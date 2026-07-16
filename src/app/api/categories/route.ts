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
import { createCategorySchema } from "@/lib/validations/category";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

const CATEGORY_COLORS = [
  "bg-slate-700 text-white",
  "bg-rose-500 text-white",
  "bg-orange-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-sky-500 text-white",
  "bg-violet-500 text-white",
  "bg-pink-500 text-white",
];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  const { storeId } = getStoreFilter(session);
  const counts = req.nextUrl.searchParams.get("counts") === "true";
  const forPos = req.nextUrl.searchParams.get("forPos") === "true";
  const includeInactive =
    req.nextUrl.searchParams.get("includeInactive") === "true";
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where = {
    storeId,
    ...(includeInactive ? {} : { isActive: true }),
    ...(search && { name: { contains: search } }),
  };

  // POS needs ALL categories in one shot (no pagination) for the filter bar.
  if (forPos) {
    const allCategories = await prisma.category.findMany({
      where,
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    });
    const posCategories = allCategories
      .filter((c) => c.isActive)
      .map((cat, i) => ({
        id: cat.id,
        name: cat.name,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }));
    return apiSuccess([
      { id: "all", name: "All", color: "bg-slate-700 text-white" },
      ...posCategories,
    ]);
  }

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        store: { select: { name: true } },
        ...(counts || includeInactive
          ? { _count: { select: { products: true } } }
          : {}),
      },
      skip,
      take: limit,
    }),
    prisma.category.count({ where }),
  ]);

  return apiSuccess({ categories, ...paginatedMeta(page, limit, total) });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);
  const body = await req.json();
  const { name, description } = createCategorySchema.parse(body);

  const category = await prisma.category.create({
    data: { storeId, name, description: description || null },
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "CATEGORY_CREATED",
    entityType: "Category",
    entityId: category.id,
    details: { name } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess({ category }, "Category created successfully", 201);
});
