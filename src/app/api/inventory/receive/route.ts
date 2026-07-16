import { NextRequest } from "next/server";
import { logAudit, requireStoreId, requireWarehouse } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { receiveStockSchema } from "@/lib/validations/product";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { receiveStock } from "@/services/inventoryService";

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireWarehouse();
  const targetStoreId = requireStoreId(session);

  const body = await req.json();
  const { productId, batchNumber, expiryDate, quantity, costPrice, reason } =
    receiveStockSchema.parse(body);

  // Delegate to the service layer
  const result = await receiveStock({
    storeId: targetStoreId,
    productId,
    quantity,
    costPrice,
    batchNumber: batchNumber || null,
    expiryDate: expiryDate ? new Date(expiryDate) : null,
    reason: reason || undefined,
    userId: session.userId,
  });

  await logAudit({
    userId: session.userId,
    storeId: targetStoreId,
    action: "STOCK_RECEIVED",
    entityType: "Product",
    entityId: productId,
    details: {
      quantity,
      costPrice,
      batchNumber,
      previousStock: result.previousStock,
      newStock: result.newStock,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    {
      batchId: result.batchId,
      previousStock: result.previousStock,
      newStock: result.newStock,
    },
    "Stock received successfully",
    201,
  );
});
