// src/services/inventoryService.ts
//
// Business logic for inventory adjustments. Extracted from
// src/app/api/inventory/receive/route.ts and shared across routes.
//
// Key responsibilities:
//   1. Create an InventoryAdjustment record (audit trail)
//   2. Optionally update Product.stockQuantity
//   3. Optionally create a ProductBatch (for batch-tracked receiving)

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-error";
import { InventoryReferenceType } from "@generated/prisma/client";
import type { Tx } from "./types";
import { postInventoryAdjustmentJournalEntry } from "./accountingService";

export interface StockAdjustmentInput {
  storeId: string;
  productId: string;
  type: "add" | "remove" | "set" | "damage" | "return";
  quantity: number;
  reason?: string;
  referenceType?: InventoryReferenceType;
  referenceId?: string;
  userId?: string;
}

export interface StockAdjustmentResult {
  adjustmentId: string;
  previousStock: number;
  newStock: number;
}

/**
 * Records a stock adjustment AND updates Product.stockQuantity.
 * Use this for: sales (remove), returns (return), damage (damage), manual adjustments.
 *
 * For purchase-order receiving (where you also want to create a ProductBatch),
 * use `receiveStock` instead.
 */
export async function adjustStock(
  input: StockAdjustmentInput,
  tx?: Tx,
): Promise<StockAdjustmentResult> {
  const client = tx ?? prisma;

  // FIX P1-6 + P2-2: Validate inputs. Negative quantity corrupts stock.
  // For remove/damage, must check atomically that stock won't go negative.
  if (input.quantity < 0) {
    throw new HttpError(
      "Quantity cannot be negative",
      400,
      "VALIDATION_ERROR",
    );
  }

  const product = await client.product.findFirst({
    where: { id: input.productId, storeId: input.storeId },
    select: { id: true, stockQuantity: true, name: true, costPrice: true },
  });

  if (!product) {
    throw new HttpError("Product not found", 404, "NOT_FOUND");
  }

  const previousStock = Number(product.stockQuantity);
  const costPrice = Number(product.costPrice);
  let newStock: number;

  switch (input.type) {
    case "add":
    case "return":
      newStock = previousStock + input.quantity;
      await client.product.update({
        where: { id: input.productId },
        data: { stockQuantity: { increment: input.quantity } },
      });
      break;
    case "remove":
    case "damage":
      // FIX P2-2 + new bug fix: Use atomic updateMany with gte check to
      // prevent race conditions. Two concurrent removes can both pass the
      // pre-check above (previousStock < input.quantity) but then both
      // decrement, driving stock negative. The updateMany with a gte guard
      // is atomic — only succeeds if stock is still sufficient.
      {
        const updateResult = await client.product.updateMany({
          where: {
            id: input.productId,
            stockQuantity: { gte: input.quantity },
          },
          data: { stockQuantity: { decrement: input.quantity } },
        });
        if (updateResult.count === 0) {
          // FIX: Re-read the current stock for an accurate error message.
          // `previousStock` is from the initial read — in a race condition,
          // another request may have decremented it since then.
          const current = await client.product.findFirst({
            where: { id: input.productId },
            select: { stockQuantity: true },
          });
          const actualStock = current ? Number(current.stockQuantity) : 0;
          throw new HttpError(
            `Insufficient stock for "${product.name}". Available: ${actualStock}, Requested: ${input.quantity}`,
            400,
            "INSUFFICIENT_STOCK",
          );
        }
        newStock = previousStock - input.quantity;

        // AUDIT-FIX (5-c #11): Decrement ProductBatch.quantity in FIFO order
        // for manual remove/damage so batch tracking stays accurate. Only
        // applies when a tx is provided (adjustStock may be called standalone
        // — in that case the batch decrement is skipped to avoid running
        // outside a transaction).
        if (tx) {
          await decrementProductBatches(
            tx,
            input.storeId,
            input.productId,
            input.quantity,
          );
        }
      }
      break;
    case "set":
      newStock = input.quantity;
      await client.product.update({
        where: { id: input.productId },
        data: { stockQuantity: input.quantity },
      });
      break;
  }

  const adjustment = await client.inventoryAdjustment.create({
    data: {
      storeId: input.storeId,
      productId: input.productId,
      type: input.type,
      quantity: input.quantity,
      previousStock,
      newStock,
      reason: input.reason || null,
      referenceType: input.referenceType || null,
      referenceId: input.referenceId || null,
      userId: input.userId || null,
    },
  });

  // AUDIT-FIX H-17: Post a journal entry so the GL Inventory account
  // stays in sync with physical stock. Previously manual adjustments
  // (damage, set, add) posted NO JE — GL Inventory diverged from
  // physical stock and the balance sheet inventory value was wrong.
  // Non-blocking: if the JE fails, the stock adjustment still succeeds
  // (the InventoryAdjustment record is the source of truth for stock;
  // the JE is for the GL). A reconciliation cron can detect missing JEs.
  if (!tx) {
    // Only post if we're NOT inside a transaction — if the caller passed
    // a tx, they're responsible for posting the JE within their tx.
    await postInventoryAdjustmentJournalEntry(input.storeId, {
      id: adjustment.id,
      productId: input.productId,
      productName: product.name,
      type: input.type,
      quantity: input.quantity,
      previousStock,
      newStock,
      costPrice,
      reason: input.reason || null,
    }).catch((err) => {
      console.error("[inventory] Failed to post adjustment JE:", err);
    });
  }

  return {
    adjustmentId: adjustment.id,
    previousStock,
    newStock,
  };
}

// ─── Receive stock (with optional batch creation) ────────────────────────

export interface ReceiveStockInput {
  storeId: string;
  productId: string;
  quantity: number;
  costPrice: number;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  reason?: string;
  userId?: string;
}

export interface ReceiveStockResult {
  batchId: string;
  adjustmentId: string;
  previousStock: number;
  newStock: number;
}

/**
 * Receives stock into inventory:
 *   1. Creates a ProductBatch (for expiry tracking)
 *   2. Increments Product.stockQuantity
 *   3. Creates an InventoryAdjustment (type: add) with the CORRECT previousStock
 */
export async function receiveStock(
  input: ReceiveStockInput,
  tx?: Tx,
): Promise<ReceiveStockResult> {
  const client = tx ?? prisma;

  // FIX P1-6: Validate costPrice and quantity are non-negative.
  if (input.costPrice < 0) {
    throw new HttpError(
      "Cost price cannot be negative",
      400,
      "VALIDATION_ERROR",
    );
  }
  if (input.quantity < 0) {
    throw new HttpError(
      "Quantity cannot be negative",
      400,
      "VALIDATION_ERROR",
    );
  }

  const product = await client.product.findFirst({
    where: { id: input.productId, storeId: input.storeId },
    // AUDIT-FIX (5-c #1): select costPrice so we can recompute WAC after the
    // receive. Without WAC, Product.costPrice stays stale → every subsequent
    // sale understates COGS and overstates profit, and GL Inventory diverges
    // from Product.costPrice × stockQuantity.
    select: { id: true, stockQuantity: true, name: true, costPrice: true },
  });
  if (!product) {
    throw new HttpError("Product not found", 404, "NOT_FOUND");
  }

  const previousStock = Number(product.stockQuantity);
  const currentCost = Number(product.costPrice);

  // 1. Create the batch
  const batch = await client.productBatch.create({
    data: {
      productId: input.productId,
      storeId: input.storeId,
      batchNumber: input.batchNumber || null,
      expiryDate: input.expiryDate || null,
      quantity: input.quantity,
      costPrice: input.costPrice,
    },
  });

  // 2. Increment the main product's stockQuantity
  await client.product.update({
    where: { id: input.productId },
    data: { stockQuantity: { increment: input.quantity } },
  });

  // AUDIT-FIX (5-c #1): Recompute Weighted-Average Cost (WAC) and update
  // Product.costPrice. Mirrors purchaseService.receivePurchaseOrder. Without
  // this, manual receives leave costPrice stale → COGS on subsequent sales is
  // wrong → GL Inventory (which uses the correct cost via JEs) diverges from
  // Product.costPrice × stockQuantity.
  const totalQty = previousStock + input.quantity;
  if (totalQty > 0) {
    const newWAC =
      (previousStock * currentCost + input.quantity * input.costPrice) /
      totalQty;
    await client.product.update({
      where: { id: input.productId },
      data: { costPrice: Math.round(newWAC * 100) / 100 },
    });
  }

  // 3. Create the InventoryAdjustment with correct previousStock
  const adjustment = await client.inventoryAdjustment.create({
    data: {
      storeId: input.storeId,
      productId: input.productId,
      type: "add",
      quantity: input.quantity,
      previousStock,
      newStock: previousStock + input.quantity,
      reason: input.reason || `Received batch ${input.batchNumber || "N/A"}`,
      referenceType: "purchase" as InventoryReferenceType,
      referenceId: batch.id,
      userId: input.userId || null,
    },
  });

  // AUDIT-FIX H-17: Post a journal entry for the manual stock receive.
  // Previously manual receives posted NO JE — GL Inventory understated.
  if (!tx) {
    await postInventoryAdjustmentJournalEntry(input.storeId, {
      id: adjustment.id,
      productId: input.productId,
      productName: product.name,
      type: "receive",
      quantity: input.quantity,
      previousStock,
      newStock: previousStock + input.quantity,
      costPrice: input.costPrice,
      reason: input.reason || `Received batch ${input.batchNumber || "N/A"}`,
    }).catch((err) => {
      console.error("[inventory] Failed to post receive JE:", err);
    });
  }

  return {
    batchId: batch.id,
    adjustmentId: adjustment.id,
    previousStock,
    newStock: previousStock + input.quantity,
  };
}

// AUDIT-FIX (5-c #11): FIFO batch decrement helper.
//
// ProductBatch.quantity was previously NEVER decremented on sale, transfer-out,
// or damage — each batch row retained its original received quantity forever.
// This broke FIFO/expiry tracking and inflated the POS stock display (which
// sums batch quantities when batches exist) after any sale/transfer-out.
//
// This helper decrements batches for a stock-out operation in FIFO order
// (oldest first by expiryDate, then createdAt). Call it from inside the
// caller's Serializable transaction so batch updates + the product stock
// decrement are atomic.
//
// If the product has NO batches (non-batch-tracked), this is a no-op —
// the product's stockQuantity is still decremented by the caller.
//
// If the remaining quantity after consuming all batches is still > 0, it
// means the batches are out of sync with Product.stockQuantity (legacy data
// or a previous bug). We log a warning and continue rather than throwing —
// the product stock decrement has already happened, and throwing here would
// roll back a valid sale. The reconciliation cron should detect the drift.
export async function decrementProductBatches(
  tx: Tx,
  storeId: string,
  productId: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) return;

  // FIFO: oldest expiry first (null expiry = no expiry → sort last), then
  // oldest createdAt. Only consume batches with quantity > 0.
  const batches = await tx.productBatch.findMany({
    where: {
      productId,
      storeId,
      quantity: { gt: 0 },
    },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, quantity: true, batchNumber: true },
  });

  if (batches.length === 0) {
    // No batch tracking for this product — nothing to decrement.
    return;
  }

  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = Number(batch.quantity);
    if (available <= 0) continue;

    const take = Math.min(remaining, available);
    await tx.productBatch.update({
      where: { id: batch.id },
      data: { quantity: { decrement: take } },
    });
    remaining -= take;
  }

  if (remaining > 0) {
    // Batches are short of the requested quantity — drift between
    // Product.stockQuantity and sum(ProductBatch.quantity). Log so the
    // reconciliation cron can detect it. Don't throw (the product stock
    // decrement already succeeded).
    console.warn(
      `[inventory] Batch drift: product ${productId} in store ${storeId} — ` +
        `batches short by ${remaining} after FIFO decrement. ` +
        `Run reconciliation to realign batches.`,
    );
  }
}
