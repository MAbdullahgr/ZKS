// src/services/purchaseService.ts
//
// Business logic for purchase orders. Extracted from
// src/app/api/purchases/route.ts, purchases/[id]/route.ts,
// purchases/[id]/receive/route.ts, purchases/[id]/send/route.ts.
//
// Key responsibilities:
//   1. Create a purchase order with items
//   2. Update PO status (draft → ordered → partial → received)
//   3. Receive items: increment stock, create batch, update supplier ledger
//   4. Send PO (mark as ordered)

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-error";
import { Prisma } from "@generated/prisma/client";
import { receiveStock } from "./inventoryService";
import type { Tx } from "./types";
import { postPurchaseReceiptJournalEntry } from "./accountingService";

export interface CreatePurchaseOrderInput {
  storeId: string;
  supplierId: string;
  expectedDate?: Date | null;
  notes?: string | null;
  items: Array<{
    productId: string;
    quantity: number;
    unitCost: number;
  }>;
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  // Verify supplier belongs to this store
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, storeId: input.storeId },
    select: { id: true },
  });
  if (!supplier) {
    throw new HttpError("Supplier not found in this store", 404, "NOT_FOUND");
  }

  // Verify all products belong to this store
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId: input.storeId },
    select: { id: true },
  });
  if (products.length !== productIds.length) {
    throw new HttpError(
      "One or more products do not belong to this store",
      400,
      "VALIDATION_ERROR",
    );
  }

  // FIX P1-6: Validate unitCost and quantity are non-negative for each item.
  for (const item of input.items) {
    if (item.unitCost < 0) {
      throw new HttpError(
        `Unit cost cannot be negative for product ${item.productId}`,
        400,
        "VALIDATION_ERROR",
      );
    }
    if (item.quantity < 0) {
      throw new HttpError(
        `Quantity cannot be negative for product ${item.productId}`,
        400,
        "VALIDATION_ERROR",
      );
    }
  }

  const totalAmount = input.items.reduce(
    (sum, i) => sum + i.quantity * i.unitCost,
    0,
  );
  const orderNumber = `PO-${Date.now()}`;

  const order = await prisma.purchaseOrder.create({
    data: {
      storeId: input.storeId,
      supplierId: input.supplierId,
      orderNumber,
      expectedDate: input.expectedDate || null,
      totalAmount,
      notes: input.notes || null,
      status: "draft",
      items: {
        create: input.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitCost: i.unitCost,
          total: i.quantity * i.unitCost,
        })),
      },
    },
    include: {
      supplier: true,
      items: { include: { product: true } },
    },
  });

  return order;
}

// ─── Receive items against a purchase order ──────────────────────────────

export interface ReceivePurchaseItemInput {
  purchaseOrderItemId: string;
  receivedQty: number;
  newCostPrice?: number;
}

export interface ReceivePurchaseOrderInput {
  purchaseOrderId: string;
  storeId: string;
  items: ReceivePurchaseItemInput[];
  userId: string;
}

export interface ReceivePurchaseOrderResult {
  totalReceivedValue: number;
  newStatus: "draft" | "ordered" | "partial" | "received";
}

export async function receivePurchaseOrder(
  input: ReceivePurchaseOrderInput,
): Promise<ReceivePurchaseOrderResult> {
  const result = await prisma.$transaction(
    async (tx: Tx) => {
      // Fetch the PO INSIDE the transaction to avoid stale data.
      const order = await tx.purchaseOrder.findFirst({
        where: { id: input.purchaseOrderId, storeId: input.storeId },
        include: { items: true, supplier: true },
      });

      if (!order) {
        throw new HttpError("Purchase order not found", 404, "NOT_FOUND");
      }
      if (order.status === "received" || order.status === "cancelled") {
        throw new HttpError(
          "Order already completed or cancelled",
          400,
          "ORDER_COMPLETED",
        );
      }
      // AUDIT-FIX (5-c #7): Block receiving a DRAFT purchase order. The PO
      // state machine only allows `draft → ordered, cancelled`, but the old
      // status check above only blocked `received`/`cancelled` — so a draft
      // PO could be received directly, bypassing the "send" step. A draft PO
      // hasn't been sent to the supplier yet, so receiving against it is
      // nonsensical and corrupts the audit trail.
      if (order.status === "draft") {
        throw new HttpError(
          "Cannot receive a draft purchase order — send it to the supplier first.",
          400,
          "INVALID_STATUS_TRANSITION",
        );
      }

      let totalReceivedValue = 0;

      for (const receivedItem of input.items) {
        const orderItem = order.items.find(
          (i) => i.id === receivedItem.purchaseOrderItemId,
        );
        if (!orderItem) continue;

        const orderedQty = Number(orderItem.quantity);
        const currentlyReceived = Number(orderItem.receivedQty);

        if (currentlyReceived + receivedItem.receivedQty > orderedQty + 0.001) {
          throw new HttpError(
            `Cannot receive more than ordered. Ordered: ${orderedQty}, already received: ${currentlyReceived}, trying to receive: ${receivedItem.receivedQty}`,
            400,
            "VALIDATION_ERROR",
          );
        }

        await tx.purchaseOrderItem.update({
          where: { id: receivedItem.purchaseOrderItemId },
          data: { receivedQty: { increment: receivedItem.receivedQty } },
        });

        // ─── Weighted-Average Cost (WAC) ────────────────────────────
        // Fetch the product's pre-receipt stock + cost so we can compute
        // the weighted-average cost across (existing stock + received qty).
        // This ensures COGS uses the average cost across all batches on
        // hand, not just the most-received cost — which would over-state
        // COGS when a cheap receipt follows an expensive one (or vice
        // versa).
        //
        // NOTE: must fetch BEFORE receiveStock() runs — receiveStock
        // increments stockQuantity, so reading after would give us the
        // post-receipt stock and skew the WAC.
        const product = await tx.product.findFirst({
          where: { id: orderItem.productId, storeId: input.storeId },
          select: { id: true, stockQuantity: true, costPrice: true },
        });
        if (!product) {
          throw new HttpError(
            `Product not found for PO item ${orderItem.id}`,
            404,
            "NOT_FOUND",
          );
        }

        const receivedUnitCost =
          receivedItem.newCostPrice ?? Number(orderItem.unitCost);

        await receiveStock(
          {
            storeId: input.storeId,
            productId: orderItem.productId,
            quantity: receivedItem.receivedQty,
            costPrice: receivedUnitCost,
            reason: `Purchase order ${order.orderNumber} receipt`,
            userId: input.userId,
          },
          tx,
        );

        // WAC: newCost = (currentStockValue + receivedValue) / (currentQty + receivedQty)
        // - currentStock = pre-receipt stock (we fetched it above)
        // - currentCost  = pre-receipt costPrice
        // - receivedQty  = this receipt's quantity
        // - receivedCost = this receipt's unit cost (override or PO item unit cost)
        //
        // Edge cases:
        //   - totalQty === 0  → fall back to receivedCost (can't divide by 0;
        //     happens only if both currentStock and receivedQty are 0)
        //   - currentStock < 0 → clamp to 0 (shouldn't happen, but defensive)
        const currentStock = Math.max(0, Number(product.stockQuantity));
        const currentCost = Number(product.costPrice);
        const receivedQty = receivedItem.receivedQty;
        const receivedCost = receivedUnitCost;

        const currentStockValue = currentStock * currentCost;
        const receivedValue = receivedQty * receivedCost;
        const totalQty = currentStock + receivedQty;
        const newWAC =
          totalQty > 0
            ? (currentStockValue + receivedValue) / totalQty
            : receivedCost;

        // Round to 2dp to match the Product.costPrice column precision
        // (Decimal(10, 2)) — avoids floating-point noise like 123.45678901
        // being written and Prisma re-rounding on next read.
        const newWACRounded = Math.round(newWAC * 100) / 100;

        // Always update costPrice on receipt — WAC changes with every
        // receipt, even when no newCostPrice override is provided (the PO
        // item's unitCost is the received cost in that case).
        await tx.product.update({
          where: { id: product.id },
          data: { costPrice: newWACRounded },
        });

        totalReceivedValue += receivedItem.receivedQty * receivedUnitCost;
      }

      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: input.purchaseOrderId },
      });

      const allReceived = updatedItems.every(
        (i) => Number(i.receivedQty) >= Number(i.quantity),
      );
      const anyReceived = updatedItems.some((i) => Number(i.receivedQty) > 0);

      const newStatus: "draft" | "ordered" | "partial" | "received" =
        allReceived ? "received" : anyReceived ? "partial" : "ordered";

      await tx.purchaseOrder.update({
        where: { id: input.purchaseOrderId },
        data: {
          status: newStatus,
          ...(allReceived && { receivedDate: new Date() }),
        },
      });

      if (totalReceivedValue > 0) {
        const supplier = await tx.supplier.findFirst({
          where: { id: order.supplierId, storeId: input.storeId },
          select: { balance: true },
        });

        if (!supplier) {
          throw new HttpError("Supplier not found", 404, "NOT_FOUND");
        }

        const currentBalance = Number(supplier.balance);
        const newBalance = currentBalance + totalReceivedValue;

        await tx.supplierLedger.create({
          data: {
            storeId: input.storeId,
            supplierId: order.supplierId,
            type: "credit",
            amount: totalReceivedValue,
            balanceAfter: newBalance,
            note: `Stock received for PO ${order.orderNumber}`,
            purchaseOrderId: order.id,
          },
        });

        await tx.supplier.update({
          where: { id: order.supplierId },
          data: { balance: { increment: totalReceivedValue } },
        });
      }

      // AUDIT-FIX (5-c #2): Post the PO receipt journal entry INSIDE the
      // Serializable transaction. Previously it was posted AFTER the tx
      // committed — if the JE failed, the error was swallowed and the PO
      // stayed committed with stock incremented + supplier ledger credited
      // but NO GL Inventory/AP entry → silent GL drift. Now a JE failure
      // rolls back the entire receipt (stock, supplier ledger, PO status).
      if (totalReceivedValue > 0) {
        await postPurchaseReceiptJournalEntry(
          input.storeId,
          {
            purchaseOrderId: input.purchaseOrderId,
            orderNumber: order.orderNumber,
            totalReceivedValue,
          },
          tx,
        );
      }

      return { totalReceivedValue, newStatus, orderNumber: order.orderNumber };
    },
    {
      timeout: 15000,
      maxWait: 5000,
      // FIX P1-21: Add Serializable isolation — other services (saleService,
      // returnService) use this level. Without it, concurrent receives can
      // over-receive on the same PO item.
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  // JE posting now happens INSIDE the Serializable transaction (see
  // AUDIT-FIX 5-c #2 above), so there's no post-tx auto-post block.

  return {
    totalReceivedValue: result.totalReceivedValue,
    newStatus: result.newStatus,
  };
}

// ─── Send PO (mark as ordered) ───────────────────────────────────────────

export async function sendPurchaseOrder(
  purchaseOrderId: string,
  storeId: string,
): Promise<{
  orderNumber: string;
  sentAt: string;
}> {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, storeId },
    select: { status: true, orderNumber: true },
  });

  if (!order) {
    throw new HttpError("Purchase order not found", 404, "NOT_FOUND");
  }
  if (order.status !== "draft") {
    throw new HttpError("Can only send draft orders", 400, "VALIDATION_ERROR");
  }

  await prisma.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: { status: "ordered" },
  });

  return {
    orderNumber: order.orderNumber,
    sentAt: new Date().toISOString(),
  };
}

// ─── Serialize helpers ───────────────────────────────────────────────────

export function serializePurchaseOrder(
  order: Prisma.PurchaseOrderGetPayload<{
    include: {
      supplier: true;
      items: {
        include: {
          product: {
            select: { name: true; sku: true; stockQuantity: true };
          };
        };
      };
    };
  }>,
) {
  const items = order.items.map((item) => ({
    ...item,
    quantity: Number(item.quantity),
    unitCost: Number(item.unitCost),
    total: Number(item.total),
    receivedQty: Number(item.receivedQty),
  }));

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxAmount = 0;
  const totalAmount = Number(order.totalAmount);

  return {
    ...order,
    totalAmount,
    subtotal,
    taxAmount,
    orderDate: order.orderDate.toISOString(),
    expectedDate: order.expectedDate?.toISOString() ?? undefined,
    receivedDate: order.receivedDate?.toISOString() ?? undefined,
    items,
  };
}
