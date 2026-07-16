import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, logAudit, requireOwner } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateStoreSchema } from "@/lib/validations/store";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireAdmin();
    const { id } = await params;

    const body = await req.json();
    const updateData = updateStoreSchema.parse(body);

    if (Object.keys(updateData).length === 0) {
      throw new HttpError("No fields to update", 400, "VALIDATION_ERROR");
    }

    const store = await prisma.store.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: session.userId,
      storeId: id,
      action: "STORE_UPDATED",
      entityType: "Store",
      entityId: id,
      details: { updates: updateData } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ store });
  },
);

// Soft-delete by setting isActive: false
export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireOwner();
    const { id } = await params;

    // Check if store has sales before deactivating
    const salesCount = await prisma.sale.count({ where: { storeId: id } });
    if (salesCount > 0) {
      // We still soft-delete, but warn the admin it's historic
      await prisma.store.update({ where: { id }, data: { isActive: false } });
      await logAudit({
        userId: session.userId,
        storeId: id,
        action: "STORE_DEACTIVATED",
        entityType: "Store",
        entityId: id,
        details: { hadSales: true } as unknown as Prisma.InputJsonValue,
        ipAddress: ip,
        userAgent,
      });
      return apiSuccess({
        message: "Store deactivated. Historical data preserved.",
      });
    }

    // If no sales, we can still just deactivate it.
    await prisma.store.update({ where: { id }, data: { isActive: false } });

    await logAudit({
      userId: session.userId,
      storeId: id,
      action: "STORE_DEACTIVATED",
      entityType: "Store",
      entityId: id,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Store deactivated successfully" });
  },
);
