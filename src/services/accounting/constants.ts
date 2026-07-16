// src/services/accounting/constants.ts
//
// System account codes for the default chart of accounts.
// These MUST match the codes seeded by `prisma/seed-accounting.ts`.
//
// Why a separate file: these constants are imported by posting helpers,
// report queries, the seed script, and the backfill script. Keeping them
// in one place means a rename here is a one-file change, not a find-replace
// across the codebase.

export const ACCOUNT_CODES = {
  // Assets (1000-series)
  CASH: "1000",
  ACCOUNTS_RECEIVABLE: "1010",
  INVENTORY: "1020",
  INTER_STORE_RECEIVABLE: "1050",
  EQUIPMENT: "1100",

  // Liabilities (2000-series)
  ACCOUNTS_PAYABLE: "2000",
  INTER_STORE_PAYABLE: "2050",
  SALES_TAX_PAYABLE: "2010",
  PAYROLL_PAYABLE: "2020",

  // Equity (3000-series)
  OWNERS_CAPITAL: "3000",
  OWNERS_DRAWINGS: "3100",

  // Revenue (4000-series)
  SALES_REVENUE: "4000",
  SALES_RETURNS: "4100",
  // FIX P0-6: Sales Discounts is a contra-revenue account. Sale-level
  // discounts are posted here (Dr Sales Discounts) so revenue isn't overstated.
  SALES_DISCOUNTS: "4200",

  // Expenses (5000-series)
  COGS: "5000",
  RENT_EXPENSE: "5100",
  SALARIES_EXPENSE: "5200",
  UTILITIES_EXPENSE: "5300",
  MARKETING_EXPENSE: "5400",
  MISC_EXPENSE: "5900",
} as const;

export type AccountCode =
  (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

// Default expense-category → account-code mapping used by
// postExpenseJournalEntry. Kept here so the chart-of-accounts seed and the
// posting helper agree on the mapping.
export const EXPENSE_CATEGORY_TO_ACCOUNT: Record<string, string> = {
  utilities: ACCOUNT_CODES.UTILITIES_EXPENSE,
  rent: ACCOUNT_CODES.RENT_EXPENSE,
  salaries: ACCOUNT_CODES.SALARIES_EXPENSE,
  supplies: ACCOUNT_CODES.MISC_EXPENSE,
  transport: ACCOUNT_CODES.MISC_EXPENSE,
  maintenance: ACCOUNT_CODES.MISC_EXPENSE,
  marketing: ACCOUNT_CODES.MARKETING_EXPENSE,
  misc: ACCOUNT_CODES.MISC_EXPENSE,
};
