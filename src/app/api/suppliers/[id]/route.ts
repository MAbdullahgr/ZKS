import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWarehouse, requireStoreId, getStoreFilter, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateSupplierSchema } from "@/lib/validations/supplier";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const session = await requireWarehouse();
    // FIX P2-7: Use getStoreFilter on reads — owner in All Stores mode can
    // view any supplier.
    const { storeId } = getStoreFilter(session);
    const { id } = await params;

    const supplier = await prisma.supplier.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        name: true,
        contactPerson: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        balance: true,
        ledgerEntries: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        purchaseOrders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    });

    if (!supplier) throw new HttpError("Supplier not found", 404, "NOT_FOUND");

    return apiSuccess({
      supplier: {
        ...supplier,
        balance: Number(supplier.balance),
        ledgerEntries: supplier.ledgerEntries.map((e) => ({
          ...e,
          amount: Number(e.amount),
          balanceAfter: Number(e.balanceAfter),
        })),
        purchaseOrders: supplier.purchaseOrders.map((p) => ({
          ...p,
          totalAmount: Number(p.totalAmount),
        })),
      },
    });
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireWarehouse();
    const storeId = requireStoreId(session);
    const { id } = await params;
    const body = await req.json();
    const updateData = updateSupplierSchema.parse(body);

    if (Object.keys(updateData).length === 0) {
      throw new HttpError("No fields to update", 400, "VALIDATION_ERROR");
    }

    // Verify supplier belongs to this store
    const existing = await prisma.supplier.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new HttpError("Supplier not found", 404, "NOT_FOUND");

    if (updateData.email) {
      updateData.email = updateData.email.toLowerCase().trim();
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        contactPerson: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        balance: true,
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "SUPPLIER_UPDATED",
      entityType: "Supplier",
      entityId: id,
      details: { updates: updateData } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      supplier: { ...supplier, balance: Number(supplier.balance) },
    });
  },
);

export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireWarehouse();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify supplier belongs to this store
    const existing = await prisma.supplier.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new HttpError("Supplier not found", 404, "NOT_FOUND");

    const [productCount, orderCount] = await Promise.all([
      prisma.product.count({
        where: { supplierId: id, storeId, isActive: true },
      }),
      prisma.purchaseOrder.count({
        where: {
          supplierId: id,
          storeId,
          status: { not: "cancelled" },
        },
      }),
    ]);

    if (productCount > 0 || orderCount > 0) {
      throw new HttpError(
        `Cannot delete — this supplier has ${productCount} active product(s) and ${orderCount} order(s). Reassign or resolve them first.`,
        409,
        "FOREIGN_KEY_CONSTRAINT",
      );
    }

    await prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "SUPPLIER_DELETED",
      entityType: "Supplier",
      entityId: id,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Supplier deactivated successfully" });
  },
);
