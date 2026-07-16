import { NextRequest } from "next/server";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { settleTransfers } from "@/services/stockTransferService";

// POST /api/transfers/settle — settle all received transfers for current store
export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);

  const result = await settleTransfers(storeId);

  await logAudit({
    userId: session.userId,
    storeId,
    action: "TRANSFERS_SETTLED",
    entityType: "StockTransfer",
    details: {
      count: result.count,
      totalValue: result.totalValue,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    result,
    `Settled ${result.count} transfer(s) worth ${result.totalValue.toLocaleString("en-PK")} Rs.`,
  );
});
