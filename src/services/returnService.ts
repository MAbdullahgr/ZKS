// src/services/returnService.ts
//
// Business logic for processing sales returns. Extracted from
// src/app/api/sales/[id]/return/route.ts.
//
// Key responsibilities:
//   1. Validate the original sale exists
//   2. Per-item: check available return qty (quantity - returnedQty)
//   3. Create SaleReturn + SaleReturnItems
//   4. Increment SaleItem.returnedQty
//   5. Recompute Sale.returnStatus (none/partial/full)
//   6. Increment product stock + create InventoryAdjustment (type: return)
//   7. Khata refund: decrement customer balance, create KhataTransaction
//   8. Cash refund: create CashTransaction (cash_out) on register session

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-error";
import {
  Prisma,
  ReturnStatus,
  InventoryReferenceType,
} from "@generated/prisma/client";
import type { ReturnProcessInput, ReturnProcessResult, Tx } from "./types";
import { generateReturnNumber } from "./helpers";
import { postSaleReturnJournalEntry } from "./accountingService";

// Re-export so callers can import from returnService
export { generateReturnNumber };

// ─── P2034 retry wrapper ─────────────────────────────────────────────────
//
// processReturn uses Serializable isolation (just like createSale). Two
// concurrent returns on the same sale can conflict on the SaleItem
// returnedQty increment, throwing Prisma P2034. Retry a few times before
// surfacing the error to the cashier.

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      retries > 0 &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2034"
    ) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

export interface ProcessReturnContext {
  userId: string;
  role: string;
  storeId: string;
}

export async function processReturn(
  saleId: string,
  input: ReturnProcessInput,
  ctx: ProcessReturnContext,
): Promise<ReturnProcessResult> {
  const returnNumber = generateReturnNumber();

  // AUDIT-FIX (5-a #7): Idempotency pre-check. If the client already submitted
  // this return (e.g. network timeout after the server committed), return the
  // existing SaleReturn instead of creating a duplicate (which would
  // double-refund the customer and double-restore stock). Scoped per-store to
  // match the @@unique([storeId, idempotencyKey]) constraint.
  if (input.idempotencyKey) {
    const existing = await prisma.saleReturn.findFirst({
      where: { idempotencyKey: input.idempotencyKey, storeId: ctx.storeId },
      select: { id: true, returnNumber: true, total: true, storeId: true },
    });
    if (existing) {
      return {
        saleReturnId: existing.id,
        returnNumber: existing.returnNumber,
        totalReturn: Number(existing.total),
        storeId: existing.storeId,
      };
    }
  }

  let result;
  let isExistingReturn = false;
  try {
    result = await withRetry(() =>
      prisma.$transaction(
        async (tx: Tx) => {
          // Re-check idempotency INSIDE the transaction to close the race
          // window where two concurrent requests both pass the pre-check.
          if (input.idempotencyKey) {
            const existingInTx = await tx.saleReturn.findFirst({
              where: { idempotencyKey: input.idempotencyKey, storeId: ctx.storeId },
              include: { items: true },
            });
            if (existingInTx) {
              isExistingReturn = true;
              return {
                saleReturn: existingInTx,
                totalReturn: Number(existingInTx.total),
                saleSubtotal: 0,
                saleDiscount: 0,
              };
            }
          }

          const originalSale = await tx.sale.findFirst({
            where: { id: saleId, storeId: ctx.storeId },
            include: { items: true, customer: true },
          });

          if (!originalSale) {
            throw new HttpError("Original sale not found", 404, "NOT_FOUND");
          }

      const returnItems = [];
      let totalReturn = 0;

      // FIX P0-4: Deduplicate input.items by saleItemId. Without this, if the
      // input contains the same saleItemId twice, both pass the availableQty
      // check (read from a snapshot fetched once), then both increments apply.
      // returnedQty exceeds quantity, customer is over-refunded, stock is
      // over-incremented.
      const seenSaleItemIds = new Set<string>();
      const runningReturnedQty = new Map<string, number>();

      // ─── Validate each return item ──────────────────────────────────
      for (const item of input.items) {
        // Check for duplicate saleItemId in the input
        if (seenSaleItemIds.has(item.saleItemId)) {
          throw new HttpError(
            `Duplicate return item detected: ${item.saleItemId}. Each sale item can only appear once in a return.`,
            400,
            "DUPLICATE_RETURN_ITEM",
          );
        }
        seenSaleItemIds.add(item.saleItemId);

        const saleItem = originalSale.items.find(
          (si) => si.id === item.saleItemId,
        );
        if (!saleItem) {
          throw new HttpError(
            `Sale item ${item.saleItemId} not found`,
            404,
            "NOT_FOUND",
          );
        }
        if (saleItem.productId !== item.productId) {
          throw new HttpError("Product ID mismatch", 400, "VALIDATION_ERROR");
        }

        const dbReturnedQty = Number(saleItem.returnedQty || 0);
        const alreadyReturningThisBatch =
          runningReturnedQty.get(item.saleItemId) ?? 0;
        const availableQty =
          Number(saleItem.quantity) -
          dbReturnedQty -
          alreadyReturningThisBatch;
        if (item.quantity > availableQty) {
          throw new HttpError(
            `Cannot return ${item.quantity} of item ${saleItem.id}. Only ${availableQty} available.`,
            400,
            "VALIDATION_ERROR",
          );
        }
        runningReturnedQty.set(
          item.saleItemId,
          alreadyReturningThisBatch + item.quantity,
        );

        // AUDIT-FIX (5-a #4): The client-supplied unitPrice is a refund-fraud
        // vector — a manager (or stolen manager JWT) could script returns with
        // unitPrice: 99999 for items originally sold at Rs 50, refunding
        // themselves arbitrary cash. Validate it matches the ORIGINAL sale
        // item's unitPrice, then use the server-authoritative value for all
        // computation + recording (defense in depth — even if the check is
        // bypassed, the recorded refund can't exceed the original price).
        const originalUnitPrice = Number(saleItem.unitPrice);
        if (Math.abs(originalUnitPrice - item.unitPrice) > 0.01) {
          throw new HttpError(
            `Return unit price (Rs ${item.unitPrice}) does not match the original sale item price (Rs ${originalUnitPrice}). Refund at the original price only.`,
            400,
            "PRICE_MISMATCH",
          );
        }

        // Compute refund including tax — the customer paid tax-inclusive price.
        // Use the server-authoritative originalUnitPrice (not client input).
        const itemTaxRate = Number(saleItem.taxRate || 0);
        const lineSubtotal = item.quantity * originalUnitPrice;
        const lineTax = Math.round(lineSubtotal * itemTaxRate) / 100;
        const lineTotalWithTax = lineSubtotal + lineTax;

        returnItems.push({
          saleItemId: saleItem.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: originalUnitPrice,
          total: lineTotalWithTax, // tax-inclusive refund amount
        });

        totalReturn += lineTotalWithTax;
      }

      // AUDIT-FIX (5-a #11 + #15): Validate the refund lines.
      // #11: all-zero refund lines → stock restored, returnedQty incremented,
      //   but the customer gets NOTHING back. The resulting JE has a single
      //   Dr line → postJournalEntry throws "must have at least 2 lines" →
      //   silently swallowed → no JE. Reject explicitly.
      // #15: sum(refundLines) > totalReturn → manager refunds more cash than
      //   the return is worth. Cash leaves the register; the JE is unbalanced
      //   → swallowed → GL drifts AND cash is gone. Reject explicitly.
      const totalRefund = input.refundLines.reduce(
        (s, l) => s + l.amount,
        0,
      );
      if (totalRefund === 0) {
        throw new HttpError(
          "At least one refund line must have a positive amount. A return with zero refund gives the customer nothing back.",
          400,
          "VALIDATION_ERROR",
        );
      }
      if (totalRefund > totalReturn + 0.01) {
        throw new HttpError(
          `Refund total (Rs ${totalRefund.toFixed(2)}) exceeds the return total (Rs ${totalReturn.toFixed(2)}).`,
          400,
          "REFUND_EXCEEDS_TOTAL",
        );
      }

      // ─── Create the SaleReturn ──────────────────────────────────────
      const saleReturn = await tx.saleReturn.create({
        data: {
          storeId: originalSale.storeId,
          saleId: originalSale.id,
          returnNumber,
          total: totalReturn,
          reason: input.reason || null,
          // AUDIT-FIX (5-a #7): persist the idempotency key so retries are
          // detected by the pre-check / in-tx re-check above.
          idempotencyKey: input.idempotencyKey ?? null,
          items: { create: returnItems },
        },
        include: { items: true },
      });

      // ─── Increment returnedQty on each SaleItem ─────────────────────
      for (const item of input.items) {
        await tx.saleItem.update({
          where: { id: item.saleItemId },
          data: { returnedQty: { increment: item.quantity } },
        });
      }

      // ─── Recompute Sale.returnStatus ────────────────────────────────
      const allItems = await tx.saleItem.findMany({ where: { saleId } });
      const totalSold = allItems.reduce((s, i) => s + Number(i.quantity), 0);
      const totalReturned = allItems.reduce(
        (s, i) => s + Number(i.returnedQty || 0),
        0,
      );

      let returnStatus: ReturnStatus = "none";
      if (totalReturned >= totalSold && totalSold > 0) returnStatus = "full";
      else if (totalReturned > 0) returnStatus = "partial";

      await tx.sale.update({ where: { id: saleId }, data: { returnStatus } });

      // ─── Restock + InventoryAdjustment ──────────────────────────────
      // AUDIT-FIX H-10: Batch-fetch all products in a single query before
      // the loop. Previously each iteration did a separate tx.product.findFirst
      // — for a 20-item return that's 20 sequential round-trips inside a
      // Serializable transaction, holding locks longer.
      const returnProductIds = input.items.map((i) => i.productId);
      const returnProducts = await tx.product.findMany({
        where: { id: { in: returnProductIds }, storeId: originalSale.storeId },
        select: { id: true, stockQuantity: true },
      });
      const returnProductMap = new Map(
        returnProducts.map((p) => [p.id, Number(p.stockQuantity)]),
      );

      for (const item of input.items) {
        const previousStock = returnProductMap.get(item.productId) ?? 0;
        const newStock = previousStock + item.quantity;
        // Update the map so subsequent items of the same product see the
        // incremented stock (matches the old per-item read behavior).
        returnProductMap.set(item.productId, newStock);

        await tx.inventoryAdjustment.create({
          data: {
            storeId: originalSale.storeId,
            productId: item.productId,
            type: "return",
            quantity: item.quantity,
            previousStock,
            newStock,
            reason: `Return ${returnNumber}`,
            referenceType: "return_order" as InventoryReferenceType,
            referenceId: saleReturn.id,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
      }

      // ─── Khata refund (decrement customer balance) ──────────────────
      const khataRefundAmount = input.refundLines
        .filter((l) => l.method === "khata" || l.method === "credit")
        .reduce((s, l) => s + l.amount, 0);

      if (khataRefundAmount > 0) {
        if (!originalSale.customerId) {
          throw new HttpError(
            "Cannot process khata refund for a sale with no customer. Use cash refund instead.",
            400,
            "VALIDATION_ERROR",
          );
        }
        const customer = await tx.customer.findFirst({
          where: { id: originalSale.customerId, storeId: originalSale.storeId },
          select: { balance: true },
        });
        const currentBalance = Number(customer?.balance ?? 0);
        const newBalance = currentBalance - khataRefundAmount;

        await tx.khataTransaction.create({
          data: {
            storeId: originalSale.storeId,
            customerId: originalSale.customerId,
            type: "return_credit",
            amount: khataRefundAmount,
            balanceAfter: newBalance,
            note: `Return ${returnNumber}`,
            saleReturnId: saleReturn.id,
          },
        });

        await tx.customer.update({
          where: { id: originalSale.customerId },
          data: { balance: { decrement: khataRefundAmount } },
        });
      }

      // ─── Cash refund (CashTransaction on register) ──────────────────
      const cashRefundAmount = input.refundLines
        .filter((l) => l.method === "cash")
        .reduce((s, l) => s + l.amount, 0);

      if (cashRefundAmount > 0) {
        if (!input.registerSessionId) {
          // FIX P1-3: No register session provided at all. Previously, for
          // manager+ this silently lost the refund. Now we throw for ALL roles
          // — cash refunds MUST go through an open register so there's a
          // record. Managers who need to refund without a register should use
          // khata refund or record a manual expense.
          throw new HttpError(
            "Cash refunds require an open register session. Please open the register first, or use khata refund if no cash is involved.",
            403,
            "REGISTER_REQUIRED",
          );
        }

        const registerSession = await tx.registerSession.findFirst({
          where: {
            id: input.registerSessionId,
            status: "open",
            storeId: ctx.storeId,
          },
        });

        if (!registerSession) {
          // FIX P1-3: Register is closed or doesn't belong to this store.
          // Previously, manager+ silently lost the refund here. Now we throw
          // for ALL roles — no silent loss.
          throw new HttpError(
            "The selected register is closed or does not belong to this store. Please open a register first.",
            403,
            "REGISTER_CLOSED",
          );
        }

        await tx.cashTransaction.create({
          data: {
            sessionId: input.registerSessionId,
            type: "cash_out",
            amount: cashRefundAmount,
            reason: `Refund ${returnNumber}`,
          },
        });

        await tx.registerSession.update({
          where: { id: input.registerSessionId },
          data: { cashOutTotal: { increment: cashRefundAmount } },
        });
      }

      // AUDIT-FIX (5-a #10): Post the return journal entry INSIDE the
      // Serializable transaction. Previously it was posted AFTER the tx
      // committed — if the JE failed (unbalanced due to a discount-apportionment
      // bug, account not seeded, entry-number conflict), the error was
      // swallowed and the return stayed committed with stock restored +
      // customer refunded + cash paid out but NO GL record. Worse than the
      // sale case because cash has physically left the register. Now a JE
      // failure rolls back the entire return.
      //
      // Skip for idempotency-replay returns — the original request already
      // posted the JE.
      if (!isExistingReturn) {
        // Fetch the original SaleItems' cost/discount/tax/total to compute
        // the JE split (reverses Sales Tax Payable + Sales Discounts correctly).
        const origSaleItemIds = saleReturn.items.map((i) => i.saleItemId);
        const origSaleItems = await tx.saleItem.findMany({
          where: { id: { in: origSaleItemIds } },
          select: {
            id: true,
            costPrice: true,
            discount: true,
            taxAmount: true,
            quantity: true,
            total: true,
          },
        });
        const costPriceMap = new Map(
          origSaleItems.map((si) => [si.id, Number(si.costPrice)]),
        );
        const saleSubtotal = Number(originalSale.subtotal);
        const saleLevelDiscount = Number(originalSale.discount);
        let returnSubtotal = 0;
        let returnTax = 0;
        let returnDiscount = 0;
        for (const item of saleReturn.items) {
          const origSaleItem = origSaleItems.find((si) => si.id === item.saleItemId);
          if (!origSaleItem) continue;
          const origQty = Number(origSaleItem.quantity);
          const scale = origQty > 0 ? Number(item.quantity) / origQty : 0;
          const lineSubtotal = Number(item.unitPrice) * Number(item.quantity);
          const lineItemDiscount = Number(origSaleItem.discount) * scale;
          // Apportion sale-level discount by this line's share of the sale
          // subtotal, scaled by the returned fraction.
          const lineSaleDiscount =
            saleSubtotal > 0
              ? saleLevelDiscount *
                (Number(origSaleItem.total) / saleSubtotal) *
                scale
              : 0;
          const lineTax = Number(origSaleItem.taxAmount) * scale;
          returnSubtotal += lineSubtotal - lineItemDiscount;
          returnTax += lineTax;
          returnDiscount += lineItemDiscount + lineSaleDiscount;
        }

        await postSaleReturnJournalEntry(
          ctx.storeId,
          {
            id: saleReturn.id,
            returnNumber,
            saleId,
            total: totalReturn,
            items: saleReturn.items.map((i) => ({
              unitPrice: Number(i.unitPrice),
              quantity: Number(i.quantity),
              productId: i.productId,
              costPrice: costPriceMap.get(i.saleItemId) ?? 0,
            })),
          },
          input.refundLines,
          tx,
          // Pass the split so the JE reverses tax + discount correctly.
          {
            subtotal: Math.round(returnSubtotal * 100) / 100,
            tax: Math.round(returnTax * 100) / 100,
            discount: Math.round(returnDiscount * 100) / 100,
          },
        );
      }

      // AUDIT-FIX (5-a #1): Return the sale-level subtotal + discount so the
      // JE split computation (which now runs inside the transaction) can
      // apportion the sale-level discount across the returned lines.
      return {
        saleReturn,
        totalReturn,
        saleSubtotal: Number(originalSale.subtotal),
        saleDiscount: Number(originalSale.discount),
      };
    },
    {
      timeout: 15000,
      maxWait: 5000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
      ),
    );
  } catch (err) {
    // AUDIT-FIX (5-a #7): P2002 on the @@unique([storeId, idempotencyKey])
    // constraint means a concurrent request won the race. Fetch + return that
    // SaleReturn instead of surfacing an ugly 409 to the cashier.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      input.idempotencyKey
    ) {
      const existing = await prisma.saleReturn.findFirst({
        where: { idempotencyKey: input.idempotencyKey, storeId: ctx.storeId },
        select: { id: true, returnNumber: true, total: true, storeId: true },
      });
      if (existing) {
        return {
          saleReturnId: existing.id,
          returnNumber: existing.returnNumber,
          totalReturn: Number(existing.total),
          storeId: existing.storeId,
        };
      }
    }
    // P2034 (serialization conflict) after all retries exhausted — surface
    // a user-friendly message so the cashier knows to retry the return.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2034"
    ) {
      throw new HttpError(
        "Concurrent operation detected. Please retry the return.",
        409,
        "CONFLICT_RETRY",
      );
    }
    throw err;
  }

  // JE posting now happens INSIDE the Serializable transaction (see
  // AUDIT-FIX 5-a #10 above), so there's no post-tx auto-post block. For
  // idempotency-replay returns (isExistingReturn), the in-tx code path skips
  // JE posting because the original request already posted it.

  return {
    saleReturnId: result.saleReturn.id,
    returnNumber,
    totalReturn: result.totalReturn,
    storeId: result.saleReturn.storeId,
  };
}

// ─── Helper: serialize a return for API response ─────────────────────────

export function serializeReturn(
  saleReturn: Prisma.SaleReturnGetPayload<{ include: { items: true } }>,
  totalReturn: number,
) {
  return {
    saleReturn: {
      ...saleReturn,
      total: Number(saleReturn.total),
      items: saleReturn.items.map((i) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
      })),
    },
    totalReturn,
  };
}
