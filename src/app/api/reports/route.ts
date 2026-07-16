import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreFilterOrNull, requireManager } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { Prisma } from "@/generated/prisma/client";

// AUDIT (issue 16): Store filter verification
// ===========================================
// This route uses `getStoreFilterOrNull(session)`:
//   - Owner/Admin with a specific store selected → returns `{ storeId }`
//     → ALL sales aggregates, the daily sales SQL query, payment breakdown,
//       and expense total are filtered to that store ONLY.
//   - Owner/Admin in "All Stores" mode → returns `undefined`
//     → Aggregates across all stores.
//   - Other roles → always get their storeId.
//
// The store filter is applied to:
//   ✓ salesSummary aggregate (line ~48)
//   ✓ dailySales raw SQL via storeWhereClause (line ~55)
//   ✓ topProducts via saleDateCondition (line ~66)
//   ✓ paymentBreakdown via saleDateCondition (line ~74)
//   ✓ profitSummary via saleDateCondition (line ~105)
//   ✓ expensesAgg (line ~120)
//
// All queries now respect the store filter (products, customers, suppliers
// all have storeId in the multi-company architecture).
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireManager();
  // Reports legitimately aggregate across stores for owners in "All Stores" mode.
  const storeFilter = getStoreFilterOrNull(session);

  const { searchParams } = new URL(req.url);
  const period = Number(searchParams.get("period") ?? 30);

  if (isNaN(period) || period <= 0) {
    throw new HttpError("Invalid period", 400, "VALIDATION_ERROR");
  }

  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - period);

  // Build sale date condition with optional store filter
  const saleDateCondition: Prisma.SaleWhereInput = {
    saleDate: { gte: daysAgo },
    ...(storeFilter ? { storeId: storeFilter.storeId } : {}),
  };

  // For raw SQL queries, build the store filter conditionally
  // (the old code used `storeId = ${storeFilter?.storeId ?? null}` which matched nothing for owners)
  const storeFilterForSql = storeFilter?.storeId ?? null;
  const storeWhereClause = storeFilterForSql
    ? Prisma.sql`AND "storeId" = ${storeFilterForSql}`
    : Prisma.empty;

  const [
    salesSummary,
    dailySales,
    topProducts,
    paymentBreakdown,
    lowStockProducts,
    totalCustomers,
    customersWithDebt,
    profitSummary,
    inventoryValuation,
    expensesAgg,
  ] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { total: true, paidAmount: true },
      _count: { id: true },
      where: saleDateCondition,
    }),

    // Daily sales for chart — uses parameterized SQL with conditional store filter
    prisma.$queryRaw<Array<{ date: string; revenue: number; count: number }>>`
      SELECT
        DATE("saleDate") as date,
        SUM(CAST("total" AS DECIMAL)) as revenue,
        COUNT(*) as count
      FROM "Sale"
      WHERE "saleDate" >= ${daysAgo} ${storeWhereClause}
      GROUP BY DATE("saleDate")
      ORDER BY date ASC
    `,

    prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, total: true, profit: true },
      where: { sale: saleDateCondition },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),

    prisma.sale.groupBy({
      by: ["paymentMethod"],
      _sum: { total: true },
      _count: { id: true },
      where: saleDateCondition,
    }),

    // Low stock products — now store-scoped
    prisma.product.findMany({
      where: {
        ...(storeFilter ? { storeId: storeFilter.storeId } : {}),
        isActive: true,
        stockQuantity: { lte: prisma.product.fields.minStockLevel },
      },
      orderBy: { stockQuantity: "asc" },
      take: 10,
      select: {
        id: true,
        name: true,
        stockQuantity: true,
        minStockLevel: true,
        unit: true,
      },
    }),

    // Customers now have storeId — filter by store
    prisma.customer.count({
      where: storeFilter ? { storeId: storeFilter.storeId } : {},
    }),
    prisma.customer.aggregate({
      _sum: { balance: true },
      where: {
        ...(storeFilter ? { storeId: storeFilter.storeId } : {}),
        balance: { gt: 0 },
      },
    }),

    prisma.saleItem.aggregate({
      _sum: { profit: true },
      where: { sale: saleDateCondition },
    }),

    // Inventory Valuation — now store-scoped
    prisma.$queryRaw<Array<{ total_cost: number; total_retail: number }>>`
      SELECT
        COALESCE(SUM("stockQuantity" * "costPrice"), 0) as total_cost,
        COALESCE(SUM("stockQuantity" * "sellingPrice"), 0) as total_retail
      FROM "Product"
      WHERE "isActive" = true
      ${storeFilter ? Prisma.sql`AND "storeId" = ${storeFilter.storeId}` : Prisma.empty}
    `,

    // Total Expenses in the period — respects store filter
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        ...(storeFilter ? { storeId: storeFilter.storeId } : {}),
        date: { gte: daysAgo },
      },
    }),
  ]);

  const productIds = topProducts.map((p) => p.productId);
  const productNames = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });

  const topProductsWithNames = topProducts.map((p) => ({
    ...p,
    productName:
      productNames.find((n) => n.id === p.productId)?.name ?? "Unknown",
    revenue: Number(p._sum.total ?? 0),
    profit: Number(p._sum.profit ?? 0),
    quantity: Number(p._sum.quantity ?? 0),
  }));

  const totalRevenue = Number(salesSummary._sum.total ?? 0);
  const grossProfit = Number(profitSummary._sum.profit ?? 0);
  const totalSales = salesSummary._count.id;
  const totalOutstanding = Number(customersWithDebt._sum.balance ?? 0);

  const invCost = Number(inventoryValuation[0]?.total_cost ?? 0);
  const invRetail = Number(inventoryValuation[0]?.total_retail ?? 0);

  const totalExpenses = Number(expensesAgg._sum.amount ?? 0);
  const netProfit = grossProfit - totalExpenses;

  return apiSuccess({
    period,
    isCrossStoreView: !storeFilter,
    summary: {
      totalRevenue,
      totalProfit: grossProfit,
      grossProfit,
      totalExpenses,
      netProfit,
      totalSales,
      avgSaleValue: totalSales > 0 ? totalRevenue / totalSales : 0,
      profitMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
      totalOutstanding,
      totalCustomers,
      inventoryCostValue: invCost,
      inventoryRetailValue: invRetail,
      potentialProfit: invRetail - invCost,
    },
    dailySales: dailySales.map((d) => ({
      date: d.date,
      revenue: Number(d.revenue),
      count: Number(d.count),
    })),
    topProducts: topProductsWithNames,
    paymentBreakdown: paymentBreakdown.map((p) => ({
      method: p.paymentMethod,
      total: Number(p._sum.total ?? 0),
      count: p._count.id,
    })),
    lowStockProducts: lowStockProducts.map((p) => ({
      ...p,
      stockQuantity: Number(p.stockQuantity),
      minStockLevel: Number(p.minStockLevel),
    })),
  });
});
