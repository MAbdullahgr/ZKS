// src/services/helpers.ts
//
// Pure helper functions for the service layer.
//
// IMPORTANT: This file uses `import type` for Prisma types only. Type-only
// imports are erased at compile time, so they do NOT trigger module loading
// at runtime. This keeps the file safe to unit-test without loading the
// generated Prisma client (which pulls in native bindings that Vitest
// can't resolve).

import type { Prisma } from "@generated/prisma/client";
import { randomInt } from "node:crypto";

// AUDIT-FIX C-18: Use PKT-local date for sale/return/invoice number date
// stamps. Previously used toISOString() which is UTC — a sale at 11 PM PKT
// on Jan 5 was timestamped Jan 6 in UTC, mismatching daily reports. Now
// uses Asia/Karachi timezone so the date in the number matches the
// business date the cashier sees.
function pktDateString(): string {
  const now = new Date();
  // Format: YYYYMMDD in Asia/Karachi timezone
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }).replace(/-/g, "");
}

// FIX P2-3: Use 6-digit random suffix (was 4 digits). With 4 digits, the
// birthday paradox means ~95 sales/day gives a 50% chance of collision.
// 6 digits = 900,000 combinations → collision at ~950 sales/day, safe for
// high-volume stores. Also use crypto.randomInt instead of Math.random.
export function generateSaleNumber(): string {
  const date = pktDateString();
  const random = randomInt(100000, 1000000);
  return `SALE-${date}-${random}`;
}

export function generateReturnNumber(): string {
  const date = pktDateString();
  const random = randomInt(100000, 1000000);
  return `RET-${date}-${random}`;
}

// Minimal interface for the transaction client — structurally compatible
// with Prisma's TransactionClient. Uses the real Prisma SaleCountArgs type
// for the argument so callers get full type-checking.
export interface CountableTx {
  sale: {
    count: (args?: Prisma.SaleCountArgs) => Promise<number>;
  };
}

// AUDIT-FIX C-16: FBR-compliant sequential invoice number generator.
// FBR Pakistan requires sequential invoice numbers per registered taxpayer
// per tax period. Previously used INV-YYYYMMDD-HHMMSS-random(100,1000)
// which is non-sequential — FBR would reject these.
//
// New format: INV-{FY}-{NNNNNN} where FY is the Pakistan fiscal year
// (July 1 – June 30) and NNNNNN is a zero-padded sequence number per store.
// The sequence is computed via COUNT + 1 inside the caller's transaction
// (Serializable isolation) — atomic enough for a single store. For true
// multi-terminal atomicity, a Postgres SEQUENCE would be better, but
// COUNT+1 inside Serializable is sufficient for most store volumes.
//
// Pakistan fiscal year: July 1 – June 30. FY label: "FY2526" for
// July 2025 – June 2026.
function pakistaniFiscalYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (0 = January)
  // If before July (month < 6), fiscal year started the previous year
  const fyStartYear = month < 6 ? year - 1 : year;
  const fyEndYear = (fyStartYear + 1) % 100;
  return `FY${fyStartYear % 100}${fyEndYear.toString().padStart(2, "0")}`;
}

export async function generateTaxInvoiceNumber(
  tx?: CountableTx,
  storeId?: string,
): Promise<string> {
  const fy = pakistaniFiscalYear();

  // If we have a transaction client + storeId, generate a sequential number
  // by counting existing invoices for this store in this fiscal year.
  if (tx && storeId) {
    // Count sales with a taxInvoiceNumber starting with this FY prefix.
    // This is approximate (a deleted sale would leave a gap) but FBR-
    // acceptable — gaps are allowed as long as the sequence is monotonic.
    const fyStart = new Date(
      Number(`20${fy.slice(2, 4)}`),
      6, // July (0-indexed)
      1,
    );
    const count = await tx.sale.count({
      where: {
        // AUDIT-FIX (5-a #5): Scope the invoice sequence to the STORE. The
        // function already receives storeId as a parameter but previously
        // ignored it — Store B's first invoice became INV-FY2526-000006 if
        // Store A already had 5 invoices. FBR requires per-taxpayer sequential
        // numbering and per-store audit trails break without this filter.
        storeId,
        // Can't filter by taxInvoiceNumber prefix in Prisma — use saleDate
        // as a proxy (invoices are generated at sale time).
        saleDate: { gte: fyStart },
        taxInvoiceNumber: { not: null },
      },
    });
    const sequence = count + 1;
    return `INV-${fy}-${sequence.toString().padStart(6, "0")}`;
  }

  // Fallback (no tx provided) — use timestamp-based. This is NOT FBR-
  // compliant but preserves backwards compatibility for callers that
  // don't pass a tx. All production callers should pass tx + storeId.
  const timeStr = new Date()
    .toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour12: false })
    .replace(/:/g, "");
  const random = randomInt(100, 1000);
  return `INV-${fy}-${timeStr}-${random}`;
}
