import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateBrandSchema } from "@/lib/validations/brand";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";
    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    const body = await req.json();
    const updateData = updateBrandSchema.parse(body);

    // Verify brand belongs to this store
    const existing = await prisma.brand.findFirst({ where: { id, storeId } });
    if (!existing) throw new HttpError("Brand not found", 404, "NOT_FOUND");

    const brand = await prisma.brand.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "BRAND_UPDATED",
      entityType: "Brand",
      entityId: brand.id,
      details: { name: brand.name } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ brand });
  },
);

export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";
    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify brand belongs to this store
    const existing = await prisma.brand.findFirst({ where: { id, storeId } });
    if (!existing) throw new HttpError("Brand not found", 404, "NOT_FOUND");

    const productsCount = await prisma.product.count({
      where: { brandId: id, storeId, isActive: true },
    });
    if (productsCount > 0) {
      throw new HttpError(
        `Cannot delete: ${productsCount} active products are assigned to this brand.`,
        409,
        "FOREIGN_KEY_CONSTRAINT",
      );
    }

    await prisma.brand.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "BRAND_DELETED",
      entityType: "Brand",
      entityId: id,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Brand deactivated successfully" });
  },
);
