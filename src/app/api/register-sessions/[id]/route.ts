import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { closeRegisterSchema } from "@/lib/validations/register";
import { getClientIp } from "@/lib/rate-limit";

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const session = await requireAuth();
    const { id } = await params;

    // AUDIT-FIX H-2 + S-2: Use requireStoreId + findFirst by (id, storeId)
    // for non-owner/admin roles. Previously this used findUnique by id only
    // and relied on post-fetch authorization — safe today but fragile. Now
    // a manager from store A passing store B's session id gets a clean 404
    // (no information disclosure that the session exists).
    let storeScopedWhere: { id: string; storeId?: string };
    if (session.role === "owner" || session.role === "admin") {
      // Owners/admins can see any session (intended for cross-store oversight).
      storeScopedWhere = { id };
    } else {
      // Cashier/warehouse/manager: scope by storeId. Cashier/warehouse will
      // additionally be checked for ownership below.
      if (!session.storeId) {
        throw new HttpError(
          "Your account is not assigned to a store. Please contact an administrator.",
          403,
          "FORBIDDEN",
        );
      }
      storeScopedWhere = { id, storeId: session.storeId };
    }

    const registerSession = await prisma.registerSession.findFirst({
      where: storeScopedWhere,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            employee: { select: { name: true } },
          },
        },
        store: { select: { id: true, name: true } },
        // AUDIT-FIX H-12: Don't load ALL sales with items+payments — that's
        // the worst N+1 in the codebase (500 sales × 10 items = 5000 rows
        // into memory). Instead, load transactions + a paginated slice of
        // sales (first 50). The totals are computed via aggregate queries below.
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!registerSession)
      throw new HttpError("Register session not found", 404, "NOT_FOUND");

    if (session.role === "cashier" || session.role === "warehouse") {
      if (registerSession.userId !== session.userId)
        throw new HttpError("Forbidden", 403, "FORBIDDEN");
    }
    else if (
      session.role === "manager" &&
      registerSession.storeId !== session.storeId
    ) {
      throw new HttpError("Forbidden", 403, "FORBIDDEN");
    }

    // AUDIT-FIX H-12: Compute totals via aggregates instead of loading
    // all sales into memory. This is 4 fast SQL queries instead of 1
    // giant join that loads every sale + every item + every payment.
    const sessionId = registerSession.id;
    const [salesCount, salesTotalAgg, cashSalesAgg, khataSalesAgg, cardSalesAgg, mobileSalesAgg, jazzcashSalesAgg, easypaisaSalesAgg] =
      await Promise.all([
        prisma.sale.count({ where: { registerSessionId: sessionId } }),
        prisma.sale.aggregate({
          where: { registerSessionId: sessionId },
          _sum: { total: true },
        }),
        prisma.salePayment.aggregate({
          where: { sale: { registerSessionId: sessionId }, method: "cash" },
          _sum: { amount: true },
        }),
        prisma.salePayment.aggregate({
          where: {
            sale: { registerSessionId: sessionId },
            method: { in: ["khata", "credit"] },
          },
          _sum: { amount: true },
        }),
        prisma.salePayment.aggregate({
          where: { sale: { registerSessionId: sessionId }, method: "card" },
          _sum: { amount: true },
        }),
        prisma.salePayment.aggregate({
          where: { sale: { registerSessionId: sessionId }, method: "mobile" },
          _sum: { amount: true },
        }),
        prisma.salePayment.aggregate({
          where: { sale: { registerSessionId: sessionId }, method: "jazzcash" },
          _sum: { amount: true },
        }),
        prisma.salePayment.aggregate({
          where: { sale: { registerSessionId: sessionId }, method: "easypaisa" },
          _sum: { amount: true },
        }),
      ]);

    const totalSales = Number(salesTotalAgg._sum.total || 0);
    const totalCashSales = Number(cashSalesAgg._sum.amount || 0);
    const totalKhataSales = Number(khataSalesAgg._sum.amount || 0);
    const totalCardSales = Number(cardSalesAgg._sum.amount || 0);
    const totalMobileSales = Number(mobileSalesAgg._sum.amount || 0);
    const totalJazzcashSales = Number(jazzcashSalesAgg._sum.amount || 0);
    const totalEasypaisaSales = Number(easypaisaSalesAgg._sum.amount || 0);

    // AUDIT-FIX H-12: Load a paginated slice of sales (first 50) for the
    // reconciliation UI. The frontend can paginate if needed.
    const recentSales = await prisma.sale.findMany({
      where: { registerSessionId: sessionId },
      include: {
        items: true,
        payments: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { saleDate: "desc" },
      take: 50,
    });

    const stripMargins = session.role === "cashier" || session.role === "warehouse";
    const safeSales = recentSales.map((s) => ({
      ...s,
      subtotal: Number(s.subtotal),
      tax: Number(s.tax),
      discount: Number(s.discount),
      total: Number(s.total),
      paidAmount: Number(s.paidAmount),
      items: s.items.map((item) => {
        const serialized: Record<string, unknown> = {
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
          taxRate: Number(item.taxRate),
          taxAmount: Number(item.taxAmount),
          total: Number(item.total),
        };
        if (stripMargins) {
          delete serialized.costPrice;
          delete serialized.profit;
        } else {
          serialized.costPrice = Number(item.costPrice);
          serialized.profit = Number(item.profit);
        }
        return serialized;
      }),
      payments: s.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    }));

    // AUDIT-FIX H-12: Totals are now computed via SQL aggregates above
    // (totalSales, totalCashSales, totalKhataSales, totalCardSales,
    // totalMobileSales) instead of loading all sales into memory and
    // reducing in JS. The salesCount is the total number of sales.

    const expectedCash =
      Number(registerSession.openingCash) +
      Number(registerSession.cashInTotal) -
      Number(registerSession.cashOutTotal) +
      totalCashSales;

    return apiSuccess({
      ...registerSession,
      sales: safeSales,
      openingCash: Number(registerSession.openingCash),
      closingCash: registerSession.closingCash
        ? Number(registerSession.closingCash)
        : null,
      cashInTotal: Number(registerSession.cashInTotal),
      cashOutTotal: Number(registerSession.cashOutTotal),
      transactions: registerSession.transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
      totalSales,
      totalCashSales,
      totalKhataSales,
      totalCardSales,
      totalMobileSales,
      totalJazzcashSales,
      totalEasypaisaSales,
      expectedCash,
      transactionCount: salesCount,
    });
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const { closingCash, closingNote } = closeRegisterSchema.parse(body);

    // AUDIT-FIX H-2: For owners/admins in "All Stores" mode, require them to
    // pick a specific store before closing a register — matches the
    // invariant enforced on every other mutating route. For other roles,
    // requireStoreId throws FORBIDDEN if they have no store assigned.
    let scopeStoreId: string;
    if (session.role === "owner" || session.role === "admin") {
      if (!session.storeId) {
        throw new HttpError(
          "Please select a specific store before performing this action. 'All Stores' mode is view-only.",
          403,
          "STORE_NOT_SELECTED",
        );
      }
      scopeStoreId = session.storeId;
    } else {
      if (!session.storeId) {
        throw new HttpError(
          "Your account is not assigned to a store. Please contact an administrator.",
          403,
          "FORBIDDEN",
        );
      }
      scopeStoreId = session.storeId;
    }

    // AUDIT-FIX H-2: Use findFirst by (id, storeId) instead of findUnique by
    // id. A cross-store PATCH now returns a clean 404 instead of finding
    // the session and then failing the auth check (which leaked existence).
    const existing = await prisma.registerSession.findFirst({
      where: { id, storeId: scopeStoreId },
    });

    if (!existing)
      throw new HttpError("Register session not found", 404, "NOT_FOUND");

    if (session.role === "cashier" || session.role === "warehouse") {
      if (existing.userId !== session.userId)
        throw new HttpError(
          "You can only close your own register",
          403,
          "FORBIDDEN",
        );
    }
    // Manager check redundant with scopeStoreId but kept for defense-in-depth.
    else if (session.role === "manager" && existing.storeId !== session.storeId) {
      throw new HttpError(
        "You can only close sessions in your assigned store",
        403,
        "FORBIDDEN",
      );
    }

    if (existing.status !== "open")
      throw new HttpError(
        "Register is already closed",
        400,
        "VALIDATION_ERROR",
      );

    const cashTransactions = await prisma.cashTransaction.findMany({
      where: { sessionId: id },
    });
    const cashIn = cashTransactions
      .filter((t) => t.type === "cash_in")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const cashOut = cashTransactions
      .filter((t) => t.type === "cash_out")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const cashSalesAgg = await prisma.salePayment.aggregate({
      where: { sale: { registerSessionId: id }, method: "cash" },
      _sum: { amount: true },
    });
    const totalCashSales = Number(cashSalesAgg._sum.amount || 0);

    const expectedCash =
      Number(existing.openingCash) + cashIn - cashOut + totalCashSales;
    const difference = closingCash - expectedCash;

    if (Math.abs(difference) > 100 && !closingNote?.trim()) {
      throw new HttpError(
        "Cash discrepancy of over Rs. 100 detected. A mandatory closing note is required to explain the difference.",
        400,
        "CASH_DISCREPANCY_REQUIRES_NOTE",
      );
    }

    const updatedSession = await prisma.registerSession.update({
      where: { id },
      data: {
        status: "closed",
        closingCash,
        closingNote: closingNote || "",
        closedAt: new Date(),
        cashInTotal: cashIn,
        cashOutTotal: cashOut,
      },
    });

    await logAudit({
      userId: session.userId,
      storeId: existing.storeId,
      action: "REGISTER_CLOSED",
      entityType: "RegisterSession",
      entityId: id,
      details: { expectedCash, closingCash, difference },
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      {
        ...updatedSession,
        openingCash: Number(updatedSession.openingCash),
        closingCash: Number(updatedSession.closingCash),
        cashInTotal: Number(updatedSession.cashInTotal),
        cashOutTotal: Number(updatedSession.cashOutTotal),
      },
      "Register closed successfully",
    );
  },
);
