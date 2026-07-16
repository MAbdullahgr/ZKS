import { z } from "zod";

// ─── Account schemas ─────────────────────────────────────────────────────

export const createAccountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Account code is required")
    .max(20, "Account code too long")
    .regex(/^[0-9]+$/, "Account code must be numeric"),
  name: z.string().trim().min(1, "Account name is required").max(100, "Account name too long"),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  parentId: z.string().uuid().optional().nullable(),
  // FIX P2-13: Add max cap to prevent unreasonable opening balances.
  openingBalance: z.number().min(0, "Opening balance cannot be negative").max(1000000000, "Opening balance unreasonably high").optional().default(0),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  parentId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  // AUDIT-FIX H-34: Add min/max to match createAccountSchema. Previously
  // a manager could PATCH any account to openingBalance: 1e18, corrupting
  // the trial balance.
  openingBalance: z
    .number()
    .min(0, "Opening balance cannot be negative")
    .max(1000000000, "Opening balance unreasonably high")
    .optional(),
});

// ─── Journal Entry schemas ───────────────────────────────────────────────

export const journalLineSchema = z.object({
  accountCode: z.string().trim().min(1, "Account code is required"),
  debit: z.number().min(0).optional(),
  credit: z.number().min(0).optional(),
  description: z.string().max(200).optional().nullable(),
});

export const createJournalEntrySchema = z.object({
  entryDate: z.string().optional(), // ISO date string — defaults to now
  description: z.string().trim().min(1, "Description is required").max(500),
  referenceType: z
    .enum([
      "sale",
      "sale_return",
      "purchase",
      "expense",
      "payroll",
      "supplier_payment",
      "khata_payment",
      "cash_in",
      "cash_out",
      "manual",
    ])
    .optional()
    .default("manual"),
  referenceId: z.string().optional().nullable(),
  lines: z.array(journalLineSchema).min(2, "At least 2 lines required"),
});

export const reverseJournalEntrySchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(500),
});
