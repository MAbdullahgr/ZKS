// src/services/khataService.ts
//
// Business logic for customer khata (credit ledger) transactions.
// Extracted from src/app/api/customers/[id]/khata/route.ts.
//
// Key responsibilities:
//   1. Validate customer exists
//   2. Apply relative balance update (decrement for payment/advance/return_credit)
//   3. Create KhataTransaction with balanceAfter snapshot
//   4. Return the new balance
//
// IMPORTANT: This service does NOT handle the "credit" type (created by
// saleService when a customer buys on credit). It only handles manual
// payments, advances, and return refunds.

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-error";
import type { Tx } from "./types";
import {
  postSupplierPaymentJournalEntry,
  postKhataPaymentJournalEntry,
} from "./accountingService";

export interface KhataInput {
  customerId: string;
  storeId: string;
  amount: number;
  type: "payment" | "advance" | "return_credit" | "return_cash";
  note?: string | null;
}

export interface KhataResult {
  transactionId: string;
  newBalance: number;
}

export async function recordKhata(
  input: KhataInput,
  tx?: Tx,
): Promise<KhataResult> {
  // FIX P2-15: If no transaction client is provided, wrap the two writes
  // (create KhataTransaction + update Customer.balance) in a transaction
  // so they can't drift apart if one fails. Previously, if the customer
  // update failed after the transaction was created, the ledger would show
  // a payment that didn't actually reduce the customer's balance.
  if (tx) {
    return recordKhataInTx(input, tx);
  }
  return prisma.$transaction(async (innerTx) => recordKhataInTx(input, innerTx), {
    timeout: 10000,
    maxWait: 5000,
  });
}

async function recordKhataInTx(
  input: KhataInput,
  client: Tx,
): Promise<KhataResult> {
  const customer = await client.customer.findFirst({
    where: { id: input.customerId, storeId: input.storeId },
    select: { balance: true, creditLimit: true, name: true },
  });

  if (!customer) {
    throw new HttpError("Customer not found", 404, "NOT_FOUND");
  }

  const currentBalance = Number(customer.balance);

  // Determine the balance update direction
  let newBalance: number;
  let balanceUpdate:
    | { decrement: number }
    | { increment: number }
    | Record<string, never>;

  if (
    input.type === "payment" ||
    input.type === "advance" ||
    input.type === "return_credit"
  ) {
    newBalance = currentBalance - input.amount;
    balanceUpdate = { decrement: input.amount };
  } else if (input.type === "return_cash") {
    // No khata change for cash refund — handled by CashTransaction on the register
    newBalance = currentBalance;
    balanceUpdate = {};
  } else {
    throw new HttpError(
      `Khata type "${input.type}" not supported via this endpoint`,
      400,
      "VALIDATION_ERROR",
    );
  }

  const transaction = await client.khataTransaction.create({
    data: {
      storeId: input.storeId,
      customerId: input.customerId,
      type: input.type,
      amount: input.amount,
      balanceAfter: newBalance,
      note:
        input.note ??
        (input.type === "advance"
          ? "Advance payment"
          : input.type.startsWith("return")
            ? "Return refund"
            : "Payment received"),
    },
  });

  // Apply relative balance update only if there's a real change
  if ("decrement" in balanceUpdate || "increment" in balanceUpdate) {
    await client.customer.update({
      where: { id: input.customerId },
      data: { balance: balanceUpdate },
    });
  }

  // ─── Auto-post journal entry (non-blocking) ─────────────────────────
  // Only post for payment/advance — return types are handled by returnService
  if (input.type === "payment" || input.type === "advance") {
    await postKhataPaymentJournalEntry(
      input.storeId,
      {
        customerId: input.customerId,
        amount: input.amount,
        note: input.note,
      },
      client,
    );
  }

  return {
    transactionId: transaction.id,
    newBalance,
  };
}

// ─── Supplier ledger (Bakaya) ────────────────────────────────────────────
//
// Separate but parallel logic for supplier payments.

export interface SupplierPaymentInput {
  supplierId: string;
  storeId: string;
  amount: number;
  type: "payment" | "debit"; // payment = we pay them, debit = they refund us
  note?: string | null;
}

export interface SupplierPaymentResult {
  supplierId: string;
  newBalance: number;
}

export async function recordSupplierPayment(
  input: SupplierPaymentInput,
  tx?: Tx,
): Promise<SupplierPaymentResult> {
  // FIX P2-15: Wrap in a transaction when no tx is provided — same rationale
  // as recordKhata. The supplierLedger.create + supplier.update must be atomic.
  if (tx) {
    return recordSupplierPaymentInTx(input, tx);
  }
  return prisma.$transaction(
    async (innerTx) => recordSupplierPaymentInTx(input, innerTx),
    { timeout: 10000, maxWait: 5000 },
  );
}

async function recordSupplierPaymentInTx(
  input: SupplierPaymentInput,
  client: Tx,
): Promise<SupplierPaymentResult> {
  const supplier = await client.supplier.findFirst({
    where: { id: input.supplierId, storeId: input.storeId },
    select: { balance: true, name: true },
  });

  if (!supplier) {
    throw new HttpError("Supplier not found", 404, "NOT_FOUND");
  }

  const currentBalance = Number(supplier.balance);
  const newBalance = currentBalance - input.amount;

  await client.supplierLedger.create({
    data: {
      storeId: input.storeId,
      supplierId: input.supplierId,
      type: input.type,
      amount: input.amount,
      balanceAfter: newBalance,
      note:
        input.note ||
        (input.type === "payment"
          ? `Payment to ${supplier.name}`
          : `Refund/Return from ${supplier.name}`),
    },
  });

  await client.supplier.update({
    where: { id: input.supplierId },
    data: { balance: { decrement: input.amount } },
  });

  // ─── Auto-post journal entry (non-blocking) ─────────────────────────
  // AUDIT-FIX (5-c #6): Pass the ledger entry type so the JE posts in the
  // correct direction. "debit" (supplier refund to us) must be Dr Cash / Cr
  // AP (cash IN), not Dr AP / Cr Cash (cash OUT).
  await postSupplierPaymentJournalEntry(
    input.storeId,
    {
      supplierId: input.supplierId,
      amount: input.amount,
      note: input.note,
      type: input.type,
    },
    client,
  );

  return { supplierId: input.supplierId, newBalance };
}
