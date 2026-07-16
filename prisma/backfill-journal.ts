// prisma/backfill-journal.ts
//
// One-time script that creates journal entries for all historical transactions
// that happened BEFORE the auto-posting integration was added.
//
// This makes your financial reports (Trial Balance, P&L, Balance Sheet) show
// accurate historical data, not just from the go-live date forward.
//
// The script is IDEMPOTENT — it checks if a JE already exists for each
// transaction before creating one. You can run it multiple times safely.
//
// Usage: npm run db:backfill
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  postSaleJournalEntry,
  postSaleReturnJournalEntry,
  postExpenseJournalEntry,
  postPurchaseReceiptJournalEntry,
  postSupplierPaymentJournalEntry,
  postKhataPaymentJournalEntry,
  postPayrollJournalEntry,
  ACCOUNT_CODES,
  postJournalEntry,
} from "../src/services/accountingService";
import { JournalReferenceType } from "../src/generated/prisma/client";

// ─── Helper: check if a JE already exists for a reference ────────────────

async function jeExists(
  storeId: string,
  referenceType: JournalReferenceType,
  referenceId: string,
): Promise<boolean> {
  const existing = await prisma.journalEntry.findFirst({
    where: { storeId, referenceType, referenceId },
    select: { id: true },
  });
  return !!existing;
}

// ─── Backfill: Sales ─────────────────────────────────────────────────────

async function backfillSales(storeId: string) {
  const sales = await prisma.sale.findMany({
    where: { storeId, status: "completed" },
    include: {
      items: { select: { costPrice: true, quantity: true } },
      payments: { select: { method: true, amount: true } },
    },
  });

  let count = 0;
  for (const sale of sales) {
    // FIX: Check both the main sale JE and the COGS JE independently.
    // postSaleJournalEntry posts 2 entries with different referenceIds:
    //   - sale.id (main entry: Dr Cash/AR, Cr Revenue/Tax/Discount)
    //   - sale.id + "-cogs" (COGS entry: Dr COGS, Cr Inventory)
    // If only one exists (partial failure), we need to retry the whole call.
    // postSaleJournalEntry is idempotent per-referenceId (it doesn't check
    // for existing entries — it just creates), so we skip only if BOTH exist.
    const mainExists = await jeExists(storeId, "sale", sale.id);
    const cogsExists = await jeExists(storeId, "sale", `${sale.id}-cogs`);
    if (mainExists && cogsExists) continue;
    if (mainExists && !cogsExists) {
      // Main exists but COGS doesn't — this is a partial failure from a
      // previous run. We can't call postSaleJournalEntry again because it
      // would re-post the main entry (duplicate). Log and skip — needs
      // manual intervention or a targeted COGS-only backfill.
      console.warn(
        `[backfill] Sale ${sale.saleNumber} has main JE but missing COGS JE. Skipping — manual fix needed.`,
      );
      continue;
    }

    await postSaleJournalEntry(storeId, {
      id: sale.id,
      saleNumber: sale.saleNumber,
      subtotal: Number(sale.subtotal),
      tax: Number(sale.tax),
      total: Number(sale.total),
      // FIX P0-6: Pass discount so the backfilled JE includes the Sales Discounts entry.
      discount: Number(sale.discount),
      items: sale.items.map((i) => ({
        costPrice: Number(i.costPrice),
        quantity: Number(i.quantity),
      })),
      payments: sale.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
      })),
    });
    count++;
  }
  return count;
}

// ─── Backfill: Sale Returns (P0-9) ──────────────────────────────────────

async function backfillSaleReturns(storeId: string) {
  const returns = await prisma.saleReturn.findMany({
    where: { storeId },
    include: {
      items: {
        select: {
          saleItemId: true,
          unitPrice: true,
          quantity: true,
          productId: true,
        },
      },
      sale: {
        select: {
          id: true,
          payments: { select: { method: true, amount: true } },
        },
      },
    },
  });

  let count = 0;
  for (const saleReturn of returns) {
    // FIX: Check both the main return JE and the COGS reversal JE independently.
    // postSaleReturnJournalEntry posts 2 entries:
    //   - saleReturn.id (main: Dr Sales Returns, Cr Cash/AR)
    //   - saleReturn.id + "-cogs" (COGS reversal: Dr Inventory, Cr COGS)
    const mainExists = await jeExists(storeId, "sale_return", saleReturn.id);
    const cogsExists = await jeExists(
      storeId,
      "sale_return",
      `${saleReturn.id}-cogs`,
    );
    if (mainExists && cogsExists) continue;
    if (mainExists && !cogsExists) {
      console.warn(
        `[backfill] Return ${saleReturn.returnNumber} has main JE but missing COGS reversal JE. Skipping — manual fix needed.`,
      );
      continue;
    }

    // Fetch costPrice + discount + taxAmount from original SaleItems for COGS reversal
    const saleItemIds = saleReturn.items.map((i) => i.saleItemId);
    const originalItems = await prisma.saleItem.findMany({
      where: { id: { in: saleItemIds } },
      select: { id: true, costPrice: true, discount: true, taxAmount: true, quantity: true },
    });
    const costPriceMap = new Map(
      originalItems.map((si) => [si.id, Number(si.costPrice)]),
    );

    // AUDIT-FIX C-6: Use saleReturn.total as a single cash refund line.
    // Previously used the original sale's FULL payment amounts as refund
    // lines — for a partial return (sale 1000, return 200) the JE became
    // Dr Sales Returns 200, Cr Cash 1000 → UNBALANCED → silent failure.
    // Now we post a single balanced reversing entry. The actual refund
    // method mix is unknown for historical returns, so cash is the safest
    // assumption (the GL Cash account is a catch-all for liquid funds).
    const refundLines = [
      { method: "cash", amount: Number(saleReturn.total) },
    ];

    // AUDIT-FIX C-1/C-2: Compute subtotal/tax/discount split for the
    // return so the JE reverses Sales Tax Payable and Sales Discounts
    // correctly, matching the live path in returnService.ts.
    let returnSubtotal = 0;
    let returnTax = 0;
    let returnDiscount = 0;
    for (const item of saleReturn.items) {
      const origItem = originalItems.find((si) => si.id === item.saleItemId);
      if (!origItem) continue;
      const origQty = Number(origItem.quantity);
      const scale = origQty > 0 ? Number(item.quantity) / origQty : 0;
      const lineSubtotal = Number(item.unitPrice) * Number(item.quantity);
      const lineDiscount = Number(origItem.discount) * scale;
      const lineTax = Number(origItem.taxAmount) * scale;
      returnSubtotal += lineSubtotal - lineDiscount;
      returnTax += lineTax;
      returnDiscount += lineDiscount;
    }

    await postSaleReturnJournalEntry(
      storeId,
      {
        id: saleReturn.id,
        returnNumber: saleReturn.returnNumber,
        saleId: saleReturn.saleId,
        total: Number(saleReturn.total),
        items: saleReturn.items.map((i) => ({
          unitPrice: Number(i.unitPrice),
          quantity: Number(i.quantity),
          productId: i.productId,
          costPrice: costPriceMap.get(i.saleItemId) ?? 0,
        })),
      },
      refundLines,
      undefined,
      // Pass the split so the JE reverses tax + discount correctly.
      {
        subtotal: Math.round(returnSubtotal * 100) / 100,
        tax: Math.round(returnTax * 100) / 100,
        discount: Math.round(returnDiscount * 100) / 100,
      },
    );
    count++;
  }
  return count;
}

// ─── Backfill: Expenses ──────────────────────────────────────────────────

async function backfillExpenses(storeId: string) {
  const expenses = await prisma.expense.findMany({ where: { storeId } });

  let count = 0;
  for (const expense of expenses) {
    const exists = await jeExists(storeId, "expense", expense.id);
    if (exists) continue;

    await postExpenseJournalEntry(storeId, {
      id: expense.id,
      amount: Number(expense.amount),
      category: expense.category,
      description: expense.description,
    });
    count++;
  }
  return count;
}

// ─── Backfill: Purchase Order Receipts ──────────────────────────────────

async function backfillPurchaseReceipts(storeId: string) {
  // Find all POs that have received items (status = partial or received)
  const pos = await prisma.purchaseOrder.findMany({
    where: {
      storeId,
      status: { in: ["partial", "received"] },
    },
    include: {
      items: { select: { receivedQty: true, unitCost: true } },
    },
  });

  let count = 0;
  for (const po of pos) {
    const exists = await jeExists(storeId, "purchase", po.id);
    if (exists) continue;

    // Calculate total received value
    const totalReceivedValue = po.items.reduce(
      (sum, item) => sum + Number(item.receivedQty) * Number(item.unitCost),
      0,
    );

    if (totalReceivedValue > 0) {
      await postPurchaseReceiptJournalEntry(storeId, {
        purchaseOrderId: po.id,
        orderNumber: po.orderNumber,
        totalReceivedValue,
      });
      count++;
    }
  }
  return count;
}

// ─── Backfill: Supplier Payments ─────────────────────────────────────────

async function backfillSupplierPayments(storeId: string) {
  // Find all supplier ledger entries with type "payment"
  const payments = await prisma.supplierLedger.findMany({
    where: { storeId, type: "payment" },
  });

  let count = 0;
  for (const payment of payments) {
    // AUDIT-FIX C-4: Use the SAME compound referenceId that the live
    // postSupplierPaymentJournalEntry now accepts. Previously backfill
    // checked supplierId-ledgerId but live posted supplierId only —
    // mismatch caused duplicates on every backfill re-run.
    const compoundRefId = payment.supplierId + "-" + payment.id;
    const exists = await jeExists(
      storeId,
      "supplier_payment",
      compoundRefId,
    );
    if (exists) continue;

    await postSupplierPaymentJournalEntry(storeId, {
      supplierId: payment.supplierId,
      amount: Number(payment.amount),
      note: payment.note,
      referenceId: compoundRefId,
    });
    count++;
  }
  return count;
}

// ─── Backfill: Khata Payments (customer payments) ───────────────────────

async function backfillKhataPayments(storeId: string) {
  // Find all khata transactions with type "payment" or "advance"
  const transactions = await prisma.khataTransaction.findMany({
    where: { storeId, type: { in: ["payment", "advance"] } },
  });

  let count = 0;
  for (const txn of transactions) {
    // AUDIT-FIX C-5: Use the SAME compound referenceId that the live
    // postKhataPaymentJournalEntry now accepts. Previously backfill
    // checked customerId-txnId but live posted customerId only —
    // mismatch caused duplicates on every backfill re-run.
    const compoundRefId = txn.customerId + "-" + txn.id;
    const exists = await jeExists(
      storeId,
      "khata_payment",
      compoundRefId,
    );
    if (exists) continue;

    await postKhataPaymentJournalEntry(storeId, {
      customerId: txn.customerId,
      amount: Number(txn.amount),
      note: txn.note,
      referenceId: compoundRefId,
    });
    count++;
  }
  return count;
}

// ─── Backfill: Payroll ──────────────────────────────────────────────────

async function backfillPayroll(storeId: string) {
  // Group payrolls by month/year and post one aggregate JE per period
  const payrolls = await prisma.payroll.findMany({ where: { storeId } });

  // Group by month/year
  const groups = new Map<string, typeof payrolls>();
  for (const p of payrolls) {
    const key = `${p.year}-${p.month}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  let count = 0;
  for (const [key, group] of groups) {
    const [year, month] = key.split("-").map(Number);

    const exists = await jeExists(
      storeId,
      "payroll",
      `payroll-${month}-${year}`,
    );
    if (exists) continue;

    const totalNetPayable = group.reduce((s, p) => s + Number(p.netPayable), 0);
    const totalDeductions = group.reduce(
      (s, p) => s + Number(p.salaryDeduction) + Number(p.advanceDeduction),
      0,
    );

    if (totalNetPayable > 0) {
      await postPayrollJournalEntry(storeId, {
        month,
        year,
        totalNetPayable,
        totalDeductions,
        count: group.length,
      });
      count++;
    }
  }
  return count;
}

// ─── Opening Balance Entry (for inventory received before any PO) ────────
//
// This handles the edge case where products exist with stock but have no
// PO receipt (e.g., initial stock added via inventory adjustment or import).
// We post the current inventory value as an opening balance.

async function backfillOpeningInventory(storeId: string) {
  // FIX P0-8: The opening inventory must be computed as:
  //   opening = currentStockValue - cumulativePOReceipts + cumulativeCOGS
  // Because: currentStock = opening + received - sold
  // The old code used currentStockValue directly, which double-counts:
  // opening (currentStock) + PO receipts (Dr) - COGS (Cr) = too much inventory.

  const products = await prisma.product.findMany({
    where: { storeId, isActive: true, stockQuantity: { gt: 0 } },
    select: { stockQuantity: true, costPrice: true },
  });

  const currentStockValue = products.reduce(
    (sum, p) => sum + Number(p.stockQuantity) * Number(p.costPrice),
    0,
  );

  // Compute cumulative PO receipts value (all received items)
  const poItems = await prisma.purchaseOrderItem.findMany({
    where: { purchaseOrder: { storeId } },
    select: { receivedQty: true, unitCost: true },
  });
  const cumulativePOReceipts = poItems.reduce(
    (sum, item) => sum + Number(item.receivedQty) * Number(item.unitCost),
    0,
  );

  // Compute cumulative COGS (all sold items' cost)
  const saleItems = await prisma.saleItem.findMany({
    where: { sale: { storeId } },
    select: { costPrice: true, quantity: true },
  });
  const cumulativeCOGS = saleItems.reduce(
    (sum, item) => sum + Number(item.costPrice) * Number(item.quantity),
    0,
  );

  // opening = currentStock - received + sold
  const inventoryValue =
    currentStockValue - cumulativePOReceipts + cumulativeCOGS;

  // If opening is <= 0, all stock came from POs — no opening entry needed
  if (inventoryValue <= 0) return 0;

  // Check if an opening inventory entry already exists
  const exists = await jeExists(storeId, "manual", "opening-inventory");
  if (exists) return 0;

  // Post: Dr Inventory, Cr Owner's Capital (assume owner funded the initial stock)
  await postJournalEntry({
    storeId,
    description: "Opening inventory balance (backfilled)",
    referenceType: "manual",
    referenceId: "opening-inventory",
    lines: [
      {
        accountCode: ACCOUNT_CODES.INVENTORY,
        debit: inventoryValue,
        description: "Opening stock at cost",
      },
      {
        accountCode: ACCOUNT_CODES.OWNERS_CAPITAL,
        credit: inventoryValue,
        description: "Owner capital (inventory funding)",
      },
    ],
  });

  return 1;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("Starting journal entry backfill...\n");

  const stores = await prisma.store.findMany();
  console.log(`Found ${stores.length} store(s)\n`);

  for (const store of stores) {
    console.log(`━━━ Store: ${store.name} (${store.id}) ━━━`);

    const sales = await backfillSales(store.id);
    console.log(`  Sales: ${sales} entries created`);

    const saleReturns = await backfillSaleReturns(store.id);
    console.log(`  Sale Returns: ${saleReturns} entries created`);

    const expenses = await backfillExpenses(store.id);
    console.log(`  Expenses: ${expenses} entries created`);

    const poReceipts = await backfillPurchaseReceipts(store.id);
    console.log(`  PO Receipts: ${poReceipts} entries created`);

    const supplierPayments = await backfillSupplierPayments(store.id);
    console.log(`  Supplier Payments: ${supplierPayments} entries created`);

    const khataPayments = await backfillKhataPayments(store.id);
    console.log(`  Khata Payments: ${khataPayments} entries created`);

    const payroll = await backfillPayroll(store.id);
    console.log(`  Payroll: ${payroll} entries created`);

    const openingInv = await backfillOpeningInventory(store.id);
    console.log(`  Opening Inventory: ${openingInv} entries created`);

    console.log("");
  }

  console.log("✅ Backfill complete!");
  console.log("   Your financial reports now include all historical data.");
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
