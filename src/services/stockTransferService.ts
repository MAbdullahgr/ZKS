// src/services/stockTransferService.ts
//
// Business logic for inter-store stock transfers.
//
// Flow:
//   1. createTransfer — create a draft transfer with items (no stock movement yet)
//   2. dispatchTransfer — decrement stock from source store, post accounting
//   3. receiveTransfer — increment stock in dest store (auto-create products if needed), post accounting
//   4. cancelTransfer — cancel if draft, or reverse stock + accounting if in_transit

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-error";
import { Prisma } from "@generated/prisma/client";
import { randomInt } from "node:crypto";
import type { Tx } from "./types";
import {
  postTransferDispatchJournalEntry,
  postTransferReceiveJournalEntry,
  postTransferCancelJournalEntry,
} from "./accountingService";
import { decrementProductBatches } from "./inventoryService";

// ─── Helper: generate transfer number ────────────────────────────────────

function generateTransferNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = randomInt(100000, 1000000);
  return `TR-${date}-${random}`;
}

// ─── Create Transfer ─────────────────────────────────────────────────────

export interface CreateTransferInput {
  sourceStoreId: string;
  destStoreId: string;
  notes?: string | null;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  userId: string;
}

export async function createTransfer(input: CreateTransferInput) {
  // Source and dest must be different
  if (input.sourceStoreId === input.destStoreId) {
    throw new HttpError(
      "Source and destination stores must be different",
      400,
      "VALIDATION_ERROR",
    );
  }

  // Verify dest store exists and is active
  const destStore = await prisma.store.findFirst({
    where: { id: input.destStoreId, isActive: true },
    select: { id: true, name: true },
  });
  if (!destStore) {
    throw new HttpError(
      "Destination store not found or inactive",
      404,
      "NOT_FOUND",
    );
  }

  // Verify all products belong to source store + have sufficient stock
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId: input.sourceStoreId },
    select: {
      id: true,
      name: true,
      sku: true,
      costPrice: true,
      stockQuantity: true,
    },
  });

  if (products.length !== productIds.length) {
    throw new HttpError(
      "One or more products do not belong to the source store",
      400,
      "VALIDATION_ERROR",
    );
  }

  // Check stock availability + build item data
  const transferItems: Array<{
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitCost: number;
    total: number;
  }> = [];

  for (const item of input.items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) continue;

    const stock = Number(product.stockQuantity);
    if (stock < item.quantity) {
      throw new HttpError(
        `Insufficient stock for "${product.name}". Available: ${stock}, Requested: ${item.quantity}`,
        400,
        "INSUFFICIENT_STOCK",
      );
    }

    const unitCost = Number(product.costPrice);
    transferItems.push({
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      quantity: item.quantity,
      unitCost,
      total: item.quantity * unitCost,
    });
  }

  const totalValue = transferItems.reduce((s, i) => s + i.total, 0);
  const transferNumber = generateTransferNumber();

  const transfer = await prisma.stockTransfer.create({
    data: {
      transferNumber,
      sourceStoreId: input.sourceStoreId,
      destStoreId: input.destStoreId,
      status: "draft",
      notes: input.notes || null,
      totalValue,
      items: {
        create: transferItems.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          productSku: i.productSku,
          quantity: i.quantity,
          unitCost: i.unitCost,
          total: i.total,
        })),
      },
    },
    include: {
      items: true,
      sourceStore: { select: { id: true, name: true } },
      destStore: { select: { id: true, name: true } },
      dispatchedBy: {
        select: { id: true, email: true, employee: { select: { name: true } } },
      },
      receivedBy: {
        select: { id: true, email: true, employee: { select: { name: true } } },
      },
      cancelledBy: {
        // FIX 4: Added for cancel tracking
        select: { id: true, email: true, employee: { select: { name: true } } },
      },
    },
  });

  return transfer;
}

// ─── Dispatch Transfer ───────────────────────────────────────────────────

export async function dispatchTransfer(
  transferId: string,
  sourceStoreId: string,
  userId: string,
): Promise<{ id: string; transferNumber: string; totalValue: number }> {
  const result = await prisma.$transaction(
    async (tx: Tx) => {
      const transfer = await tx.stockTransfer.findFirst({
        where: { id: transferId, sourceStoreId },
        include: { items: true },
      });

      if (!transfer) {
        throw new HttpError("Transfer not found", 404, "NOT_FOUND");
      }
      if (transfer.status !== "draft") {
        throw new HttpError(
          `Cannot dispatch a transfer with status: ${transfer.status}`,
          400,
          "VALIDATION_ERROR",
        );
      }

      // Decrement stock from source store products (atomic with gte check)
      for (const item of transfer.items) {
        const updateResult = await tx.product.updateMany({
          where: {
            id: item.productId,
            stockQuantity: { gte: Number(item.quantity) },
          },
          data: { stockQuantity: { decrement: Number(item.quantity) } },
        });

        if (updateResult.count === 0) {
          // Re-read for accurate error message
          const current = await tx.product.findFirst({
            where: { id: item.productId },
            select: { stockQuantity: true, name: true },
          });
          throw new HttpError(
            `Insufficient stock for "${current?.name ?? item.productName}". Available: ${current ? Number(current.stockQuantity) : 0}, Requested: ${Number(item.quantity)}`,
            400,
            "INSUFFICIENT_STOCK",
          );
        }

        // Create InventoryAdjustment
        const product = await tx.product.findFirst({
          where: { id: item.productId },
          select: { stockQuantity: true, name: true },
        });
        const previousStock = Number(product?.stockQuantity ?? 0);
        // Note: stock was already decremented by updateMany above, so
        // previousStock (read AFTER update) is the NEW stock level.
        // previousStock + quantity = the OLD stock level (before decrement).

        // AUDIT-FIX (5-c #11): Decrement ProductBatch.quantity in FIFO order
        // at the source store so batch tracking stays accurate after a
        // transfer-out.
        await decrementProductBatches(
          tx,
          sourceStoreId,
          item.productId,
          Number(item.quantity),
        );

        await tx.inventoryAdjustment.create({
          data: {
            storeId: sourceStoreId,
            productId: item.productId,
            type: "remove",
            quantity: Number(item.quantity),
            previousStock: previousStock + Number(item.quantity),
            newStock: previousStock,
            reason: `Transfer out ${transfer.transferNumber}`,
            referenceType: "transfer",
            referenceId: transfer.id,
          },
        });
      }

      // AUDIT-FIX (5-c #12): Recompute totalValue at dispatch time using the
      // CURRENT source Product.costPrice for each item. Previously totalValue
      // was computed once at create-time and never updated — if a PO receipt
      // changed the source's costPrice (WAC) between create and dispatch, all
      // four transfer JEs (dispatch/receive/cancel/settle) used the stale
      // value → GL Inter-Store Receivable/Payable and Inventory amounts didn't
      // match the actual inventory value moved. Recompute + persist so every
      // downstream JE uses the dispatch-time cost.
      let recomputedTotalValue = 0;
      for (const item of transfer.items) {
        const currentProduct = await tx.product.findFirst({
          where: { id: item.productId },
          select: { costPrice: true },
        });
        const currentUnitCost = Number(currentProduct?.costPrice ?? item.unitCost);
        recomputedTotalValue +=
          Number(item.quantity) * currentUnitCost;
      }
      recomputedTotalValue = Math.round(recomputedTotalValue * 100) / 100;

      // Persist the recomputed totalValue so receive/cancel/settle JEs use it.
      if (recomputedTotalValue !== Number(transfer.totalValue)) {
        await tx.stockTransfer.update({
          where: { id: transferId },
          data: { totalValue: recomputedTotalValue },
        });
      }

      // Update transfer status
      await tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: "in_transit",
          dispatchedById: userId,
          dispatchedAt: new Date(),
        },
      });

      // AUDIT-FIX (5-c #3): Post the dispatch JE INSIDE the Serializable
      // transaction so a JE failure rolls back the stock decrement + status
      // change (prevents silent GL drift on Inter-Store Receivable/Inventory).
      await postTransferDispatchJournalEntry(
        sourceStoreId,
        {
          id: transfer.id,
          transferNumber: transfer.transferNumber,
          totalValue: recomputedTotalValue,
        },
        tx,
      );

      return {
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        totalValue: recomputedTotalValue,
      };
    },
    {
      timeout: 15000,
      maxWait: 5000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  // JE posting now happens INSIDE the Serializable transaction (AUDIT-FIX 5-c #3).

  return result;
}

// ─── Receive Transfer ────────────────────────────────────────────────────

export async function receiveTransfer(
  transferId: string,
  destStoreId: string,
  userId: string,
): Promise<{ id: string; transferNumber: string; totalValue: number }> {
  const result = await prisma.$transaction(
    async (tx: Tx) => {
      const transfer = await tx.stockTransfer.findFirst({
        where: { id: transferId, destStoreId },
        include: { items: true },
      });

      if (!transfer) {
        throw new HttpError("Transfer not found", 404, "NOT_FOUND");
      }
      if (transfer.status !== "in_transit") {
        throw new HttpError(
          `Cannot receive a transfer with status: ${transfer.status}`,
          400,
          "VALIDATION_ERROR",
        );
      }

      // For each item: find product in dest store by SKU (or create if not found)
      for (const item of transfer.items) {
        const destProduct = await tx.product.findFirst({
          where: { sku: item.productSku, storeId: destStoreId },
          // AUDIT-FIX (5-c #9): select costPrice so we can recompute WAC on the
          // dest product after receiving. Without WAC, dest's costPrice stays
          // stale → COGS on the next dest sale is wrong → GL Inventory diverges
          // from Product.costPrice × stockQuantity.
          select: { id: true, stockQuantity: true, name: true, costPrice: true },
        });

        let destProductId: string;
        let previousStock: number;

        if (destProduct) {
          // Product exists in dest store — increment stock
          destProductId = destProduct.id;
          previousStock = Number(destProduct.stockQuantity);
          await tx.product.update({
            where: { id: destProduct.id },
            data: { stockQuantity: { increment: Number(item.quantity) } },
          });

          // AUDIT-FIX (5-c #9): Recompute dest WAC using the source transfer
          // cost (item.unitCost). This keeps dest's costPrice consistent with
          // the value posted to GL Inventory via the transfer-receive JE.
          const destPreCost = Number(destProduct.costPrice);
          const transferredQty = Number(item.quantity);
          const sourceUnitCost = Number(item.unitCost);
          const totalQty = previousStock + transferredQty;
          if (totalQty > 0) {
            const newWAC =
              (previousStock * destPreCost +
                transferredQty * sourceUnitCost) /
              totalQty;
            await tx.product.update({
              where: { id: destProduct.id },
              data: { costPrice: Math.round(newWAC * 100) / 100 },
            });
          }
        } else {
          // Product doesn't exist in dest store — create a copy
          const sourceProduct = await tx.product.findFirst({
            where: { id: item.productId },
            select: {
              name: true,
              sku: true,
              barcode: true,
              description: true,
              costPrice: true,
              sellingPrice: true,
              unit: true,
              parentUnit: true,
              unitsPerParent: true,
              categoryId: true,
              brandId: true,
              supplierId: true,
              taxId: true,
              productGroup: true,
              variantName: true,
              isLoose: true,
              isReturnable: true,
              minStockLevel: true,
              baseUnit: true,
              imageUrl: true,
              // AUDIT-FIX (5-c #10): carry over isActive so a deactivated
              // source product isn't silently reactivated in the dest store.
              isActive: true,
            },
          });

          if (!sourceProduct) {
            throw new HttpError(
              `Source product not found for ${item.productName}`,
              404,
              "NOT_FOUND",
            );
          }

          // Check if category/brand/supplier/tax exist in dest store
          // If not, set to null (the dest store can configure later)
          let destCategoryId = sourceProduct.categoryId;
          if (destCategoryId) {
            const catExists = await tx.category.findFirst({
              where: { id: destCategoryId, storeId: destStoreId },
              select: { id: true },
            });
            if (!catExists) destCategoryId = null;
          }

          let destBrandId = sourceProduct.brandId;
          if (destBrandId) {
            const brandExists = await tx.brand.findFirst({
              where: { id: destBrandId, storeId: destStoreId },
              select: { id: true },
            });
            if (!brandExists) destBrandId = null;
          }

          let destSupplierId = sourceProduct.supplierId;
          if (destSupplierId) {
            const supExists = await tx.supplier.findFirst({
              where: { id: destSupplierId, storeId: destStoreId },
              select: { id: true },
            });
            if (!supExists) destSupplierId = null;
          }

          let destTaxId = sourceProduct.taxId;
          if (destTaxId) {
            const taxExists = await tx.tax.findFirst({
              where: { id: destTaxId, storeId: destStoreId },
              select: { id: true },
            });
            if (!taxExists) destTaxId = null;
          }

          const newProduct = await tx.product.create({
            data: {
              storeId: destStoreId,
              name: sourceProduct.name,
              sku: sourceProduct.sku,
              barcode: sourceProduct.barcode,
              description: sourceProduct.description,
              costPrice: sourceProduct.costPrice,
              sellingPrice: sourceProduct.sellingPrice,
              unit: sourceProduct.unit,
              parentUnit: sourceProduct.parentUnit,
              unitsPerParent: sourceProduct.unitsPerParent,
              categoryId: destCategoryId,
              brandId: destBrandId,
              supplierId: destSupplierId,
              taxId: destTaxId,
              productGroup: sourceProduct.productGroup,
              variantName: sourceProduct.variantName,
              isLoose: sourceProduct.isLoose,
              isReturnable: sourceProduct.isReturnable,
              minStockLevel: sourceProduct.minStockLevel,
              baseUnit: sourceProduct.baseUnit,
              imageUrl: sourceProduct.imageUrl,
              // AUDIT-FIX (5-c #10): preserve the source product's active
              // status. Previously isActive wasn't selected, so the dest
              // create used the schema default (true) — reactivating a
              // deactivated product in the dest store.
              isActive: sourceProduct.isActive,
              stockQuantity: Number(item.quantity),
            },
          });

          destProductId = newProduct.id;
          previousStock = 0;
        }

        // Create InventoryAdjustment
        await tx.inventoryAdjustment.create({
          data: {
            storeId: destStoreId,
            productId: destProductId,
            type: "add",
            quantity: Number(item.quantity),
            previousStock,
            newStock: previousStock + Number(item.quantity),
            reason: `Transfer in ${transfer.transferNumber}`,
            referenceType: "transfer",
            referenceId: transfer.id,
          },
        });
      }

      // Update transfer status
      await tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: "received",
          receivedById: userId,
          receivedAt: new Date(),
        },
      });

      // AUDIT-FIX (5-c #3): Post the receive JE INSIDE the Serializable
      // transaction so a JE failure rolls back the dest stock increment +
      // WAC update + status change.
      await postTransferReceiveJournalEntry(
        destStoreId,
        {
          id: transfer.id,
          transferNumber: transfer.transferNumber,
          totalValue: Number(transfer.totalValue),
        },
        tx,
      );

      return {
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        totalValue: Number(transfer.totalValue),
      };
    },
    {
      timeout: 15000,
      maxWait: 5000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  // JE posting now happens INSIDE the Serializable transaction (AUDIT-FIX 5-c #3).

  return result;
}

// ─── Cancel Transfer ─────────────────────────────────────────────────────

export async function cancelTransfer(
  transferId: string,
  sourceStoreId: string,
  userId: string,
): Promise<{ id: string; transferNumber: string; totalValue: number }> {
  // AUDIT-FIX C-14: Move the entire cancel operation (including the status
  // check) INSIDE the Serializable transaction. Previously the status was
  // read OUTSIDE the transaction — a concurrent receiveTransfer could flip
  // status from in_transit → received between the read and the transaction,
  // causing the cancel to execute stock-reversal on an already-received
  // transfer → stock duplicated.

  const result = await prisma.$transaction(
    async (tx: Tx) => {
      // Re-fetch the transfer INSIDE the transaction with a lock.
      const transfer = await tx.stockTransfer.findFirst({
        where: { id: transferId, sourceStoreId },
        include: { items: true },
      });

      if (!transfer) {
        throw new HttpError("Transfer not found", 404, "NOT_FOUND");
      }
      // AUDIT-FIX C-14: Re-check status INSIDE the transaction. If a
      // concurrent receiveTransfer already flipped status to "received",
      // we throw here — the transaction rolls back, no stock is touched.
      if (transfer.status === "received") {
        throw new HttpError(
          "Cannot cancel a transfer that has already been received",
          400,
          "VALIDATION_ERROR",
        );
      }
      if (transfer.status === "cancelled") {
        throw new HttpError(
          "Transfer is already cancelled",
          400,
          "VALIDATION_ERROR",
        );
      }

      if (transfer.status === "draft") {
        // Just mark as cancelled — no stock was moved
        await tx.stockTransfer.update({
          where: { id: transferId },
          data: {
            status: "cancelled",
            cancelledById: userId,
          },
        });
        return {
          id: transfer.id,
          transferNumber: transfer.transferNumber,
          totalValue: Number(transfer.totalValue),
        };
      }

      // in_transit — reverse the stock decrement
      // Increment stock back in source store
      for (const item of transfer.items) {
        const sourceProduct = await tx.product.findFirst({
          where: { id: item.productId, storeId: sourceStoreId },
          select: { stockQuantity: true, name: true },
        });

        if (sourceProduct) {
          const previousStock = Number(sourceProduct.stockQuantity);
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: Number(item.quantity) } },
          });

          await tx.inventoryAdjustment.create({
            data: {
              storeId: sourceStoreId,
              productId: item.productId,
              type: "add",
              quantity: Number(item.quantity),
              previousStock,
              newStock: previousStock + Number(item.quantity),
              reason: `Transfer cancelled ${transfer.transferNumber}`,
              referenceType: "transfer",
              referenceId: transfer.id,
            },
          });
        }
      }

      await tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: "cancelled",
          cancelledById: userId,
        },
      });

      // AUDIT-FIX (5-c #3): Post the cancel/reversal JE INSIDE the
      // Serializable transaction so a JE failure rolls back the stock
      // restoration + status change.
      await postTransferCancelJournalEntry(
        sourceStoreId,
        {
          id: transfer.id,
          transferNumber: transfer.transferNumber,
          totalValue: Number(transfer.totalValue),
        },
        tx,
      );

      return {
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        totalValue: Number(transfer.totalValue),
      };
    },
    {
      timeout: 15000,
      maxWait: 5000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  // JE posting now happens INSIDE the Serializable transaction (AUDIT-FIX 5-c #3).

  return result;
}

// ─── Settle Transfers ────────────────────────────────────────────────────

export async function settleTransfers(
  storeId: string,
): Promise<{ count: number; totalValue: number }> {
  // AUDIT-FIX H-26: Wrap the entire settle operation in a Serializable
  // transaction. Previously two managers clicking Settle concurrently
  // could both post duplicate JEs and double-mark settledAt. Now the
  // transaction ensures atomicity: either all transfers settle or none.

  // Static import at the top of the file would be cleaner, but the
  // existing code uses dynamic import — keep that pattern to avoid
  // circular import issues (accountingService imports from this file).
  const { postTransferSettlementJournalEntry } = await import(
    "./accountingService"
  );

  const result = await prisma.$transaction(
    async (tx: Tx) => {
      // Find all received + unsettled transfers where this store is source OR dest.
      // Re-fetch INSIDE the transaction so we get a consistent snapshot.
      //
      // AUDIT-FIX (5-c #4): Filter on the SIDE-appropriate settlement column.
      // Previously the query only checked `settledAt IS NULL`, so the dest
      // store kept re-finding transfers that the source store had already
      // settled (dest has no settledAt mark) → duplicate dest-settlement JEs.
      // Now: source-side settle looks for settledAt IS NULL; dest-side looks
      // for destSettledAt IS NULL. Both sides can settle independently and
      // neither can double-post.
      const transfers = await tx.stockTransfer.findMany({
        where: {
          status: "received",
          OR: [
            { sourceStoreId: storeId, settledAt: null },
            { destStoreId: storeId, destSettledAt: null },
          ],
        },
        select: {
          id: true,
          transferNumber: true,
          totalValue: true,
          sourceStoreId: true,
          destStoreId: true,
        },
      });

      if (transfers.length === 0) {
        // AUDIT-FIX: Return empty result instead of throwing — a cron job
        // or batch settle script shouldn't break on an empty queue.
        return { count: 0, totalValue: 0 };
      }

      let totalValue = 0;

      for (const transfer of transfers) {
        const isSourceStore = transfer.sourceStoreId === storeId;
        const value = Number(transfer.totalValue);
        totalValue += value;

        // AUDIT-FIX (5-c #3): Post settlement JE INSIDE the tx + pass `tx`
        // so a JE failure rolls back the whole settle (and handlePostFailure
        // propagates rather than swallowing).
        await postTransferSettlementJournalEntry(
          storeId,
          {
            id: transfer.id,
            transferNumber: transfer.transferNumber,
            totalValue: value,
          },
          isSourceStore,
          tx,
        );

        // AUDIT-FIX (5-c #4): Mark the SIDE-appropriate settlement column.
        // Source marks settledAt; dest marks destSettledAt. Use updateMany
        // with a null guard so a concurrent settle by another manager can't
        // double-mark. Both guards are checked so the update is a no-op if
        // this side was already settled (defense in depth).
        const now = new Date();
        if (isSourceStore) {
          await tx.stockTransfer.updateMany({
            where: { id: transfer.id, settledAt: null },
            data: { settledAt: now },
          });
        } else {
          await tx.stockTransfer.updateMany({
            where: { id: transfer.id, destSettledAt: null },
            data: { destSettledAt: now },
          });
        }
      }

      return { count: transfers.length, totalValue };
    },
    {
      timeout: 30000,
      maxWait: 10000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  return result;
}

// ─── Serialize helper ────────────────────────────────────────────────────

export function serializeTransfer(
  transfer: Prisma.StockTransferGetPayload<{
    include: {
      items: true;
      sourceStore: { select: { id: true; name: true } };
      destStore: { select: { id: true; name: true } };
      dispatchedBy: {
        select: { id: true; email: true; employee: { select: { name: true } } };
      };
      receivedBy: {
        select: { id: true; email: true; employee: { select: { name: true } } };
      };
      cancelledBy: {
        // FIX 4: Added for cancel tracking
        select: { id: true; email: true; employee: { select: { name: true } } };
      };
    };
  }>,
) {
  return {
    ...transfer,
    totalValue: Number(transfer.totalValue),
    items: transfer.items.map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      unitCost: Number(i.unitCost),
      total: Number(i.total),
    })),
    dispatchedByName:
      transfer.dispatchedBy?.employee?.name ||
      transfer.dispatchedBy?.email ||
      null,
    receivedByName:
      transfer.receivedBy?.employee?.name || transfer.receivedBy?.email || null,
    // FIX 4: Added for cancel tracking
    cancelledByName:
      transfer.cancelledBy?.employee?.name ||
      transfer.cancelledBy?.email ||
      null,
  };
}
