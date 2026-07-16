import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  requireManager,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const updateTaxSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  rate: z.coerce.number().min(0).max(100).optional(),
  type: z.enum(["standard", "fixed", "exempt", "zero_rated"]).optional(),
  fbrCode: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const session = await requireAuth();
    const { storeId } = getStoreFilter(session);
    const { id } = await params;

    const tax = await prisma.tax.findFirst({
      where: { id, storeId },
      include: { _count: { select: { products: true } } },
    });

    if (!tax) throw new HttpError("Tax not found", 404, "NOT_FOUND");

    return apiSuccess({
      tax: { ...tax, rate: Number(tax.rate) },
    });
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;
    const body = await req.json();
    const data = updateTaxSchema.parse(body);

    if (Object.keys(data).length === 0) {
      throw new HttpError("No fields to update", 400, "VALIDATION_ERROR");
    }

    // Verify tax belongs to this store
    const existing = await prisma.tax.findFirst({ where: { id, storeId } });
    if (!existing) throw new HttpError("Tax not found", 404, "NOT_FOUND");

    const tax = await prisma.tax.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.rate !== undefined && { rate: data.rate }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.fbrCode !== undefined && { fbrCode: data.fbrCode || null }),
        ...(data.description !== undefined && {
          description: data.description || null,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "TAX_UPDATED",
      entityType: "Tax",
      entityId: id,
      details: { updates: data } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      tax: { ...tax, rate: Number(tax.rate) },
    });
  },
);

export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const ip = getClientIp(_req);
    const userAgent = _req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify tax belongs to this store
    const existing = await prisma.tax.findFirst({ where: { id, storeId } });
    if (!existing) throw new HttpError("Tax not found", 404, "NOT_FOUND");

    const productCount = await prisma.product.count({
      where: { taxId: id, storeId, isActive: true },
    });

    if (productCount > 0) {
      throw new HttpError(
        `Cannot delete — ${productCount} product(s) are using this tax rate. Reassign them first.`,
        409,
        "FOREIGN_KEY_CONSTRAINT",
      );
    }

    await prisma.tax.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "TAX_DELETED",
      entityType: "Tax",
      entityId: id,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Tax deactivated successfully" });
  },
);
