import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  requireManager,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createBrandSchema } from "@/lib/validations/brand";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  const { storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const includeInactive = searchParams.get("includeInactive") === "true";
  const { page, limit, skip } = parsePagination(req);

  const where = {
    storeId,
    ...(includeInactive ? {} : { isActive: true }),
    ...(search && { name: { contains: search } }),
  };

  const [brands, total] = await Promise.all([
    prisma.brand.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        store: { select: { name: true } },
        _count: { select: { products: true } },
      },
      skip,
      take: limit,
    }),
    prisma.brand.count({ where }),
  ]);

  return apiSuccess({ brands, ...paginatedMeta(page, limit, total) });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);
  const body = await req.json();
  const { name } = createBrandSchema.parse(body);

  const brand = await prisma.brand.create({ data: { storeId, name } });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "BRAND_CREATED",
    entityType: "Brand",
    entityId: brand.id,
    details: { name } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess({ brand }, "Brand created successfully", 201);
});
