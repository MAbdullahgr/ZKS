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
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";
import { z } from "zod";

const createTaxSchema = z.object({
  name: z.string().trim().min(1, "Tax name is required").max(100),
  rate: z.coerce
    .number()
    .min(0, "Rate cannot be negative")
    .max(100, "Rate cannot exceed 100"),
  type: z
    .enum(["standard", "fixed", "exempt", "zero_rated"])
    .default("standard"),
  fbrCode: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  const { storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "true";
  const search = searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where = {
    storeId,
    ...(includeInactive ? {} : { isActive: true }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { fbrCode: { contains: search } },
      ],
    }),
  };

  const [taxes, total] = await Promise.all([
    prisma.tax.findMany({
      where,
      orderBy: [{ type: "asc" }, { rate: "asc" }],
      include: {
        store: { select: { name: true } },
      },
      skip,
      take: limit,
    }),
    prisma.tax.count({ where }),
  ]);

  return apiSuccess({
    taxes: taxes.map((t) => ({
      ...t,
      rate: Number(t.rate),
    })),
    ...paginatedMeta(page, limit, total),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);
  const body = await req.json();
  const data = createTaxSchema.parse(body);

  const tax = await prisma.tax.create({
    data: {
      storeId,
      name: data.name,
      rate: data.rate,
      type: data.type,
      fbrCode: data.fbrCode || null,
      description: data.description || null,
      isActive: data.isActive,
    },
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "TAX_CREATED",
    entityType: "Tax",
    entityId: tax.id,
    details: {
      name: tax.name,
      rate: Number(tax.rate),
      type: tax.type,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { tax: { ...tax, rate: Number(tax.rate) } },
    "Tax created successfully",
    201,
  );
});
