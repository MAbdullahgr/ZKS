import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { createExpenseSchema } from "@/lib/validations/expense";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { postExpenseJournalEntry } from "@/services/accountingService";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireManager();
  const { storeId } = getStoreFilter(session);

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");
  const search = searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where: Prisma.ExpenseWhereInput = {
    ...(storeId && { storeId }),
    ...(from &&
      to && { date: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) } }),
    ...(category && {
      category: category as Prisma.EnumDefaultExpenseCategoryFilter,
    }),
    ...(search && { description: { contains: search } }),
  };

  const [expenses, total, totalExpenses] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        store: { select: { name: true } },
        user: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true } },
          },
        },
      },
      orderBy: { date: "desc" },
      skip,
      take: limit,
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({
      where,
      _sum: { amount: true },
    }),
  ]);

  return apiSuccess({
    expenses: expenses.map((e) => ({
      ...e,
      amount: Number(e.amount),
      user: e.user ? { name: e.user.employee?.name || e.user.email } : null,
    })),
    grandTotal: Number(totalExpenses._sum.amount ?? 0),
    ...paginatedMeta(page, limit, total),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);

  // AUDIT-FIX (5-b MEDIUM-1): Rate-limit expense creation. A compromised
  // manager JWT could otherwise script thousands of fake expenses per minute,
  // draining the GL via auto-posted journal entries. 20/min is generous for
  // normal use.
  const rl = await rateLimit("financialMutation", `${session.userId}:${ip}`);
  if (!rl.success) {
    throw new HttpError(
      "Too many expense entries. Please slow down.",
      429,
      "RATE_LIMITED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const { amount, category, categoryId, description, date } =
    createExpenseSchema.parse(body);

  // If `categoryId` is provided, verify it belongs to this store and is
  // active. We still write the enum `category` field for backward compat
  // (existing UI / reports read the enum).
  let resolvedCategoryId: string | null = null;
  if (categoryId) {
    const cat = await prisma.expenseCategory.findFirst({
      where: { id: categoryId, storeId, isActive: true },
      select: { id: true, name: true },
    });
    if (!cat) {
      throw new HttpError(
        "Expense category not found in this store. Please refresh and try again.",
        404,
        "NOT_FOUND",
      );
    }
    resolvedCategoryId = cat.id;
    // The canonical category is `categoryId`. We keep the enum `category`
    // field as whatever the client sent (defaulting to `misc`) so existing
    // queries that filter by enum still work.
  }

  const expense = await prisma.expense.create({
    data: {
      storeId,
      userId: session.userId,
      amount,
      category,
      categoryId: resolvedCategoryId,
      description: description || null,
      date: date ? new Date(date) : new Date(),
    },
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "EXPENSE_RECORDED",
    entityType: "Expense",
    entityId: expense.id,
    details: {
      amount,
      category,
      categoryId,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  // ─── Auto-post journal entry (non-blocking) ─────────────────────────
  await postExpenseJournalEntry(storeId, {
    id: expense.id,
    amount,
    category,
    description: description || null,
  });

  return apiSuccess(
    { expense: { ...expense, amount: Number(expense.amount) } },
    "Expense recorded successfully",
    201,
    rateLimitHeaders(rl),
  );
});
