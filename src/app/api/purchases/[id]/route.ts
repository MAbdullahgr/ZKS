import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreId, getStoreFilter, logAudit, requireWarehouse } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updatePurchaseOrderSchema } from "@/lib/validations/purchase";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import {
  assertTransition,
  isPatchAllowedTransition,
  type POStatus,
} from "@/services/poStateMachine";

function serializeOrder(
  order: Prisma.PurchaseOrderGetPayload<{
    include: {
      supplier: true;
      items: {
        include: {
          product: { select: { name: true; sku: true; stockQuantity: true } };
        };
      };
    };
  }>,
) {
  const items = order.items.map((item) => ({
    ...item,
    // FIX: Force Number() to prevent string concatenation in frontend
    quantity: Number(item.quantity),
    unitCost: Number(item.unitCost),
    total: Number(item.total),
    receivedQty: Number(item.receivedQty),
  }));

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxRate = 0;
  const taxAmount = subtotal * taxRate;
  const totalAmount = Number(order.totalAmount);

  return {
    ...order,
    totalAmount,
    subtotal,
    taxAmount,
    orderDate: order.orderDate.toISOString(),
    expectedDate: order.expectedDate?.toISOString() ?? undefined,
    receivedDate: order.receivedDate?.toISOString() ?? undefined,
    items,
  };
}

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const session = await requireWarehouse();
    // FIX P2-7: Use getStoreFilter on reads — owner in All Stores mode can
    // view any purchase order.
    const { storeId } = getStoreFilter(session);
    const { id } = await params;

    const order = await prisma.purchaseOrder.findFirst({
      where: { id, storeId },
      include: {
        supplier: true,
        items: {
          include: {
            product: { select: { name: true, sku: true, stockQuantity: true } },
          },
        },
      },
    });

    if (!order)
      throw new HttpError("Purchase order not found", 404, "NOT_FOUND");

    return apiSuccess({ order: serializeOrder(order) });
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireWarehouse();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify PO belongs to this store
    const existing = await prisma.purchaseOrder.findFirst({
      where: { id, storeId },
      select: { id: true, status: true },
    });
    if (!existing)
      throw new HttpError("Purchase order not found", 404, "NOT_FOUND");

    const body = await req.json();
    const { status, notes } = updatePurchaseOrderSchema.parse(body);

    // ─── State machine validation ────────────────────────────────────
    // PATCH may only perform the transitions in PATCH_ALLOWED_TRANSITIONS:
    //   draft → ordered           (Send/Confirm)
    //   ordered → cancelled       (Cancel)
    //   partial → cancelled       (Cancel)
    // All other transitions must go through /receive (receiving) or /send
    // (legacy draft → ordered). Receiving posts a JE + supplier ledger +
    // stock increment; it MUST NOT be reachable via a status-only PATCH.
    if (status) {
      const fromStatus = existing.status as POStatus;
      const toStatus = status as POStatus;
      // First, gate to PATCH-allowed transitions only.
      if (!isPatchAllowedTransition(fromStatus, toStatus)) {
        throw new HttpError(
          `Cannot set status to "${toStatus}" via PATCH from "${fromStatus}". Use the /receive or /send endpoint for that transition.`,
          400,
          "INVALID_STATUS_TRANSITION",
        );
      }
      // Then run the full state-machine assertion (defensive — should
      // always pass for PATCH-allowed transitions, but guards against
      // future changes to PATCH_ALLOWED_TRANSITIONS that violate the
      // global VALID_TRANSITIONS table).
      assertTransition(fromStatus, toStatus);
    }

    const updateData: Prisma.PurchaseOrderUpdateInput = {};
    if (status) {
      updateData.status = status;
      if (status === "cancelled") updateData.receivedDate = null;
    }
    if (notes !== undefined) updateData.notes = notes || null;

    const order = await prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        supplier: true,
        items: {
          include: {
            product: { select: { name: true, sku: true, stockQuantity: true } },
          },
        },
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "PURCHASE_ORDER_UPDATED",
      entityType: "PurchaseOrder",
      entityId: id,
      details: {
        updates: { status, notes },
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ order: serializeOrder(order) });
  },
);

export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const ip = getClientIp(_req);
    const userAgent = _req.headers.get("user-agent") ?? "unknown";

    const session = await requireWarehouse();
    const storeId = requireStoreId(session);
    const { id } = await params;

    const order = await prisma.purchaseOrder.findFirst({
      where: { id, storeId },
      select: { status: true },
    });

    if (!order)
      throw new HttpError("Purchase order not found", 404, "NOT_FOUND");

    if (order.status !== "draft") {
      throw new HttpError("Only draft orders can be deleted", 409, "FORBIDDEN");
    }

    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrderId: id },
    });
    await prisma.purchaseOrder.delete({ where: { id } });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "PURCHASE_ORDER_DELETED",
      entityType: "PurchaseOrder",
      entityId: id,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Purchase order deleted successfully" });
  },
);
