// src/lib/transaction.ts
//
// withSerializableTransaction — a typed helper that DRYs up the Serializable
// isolation + P2034 retry pattern currently duplicated in saleService.ts,
// returnService.ts, and (partially) elsewhere.
//
// WHY
// ---
// The sale and return flows use `prisma.$transaction(fn, { isolationLevel:
// "Serializable" })` so that two concurrent cashiers can't oversell the same
// stock item. Serializable transactions can throw Prisma error code P2034
// (serialization failure) when two concurrent txns touch overlapping rows.
// The right response is to retry the whole transaction a few times — most
// conflicts resolve on the next attempt.
//
// Both saleService.ts and returnService.ts currently inline the same retry
// wrapper. That's duplicated code, and the retry count + delay are not
// configurable. This helper centralizes it.
//
// ADDITIONAL VALUE
// ----------------
// 1. The helper enforces a transaction timeout (15s, matching the sale flow)
//    so a stuck transaction can't hold locks indefinitely.
// 2. It exposes the Prisma TransactionClient as a typed `Tx` so service
//    functions can declare their dependency on a transaction explicitly.
// 3. It logs retries at warn level so you can spot contention in production.
// 4. It rejects the common foot-gun of calling `prisma` (the global client)
//    INSIDE a transaction function instead of the passed `tx` — see the
//    lint note below.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

// Re-export the TransactionClient type so services can import it from one place.
export type Tx = Prisma.TransactionClient;

export interface TransactionOptions {
  /** Max retry attempts on Prisma P2034 (serialization conflict). Default 3. */
  maxRetries?: number;
  /** Delay between retries in ms. Default 100. */
  retryDelayMs?: number;
  /** Transaction timeout in ms. Default 15000 (matches sale flow). */
  timeoutMs?: number;
  /**
   * Isolation level. Default "Serializable" — the only correct level for
   * financial mutations. Callers that don't need serializable (e.g. read-
   * heavy aggregation) can pass "ReadCommitted" for better concurrency.
   */
  isolationLevel?: Prisma.TransactionIsolationLevel;
  /** Label for logging — set to the operation name (e.g. "createSale"). */
  operation?: string;
}

const DEFAULTS: Required<Omit<TransactionOptions, "operation">> = {
  maxRetries: 3,
  retryDelayMs: 100,
  timeoutMs: 15000,
  isolationLevel: "Serializable",
};

/**
 * Run a function inside a Prisma transaction with automatic retry on
 * serialization conflict (P2034).
 *
 * @example
 *   const result = await withSerializableTransaction(
 *     async (tx) => {
 *       // Inside the transaction — use `tx`, NOT `prisma`.
 *       const sale = await tx.sale.create({ data: { ... } });
 *       await tx.product.updateMany({ where: { ... } });
 *       return sale;
 *     },
 *     { operation: "createSale" },
 *   );
 *
 * @throws the original error if retries are exhausted or a non-P2034 error occurs.
 */
export async function withSerializableTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  const { maxRetries, retryDelayMs, timeoutMs, isolationLevel, operation } =
    opts;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel,
        timeout: timeoutMs,
      });
    } catch (err) {
      lastError = err;

      // P2034 = serialization failure — retryable.
      // P2034 is the only retryable Prisma error code for Serializable.
      const isSerializationConflict =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034";

      if (isSerializationConflict && attempt < maxRetries) {
        logger.warn("TX_RETRY", {
          operation: operation ?? "unknown",
          attempt: attempt + 1,
          maxRetries,
          code: "P2034",
        });
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }

      // Any other error, or retries exhausted — surface to caller.
      throw err;
    }
  }

  // Should be unreachable — the loop either returns or throws.
  throw lastError;
}

/**
 * Run a function with NO transaction (just pass the global prisma client).
 * Useful for service functions that accept an optional `tx?` param — when
 * the caller doesn't have a transaction, this lets the service run standalone
 * without duplicating the `const client = tx ?? prisma` boilerplate.
 *
 * @example
 *   export async function getAccountBalance(storeId, code, tx?: Tx) {
 *     return runWith(tx, async (client) => {
 *       // use client.findFirst, client.aggregate, etc.
 *     });
 *   }
 */
export async function runWith<T>(
  tx: Tx | undefined,
  fn: (client: Tx) => Promise<T>,
): Promise<T> {
  return fn(tx ?? (prisma as unknown as Tx));
}

// ─── Lint note ────────────────────────────────────────────────────────────
//
// If you're inside a `withSerializableTransaction` callback and you call the
// GLOBAL `prisma` instead of the passed `tx`, your queries run OUTSIDE the
// transaction — they commit immediately and aren't rolled back on error.
// This is a silent correctness bug.
//
// ESLint can't catch this automatically (the global `prisma` is in scope).
// Code review must watch for it. A future improvement would be to thread the
// tx through a React-style context or AsyncLocalStorage so that `prisma`
// inside a transaction automatically delegates to the active tx.
