import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createExpenseCategorySchema } from "@/lib/validations/expense";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

// GET /api/expense-categories
//
// Returns custom expense categories for the active store (managers+).
// Active-only by default; pass ?includeInactive=true to also see deactivated
// categories. Supports ?search= on name and standard pagination.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireManager();
  const { storeId } = getStoreFilter(session);

  const { searchParams } = new URL(req.url);
  const includeInactive =
    searchParams.get("includeInactive") === "true" ||
    searchParams.get("includeInactive") === "1";
  const search = searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where: Prisma.ExpenseCategoryWhereInput = {
    ...(storeId && { storeId }),
    ...(includeInactive ? {} : { isActive: true }),
    ...(search && { name: { contains: search } }),
  };

  const [categories, total] = await Promise.all([
    prisma.expenseCategory.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.expenseCategory.count({ where }),
  ]);

  return apiSuccess({
    categories: categories.map((c) => ({
      id: c.id,
      storeId: c.storeId,
      name: c.name,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
    })),
    ...paginatedMeta(page, limit, total),
  });
});

// POST /api/expense-categories
//
// Create a new custom expense category for the active store.
// - Requires manager+ role (only store managers / admins should define
//   financial categories).
// - Name must be unique per store (enforced at the DB level by
//   @@unique([storeId, name])).
export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);

  const body = await req.json();
  const { name, isActive } = createExpenseCategorySchema.parse(body);

  // Normalize: trim + collapse internal whitespace. The @@unique is on the
  // raw string, so "Rent  " and "Rent" would be different rows — we trim
  // first to prevent accidental duplicates.
  const normalizedName = name.replace(/\s+/g, " ").trim();

  // Check for existing category with the same name (case-insensitive check
  // to give a friendlier error before the DB unique constraint fires).
  const existing = await prisma.expenseCategory.findFirst({
    where: {
      storeId,
      name: { equals: normalizedName },
    },
    select: { id: true, isActive: true },
  });
  if (existing) {
    throw new HttpError(
      `A category named "${normalizedName}" already exists in this store.`,
      409,
      "DUPLICATE_CATEGORY",
    );
  }

  const category = await prisma.expenseCategory.create({
    data: {
      storeId,
      name: normalizedName,
      isActive: isActive ?? true,
    },
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "EXPENSE_CATEGORY_CREATED",
    entityType: "ExpenseCategory",
    entityId: category.id,
    details: { name: normalizedName, isActive } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    {
      category: {
        id: category.id,
        storeId: category.storeId,
        name: category.name,
        isActive: category.isActive,
        createdAt: category.createdAt.toISOString(),
      },
    },
    "Expense category created successfully",
    201,
  );
});
