// src/services/types.ts
//
// Shared types for the service layer. Services are framework-agnostic —
// they don't import Next.js, and they throw `HttpError`/`AuthError` for
// the route handler to catch via `withErrorHandler`.

import { Prisma } from "@generated/prisma/client";

// Re-export Prisma's transaction client type so services can accept it
export type Tx = Prisma.TransactionClient;

// Result type for service operations — always returns plain data,
// never a NextResponse. Errors are thrown.
export interface SaleCreateInput {
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
    note?: string | null;
    variantId?: string | null;
    discount?: number;
  }>;
  paymentLines: Array<{
    method: "cash" | "card" | "mobile" | "credit" | "khata" | "easypaisa" | "jazzcash";
    amount: number;
  }>;
  customerId?: string | null;
  customerName?: string | null;
  discount: number;
  tax: number;
  notes?: string | null;
  registerSessionId: string;
  idempotencyKey: string;
}

export interface SaleCreateResult {
  saleId: string;
  saleNumber: string;
  taxInvoiceNumber: string | null;
}

export interface ReturnProcessInput {
  items: Array<{
    saleItemId: string;
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  refundLines: Array<{
    method: "cash" | "card" | "mobile" | "credit" | "khata" | "easypaisa" | "jazzcash";
    amount: number;
  }>;
  reason?: string | null;
  registerSessionId?: string | null;
  // AUDIT-FIX (5-a #7): optional idempotency key to prevent duplicate returns
  // on client retry. Mirrors SaleCreateInput.idempotencyKey.
  idempotencyKey?: string | null;
}

export interface ReturnProcessResult {
  saleReturnId: string;
  returnNumber: string;
  totalReturn: number;
  storeId: string;
}

export interface PayrollGenerateInput {
  month: number; // 1-12
  year: number;
  storeId: string;
}

export interface PayrollGenerateResult {
  count: number;
  skipped: number;
}
