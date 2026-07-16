import { NextRequest } from "next/server";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { processReturnSchema } from "@/lib/validations/sale";
import { Prisma } from "@generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { processReturn } from "@/services/returnService";

export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // AUDIT-FIX H-28: Rate-limit returns per manager+IP. Returns are a
    // refund-fraud vector — a compromised manager JWT could script returns
    // to drain cash. 20/min is generous for normal use.
    const rl = await rateLimit("financialMutation", `${session.userId}:${ip}`);
    if (!rl.success) {
      throw new HttpError(
        "Too many returns processed. Please slow down.",
        429,
        "RATE_LIMITED",
        rateLimitHeaders(rl),
      );
    }

    const body = await req.json();
    const { items, refundLines, reason, registerSessionId, idempotencyKey } =
      processReturnSchema.parse(body);

    // Delegate to the service layer
    const result = await processReturn(
      id,
      { items, refundLines, reason, registerSessionId, idempotencyKey },
      { userId: session.userId, role: session.role, storeId },
    );

    await logAudit({
      userId: session.userId,
      storeId: result.storeId,
      action: "SALE_RETURNED",
      entityType: "SaleReturn",
      entityId: result.saleReturnId,
      details: {
        originalSaleId: id,
        returnNumber: result.returnNumber,
        totalReturn: result.totalReturn,
        refundMethods: refundLines.map((l) => l.method),
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      {
        saleReturnId: result.saleReturnId,
        returnNumber: result.returnNumber,
        totalReturn: result.totalReturn,
      },
      "Return processed successfully",
      201,
      rateLimitHeaders(rl),
    );
  },
);
