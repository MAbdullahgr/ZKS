import { NextRequest } from "next/server";
import { requireAuth, logAudit, requireStoreId } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { recordKhataSchema } from "@/lib/validations/customer";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { recordKhata } from "@/services/khataService";

export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireAuth();
    // FIX: Warehouse is excluded from Customers module — block API access too.
    if (session.role === "warehouse") throw new HttpError("Warehouse staff cannot access customer data", 403, "FORBIDDEN");
    const targetStoreId = requireStoreId(session);
    const { id } = await params;

    const body = await req.json();
    const { amount, type, note } = recordKhataSchema.parse(body);

    // Delegate to the service layer
    const result = await recordKhata({
      customerId: id,
      storeId: targetStoreId,
      amount,
      type,
      note,
    });

    await logAudit({
      userId: session.userId,
      storeId: targetStoreId,
      action: "KHATA_TRANSACTION_RECORDED",
      entityType: "Customer",
      entityId: id,
      details: {
        type,
        amount,
        newBalance: result.newBalance,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      {
        transactionId: result.transactionId,
        newBalance: result.newBalance,
      },
      "Khata transaction recorded successfully",
      201,
    );
  },
);
