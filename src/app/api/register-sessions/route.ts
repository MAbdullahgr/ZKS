import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { openRegisterSchema } from "@/lib/validations/register";
import { Prisma, RegisterSessionStatus } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  // FIX: Warehouse is excluded from POS/Sales — block register session access too.
  // The POST already has this check; the GET was missed.
  if (session.role === "warehouse") {
    throw new HttpError(
      "Warehouse staff cannot access register sessions",
      403,
      "FORBIDDEN",
    );
  }
  const { storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get(
    "status",
  ) as RegisterSessionStatus | null;
  const search = searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where: Prisma.RegisterSessionWhereInput = {};

  // Cashiers only see their own sessions (warehouse is blocked above)
  if (session.role === "cashier") {
    where.userId = session.userId;
  }
  // Apply store filter (owners in "All Stores" mode see all stores)
  if (storeId) where.storeId = storeId;
  if (statusParam) where.status = statusParam;
  // Search on the opening user's email or employee name.
  if (search) {
    where.OR = [
      { user: { email: { contains: search } } },
      { user: { employee: { name: { contains: search } } } },
    ];
  }

  const [sessions, total] = await Promise.all([
    prisma.registerSession.findMany({
      where,
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
        _count: { select: { sales: true } },
      },
      orderBy: { openedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.registerSession.count({ where }),
  ]);

  // FIX P1-23: Use a single groupBy query instead of N per-session aggregate
  // queries. One DB round-trip instead of N.
  const sessionIds = sessions.map((s) => s.id);
  const salesAggregated = await prisma.sale.groupBy({
    by: ["registerSessionId"],
    where: { registerSessionId: { in: sessionIds } },
    _sum: { total: true },
  });
  const salesMap = new Map(
    salesAggregated.map((a) => [
      a.registerSessionId,
      Number(a._sum.total ?? 0),
    ]),
  );

  const sessionsWithTotals = sessions.map((s) => ({
    ...s,
    openingCash: Number(s.openingCash),
    closingCash: s.closingCash ? Number(s.closingCash) : null,
    cashInTotal: Number(s.cashInTotal),
    cashOutTotal: Number(s.cashOutTotal),
    totalSales: salesMap.get(s.id) ?? 0,
  }));

  return apiSuccess({
    sessions: sessionsWithTotals,
    ...paginatedMeta(page, limit, total),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireAuth();
  // FIX: warehouse staff cannot open a register — same as sales POST.
  if (session.role === "warehouse") {
    throw new HttpError(
      "Warehouse staff cannot operate the POS",
      403,
      "FORBIDDEN",
    );
  }
  const storeId = requireStoreId(session);
  const body = await req.json();
  const { openingCash, openingNote } = openRegisterSchema.parse(body);

  // FIX P1-20: Wrap the existence check + create in a Serializable transaction
  // to prevent the race condition where two concurrent requests both see no
  // open session and both create one. Combined with the DB-level partial unique
  // index (migration), this is bulletproof.
  let newSession;
  try {
    newSession = await prisma.$transaction(
      async (tx) => {
        const existingOpen = await tx.registerSession.findFirst({
          where: { userId: session.userId, status: "open" },
        });
        if (existingOpen)
          throw new HttpError(
            "You already have an open register. Close it first.",
            400,
            "REGISTER_ALREADY_OPEN",
          );

        return tx.registerSession.create({
          data: {
            storeId,
            userId: session.userId,
            openingCash,
            openingNote: openingNote || "",
            status: "open",
          },
        });
      },
      {
        timeout: 10000,
        maxWait: 5000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (err) {
    // P2002 = unique constraint violation on the partial index — another
    // request won the race. Show the friendly "already open" message.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(
        "You already have an open register. Close it first.",
        400,
        "REGISTER_ALREADY_OPEN",
      );
    }
    throw err;
  }

  await logAudit({
    userId: session.userId,
    storeId,
    action: "REGISTER_OPENED",
    entityType: "RegisterSession",
    entityId: newSession.id,
    details: { openingCash } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { session: { ...newSession, openingCash: Number(newSession.openingCash) } },
    "Register opened successfully",
    201,
  );
});
