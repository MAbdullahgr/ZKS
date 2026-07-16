import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, getStoreFilterOrNull } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { Prisma } from "@generated/prisma/client";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireManager();
  const storeFilter = getStoreFilterOrNull(session);

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = parsePagination(req);
  const action = searchParams.get("action");
  const entityType = searchParams.get("entityType");
  const userId = searchParams.get("userId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  // Search on action/entityType text fields (details is Json — hard to search
  // in SQLite). When both `action` and `search` are provided, both apply (AND).
  const search = searchParams.get("search") ?? "";

  const where: Prisma.AuditLogWhereInput = {
    ...(storeFilter ? { storeId: storeFilter.storeId } : {}),
    ...(action && { action: { contains: action } }),
    ...(entityType && {
      entityType: { contains: entityType },
    }),
    ...(userId && { userId }),
    ...(from &&
      to && {
        createdAt: { gte: new Date(from + "T00:00:00"), lte: new Date(`${to}T23:59:59`) },
      }),
    ...(search && {
      OR: [
        { action: { contains: search } },
        { entityType: { contains: search } },
      ],
    }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Manual join: fetch user names and store names
  const userIds = [
    ...new Set(logs.map((l) => l.userId).filter(Boolean)),
  ] as string[];
  const storeIds = [
    ...new Set(logs.map((l) => l.storeId).filter(Boolean)),
  ] as string[];

  const [users, stores] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            email: true,
            employee: { select: { name: true } },
          },
        })
      : [],
    storeIds.length > 0
      ? prisma.store.findMany({
          where: { id: { in: storeIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  const logsWithRelations = logs.map((log) => ({
    ...log,
    user: log.userId ? (userMap.get(log.userId) ?? null) : null,
    store: log.storeId ? (storeMap.get(log.storeId) ?? null) : null,
  }));

  return apiSuccess({
    logs: logsWithRelations,
    ...paginatedMeta(page, limit, total),
  });
});
