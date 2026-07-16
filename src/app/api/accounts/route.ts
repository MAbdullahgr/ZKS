import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  getStoreFilter,
  logAudit,
  requireStoreId,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createAccountSchema } from "@/lib/validations/accounting";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

// GET /api/accounts — list chart of accounts for the current store
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireManager();
  const { storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const includeInactive = searchParams.get("includeInactive") === "true";
  const search = searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where: Prisma.AccountWhereInput = {
    ...(storeId && { storeId }),
    ...(type && { type: type as Prisma.EnumAccountTypeFilter }),
    ...(!includeInactive && { isActive: true }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { code: { contains: search } },
      ],
    }),
  };

  const [accounts, total] = await Promise.all([
    prisma.account.findMany({
      where,
      orderBy: [{ type: "asc" }, { code: "asc" }],
      include: {
        parent: { select: { code: true, name: true } },
        _count: { select: { journalLines: true } },
      },
      skip,
      take: limit,
    }),
    prisma.account.count({ where }),
  ]);

  // FIX P1-23: Use a single groupBy query instead of N per-account aggregate
  // queries (was N+1 via Promise.all map — parallel but still N DB round-trips).
  const accountIds = accounts.map((a) => a.id);
  const aggregatedLines = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: accountIds },
      journalEntry: { status: "posted" },
    },
    _sum: { debit: true, credit: true },
  });
  const balanceMap = new Map(
    aggregatedLines.map((a) => [
      a.accountId,
      {
        debit: Number(a._sum.debit ?? 0),
        credit: Number(a._sum.credit ?? 0),
      },
    ]),
  );

  const accountsWithBalances = accounts.map((a) => {
    const agg = balanceMap.get(a.id) ?? { debit: 0, credit: 0 };
    const debit = agg.debit;
    const credit = agg.credit;
    const opening = Number(a.openingBalance ?? 0);
    const isDebitNormal = a.type === "asset" || a.type === "expense";
    const balance = isDebitNormal
      ? opening + debit - credit
      : -opening + credit - debit;

    return {
      ...a,
      openingBalance: opening,
      balance,
      transactionCount: a._count.journalLines,
    };
  });

  return apiSuccess({
    accounts: accountsWithBalances,
    ...paginatedMeta(page, limit, total),
  });
});

// POST /api/accounts — create a new account
export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);
  const body = await req.json();
  const data = createAccountSchema.parse(body);

  // Check for duplicate code within this store
  const existing = await prisma.account.findFirst({
    where: { storeId, code: data.code },
    select: { id: true },
  });
  if (existing) {
    throw new HttpError(
      `Account code ${data.code} already exists in this store`,
      409,
      "CONFLICT",
    );
  }

  // Verify parent belongs to this store if provided
  if (data.parentId) {
    const parent = await prisma.account.findFirst({
      where: { id: data.parentId, storeId },
      select: { id: true },
    });
    if (!parent) {
      throw new HttpError(
        "Parent account not found in this store",
        404,
        "NOT_FOUND",
      );
    }
  }

  const account = await prisma.account.create({
    data: {
      storeId,
      code: data.code,
      name: data.name,
      type: data.type,
      parentId: data.parentId ?? null,
      openingBalance: data.openingBalance,
      isSystem: false, // User-created accounts are never system accounts
    },
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "ACCOUNT_CREATED",
    entityType: "Account",
    entityId: account.id,
    details: {
      code: data.code,
      name: data.name,
      type: data.type,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess({ account }, "Account created successfully", 201);
});
