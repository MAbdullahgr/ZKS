import { NextRequest } from "next/server";

import { requireWarehouse, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { receiveTransfer } from "@/services/stockTransferService";

// POST /api/transfers/[id]/receive — receive the transfer
export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireWarehouse();
    const destStoreId = requireStoreId(session);
    const { id } = await params;

    const result = await receiveTransfer(id, destStoreId, session.userId);

    await logAudit({
      userId: session.userId,
      storeId: destStoreId,
      action: "TRANSFER_RECEIVED",
      entityType: "StockTransfer",
      entityId: id,
      details: {
        transferNumber: result.transferNumber,
        totalValue: result.totalValue,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      result,
      `Transfer ${result.transferNumber} received successfully`,
    );
  },
);
