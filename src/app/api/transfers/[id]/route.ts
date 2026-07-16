import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWarehouse } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { serializeTransfer } from "@/services/stockTransferService";

// GET /api/transfers/[id] — transfer detail with items
export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const session = await requireWarehouse();
    const { id } = await params;

    const transfer = await prisma.stockTransfer.findFirst({
      where: { id },
      include: {
        items: true,
        sourceStore: { select: { id: true, name: true } },
        destStore: { select: { id: true, name: true } },
        dispatchedBy: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true } },
          },
        },
        receivedBy: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true } },
          },
        },
        cancelledBy: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true } },
          },
        },
      },
    });

    if (!transfer) throw new HttpError("Transfer not found", 404, "NOT_FOUND");

    // Authorization: warehouse/manager can only see transfers involving their store
    if (session.role === "warehouse" || session.role === "manager") {
      if (
        transfer.sourceStoreId !== session.storeId &&
        transfer.destStoreId !== session.storeId
      ) {
        throw new HttpError("Forbidden", 403, "FORBIDDEN");
      }
    }

    return apiSuccess({ transfer: serializeTransfer(transfer) });
  },
);
