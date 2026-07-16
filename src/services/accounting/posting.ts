// src/services/accounting/posting.ts
//
// Auto-posting helpers — one for each business event. Each helper builds the
// appropriate journal lines and calls postJournalEntry (from core.ts).
//
// DESIGN PRINCIPLE (preserved from the original):
//   Every helper is wrapped in try/catch so that a failure to post a journal
//   entry NEVER blocks the original transaction. Errors are logged with enough
//   context to debug later. A broken accounting entry must never block a sale.
//
// Split out from the original accountingService.ts (1,614 lines) so that the
// report queries (reports.ts) and the posting helpers can evolve
// independently.

import type { Tx } from "./types";
import type { JournalLineInput } from "./types";
import {
  postJournalEntry,
  handlePostFailure,
} from "./core";
import { ACCOUNT_CODES, EXPENSE_CATEGORY_TO_ACCOUNT } from "./constants";

// ─── Sale ─────────────────────────────────────────────────────────────────
// Dr Cash (or AR if khata)    = total
// Cr Sales Revenue            = subtotal (excl tax)
// Cr Sales Tax Payable        = tax
// Dr COGS                     = sum(costPrice * qty)
// Cr Inventory                = sum(costPrice * qty)

export interface SaleJournalInput {
  id: string;
  saleNumber: string;
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  items: Array<{ costPrice: number; quantity: number }>;
  payments: Array<{ method: string; amount: number }>;
}

export async function postSaleJournalEntry(
  storeId: string,
  sale: SaleJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    const cashAmount = sale.payments
      .filter((p) => p.method !== "khata" && p.method !== "credit")
      .reduce((s, p) => s + p.amount, 0);
    const khataAmount = sale.payments
      .filter((p) => p.method === "khata" || p.method === "credit")
      .reduce((s, p) => s + p.amount, 0);

    const cogs = sale.items.reduce(
      (s, item) => s + item.costPrice * item.quantity,
      0,
    );

    const lines: JournalLineInput[] = [];

    if (cashAmount > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.CASH,
        debit: cashAmount,
        description: `Cash sale ${sale.saleNumber}`,
      });
    }
    if (khataAmount > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        debit: khataAmount,
        description: `Khata sale ${sale.saleNumber}`,
      });
    }

    // FIX P0-6: Post sale-level discount as Dr Sales Discounts (contra-revenue)
    // so revenue isn't overstated when discounts are applied.
    if (sale.discount > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.SALES_DISCOUNTS,
        debit: sale.discount,
        description: `Sale discount ${sale.saleNumber}`,
      });
    }

    lines.push({
      accountCode: ACCOUNT_CODES.SALES_REVENUE,
      credit: sale.subtotal,
      description: `Revenue ${sale.saleNumber}`,
    });
    if (sale.tax > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.SALES_TAX_PAYABLE,
        credit: sale.tax,
        description: `Tax ${sale.saleNumber}`,
      });
    }

    await postJournalEntry(
      {
        storeId,
        description: `Sale ${sale.saleNumber}`,
        referenceType: "sale",
        referenceId: sale.id,
        lines,
      },
      tx,
    );

    // Separate COGS entry (reversible independently if needed).
    if (cogs > 0) {
      await postJournalEntry(
        {
          storeId,
          description: `COGS for ${sale.saleNumber}`,
          referenceType: "sale",
          referenceId: `${sale.id}-cogs`,
          lines: [
            {
              accountCode: ACCOUNT_CODES.COGS,
              debit: cogs,
              description: `COGS ${sale.saleNumber}`,
            },
            {
              accountCode: ACCOUNT_CODES.INVENTORY,
              credit: cogs,
              description: `Stock out ${sale.saleNumber}`,
            },
          ],
        },
        tx,
      );
    }
  } catch (err) {
    // AUDIT-FIX (5-a #9): propagate when inside a business transaction so the
    // whole sale rolls back on JE failure (prevents silent GL drift).
    handlePostFailure(`sale JE for ${sale.saleNumber}`, err, tx);
  }
}

// ─── Sale Return ──────────────────────────────────────────────────────────

export interface SaleReturnJournalInput {
  id: string;
  returnNumber: string;
  saleId: string;
  total: number;
  // FIX P0-7: costPrice per item so we can reverse the COGS entry.
  items: Array<{
    unitPrice: number;
    quantity: number;
    productId: string;
    costPrice: number;
  }>;
}

export interface SaleReturnSplit {
  subtotal: number;
  tax: number;
  discount: number;
}

export async function postSaleReturnJournalEntry(
  storeId: string,
  saleReturn: SaleReturnJournalInput,
  refundLines: Array<{ method: string; amount: number }>,
  tx?: Tx,
  // AUDIT-FIX C-1 + C-2: Optional split so we can reverse tax and discount
  // independently. Live callers pass these; backfill passes them when
  // available, otherwise falls back to the legacy single-line entry.
  split?: SaleReturnSplit,
): Promise<void> {
  try {
    const cashRefund = refundLines
      .filter(
        (l) =>
          l.method === "cash" || l.method === "card" || l.method === "mobile",
      )
      .reduce((s, l) => s + l.amount, 0);
    const khataRefund = refundLines
      .filter((l) => l.method === "khata" || l.method === "credit")
      .reduce((s, l) => s + l.amount, 0);

    const cogsReversal = saleReturn.items.reduce(
      (s, item) => s + item.costPrice * item.quantity,
      0,
    );

    const lines: JournalLineInput[] = [];

    if (cashRefund > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.CASH,
        credit: cashRefund,
        description: `Cash refund ${saleReturn.returnNumber}`,
      });
    }
    if (khataRefund > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        credit: khataRefund,
        description: `Khata refund ${saleReturn.returnNumber}`,
      });
    }

    if (split) {
      // AUDIT-FIX C-1: Dr Sales Tax Payable to reverse the original tax credit.
      // AUDIT-FIX C-2: Cr Sales Discounts to reverse the original contra-revenue.
      if (split.subtotal > 0) {
        lines.push({
          accountCode: ACCOUNT_CODES.SALES_RETURNS,
          debit: split.subtotal,
          description: `Return (subtotal) ${saleReturn.returnNumber}`,
        });
      }
      if (split.tax > 0) {
        lines.push({
          accountCode: ACCOUNT_CODES.SALES_TAX_PAYABLE,
          debit: split.tax,
          description: `Return (tax reversal) ${saleReturn.returnNumber}`,
        });
      }
      if (split.discount > 0) {
        lines.push({
          accountCode: ACCOUNT_CODES.SALES_DISCOUNTS,
          credit: split.discount,
          description: `Return (discount reversal) ${saleReturn.returnNumber}`,
        });
      }
    } else {
      // Legacy path — posts full tax-inclusive total as Dr Sales Returns.
      // NOTE: leaves Sales Tax Payable + Sales Discounts un-reversed. Only
      // hit by very old backfill data.
      lines.push({
        accountCode: ACCOUNT_CODES.SALES_RETURNS,
        debit: saleReturn.total,
        description: `Return ${saleReturn.returnNumber}`,
      });
    }

    await postJournalEntry(
      {
        storeId,
        description: `Sale return ${saleReturn.returnNumber}`,
        referenceType: "sale_return",
        referenceId: saleReturn.id,
        lines,
      },
      tx,
    );

    // FIX P0-7: Reverse the COGS (Dr Inventory, Cr COGS).
    if (cogsReversal > 0) {
      await postJournalEntry(
        {
          storeId,
          description: `COGS reversal for return ${saleReturn.returnNumber}`,
          referenceType: "sale_return",
          // Distinct referenceId so backfill can retry COGS independently.
          referenceId: `${saleReturn.id}-cogs`,
          lines: [
            {
              accountCode: ACCOUNT_CODES.INVENTORY,
              debit: cogsReversal,
              description: `Stock returned ${saleReturn.returnNumber}`,
            },
            {
              accountCode: ACCOUNT_CODES.COGS,
              credit: cogsReversal,
              description: `COGS reversal ${saleReturn.returnNumber}`,
            },
          ],
        },
        tx,
      );
    }
  } catch (err) {
    handlePostFailure(`return JE for ${saleReturn.returnNumber}`, err, tx);
  }
}

// ─── Expense ──────────────────────────────────────────────────────────────

export interface ExpenseJournalInput {
  id: string;
  amount: number;
  category: string;
  description: string | null;
}

export async function postExpenseJournalEntry(
  storeId: string,
  expense: ExpenseJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    const expenseAccountCode =
      EXPENSE_CATEGORY_TO_ACCOUNT[expense.category] ??
      ACCOUNT_CODES.MISC_EXPENSE;

    await postJournalEntry(
      {
        storeId,
        description: `Expense: ${expense.description ?? expense.category}`,
        referenceType: "expense",
        referenceId: expense.id,
        lines: [
          {
            accountCode: expenseAccountCode,
            debit: expense.amount,
            description: expense.category,
          },
          {
            accountCode: ACCOUNT_CODES.CASH,
            credit: expense.amount,
            description: "Cash paid",
          },
        ],
      },
      tx,
    );
  } catch (err) {
    handlePostFailure(`expense JE for ${expense.id}`, err, tx);
  }
}

// ─── Inventory Adjustment ─────────────────────────────────────────────────
// AUDIT-FIX H-17: Post a JE when inventory is manually adjusted (damage,
// set, manual receive). Previously these updated stock + created an
// InventoryAdjustment record but posted NO journal entry — GL Inventory
// diverged from physical stock.

export interface InventoryAdjustmentJournalInput {
  id: string;
  productId: string;
  productName: string;
  type: string; // "add" | "remove" | "set" | "receive" | "damage" | "return"
  quantity: number;
  previousStock: number;
  newStock: number;
  costPrice: number;
  reason: string | null;
}

export async function postInventoryAdjustmentJournalEntry(
  storeId: string,
  adjustment: InventoryAdjustmentJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    let valueChange: number;
    let isPositive: boolean;

    if (adjustment.type === "set") {
      valueChange =
        Math.abs(adjustment.newStock - adjustment.previousStock) *
        adjustment.costPrice;
      isPositive = adjustment.newStock > adjustment.previousStock;
    } else if (
      adjustment.type === "add" ||
      adjustment.type === "receive" ||
      adjustment.type === "return"
    ) {
      valueChange = adjustment.quantity * adjustment.costPrice;
      isPositive = true;
    } else {
      valueChange = adjustment.quantity * adjustment.costPrice;
      isPositive = false;
    }

    if (valueChange <= 0) return;

    const lines: JournalLineInput[] = [];

    if (isPositive) {
      lines.push({
        accountCode: ACCOUNT_CODES.INVENTORY,
        debit: valueChange,
        description: `Inventory +${adjustment.quantity} ${adjustment.productName} (${adjustment.type})`,
      });
      lines.push({
        accountCode: ACCOUNT_CODES.OWNERS_CAPITAL,
        credit: valueChange,
        description: `Capital contribution (${adjustment.type})`,
      });
    } else {
      lines.push({
        accountCode: ACCOUNT_CODES.MISC_EXPENSE,
        debit: valueChange,
        description: `Inventory loss: ${adjustment.productName} (${adjustment.type})`,
      });
      lines.push({
        accountCode: ACCOUNT_CODES.INVENTORY,
        credit: valueChange,
        description: `Inventory -${adjustment.quantity} (${adjustment.type})`,
      });
    }

    await postJournalEntry(
      {
        storeId,
        description: `Inventory adjustment: ${adjustment.productName} — ${adjustment.reason ?? adjustment.type}`,
        referenceType: "manual",
        referenceId: adjustment.id,
        lines,
      },
      tx,
    );
  } catch (err) {
    handlePostFailure(`inventory adjustment JE for ${adjustment.id}`, err, tx);
  }
}

// ─── Supplier Payment ─────────────────────────────────────────────────────

export interface SupplierPaymentJournalInput {
  supplierId: string;
  amount: number;
  note?: string | null;
  // AUDIT-FIX C-4: Optional referenceId override so backfill's jeExists
  // check matches live-posted entries.
  referenceId?: string;
  // AUDIT-FIX (5-c #6): The supplier-ledger entry type. "payment" = we pay the
  // supplier (cash OUT → Dr AP / Cr Cash). "debit" = the supplier refunds us
  // (cash IN → Dr Cash / Cr AP). Previously both posted Dr AP / Cr Cash, so
  // every supplier refund DECREASED the GL Cash account by the refund amount
  // when it should have INCREASED it — a 2× error per refund.
  type?: "payment" | "debit";
}

export async function postSupplierPaymentJournalEntry(
  storeId: string,
  payment: SupplierPaymentJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    const isRefund = payment.type === "debit";
    await postJournalEntry(
      {
        storeId,
        description: `Supplier ${isRefund ? "refund received" : "payment"}: ${payment.note ?? ""}`.trim(),
        referenceType: "supplier_payment",
        referenceId: payment.referenceId ?? payment.supplierId,
        lines: isRefund
          ? [
              // Supplier refunded us → cash IN.
              {
                accountCode: ACCOUNT_CODES.CASH,
                debit: payment.amount,
                description: "Cash in (supplier refund)",
              },
              {
                accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
                credit: payment.amount,
                description: "Reduce AP (supplier refund)",
              },
            ]
          : [
              // We paid the supplier → cash OUT.
              {
                accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
                debit: payment.amount,
                description: "Paid to supplier",
              },
              {
                accountCode: ACCOUNT_CODES.CASH,
                credit: payment.amount,
                description: "Cash out",
              },
            ],
      },
      tx,
    );
  } catch (err) {
    handlePostFailure("supplier payment JE", err, tx);
  }
}

// ─── Khata Payment (customer pays their credit) ───────────────────────────

export interface KhataPaymentJournalInput {
  customerId: string;
  amount: number;
  note?: string | null;
  // AUDIT-FIX C-5: Optional referenceId override for backfill matching.
  referenceId?: string;
}

export async function postKhataPaymentJournalEntry(
  storeId: string,
  payment: KhataPaymentJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    await postJournalEntry(
      {
        storeId,
        description: `Khata payment received: ${payment.note ?? ""}`.trim(),
        referenceType: "khata_payment",
        referenceId: payment.referenceId ?? payment.customerId,
        lines: [
          {
            accountCode: ACCOUNT_CODES.CASH,
            debit: payment.amount,
            description: "Cash received",
          },
          {
            accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
            credit: payment.amount,
            description: "AR reduction",
          },
        ],
      },
      tx,
    );
  } catch (err) {
    handlePostFailure("khata payment JE", err, tx);
  }
}

// ─── Purchase Order Receipt ───────────────────────────────────────────────

export interface PurchaseReceiptJournalInput {
  purchaseOrderId: string;
  orderNumber: string;
  totalReceivedValue: number;
}

export async function postPurchaseReceiptJournalEntry(
  storeId: string,
  receipt: PurchaseReceiptJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    if (receipt.totalReceivedValue <= 0) return;
    await postJournalEntry(
      {
        storeId,
        description: `Stock received for PO ${receipt.orderNumber}`,
        referenceType: "purchase",
        referenceId: receipt.purchaseOrderId,
        lines: [
          {
            accountCode: ACCOUNT_CODES.INVENTORY,
            debit: receipt.totalReceivedValue,
            description: "Inventory in",
          },
          {
            accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
            credit: receipt.totalReceivedValue,
            description: "Owed to supplier",
          },
        ],
      },
      tx,
    );
  } catch (err) {
    handlePostFailure(`PO receipt JE for ${receipt.orderNumber}`, err, tx);
  }
}

// ─── Payroll ──────────────────────────────────────────────────────────────

export interface PayrollJournalInput {
  month: number;
  year: number;
  totalNetPayable: number;
  totalDeductions: number;
  count: number;
}

export async function postPayrollJournalEntry(
  storeId: string,
  payroll: PayrollJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    if (payroll.totalNetPayable <= 0) return;
    const gross = payroll.totalNetPayable + payroll.totalDeductions;

    const lines: JournalLineInput[] = [
      {
        accountCode: ACCOUNT_CODES.SALARIES_EXPENSE,
        debit: gross,
        description: `Payroll ${payroll.month}/${payroll.year} (${payroll.count} employees)`,
      },
    ];

    if (payroll.totalNetPayable > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.CASH,
        credit: payroll.totalNetPayable,
        description: "Net paid in cash",
      });
    }

    if (payroll.totalDeductions > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.PAYROLL_PAYABLE,
        credit: payroll.totalDeductions,
        description: "Deductions (advances, absences)",
      });
    }

    await postJournalEntry(
      {
        storeId,
        description: `Payroll for ${payroll.month}/${payroll.year}`,
        referenceType: "payroll",
        // FIX P0-5: referenceId so backfill's jeExists check matches.
        referenceId: `payroll-${payroll.month}-${payroll.year}`,
        lines,
      },
      tx,
    );
  } catch (err) {
    handlePostFailure(`payroll JE for ${payroll.month}/${payroll.year}`, err, tx);
  }
}

// ─── Register Cash In/Out ─────────────────────────────────────────────────

export interface CashAdjustmentJournalInput {
  type: "cash_in" | "cash_out";
  amount: number;
  reason: string;
  transactionId: string;
}

export async function postCashAdjustmentJournalEntry(
  storeId: string,
  adjustment: CashAdjustmentJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    if (adjustment.type === "cash_in") {
      await postJournalEntry(
        {
          storeId,
          description: `Register cash in: ${adjustment.reason}`,
          referenceType: "cash_in",
          referenceId: adjustment.transactionId,
          lines: [
            {
              accountCode: ACCOUNT_CODES.CASH,
              debit: adjustment.amount,
              description: "Cash added to register",
            },
            {
              accountCode: ACCOUNT_CODES.OWNERS_DRAWINGS,
              credit: adjustment.amount,
              description: "Owner contribution",
            },
          ],
        },
        tx,
      );
    } else {
      await postJournalEntry(
        {
          storeId,
          description: `Register cash out: ${adjustment.reason}`,
          referenceType: "cash_out",
          referenceId: adjustment.transactionId,
          lines: [
            {
              accountCode: ACCOUNT_CODES.OWNERS_DRAWINGS,
              debit: adjustment.amount,
              description: "Owner withdrawal",
            },
            {
              accountCode: ACCOUNT_CODES.CASH,
              credit: adjustment.amount,
              description: "Cash removed from register",
            },
          ],
        },
        tx,
      );
    }
  } catch (err) {
    handlePostFailure(`cash adjustment JE for ${adjustment.type}`, err, tx);
  }
}

// ─── Stock Transfer — Dispatch (source store) ─────────────────────────────
// At cost price — no revenue, no COGS, no tax. Just inventory moving.

export interface TransferJournalInput {
  id: string;
  transferNumber: string;
  totalValue: number;
}

export async function postTransferDispatchJournalEntry(
  sourceStoreId: string,
  transfer: TransferJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    if (transfer.totalValue <= 0) return;
    await postJournalEntry(
      {
        storeId: sourceStoreId,
        description: `Stock transfer out: ${transfer.transferNumber}`,
        referenceType: "transfer",
        referenceId: transfer.id,
        lines: [
          {
            accountCode: ACCOUNT_CODES.INTER_STORE_RECEIVABLE,
            debit: transfer.totalValue,
            description: `Transfer to dest store ${transfer.transferNumber}`,
          },
          {
            accountCode: ACCOUNT_CODES.INVENTORY,
            credit: transfer.totalValue,
            description: `Stock out ${transfer.transferNumber}`,
          },
        ],
      },
      tx,
    );
  } catch (err) {
    handlePostFailure(
      `transfer dispatch JE for ${transfer.transferNumber}`,
      err,
      tx,
    );
  }
}

// ─── Stock Transfer — Receive (dest store) ────────────────────────────────

export async function postTransferReceiveJournalEntry(
  destStoreId: string,
  transfer: TransferJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    if (transfer.totalValue <= 0) return;
    await postJournalEntry(
      {
        storeId: destStoreId,
        description: `Stock transfer in: ${transfer.transferNumber}`,
        referenceType: "transfer",
        referenceId: `${transfer.id}-receive`,
        lines: [
          {
            accountCode: ACCOUNT_CODES.INVENTORY,
            debit: transfer.totalValue,
            description: `Stock in ${transfer.transferNumber}`,
          },
          {
            accountCode: ACCOUNT_CODES.INTER_STORE_PAYABLE,
            credit: transfer.totalValue,
            description: `Transfer from source store ${transfer.transferNumber}`,
          },
        ],
      },
      tx,
    );
  } catch (err) {
    handlePostFailure(
      `transfer receive JE for ${transfer.transferNumber}`,
      err,
      tx,
    );
  }
}

// ─── Stock Transfer — Cancel after dispatch ───────────────────────────────

export async function postTransferCancelJournalEntry(
  sourceStoreId: string,
  transfer: TransferJournalInput,
  tx?: Tx,
): Promise<void> {
  try {
    if (transfer.totalValue <= 0) return;
    await postJournalEntry(
      {
        storeId: sourceStoreId,
        description: `Stock transfer cancelled: ${transfer.transferNumber}`,
        referenceType: "transfer",
        referenceId: `${transfer.id}-cancel`,
        lines: [
          {
            accountCode: ACCOUNT_CODES.INVENTORY,
            debit: transfer.totalValue,
            description: `Stock returned ${transfer.transferNumber}`,
          },
          {
            accountCode: ACCOUNT_CODES.INTER_STORE_RECEIVABLE,
            credit: transfer.totalValue,
            description: `Receivable cleared ${transfer.transferNumber}`,
          },
        ],
      },
      tx,
    );
  } catch (err) {
    handlePostFailure(
      `transfer cancel JE for ${transfer.transferNumber}`,
      err,
      tx,
    );
  }
}

// ─── Stock Transfer — Settlement ──────────────────────────────────────────
// The owner absorbs both sides — no actual money moves between stores.

export async function postTransferSettlementJournalEntry(
  storeId: string,
  transfer: TransferJournalInput,
  isSourceStore: boolean,
  tx?: Tx,
): Promise<void> {
  try {
    if (transfer.totalValue <= 0) return;

    const lines: JournalLineInput[] = isSourceStore
      ? [
          {
            accountCode: ACCOUNT_CODES.OWNERS_CAPITAL,
            debit: transfer.totalValue,
            description: `Owner absorbs receivable ${transfer.transferNumber}`,
          },
          {
            accountCode: ACCOUNT_CODES.INTER_STORE_RECEIVABLE,
            credit: transfer.totalValue,
            description: `Receivable cleared ${transfer.transferNumber}`,
          },
        ]
      : [
          {
            accountCode: ACCOUNT_CODES.INTER_STORE_PAYABLE,
            debit: transfer.totalValue,
            description: `Payable cleared ${transfer.transferNumber}`,
          },
          {
            accountCode: ACCOUNT_CODES.OWNERS_CAPITAL,
            credit: transfer.totalValue,
            description: `Owner absorbs payable ${transfer.transferNumber}`,
          },
        ];

    await postJournalEntry(
      {
        storeId,
        description: `Inter-store settlement: ${transfer.transferNumber}`,
        referenceType: "transfer",
        referenceId: `${transfer.id}-settle-${isSourceStore ? "src" : "dst"}`,
        lines,
      },
      tx,
    );
  } catch (err) {
    handlePostFailure(
      `transfer settlement JE for ${transfer.transferNumber}`,
      err,
      tx,
    );
  }
}
