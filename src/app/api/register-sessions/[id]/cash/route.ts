import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { cashTransactionSchema } from "@/lib/validations/register";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { postCashAdjustmentJournalEntry } from "@/services/accountingService";
import { paginatedMeta, parsePagination } from "@/lib/pagination";

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireAuth();
    const { id } = await params;
    const { page, limit, skip } = parsePagination(req);

    const where = { sessionId: id };

    const [transactions, total] = await Promise.all([
      prisma.cashTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.cashTransaction.count({ where }),
    ]);

    return apiSuccess({
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
      ...paginatedMeta(page, limit, total),
    });
  },
);

export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireAuth();
    const { id } = await params;

    // AUDIT-FIX (5-b MEDIUM-1): Rate-limit cash in/out — direct cash-drawer
    // manipulation is a prime cash-drain vector for a compromised JWT.
    const rl = await rateLimit("financialMutation", `${session.userId}:${ip}`);
    if (!rl.success) {
      throw new HttpError(
        "Too many cash transactions. Please slow down.",
        429,
        "RATE_LIMITED",
        rateLimitHeaders(rl),
      );
    }

    const body = await req.json();
    const { type, amount, reason } = cashTransactionSchema.parse(body);

    // AUDIT-FIX H-2: For owners/admins in "All Stores" mode, require them to
    // pick a specific store before posting a cash adjustment — matches the
    // invariant enforced on every other mutating route.
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

    // AUDIT-FIX H-2: Use findFirst by (id, storeId) — cross-store POST gets
    // a clean 404 instead of a 403 (which leaked session existence).
    const registerSession = await prisma.registerSession.findFirst({
      where: { id, storeId: scopeStoreId },
      select: { userId: true, storeId: true, status: true },
    });

    if (!registerSession)
      throw new HttpError("Register session not found", 404, "NOT_FOUND");
    if (registerSession.status !== "open")
      throw new HttpError(
        "Cannot modify a closed register",
        400,
        "VALIDATION_ERROR",
      );

    // Authorization
    if (session.role === "cashier" || session.role === "warehouse") {
      if (registerSession.userId !== session.userId)
        throw new HttpError("Forbidden", 403, "FORBIDDEN");
    }
    // Manager check redundant with scopeStoreId but kept for defense-in-depth.

    const transaction = await prisma.$transaction(async (tx) => {
      const newTx = await tx.cashTransaction.create({
        data: { sessionId: id, type, amount, reason },
      });

      await tx.registerSession.update({
        where: { id },
        data: {
          [type === "cash_in" ? "cashInTotal" : "cashOutTotal"]: {
            increment: amount,
          },
        },
      });

      return newTx;
    });

    await logAudit({
      userId: session.userId,
      storeId: registerSession.storeId,
      action: type === "cash_in" ? "CASH_IN" : "CASH_OUT",
      entityType: "CashTransaction",
      entityId: transaction.id,
      details: { amount, reason } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    // ─── Auto-post journal entry (non-blocking) ─────────────────────────
    await postCashAdjustmentJournalEntry(registerSession.storeId, {
      type,
      amount,
      reason,
      transactionId: transaction.id,
    });

    return apiSuccess(
      { transaction: { ...transaction, amount: Number(transaction.amount) } },
      "Cash transaction recorded",
      201,
      rateLimitHeaders(rl),
    );
  },
);
