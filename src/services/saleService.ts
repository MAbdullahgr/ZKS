// src/services/saleService.ts
//
// Business logic for creating sales. Extracted from src/app/api/sales/route.ts
// so it can be unit-tested without a Next.js request context.
//
// Key responsibilities:
//   1. Validate idempotency (return existing sale if key was already processed)
//   2. Validate register session (must be open, belong to user, in target store)
//   3. Per-item: fetch product, check stock, compute tax (from Product.tax or Settings.taxRate)
//   4. Per-item: apply discount, compute line total + tax amount + profit
//   5. Generate tax invoice number (INV-YYYYMMDD-######)
//   6. Create Sale + SaleItems + SalePayments in a Serializable transaction
//   7. Decrement stock with race-condition defense (updateMany + count check)
//   8. Create InventoryAdjustment for each item
//   9. If Khata payment: check credit limit, create KhataTransaction, increment Customer.balance

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-error";
import { PaymentMethod, Prisma } from "@generated/prisma/client";
import type { SaleCreateInput, SaleCreateResult } from "./types";
import { generateSaleNumber, generateTaxInvoiceNumber } from "./helpers";
import { postSaleJournalEntry } from "./accountingService";
import { decrementProductBatches } from "./inventoryService";
import {
  moneyToNumber,
  qtyToNumber,
  moneyToString,
  qtyToString,
} from "@/lib/money";
import type { Money, Quantity } from "@/lib/money";

// Re-export the helpers so callers can import everything from saleService
export { generateSaleNumber, generateTaxInvoiceNumber };

// ─── P2034 retry wrapper ─────────────────────────────────────────────────
//
// createSale uses Serializable isolation to guarantee stock + customer
// balance consistency under concurrent cashiers. Serializable transactions
// can throw Prisma P2034 (transaction conflict / serialization failure)
// when two concurrent txns touch overlapping rows — even when neither
// would individually violate a constraint. The right response is to retry
// the whole txn a few times before giving up: most conflicts resolve on
// the next attempt because the conflicting txn has committed/rolled back.

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

// ─── Main: create a sale ─────────────────────────────────────────────────

export interface CreateSaleContext {
  userId: string;
  storeId: string;
}

export async function createSale(
  input: SaleCreateInput,
  ctx: CreateSaleContext,
): Promise<SaleCreateResult> {
  // ─── 1. Idempotency check ────────────────────────────────────────────
  if (input.idempotencyKey) {
    // FIX P0-3: Scope idempotency key to store. Without storeId in the where
    // clause, Store B reusing Store A's key gets back Store A's saleId
    // (cross-store data leak) and no sale is created for Store B.
    const existingSale = await prisma.sale.findFirst({
      where: { idempotencyKey: input.idempotencyKey, storeId: ctx.storeId },
      select: { id: true, saleNumber: true },
    });
    if (existingSale) {
      return {
        saleId: existingSale.id,
        saleNumber: existingSale.saleNumber,
        taxInvoiceNumber: null, // already returned on first creation
      };
    }
  }

  // ─── 2. Verify register session ──────────────────────────────────────
  const registerSession = await prisma.registerSession.findFirst({
    where: {
      id: input.registerSessionId,
      status: "open",
      userId: ctx.userId,
      storeId: ctx.storeId,
    },
  });
  if (!registerSession) {
    throw new HttpError(
      "No active POS register session found for this user. Please open the register.",
      400,
      "REGISTER_CLOSED",
    );
  }

  // ─── 3. Run the sale in a Serializable transaction ───────────────────
  // NOTE: Tax is OPTIONAL per product. We no longer fetch Settings.taxRate
  // as a fallback — that previously added tax the cashier couldn't see in
  // FIX P2-5: Wrap the idempotency check + sale creation in a try/catch that
  // handles the P2002 unique constraint violation gracefully. The pre-check
  // (above) handles the common case; the catch handles the race condition
  // where two concurrent requests with the same key both pass the pre-check.
  let sale;
  try {
    sale = await withRetry(() =>
      prisma.$transaction(
        async (tx) => {
          // Re-check idempotency INSIDE the transaction to close the race window
          if (input.idempotencyKey) {
            const existingInTx = await tx.sale.findFirst({
              where: {
                idempotencyKey: input.idempotencyKey,
                storeId: ctx.storeId,
              },
              // Fetch full sale with items + payments so the caller has the
              // complete record (and the JE posting below is skipped via the
              // early return — no duplicate JE for a replayed sale).
              include: { items: true, payments: true },
            });
            if (existingInTx) {
              return existingInTx;
            }
          }

          let subtotal = 0;
          let totalTax = 0;
          const validatedItems: Array<{
            productId: string;
            quantity: number;
            unitPrice: number;
            costPrice: number;
            discount: number;
            taxRate: number;
            taxAmount: number;
            total: number;
            profit: number;
            note: string | null;
            variantId: string | null;
            previousStock: number;
          }> = [];

          // ─── Per-item processing ──────────────────────────────────────
          // AUDIT-FIX H-10: Batch-fetch all products in a single query before
          // the loop. Previously each iteration did a separate tx.product.findFirst
          // — for a 50-item cart that's 50 sequential round-trips inside a
          // Serializable transaction, holding locks longer and increasing
          // deadlock risk under concurrent cashiers. Now one query, one Map.
          const productIds = input.items.map((i) => i.productId);
          const productsData = await tx.product.findMany({
            where: { id: { in: productIds }, storeId: ctx.storeId },
            select: {
              id: true,
              name: true,
              stockQuantity: true,
              costPrice: true,
              taxId: true,
              tax: { select: { rate: true, type: true } },
            },
          });
          const productMap = new Map(productsData.map((p) => [p.id, p]));

          for (const item of input.items) {
            const product = productMap.get(item.productId);

            if (!product) {
              throw new HttpError(
                `Product not found: ${item.productId}`,
                404,
                "NOT_FOUND",
              );
            }

            const dbStock = Number(product.stockQuantity);
            if (dbStock < item.quantity) {
              throw new HttpError(
                `Insufficient stock for "${product.name}". Available: ${dbStock}, Requested: ${item.quantity}`,
                400,
                "INSUFFICIENT_STOCK",
              );
            }

            const costPrice = Number(product.costPrice);

            // Tax is OPTIONAL. Only apply if product has explicit taxId linked.
            // Do NOT use Settings.taxRate as fallback — that adds tax the cashier can't see.
            let itemTaxRate = 0;
            if (product.tax) {
              if (
                product.tax.type === "exempt" ||
                product.tax.type === "zero_rated"
              ) {
                itemTaxRate = 0;
              } else {
                itemTaxRate = Number(product.tax.rate);
              }
            }

            const itemDiscount = item.discount ?? 0;
            const grossLineTotal = item.price * item.quantity;

            // Validate: discount can't exceed the line total (would make it negative)
            if (itemDiscount > grossLineTotal) {
              throw new HttpError(
                `Discount for "${product.name}" (${itemDiscount}) exceeds line total (${grossLineTotal})`,
                400,
                "VALIDATION_ERROR",
              );
            }

            const lineTotalAfterDiscount = grossLineTotal - itemDiscount;
            const lineTaxAmount =
              Math.round(lineTotalAfterDiscount * itemTaxRate) / 100;
            // AUDIT-FIX: lineProfit now subtracts proportional sale-level discount
            // via the per-item discount field. Previously profit ignored the
            // per-item discount entirely, overstating margins on discounted sales.
            const lineProfit =
              (item.price - costPrice) * item.quantity - itemDiscount;

            subtotal += lineTotalAfterDiscount;
            totalTax += lineTaxAmount;

            validatedItems.push({
              productId: product.id,
              quantity: item.quantity,
              unitPrice: item.price,
              costPrice,
              discount: itemDiscount,
              taxRate: itemTaxRate,
              taxAmount: lineTaxAmount,
              total: lineTotalAfterDiscount,
              profit: lineProfit,
              note: item.note ?? null,
              variantId: item.variantId ?? null,
              previousStock: dbStock,
            });
          }

          // ─── Totals ───────────────────────────────────────────────────
          const saleLevelDiscount = input.discount;
          const finalTax = totalTax;
          const total = subtotal - saleLevelDiscount + finalTax;

          // FIX: Validate payment lines exist to prevent TypeError on empty array.
          if (!input.paymentLines || input.paymentLines.length === 0) {
            throw new HttpError(
              "At least one payment line is required",
              400,
              "VALIDATION_ERROR",
            );
          }

          // FIX: Validate sale-level discount doesn't exceed subtotal.
          if (saleLevelDiscount > subtotal) {
            throw new HttpError(
              `Sale discount (${saleLevelDiscount}) cannot exceed subtotal (${subtotal})`,
              400,
              "VALIDATION_ERROR",
            );
          }

          // FIX: Validate total is not negative.
          if (total < 0) {
            throw new HttpError(
              "Sale total cannot be negative",
              400,
              "VALIDATION_ERROR",
            );
          }

          // AUDIT-FIX (5-a #2): Validate that payments sum to the sale total.
          // Without this, an underpayment (paid < total, no khata line) gives the
          // customer free goods, an overpayment (cash > total) loses track of
          // change due, and an all-zero payment line creates a free sale. Every
          // such case produces an unbalanced JE that is silently swallowed → the
          // GL drifts. Reject explicitly with a clear cashier-facing message.
          const paidAmount = input.paymentLines.reduce(
            (sum, p) => sum + p.amount,
            0,
          );
          if (Math.abs(paidAmount - total) > 0.01) {
            throw new HttpError(
              `Payment (Rs ${paidAmount.toFixed(2)}) does not match sale total (Rs ${total.toFixed(2)}). ` +
                `Difference: Rs ${Math.abs(total - paidAmount).toFixed(2)}. ` +
                `If the customer paid more than the total, record the change due separately.`,
              400,
              "PAYMENT_MISMATCH",
            );
          }
          // AUDIT-FIX (5-a #2c): Reject all-zero payment lines — a sale with a
          // positive total but zero payment is free goods.
          if (total > 0 && paidAmount === 0) {
            throw new HttpError(
              "Cannot complete a sale with a positive total and zero payment.",
              400,
              "PAYMENT_MISMATCH",
            );
          }

          const primaryMethod = input.paymentLines[0].method as PaymentMethod;

          // AUDIT-FIX C-16: Pass tx + storeId so generateTaxInvoiceNumber can
          // produce a sequential FBR-compliant number (INV-FY2526-000001).
          const taxInvoiceNumber = await generateTaxInvoiceNumber(
            tx,
            ctx.storeId,
          );

          const newSale = await tx.sale.create({
            data: {
              storeId: ctx.storeId,
              saleNumber: generateSaleNumber(),
              taxInvoiceNumber,
              taxRateSnapshot: 0,
              customerId: input.customerId ?? null,
              customerName: input.customerName ?? null,
              subtotal,
              tax: finalTax,
              discount: saleLevelDiscount,
              total,
              paidAmount,
              paymentMethod: primaryMethod,
              notes: input.notes ?? null,
              status: "completed",
              registerSessionId: input.registerSessionId,
              idempotencyKey: input.idempotencyKey,
              items: {
                create: validatedItems.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  costPrice: item.costPrice,
                  discount: item.discount,
                  taxRate: item.taxRate,
                  taxAmount: item.taxAmount,
                  total: item.total,
                  profit: item.profit,
                  note: item.note,
                  variantId: item.variantId,
                })),
              },
              payments: {
                create: input.paymentLines.map((line) => ({
                  method: line.method as PaymentMethod,
                  amount: line.amount,
                })),
              },
            },
            include: { items: true, payments: true },
          });

          // ─── Stock decrement with race-condition defense ──────────────
          // AUDIT-FIX (5-a #8): Track running stock per product so that when the
          // SAME productId appears in multiple cart lines (e.g. two variants, or
          // the same SKU rung up twice), each InventoryAdjustment records the
          // correct previousStock/newStock. Without this, every line for that
          // product shows the original pre-sale stock as previousStock — the
          // audit trail lies and newStock goes negative in the record.
          const runningStock = new Map<string, number>();
          for (const item of validatedItems) {
            const prevStock = runningStock.has(item.productId)
              ? runningStock.get(item.productId)!
              : item.previousStock;

            const updateResult = await tx.product.updateMany({
              where: {
                id: item.productId,
                stockQuantity: { gte: item.quantity },
              },
              data: { stockQuantity: { decrement: item.quantity } },
            });

            if (updateResult.count === 0) {
              throw new HttpError(
                `Race condition detected: Insufficient stock for product ID ${item.productId}. Sale cancelled.`,
                409,
                "RACE_CONDITION_STOCK",
              );
            }

            const newStock = prevStock - item.quantity;
            runningStock.set(item.productId, newStock);

            // AUDIT-FIX (5-c #11): Decrement ProductBatch.quantity in FIFO order
            // so batch tracking + expiry stay accurate and the POS stock display
            // (which sums batch quantities) doesn't inflate after a sale.
            await decrementProductBatches(
              tx,
              ctx.storeId,
              item.productId,
              item.quantity,
            );

            await tx.inventoryAdjustment.create({
              data: {
                storeId: ctx.storeId,
                productId: item.productId,
                type: "remove",
                quantity: item.quantity,
                previousStock: prevStock,
                newStock,
                reason: `Sale ${newSale.saleNumber}`,
                referenceType: "sale",
                referenceId: newSale.id,
              },
            });
          }

          // ─── Khata (credit) handling ──────────────────────────────────
          const khataAmount = input.paymentLines
            .filter((p) => p.method === "khata" || p.method === "credit")
            .reduce((sum, p) => sum + p.amount, 0);

          // FIX P0-2: If khata payment is provided but no customer is attached,
          // the goods leave inventory with no cash received and no customer
          // balance charged — effectively free goods. Must throw, not skip.
          if (khataAmount > 0 && !input.customerId) {
            throw new HttpError(
              "Khata/credit payment requires a customer. Please select a customer or use cash payment.",
              400,
              "KHATA_REQUIRES_CUSTOMER",
            );
          }

          if (khataAmount > 0 && input.customerId) {
            const customer = await tx.customer.findFirst({
              where: { id: input.customerId, storeId: ctx.storeId },
              select: {
                id: true,
                balance: true,
                creditLimit: true,
                name: true,
              },
            });

            if (!customer) {
              throw new HttpError(
                "Customer not found for Khata transaction.",
                404,
                "NOT_FOUND",
              );
            }

            const currentBalance = Number(customer.balance);
            const newBalance = currentBalance + khataAmount;

            // FIX P1-1: creditLimit = 0 should mean "no credit allowed", not
            // "unlimited credit". The old check `> 0` treated 0 as unlimited.
            // Now: if creditLimit is not null, enforce it (0 means 0).
            if (
              customer.creditLimit !== null &&
              newBalance > Number(customer.creditLimit)
            ) {
              throw new HttpError(
                `Credit limit exceeded for ${customer.name}. Limit: ${customer.creditLimit}, Current Balance: ${currentBalance}. Sale cancelled.`,
                400,
                "CREDIT_LIMIT_EXCEEDED",
              );
            }

            await tx.khataTransaction.create({
              data: {
                storeId: ctx.storeId,
                customerId: customer.id,
                type: "credit",
                amount: khataAmount,
                balanceAfter: newBalance,
                note: `Sale ${newSale.saleNumber}`,
                saleId: newSale.id,
              },
            });

            await tx.customer.update({
              where: { id: customer.id },
              data: { balance: { increment: khataAmount } },
            });
          }

          // AUDIT-FIX (5-a #9): Post the sale journal entry INSIDE the
          // Serializable transaction. Previously it was posted AFTER the
          // transaction committed — if the JE failed (unbalanced, account not
          // seeded, entry-number conflict after 5 retries), the error was
          // swallowed by postSaleJournalEntry's try/catch and the sale stayed
          // committed with stock decremented + customer balance incremented but
          // NO GL record. The reconcile-journals cron detected the orphan but
          // didn't fix it → silent GL drift. Now a JE failure rolls back the
          // entire sale (stock, customer balance, sale record) so the cashier
          // sees the error and can retry. The posting helper already accepts an
          // optional `tx` for exactly this case.
          await postSaleJournalEntry(
            ctx.storeId,
            {
              id: newSale.id,
              saleNumber: newSale.saleNumber,
              subtotal,
              tax: finalTax,
              total,
              discount: saleLevelDiscount,
              items: validatedItems.map((i) => ({
                costPrice: i.costPrice,
                quantity: i.quantity,
              })),
              payments: input.paymentLines.map((p) => ({
                method: p.method as string,
                amount: p.amount,
              })),
            },
            tx,
          );

          return newSale;
        },
        {
          timeout: 15000,
          maxWait: 5000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );
  } catch (err) {
    // FIX P2-5: If we hit a unique constraint violation on idempotencyKey,
    // another concurrent request won the race. Fetch and return that sale
    // instead of throwing an ugly 409 error.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      input.idempotencyKey
    ) {
      const existingSale = await prisma.sale.findFirst({
        where: { idempotencyKey: input.idempotencyKey, storeId: ctx.storeId },
        select: { id: true, saleNumber: true, taxInvoiceNumber: true },
      });
      if (existingSale) {
        return {
          saleId: existingSale.id,
          saleNumber: existingSale.saleNumber,
          taxInvoiceNumber: existingSale.taxInvoiceNumber,
        };
      }
    }
    // P2034 (serialization conflict) after all retries exhausted — surface
    // a user-friendly message so the cashier knows to retry the sale.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2034"
    ) {
      throw new HttpError(
        "Concurrent operation detected. Please retry the sale.",
        409,
        "CONFLICT_RETRY",
      );
    }
    throw err;
  }

  // JE posting now happens INSIDE the Serializable transaction (see
  // AUDIT-FIX 5-a #9 above), so there's no post-tx auto-post block. For
  // idempotency-replay sales, the in-tx code path returns early (before
  // reaching the JE posting) so no duplicate JE is created.

  return {
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    taxInvoiceNumber: sale.taxInvoiceNumber,
  };
}

// ─── Helper: serialize a sale for API response ──────────────────────────
//
// A+ MIGRATION: All Prisma Decimal fields now flow through the money module
// (src/lib/money.ts). Two serializers are provided:
//
//   serializeSale(sale, role?)         → returns `number` (BACKWARD COMPAT)
//   serializeSaleStrings(sale, role?)  → returns `Money`/`Quantity` strings (A+ target)
//
// The `number` variant preserves the existing API shape so the frontend
// keeps working unchanged. The `strings` variant is the precision-safe
// end-state — switch routes to it as part of the coordinated server+client
// migration described in MIGRATION_TO_A_PLUS.md.
//
// AUDIT-FIX C-7: role-aware serialization. Cashiers (and warehouse staff,
// who are blocked from the Sales module but defensive here too) must NOT
// see costPrice or profit per item — these reveal the store's margin and
// enable fraud (e.g., discounting to friends knowing the floor price).
// The single-sale GET endpoint already strips these (FIX P1-14); this
// function is shared by the list endpoint, so it must also strip.
//
// Pass the session role via the second argument. When omitted (legacy
// callers, internal use), the full data is returned — but every API
// route that returns sales to clients MUST pass the role.

export function serializeSale(
  sale: Prisma.SaleGetPayload<{
    include: {
      items: { include: { product: { select: { name: true; sku: true } } } };
      customer: { select: { name: true; phone: true } };
      payments: true;
    };
  }>,
  role?: string,
) {
  // AUDIT-FIX C-7: Cashiers and warehouse staff must not see margins.
  const stripMargins = role === "cashier" || role === "warehouse";

  return {
    ...sale,
    // A+ FIX: route every Decimal through moneyToNumber/qtyToNumber so the
    // conversion is centralized. The behavioral result is identical to the
    // old Number(x) calls, but switching to moneyToString (full precision)
    // later is a one-line change per field.
    subtotal: moneyToNumber(sale.subtotal),
    tax: moneyToNumber(sale.tax),
    discount: moneyToNumber(sale.discount),
    total: moneyToNumber(sale.total),
    paidAmount: moneyToNumber(sale.paidAmount),
    taxRateSnapshot: Number(sale.taxRateSnapshot), // tax rate, not money
    items: sale.items.map((item) => {
      const serialized: Record<string, unknown> = {
        ...item,
        quantity: qtyToNumber(item.quantity),
        unitPrice: moneyToNumber(item.unitPrice),
        discount: moneyToNumber(item.discount),
        taxRate: Number(item.taxRate), // tax rate, not money
        taxAmount: moneyToNumber(item.taxAmount),
        total: moneyToNumber(item.total),
      };
      if (stripMargins) {
        // Strip cost-basis and profit fields — cashiers don't need them
        // and they enable margin fraud.
        delete serialized.costPrice;
        delete serialized.profit;
      } else {
        serialized.costPrice = moneyToNumber(item.costPrice);
        serialized.profit = moneyToNumber(item.profit);
      }
      return serialized;
    }),
    payments: sale.payments.map((p) => ({
      ...p,
      amount: moneyToNumber(p.amount),
    })),
  };
}

// ─── A+ target serializer: returns Money/Quantity strings ────────────────
//
// This is the precision-safe end-state shape. Money fields are returned as
// canonical "1234.56" strings; quantity fields as "12.500" strings. The
// client must be updated to:
//   - Display via moneyToNumber(x).toLocaleString(...) OR a Money-aware formatter
//   - Compare via moneyCmp/moneyEq (NOT ===, >, <)
//   - Arithmetic via moneyAdd/moneySub/moneyMul/moneyDiv
//
// Until the client is updated, keep using `serializeSale`. Once the client
// is ready, swap the call sites in src/app/api/sales/route.ts and
// src/app/api/sales/[id]/route.ts to use this function.

export function serializeSaleStrings(
  sale: Prisma.SaleGetPayload<{
    include: {
      items: { include: { product: { select: { name: true; sku: true } } } };
      customer: { select: { name: true; phone: true } };
      payments: true;
    };
  }>,
  role?: string,
) {
  const stripMargins = role === "cashier" || role === "warehouse";

  return {
    ...sale,
    subtotal: moneyToString(sale.subtotal) as Money,
    tax: moneyToString(sale.tax) as Money,
    discount: moneyToString(sale.discount) as Money,
    total: moneyToString(sale.total) as Money,
    paidAmount: moneyToString(sale.paidAmount) as Money,
    taxRateSnapshot: Number(sale.taxRateSnapshot), // tax rate stays a number
    items: sale.items.map((item) => {
      const serialized: Record<string, unknown> = {
        ...item,
        quantity: qtyToString(item.quantity) as Quantity,
        unitPrice: moneyToString(item.unitPrice) as Money,
        discount: moneyToString(item.discount) as Money,
        taxRate: Number(item.taxRate),
        taxAmount: moneyToString(item.taxAmount) as Money,
        total: moneyToString(item.total) as Money,
      };
      if (stripMargins) {
        delete serialized.costPrice;
        delete serialized.profit;
      } else {
        serialized.costPrice = moneyToString(item.costPrice);
        serialized.profit = moneyToString(item.profit);
      }
      return serialized;
    }),
    payments: sale.payments.map((p) => ({
      ...p,
      amount: moneyToString(p.amount) as Money,
    })),
  };
}
