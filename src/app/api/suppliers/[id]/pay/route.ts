import { NextRequest } from "next/server";
import { requireManager, logAudit, requireStoreId } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { paySupplierSchema } from "@/lib/validations/supplier";
import { Prisma } from "@generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { recordSupplierPayment } from "@/services/khataService";
import { prisma } from "@/lib/prisma";

export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const targetStoreId = requireStoreId(session);
    const { id } = await params;

    // AUDIT-FIX (5-b + 5-c #13): Rate-limit supplier payments (cash-drain
    // vector) and cap overpayment. A manager (or stolen manager JWT) could
    // otherwise pay Rs 1,000,000 to a supplier owed Rs 100, driving AP
    // negative and draining the Cash account. 20/min is generous for normal
    // use; the overpayment cap flags likely typos while still allowing
    // legitimate prepayments (up to 1.5× the balance).
    const rl = await rateLimit(
      "financialMutation",
      `${session.userId}:${ip}`,
    );
    if (!rl.success) {
      throw new HttpError(
        "Too many payment requests. Please slow down.",
        429,
        "RATE_LIMITED",
        rateLimitHeaders(rl),
      );
    }

    const body = await req.json();
    const { amount, note, type } = paySupplierSchema.parse(body);

    // AUDIT-FIX (5-c #13): For "payment" type (we pay the supplier), reject
    // gross overpayments that would drive AP deeply negative. A payment up to
    // 1.5× the current balance is allowed (legitimate prepayment); beyond that
    // is almost certainly a typo and is rejected. "debit" (refund to us) is
    // not capped here — the supplier ledger + GL handle it.
    if (type === "payment") {
      const supplier = await prisma.supplier.findFirst({
        where: { id, storeId: targetStoreId },
        select: { balance: true, name: true },
      });
      if (!supplier) {
        throw new HttpError("Supplier not found", 404, "NOT_FOUND");
      }
      const currentBalance = Number(supplier.balance);
      if (currentBalance > 0 && amount > currentBalance * 1.5) {
        throw new HttpError(
          `Payment of Rs ${amount.toFixed(2)} far exceeds the amount owed to ${supplier.name} (Rs ${currentBalance.toFixed(2)}). If this is a legitimate prepayment, record it as a smaller payment or contact an administrator.`,
          400,
          "OVERPAYMENT_REJECTED",
        );
      }
    }

    // Delegate to the service layer
    const result = await recordSupplierPayment({
      supplierId: id,
      storeId: targetStoreId,
      amount,
      type,
      note,
    });

    await logAudit({
      userId: session.userId,
      storeId: targetStoreId,
      action: "SUPPLIER_PAYMENT_RECORDED",
      entityType: "Supplier",
      entityId: id,
      details: {
        amount,
        type,
        newBalance: result.newBalance,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      {
        supplierId: result.supplierId,
        newBalance: result.newBalance,
      },
      "Payment recorded successfully",
      201,
      rateLimitHeaders(rl),
    );
  },
);
