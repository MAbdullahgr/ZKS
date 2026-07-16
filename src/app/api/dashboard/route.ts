import { prisma } from "@/lib/prisma";
import { requireAuth, getStoreFilterOrNull } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { qtyToNumber } from "@/lib/money";
import { Prisma } from "@generated/prisma/client";

// A+ FIX: lowStockProducts come straight from Prisma with stockQuantity and
// minStockLevel as Decimal fields. Prisma serializes Decimal as a STRING,
// so without this mapping the client receives strings like "9.000" and
// "10.000" — and the client's `product.totalStock <= product.minStockLevel`
// comparison (inventory/[id]/page.tsx:443) becomes LEXICOGRAPHIC, so
// "9.000" <= "10.000" evaluates to FALSE (low-stock flag is wrong) and
// "0.000" === 0 evaluates to FALSE (out-of-stock flag is wrong).
// Mapping through qtyToNumber guarantees a JS number on the wire.
type LowStockProduct = Prisma.ProductGetPayload<{
  include: { category: { select: { name: true } } };
}>;

function serializeLowStockProduct(p: LowStockProduct) {
  return {
    ...p,
    stockQuantity: qtyToNumber(p.stockQuantity),
    minStockLevel: qtyToNumber(p.minStockLevel),
    costPrice: Number(p.costPrice),
    sellingPrice: Number(p.sellingPrice),
  };
}

// Dashboard aggregates. Owner in "All Stores" mode sees cross-store data.
// Products now have storeId — all product queries respect the store filter.
//
// FIX: Role-based data scoping. Previously every authenticated user received
// the same response — including todayRevenue, todayProfit, and recentSales
// with per-item costPrice/profit. Now:
//   - cashier: sees only their own register-session sales summary + low stock
//   - warehouse: sees inventory stats + low stock + pending POs (no sales $)
//   - manager+: full KPIs as before (store-wide or cross-store)
export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  const storeFilter = getStoreFilterOrNull(session);
  const storeCondition = storeFilter ? { storeId: storeFilter.storeId } : {};

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // ─── LOW-STOCK + PRODUCT COUNTS — visible to ALL roles ──────────────
  const productCondition = {
    isActive: true,
    ...storeCondition,
  };

  const [totalProducts, stockAgg, lowStockCount, outOfStockCount, lowStockProducts] =
    await Promise.all([
      prisma.product.count({ where: productCondition }),

      prisma.product.aggregate({
        _sum: { stockQuantity: true },
        where: productCondition,
      }),

      prisma.product.count({
        where: {
          ...productCondition,
          stockQuantity: { lte: prisma.product.fields.minStockLevel },
        },
      }),

      // AUDIT-FIX (feature): out-of-stock count (stockQuantity <= 0) — distinct
      // from low-stock (stock <= minStockLevel but > 0). Powers a dedicated
      // "Out of Stock" KPI tile + restock urgency badge.
      prisma.product.count({
        where: {
          ...productCondition,
          stockQuantity: { lte: 0 },
        },
      }),

      prisma.product.findMany({
        where: {
          ...productCondition,
          stockQuantity: { lte: prisma.product.fields.minStockLevel },
        },
        orderBy: { stockQuantity: "asc" },
        take: 8,
        include: { category: { select: { name: true } } },
      }),
    ]);

  // AUDIT-FIX (feature): Expiry alerts — batches expiring within 30 days or
  // already expired. Leverages the FIFO batch tracking fixed in 5-c #11.
  // Visible to all roles (warehouse + manager especially need this to avoid
  // selling expired goods). Capped at 10 for the dashboard widget.
  const EXPIRY_WINDOW_DAYS = 30;
  const expiryCutoff = new Date();
  expiryCutoff.setDate(expiryCutoff.getDate() + EXPIRY_WINDOW_DAYS);

  const expiringBatches = await prisma.productBatch.findMany({
    where: {
      ...storeCondition,
      expiryDate: { lte: expiryCutoff },
      quantity: { gt: 0 },
    },
    orderBy: { expiryDate: "asc" },
    take: 10,
    include: {
      product: {
        select: { id: true, name: true, sku: true, sellingPrice: true },
      },
    },
  });

  const now = new Date();
  const serializedExpiryAlerts = expiringBatches.map((b) => {
    const exp = b.expiryDate!;
    const daysUntilExpiry = Math.ceil(
      (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      batchId: b.id,
      productId: b.product.id,
      productName: b.product.name,
      sku: b.product.sku,
      batchNumber: b.batchNumber,
      expiryDate: exp.toISOString(),
      daysUntilExpiry,
      // "expired" (days < 0), "critical" (<= 7 days), "warning" (<= 30 days)
      severity:
        daysUntilExpiry < 0
          ? ("expired" as const)
          : daysUntilExpiry <= 7
            ? ("critical" as const)
            : ("warning" as const),
      quantity: qtyToNumber(b.quantity),
      costPrice: Number(b.costPrice),
      potentialLoss:
        daysUntilExpiry < 0
          ? Number(b.costPrice) * qtyToNumber(b.quantity)
          : 0,
    };
  });

  const expiredCount = serializedExpiryAlerts.filter(
    (a) => a.severity === "expired",
  ).length;
  const criticalExpiryCount = serializedExpiryAlerts.filter(
    (a) => a.severity === "critical",
  ).length;

  // ─── CASHIER: own register-session sales only ───────────────────────
  if (session.role === "cashier") {
    // Find cashier's open register session today
    const mySession = await prisma.registerSession.findFirst({
      where: {
        userId: session.userId,
        status: "open",
      },
      select: { id: true },
    });

    const myTodaySalesWhere = {
      saleDate: { gte: todayStart, lte: todayEnd },
      ...(mySession ? { registerSessionId: mySession.id } : { id: "none" }),
    };

    const [mySalesAgg, mySalesCount, myRecentSales] = await Promise.all([
      prisma.sale.aggregate({
        _sum: { total: true },
        where: myTodaySalesWhere,
      }),
      prisma.sale.count({ where: myTodaySalesWhere }),
      prisma.sale.findMany({
        where: myTodaySalesWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          items: { include: { product: { select: { name: true } } } },
          customer: { select: { name: true } },
        },
      }),
    ]);

    return apiSuccess({
      totalProducts,
      lowStockCount,
      outOfStockCount,
      totalStockUnits: Number(stockAgg._sum.stockQuantity ?? 0),
      // Cashier sees their OWN sales only — no store-wide revenue/profit
      todayRevenue: Number(mySalesAgg._sum.total ?? 0),
      todayProfit: 0, // explicitly hidden from cashier
      todaySalesCount: mySalesCount,
      recentSales: myRecentSales.map((sale) => ({
        ...sale,
        subtotal: Number(sale.subtotal),
        tax: Number(sale.tax),
        discount: Number(sale.discount),
        total: Number(sale.total),
        paidAmount: Number(sale.paidAmount),
        // FIX: Actually omit costPrice + profit from cashier view. The previous
        // spread kept them in the payload despite the comment claiming hidden.
        items: sale.items.map(({ costPrice, profit, ...item }) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
        })),
      })),
      lowStockProducts: lowStockProducts.map(serializeLowStockProduct),
      expiryAlerts: serializedExpiryAlerts,
      expiredCount,
      criticalExpiryCount,
      isCrossStoreView: false,
      roleScope: "cashier",
    });
  }

  // ─── WAREHOUSE: inventory stats only — no sales financials ──────────
  if (session.role === "warehouse") {
    const pendingPOs = await prisma.purchaseOrder.count({
      where: {
        ...storeCondition,
        status: { in: ["draft", "ordered"] },
      },
    });

    return apiSuccess({
      totalProducts,
      lowStockCount,
      outOfStockCount,
      totalStockUnits: Number(stockAgg._sum.stockQuantity ?? 0),
      pendingPOs,
      lowStockProducts: lowStockProducts.map(serializeLowStockProduct),
      expiryAlerts: serializedExpiryAlerts,
      expiredCount,
      criticalExpiryCount,
      isCrossStoreView: false,
      // No todayRevenue / todayProfit / recentSales for warehouse
      roleScope: "warehouse",
    });
  }

  // ─── MANAGER / ADMIN / OWNER: full KPIs ────────────────────────────
  const saleDateFilter = {
    saleDate: { gte: todayStart, lte: todayEnd },
    ...storeCondition,
  };

  const [todaySales, todayProfit, todaySalesCount, recentSales, yesterdaySalesAgg, yesterdaySalesCount] =
    await Promise.all([
      prisma.sale.aggregate({
        _sum: { total: true },
        where: saleDateFilter,
      }),

      prisma.saleItem.aggregate({
        _sum: { profit: true },
        where: { sale: saleDateFilter },
      }),

      prisma.sale.count({ where: saleDateFilter }),

      prisma.sale.findMany({
        where: storeCondition,
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          items: { include: { product: { select: { name: true } } } },
          customer: { select: { name: true } },
        },
      }),

      // Yesterday's revenue for trend comparison
      prisma.sale.aggregate({
        _sum: { total: true },
        where: {
          saleDate: {
            gte: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000),
            lt: todayStart,
          },
          ...storeCondition,
        },
      }),

      // Yesterday's sales count
      prisma.sale.count({
        where: {
          saleDate: {
            gte: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000),
            lt: todayStart,
          },
          ...storeCondition,
        },
      }),
    ]);

  const serializedRecentSales = recentSales.map((sale) => ({
    ...sale,
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    discount: Number(sale.discount),
    total: Number(sale.total),
    paidAmount: Number(sale.paidAmount),
    items: sale.items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      costPrice: Number(item.costPrice),
      total: Number(item.total),
      profit: Number(item.profit),
    })),
  }));

  const yesterdayRevenue = Number(yesterdaySalesAgg._sum.total ?? 0);

  // Trend percentage: ((today - yesterday) / yesterday) * 100
  // If yesterday was 0, show 100% if today > 0, else 0%
  const revenueTrendPct =
    yesterdayRevenue > 0
      ? Math.round(
          ((Number(todaySales._sum.total ?? 0) - yesterdayRevenue) /
            yesterdayRevenue) *
            100,
        )
      : Number(todaySales._sum.total ?? 0) > 0
        ? 100
        : 0;

  const salesCountTrendPct =
    yesterdaySalesCount > 0
      ? Math.round(
          ((todaySalesCount - yesterdaySalesCount) / yesterdaySalesCount) * 100,
        )
      : todaySalesCount > 0
        ? 100
        : 0;

  return apiSuccess({
    totalProducts,
    lowStockCount,
    outOfStockCount,
    totalStockUnits: Number(stockAgg._sum.stockQuantity ?? 0),
    todayRevenue: Number(todaySales._sum.total ?? 0),
    todayProfit: Number(todayProfit._sum.profit ?? 0),
    todaySalesCount,
    yesterdayRevenue,
    yesterdaySalesCount,
    revenueTrendPct,
    salesCountTrendPct,
    recentSales: serializedRecentSales,
    lowStockProducts: lowStockProducts.map(serializeLowStockProduct),
    expiryAlerts: serializedExpiryAlerts,
    expiredCount,
    criticalExpiryCount,
    isCrossStoreView: !storeFilter,
    roleScope: "manager+",
  });
});
