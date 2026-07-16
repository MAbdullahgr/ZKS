// src/services/accounting/types.ts
//
// Shared types for the accounting module. Split out so that core, reports,
// and posting can all import without circular dependencies.

import type { AccountType, JournalReferenceType } from "@generated/prisma/client";

// Re-export Tx so existing `import type { Tx } from "./accountingService"`
// call sites keep working without changing their import.
export type { Tx } from "@/lib/transaction";

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface PostJournalEntryInput {
  storeId: string;
  entryDate?: Date;
  description: string;
  referenceType?: JournalReferenceType;
  referenceId?: string;
  lines: JournalLineInput[];
  userId?: string;
}

export interface JournalEntryResult {
  id: string;
  entryNumber: string;
  totalDebit: number;
  totalCredit: number;
}

export interface AccountRef {
  id: string;
  name: string;
  type: AccountType;
}
