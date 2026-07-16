// src/lib/chart-of-accounts.ts
//
// Default Chart of Accounts template — used when creating a new store.
// This module is shared between seed-accounting.ts and the store creation
// API route so that every new store automatically gets its chart of
// accounts — no manual seeding required.
//
// Code ranges:
//   1000-1999: Assets
//   2000-2999: Liabilities
//   3000-3999: Equity
//   4000-4999: Revenue
//   5000-5999: Expenses

import { prisma } from "./prisma";
import { AccountType } from "@/generated/prisma/client";

export const DEFAULT_CHART_OF_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountType;
  isSystem: boolean;
}> = [
  // Assets
  { code: "1000", name: "Cash on Hand", type: "asset", isSystem: true },
  { code: "1010", name: "Accounts Receivable (Khata)", type: "asset", isSystem: true },
  { code: "1020", name: "Inventory", type: "asset", isSystem: true },
  { code: "1050", name: "Inter-Store Receivable", type: "asset", isSystem: true },
  { code: "1100", name: "Equipment", type: "asset", isSystem: false },
  // Liabilities
  { code: "2000", name: "Accounts Payable (Suppliers)", type: "liability", isSystem: true },
  { code: "2010", name: "Sales Tax Payable", type: "liability", isSystem: true },
  { code: "2020", name: "Payroll Payable", type: "liability", isSystem: true },
  { code: "2050", name: "Inter-Store Payable", type: "liability", isSystem: true },
  // Equity
  { code: "3000", name: "Owner's Capital", type: "equity", isSystem: true },
  { code: "3100", name: "Owner's Drawings", type: "equity", isSystem: true },
  // Revenue
  { code: "4000", name: "Sales Revenue", type: "revenue", isSystem: true },
  { code: "4100", name: "Sales Returns & Allowances", type: "revenue", isSystem: true },
  { code: "4200", name: "Sales Discounts", type: "revenue", isSystem: true },
  // Expenses
  { code: "5000", name: "Cost of Goods Sold", type: "expense", isSystem: true },
  { code: "5100", name: "Rent Expense", type: "expense", isSystem: false },
  { code: "5200", name: "Salaries & Wages", type: "expense", isSystem: true },
  { code: "5300", name: "Utilities Expense", type: "expense", isSystem: false },
  { code: "5400", name: "Marketing Expense", type: "expense", isSystem: false },
  { code: "5900", name: "Miscellaneous Expense", type: "expense", isSystem: false },
];

// Default product categories — every store needs these to organize inventory
export const DEFAULT_CATEGORIES = [
  "General",
  "Beverages",
  "Snacks",
  "Groceries",
  "Household",
  "Personal Care",
  "Bakery",
];

// Default tax rates — Pakistani FBR-compliant tax configuration
export const DEFAULT_TAX_RATES: Array<{
  name: string;
  rate: number;
  type: "standard" | "fixed" | "exempt" | "zero_rated";
  fbrCode: string;
  description: string;
}> = [
  {
    name: "Standard GST 17%",
    rate: 17,
    type: "standard",
    fbrCode: "SR-17",
    description: "Standard sales tax rate (17%) — most goods",
  },
  {
    name: "Fixed Retailer 4%",
    rate: 4,
    type: "fixed",
    fbrCode: "FR-4",
    description: "Fixed tax for tier-1 retailers (4% of retail price)",
  },
  {
    name: "Exempt",
    rate: 0,
    type: "exempt",
    fbrCode: "EX",
    description: "Exempt goods (basic food items, books, etc.)",
  },
  {
    name: "Zero-Rated (Exports)",
    rate: 0,
    type: "zero_rated",
    fbrCode: "ZR",
    description: "Zero-rated for exports",
  },
];

/**
 * Creates the default chart of accounts + settings + categories + tax rates
 * for a store. Called automatically when a new store is created via the API.
 * Uses upsert so it's idempotent — safe to call multiple times.
 *
 * This ensures every new store is immediately functional without needing
 * to manually run seed scripts.
 */
export async function seedDefaultAccountsForStore(
  storeId: string,
  storeName: string,
): Promise<number> {
  let count = 0;

  // 1. Chart of Accounts
  for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
    await prisma.account.upsert({
      where: { storeId_code: { storeId, code: account.code } },
      update: { name: account.name, type: account.type, isSystem: account.isSystem },
      create: {
        storeId,
        code: account.code,
        name: account.name,
        type: account.type,
        isSystem: account.isSystem,
        openingBalance: 0,
        isActive: true,
      },
    });
    count++;
  }

  // 2. Settings
  await prisma.settings.upsert({
    where: { storeId },
    update: {},
    create: {
      code: `store-${storeId}`,
      storeId,
      storeName,
      address: "",
      phone: "",
      currency: "Rs.",
      taxRate: 0,
    },
  });

  // 3. Default categories
  for (const name of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { storeId_name: { storeId, name } },
      update: {},
      create: { name, storeId, isActive: true },
    });
  }

  // 4. Default tax rates
  for (const tax of DEFAULT_TAX_RATES) {
    await prisma.tax.upsert({
      where: { storeId_name: { storeId, name: tax.name } },
      update: {},
      create: { ...tax, storeId, isActive: true },
    });
  }

  return count;
}
