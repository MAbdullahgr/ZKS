import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateCategorySchema } from "@/lib/validations/category";
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
    const updateData = updateCategorySchema.parse(body);

    if (Object.keys(updateData).length === 0) {
      throw new HttpError("No fields to update", 400, "VALIDATION_ERROR");
    }

    // Verify category belongs to this store
    const existing = await prisma.category.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new HttpError("Category not found", 404, "NOT_FOUND");

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "CATEGORY_UPDATED",
      entityType: "Category",
      entityId: id,
      details: { updates: updateData } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ category });
  },
);

export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify category belongs to this store
    const existing = await prisma.category.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new HttpError("Category not found", 404, "NOT_FOUND");

    const productCount = await prisma.product.count({
      where: { categoryId: id, storeId, isActive: true },
    });

    if (productCount > 0) {
      throw new HttpError(
        `Cannot delete — this category has ${productCount} active product(s). Reassign or deactivate them first.`,
        409,
        "FOREIGN_KEY_CONSTRAINT",
      );
    }

    await prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "CATEGORY_DELETED",
      entityType: "Category",
      entityId: id,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Category deactivated successfully" });
  },
);
