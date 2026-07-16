import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreId, logAudit, requireWarehouse } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { sendPurchaseOrder } from "@/services/purchaseService";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const ip = getClientIp(_req);
    const userAgent = _req.headers.get("user-agent") ?? "unknown";

    const session = await requireWarehouse();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify PO belongs to this store
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, storeId },
      select: { id: true },
    });
    if (!po) throw new HttpError("Purchase order not found", 404, "NOT_FOUND");

    const result = await sendPurchaseOrder(id, storeId);

    await logAudit({
      userId: session.userId,
      storeId,
      action: "PURCHASE_ORDER_SENT",
      entityType: "PurchaseOrder",
      entityId: id,
      details: {
        orderNumber: result.orderNumber,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ sentAt: result.sentAt }, "Order marked as sent");
  },
);
