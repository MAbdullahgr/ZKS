import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getStoreFilterOrNull,
  requireStoreId,
  logAudit,
  requireWarehouse,
} from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createPurchaseOrderSchema } from "@/lib/validations/purchase";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import {
  createPurchaseOrder,
  serializePurchaseOrder,
} from "@/services/purchaseService";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

export const GET = withErrorHandler(async (req: NextRequest) => {
  // FIX: Cashier should not access purchase order data — change from
  // requireAuth() to requireWarehouse(). The POST already uses requireWarehouse().
  const session = await requireWarehouse();
  // Owners in "All Stores" mode legitimately need to see purchase orders
  // across all stores, so we use getStoreFilterOrNull (not requireStoreId).
  const storeFilter = getStoreFilterOrNull(session);
  const storeId = storeFilter?.storeId;
  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = parsePagination(req);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const countOnly = searchParams.get("countOnly") === "true";

  const where: Prisma.PurchaseOrderWhereInput = {
    ...(storeId && { storeId }),
    ...(search && {
      OR: [
        { orderNumber: { contains: search } },
        { supplier: { name: { contains: search } } },
      ],
    }),
    ...(status && { status: status as Prisma.EnumPurchaseOrderStatusFilter }),
  };

  if (countOnly) {
    const counts = await prisma.purchaseOrder.groupBy({
      by: ["status"],
      where: { ...(storeId && { storeId }) },
      _count: { status: true },
    });
    const result: Record<string, number> = {};
    counts.forEach((c) => {
      result[c.status] = c._count.status;
    });
    return apiSuccess({ counts: result });
  }

  const [orders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        supplier: { select: { name: true, email: true } },
        store: { select: { name: true } },
        items: { select: { quantity: true, receivedQty: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  const serialized = orders.map((o) => ({
    ...o,
    totalAmount: Number(o.totalAmount),
  }));

  return apiSuccess({
    orders: serialized,
    ...paginatedMeta(page, limit, total),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireWarehouse();
  const body = await req.json();
  const { supplierId, expectedDate, notes, items } =
    createPurchaseOrderSchema.parse(body);

  const storeId = requireStoreId(session);

  // Delegate to the service layer
  const order = await createPurchaseOrder({
    storeId,
    supplierId,
    expectedDate: expectedDate ? new Date(expectedDate) : null,
    notes: notes || null,
    items,
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "PURCHASE_ORDER_CREATED",
    entityType: "PurchaseOrder",
    entityId: order.id,
    details: {
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      supplierId,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { order: serializePurchaseOrder(order) },
    "Purchase order created successfully",
    201,
  );
});
