import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreId, logAudit, requireWarehouse } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { receivePurchaseOrderSchema } from "@/lib/validations/purchase";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { receivePurchaseOrder } from "@/services/purchaseService";

export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireWarehouse();
    const storeId = requireStoreId(session);
    const { id } = await params;

    const body = await req.json();
    const { items: receivedItems } = receivePurchaseOrderSchema.parse(body);

    // Verify PO belongs to this store
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, storeId },
      select: { storeId: true },
    });
    if (!po) {
      throw new HttpError("Purchase order not found", 404, "NOT_FOUND");
    }

    // Delegate to the service layer
    const result = await receivePurchaseOrder({
      purchaseOrderId: id,
      storeId: po.storeId,
      items: receivedItems,
      userId: session.userId,
    });

    await logAudit({
      userId: session.userId,
      storeId: po.storeId,
      action: "PURCHASE_ORDER_RECEIVED",
      entityType: "PurchaseOrder",
      entityId: id,
      details: {
        itemsReceived: receivedItems.length,
        totalValue: result.totalReceivedValue,
        newStatus: result.newStatus,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      {
        totalReceivedValue: result.totalReceivedValue,
        newStatus: result.newStatus,
      },
      "Stock received and supplier ledger updated successfully",
    );
  },
);
