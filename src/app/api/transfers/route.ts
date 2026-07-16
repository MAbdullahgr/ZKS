import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWarehouse, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { createTransferSchema } from "@/lib/validations/stockTransfer";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { createTransfer, serializeTransfer } from "@/services/stockTransferService";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

// GET /api/transfers — list transfers
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireWarehouse();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const direction = searchParams.get("direction"); // "outgoing", "incoming", "all"
  const search = searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where: Prisma.StockTransferWhereInput = {};

  // Role-based scoping
  if (session.role === "warehouse" || session.role === "manager") {
    // AUDIT-FIX (5-b LOW-1): Replace `session.storeId!` non-null assertion
    // with requireStoreId — throws a clear FORBIDDEN if the user has no store
    // assignment instead of relying on Prisma's null-handling (which was
    // fail-closed but brittle). Mirrors the POST handler on this same route.
    const storeId = requireStoreId(session);
    // See transfers involving their store
    if (direction === "outgoing") {
      where.sourceStoreId = storeId;
    } else if (direction === "incoming") {
      where.destStoreId = storeId;
    } else {
      where.OR = [{ sourceStoreId: storeId }, { destStoreId: storeId }];
    }
  }
  // Owners/admins see all transfers (or filter by store if selected)

  if (status) where.status = status as Prisma.EnumStockTransferStatusFilter;

  // Search on transferNumber or notes. If the role-scoped OR (above) is
  // already set, wrap both in an explicit AND so Prisma doesn't overwrite.
  if (search) {
    const searchClause = {
      OR: [
        { transferNumber: { contains: search } },
        { notes: { contains: search } },
      ],
    };
    if (where.OR) {
      where.AND = [{ OR: where.OR }, searchClause];
      delete where.OR;
    } else {
      where.OR = searchClause.OR;
    }
  }

  const [transfers, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        sourceStore: { select: { id: true, name: true } },
        destStore: { select: { id: true, name: true } },
        dispatchedBy: { select: { id: true, email: true, employee: { select: { name: true } } } },
        receivedBy: { select: { id: true, email: true, employee: { select: { name: true } } } },
        _count: { select: { items: true } },
      },
    }),
    prisma.stockTransfer.count({ where }),
  ]);

  const serialized = transfers.map((t) => ({
    ...t,
    totalValue: Number(t.totalValue),
    dispatchedByName: t.dispatchedBy?.employee?.name || t.dispatchedBy?.email || null,
    receivedByName: t.receivedBy?.employee?.name || t.receivedBy?.email || null,
    itemCount: t._count.items,
  }));

  return apiSuccess({
    transfers: serialized,
    ...paginatedMeta(page, limit, total),
  });
});

// POST /api/transfers — create a draft transfer
export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireWarehouse();
  const sourceStoreId = requireStoreId(session);

  // AUDIT-FIX (5-b MEDIUM-1): Rate-limit transfer creation.
  const rl = await rateLimit(
    "financialMutation",
    `${session.userId}:${ip}`,
  );
  if (!rl.success) {
    throw new HttpError(
      "Too many transfer requests. Please slow down.",
      429,
      "RATE_LIMITED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const data = createTransferSchema.parse(body);

  const transfer = await createTransfer({
    sourceStoreId,
    destStoreId: data.destStoreId,
    notes: data.notes,
    items: data.items,
    userId: session.userId,
  });

  await logAudit({
    userId: session.userId,
    storeId: sourceStoreId,
    action: "TRANSFER_CREATED",
    entityType: "StockTransfer",
    entityId: transfer.id,
    details: {
      transferNumber: transfer.transferNumber,
      destStoreId: data.destStoreId,
      totalValue: Number(transfer.totalValue),
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { transfer: serializeTransfer(transfer) },
    "Transfer created successfully",
    201,
    rateLimitHeaders(rl),
  );
});
