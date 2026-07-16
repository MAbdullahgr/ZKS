// src/services/accounting/core.ts
//
// The core journal-entry engine: post, reverse, lookup.
//
// Design principles (preserved from the original accountingService.ts):
//   1. Debits MUST equal credits (enforced here, not just at DB level).
//   2. Auto-posting callers wrap this in try/catch so a failed JE never
//      blocks the original transaction (sale, expense, etc.).
//   3. Reversals create a NEW entry (status: posted) that mirrors the
//      original — never mutate or delete the original. This is the
//      audit-safe approach.
//   4. Entry-number generation retries on unique-constraint violation
//      (P2002) so concurrent posts don't silently fail.

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-error";
import { Prisma } from "@generated/prisma/client";
import type {
  AccountRef,
  JournalEntryResult,
  JournalLineInput,
  PostJournalEntryInput,
  Tx,
} from "./types";

// ─── Lookup ───────────────────────────────────────────────────────────────

export async function getAccountByCode(
  storeId: string,
  code: string,
  tx?: Tx,
): Promise<AccountRef | null> {
  const client = tx ?? prisma;
  return client.account.findFirst({
    where: { storeId, code, isActive: true },
    select: { id: true, name: true, type: true },
  });
}

// ─── Post a journal entry ─────────────────────────────────────────────────

export async function postJournalEntry(
  input: PostJournalEntryInput,
  tx?: Tx,
): Promise<JournalEntryResult> {
  const client = tx ?? prisma;

  // Validate: at least 2 lines.
  if (input.lines.length < 2) {
    throw new HttpError(
      "Journal entry must have at least 2 lines",
      400,
      "VALIDATION_ERROR",
    );
  }

  // Validate: each line has exactly one of debit/credit.
  for (const line of input.lines) {
    const hasDebit = line.debit && line.debit > 0;
    const hasCredit = line.credit && line.credit > 0;
    if (!hasDebit && !hasCredit) {
      throw new HttpError(
        `Line for account ${line.accountCode} has no debit or credit amount`,
        400,
        "VALIDATION_ERROR",
      );
    }
    if (hasDebit && hasCredit) {
      throw new HttpError(
        `Line for account ${line.accountCode} has both debit and credit — use one`,
        400,
        "VALIDATION_ERROR",
      );
    }
  }

  // Validate: debits = credits (exact, after rounding to paisa).
  // FIX P1-7: The old 0.01 epsilon meant entries off by exactly 1 paisa were
  // accepted as "balanced". Now we round both sides to 2dp and require exact
  // equality, which is correct for currency.
  const totalDebit = input.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = input.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  const roundedDebit = Math.round(totalDebit * 100) / 100;
  const roundedCredit = Math.round(totalCredit * 100) / 100;
  if (roundedDebit !== roundedCredit) {
    throw new HttpError(
      `Journal entry not balanced. Debits: ${roundedDebit}, Credits: ${roundedCredit}`,
      400,
      "UNBALANCED_ENTRY",
    );
  }

  // Resolve all account codes to IDs (verify they exist + belong to store).
  const accountIds: Array<{ code: string; id: string }> = [];
  for (const line of input.lines) {
    const account = await getAccountByCode(
      input.storeId,
      line.accountCode,
      client,
    );
    if (!account) {
      throw new HttpError(
        `Account code ${line.accountCode} not found for this store. Run the accounting seed.`,
        400,
        "ACCOUNT_NOT_FOUND",
      );
    }
    accountIds.push({ code: line.accountCode, id: account.id });
  }

  // FIX P1-19: Generate entry number with retry on unique-constraint
  // violation. The old `count + 1` approach is non-atomic — concurrent posts
  // can generate the same entry number, and the second one silently fails
  // (caught by the auto-posting try/catch → invisible financial drift).
  const year = new Date().getFullYear();
  let entry: Awaited<ReturnType<typeof client.journalEntry.create>> | null =
    null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const entryCount = await client.journalEntry.count({
      where: {
        storeId: input.storeId,
        entryNumber: { startsWith: `JE-${year}-` },
      },
    });
    const entryNumber = `JE-${year}-${String(entryCount + 1 + attempt).padStart(5, "0")}`;

    try {
      entry = await client.journalEntry.create({
        data: {
          storeId: input.storeId,
          entryNumber,
          entryDate: input.entryDate ?? new Date(),
          description: input.description,
          referenceType: input.referenceType ?? "manual",
          referenceId: input.referenceId,
          status: "posted",
          postedById: input.userId,
          postedAt: new Date(),
          lines: {
            create: input.lines.map((line, i) => ({
              accountId: accountIds[i].id,
              debit: line.debit ?? 0,
              credit: line.credit ?? 0,
              description: line.description,
            })),
          },
        },
        include: { lines: true },
      });
      break;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue; // entry-number collision — retry with next number
      }
      throw err; // any other error — surface immediately
    }
  }

  if (!entry) {
    throw new HttpError(
      "Failed to create journal entry after 5 attempts (entry number conflict). Please try again.",
      500,
      "JE_ENTRY_NUMBER_CONFLICT",
    );
  }

  return {
    id: entry.id,
    entryNumber: entry.entryNumber,
    totalDebit,
    totalCredit,
  };
}

// ─── Reverse a journal entry ──────────────────────────────────────────────

export async function reverseJournalEntry(
  originalEntryId: string,
  reason: string,
  userId?: string,
  tx?: Tx,
): Promise<JournalEntryResult> {
  const client = tx ?? prisma;

  const original = await client.journalEntry.findUnique({
    where: { id: originalEntryId },
    include: { lines: { include: { account: true } } },
  });

  if (!original) {
    throw new HttpError("Original journal entry not found", 404, "NOT_FOUND");
  }

  if (original.status === "reversed") {
    throw new HttpError("Entry already reversed", 400, "VALIDATION_ERROR");
  }

  // Build reversed lines: swap debits ↔ credits.
  const reversedLines: JournalLineInput[] = original.lines.map((line) => ({
    accountCode: line.account.code,
    debit: Number(line.credit), // swap
    credit: Number(line.debit), // swap
    description: `Reversal: ${line.description ?? ""}`,
  }));

  const reversal = await postJournalEntry(
    {
      storeId: original.storeId,
      entryDate: new Date(),
      description: `REVERSAL of ${original.entryNumber}: ${reason}`,
      referenceType: original.referenceType,
      referenceId: original.referenceId ?? undefined,
      lines: reversedLines,
      userId,
    },
    client,
  );

  // Link reversal to original + mark original as reversed.
  await client.journalEntry.update({
    where: { id: reversal.id },
    data: { reversalOfId: originalEntryId },
  });
  await client.journalEntry.update({
    where: { id: originalEntryId },
    data: { status: "reversed" },
  });

  return reversal;
}

// ─── Internal: log auto-posting failures ──────────────────────────────────
//
// Used by the posting helpers (posting.ts) when they catch errors. Kept here
// because it's tightly coupled to the error shapes thrown by postJournalEntry.

export function logAutoPostFailure(context: string, err: unknown): void {
  const isAccountNotFound =
    err instanceof HttpError && err.code === "ACCOUNT_NOT_FOUND";
  if (isAccountNotFound) {
    console.error(
      `[accounting] ⚠️  CRITICAL: ${context} — account not found. Run "npm run db:seed:accounting" to create the chart of accounts. Until then, ALL financial reports will be missing this transaction.`,
      err.message,
    );
  } else {
    console.error(`[accounting] Failed to post: ${context}`, err);
  }
}

// AUDIT-FIX (5-a #9, 5-c #2,#3,#5): Centralized error handling for posting
// helpers. When the helper is called INSIDE a business transaction (tx is
// provided), the error MUST propagate so the entire transaction rolls back —
// this is the atomicity guarantee that prevents silent GL drift (a committed
// sale/return/transfer with no matching journal entry). When called
// STANDALONE (no tx — backfill, manual reconcile, cron), keep the legacy
// swallow-and-log behavior so a single bad entry doesn't abort a batch.
//
// Usage in each posting helper's catch block:
//   } catch (err) {
//     handlePostFailure(`sale JE for ${sale.saleNumber}`, err, tx);
//   }
export function handlePostFailure(
  context: string,
  err: unknown,
  tx?: Tx,
): void {
  // Always log so the failure is observable even when propagated.
  logAutoPostFailure(context, err);
  // Inside a transaction → re-throw so the caller's $transaction rolls back.
  if (tx) {
    throw err;
  }
  // Standalone → swallow (legacy behavior for backfill/cron).
}
