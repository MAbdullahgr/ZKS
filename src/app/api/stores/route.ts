import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  requireAdmin,
  logAudit,
  getStoreFilter,
} from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createStoreSchema } from "@/lib/validations/store";
import { seedDefaultAccountsForStore } from "@/lib/chart-of-accounts";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { paginatedMeta, parsePagination } from "@/lib/pagination";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  const { storeId: _storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);

  // Owners/admins see all stores; everyone else sees only their assigned stores.
  const search = searchParams.get("search") ?? "";
  const isActive = searchParams.get("isActive");
  const { page, limit, skip } = parsePagination(req);

  const where: Record<string, unknown> = {};

  // Non-owners are restricted to stores they're assigned to.
  if (session.role !== "owner" && session.role !== "admin") {
    where.id = { in: session.storeId ?? [] };
  }

  if (search) {
    where.OR = [{ name: { contains: search } }, { code: { contains: search } }];
  }

  if (isActive !== null && isActive !== "") {
    where.isActive = isActive === "true";
  }

  const [stores, total] = await Promise.all([
    prisma.store.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            users: { where: { isActive: true } },
            products: { where: { isActive: true } },
          },
        },
      },
    }),
    prisma.store.count({ where }),
  ]);

  const serialized = stores.map((s) => ({
    ...s,
    userCount: s._count?.users ?? 0,
    productCount: s._count?.products ?? 0,
    _count: undefined,
  }));

  return apiSuccess({
    stores: serialized,
    ...paginatedMeta(page, limit, total),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireAdmin();
  const body = await req.json();
  const { name, address, phone, type } = createStoreSchema.parse(body);

  // Create the store
  const store = await prisma.store.create({
    data: {
      name,
      address: address ?? "",
      phone: phone ?? "",
      type,
      isActive: true,
    },
  });

  // Auto-create chart of accounts for this store — no manual seeding needed.
  try {
    const accountCount = await seedDefaultAccountsForStore(
      store.id,
      store.name,
    );
    console.log(
      `[store] Auto-seeded ${accountCount} accounts for store "${store.name}"`,
    );
  } catch (err) {
    console.error(
      `[store] Failed to auto-seed accounts for store "${store.name}":`,
      err,
    );
    // Don't fail the store creation — the owner can run seed-accounting manually
    // or the reconciliation cron will detect missing accounts.
  }

  await logAudit({
    userId: session.userId,
    storeId: store.id,
    action: "STORE_CREATED",
    entityType: "Store",
    entityId: store.id,
    details: {
      name: store.name,
      type,
      autoSeededAccounts: true,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess({ store }, "Store created successfully", 201);
});
