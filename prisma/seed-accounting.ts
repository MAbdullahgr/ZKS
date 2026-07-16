// prisma/seed-accounting.ts
//
// Seeds the default Chart of Accounts for every store in the database.
// Run AFTER `prisma migrate dev` has created the Account/JournalEntry/JournalLine
// tables and `prisma generate` has regenerated the client.
//
// Usage: npm run db:seed:accounting
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { AccountType } from "../src/generated/prisma/client";

// Default Chart of Accounts — seeded for every store.
// Code ranges:
//   1000-1999: Assets
//   2000-2999: Liabilities
//   3000-3999: Equity
//   4000-4999: Revenue
//   5000-5999: Expenses
const DEFAULT_CHART_OF_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountType;
  isSystem: boolean;
}> = [
  // Assets
  { code: "1000", name: "Cash on Hand", type: "asset", isSystem: true },
  {
    code: "1010",
    name: "Accounts Receivable (Khata)",
    type: "asset",
    isSystem: true,
  },
  { code: "1020", name: "Inventory", type: "asset", isSystem: true },
  { code: "1050", name: "Inter-Store Receivable", type: "asset", isSystem: true },
  { code: "1100", name: "Equipment", type: "asset", isSystem: false },
  // Liabilities
  {
    code: "2000",
    name: "Accounts Payable (Suppliers)",
    type: "liability",
    isSystem: true,
  },
  {
    code: "2050",
    name: "Inter-Store Payable",
    type: "liability",
    isSystem: true,
  },
  {
    code: "2010",
    name: "Sales Tax Payable",
    type: "liability",
    isSystem: true,
  },
  { code: "2020", name: "Payroll Payable", type: "liability", isSystem: true },
  // Equity
  { code: "3000", name: "Owner's Capital", type: "equity", isSystem: true },
  { code: "3100", name: "Owner's Drawings", type: "equity", isSystem: true },
  // Revenue
  { code: "4000", name: "Sales Revenue", type: "revenue", isSystem: true },
  {
    code: "4100",
    name: "Sales Returns & Allowances",
    type: "revenue",
    isSystem: true,
  },
  // FIX P0-6: Sales Discounts (contra-revenue) — posted when sale-level
  // discounts are applied so revenue isn't overstated.
  {
    code: "4200",
    name: "Sales Discounts",
    type: "revenue",
    isSystem: true,
  },
  // Expenses
  { code: "5000", name: "Cost of Goods Sold", type: "expense", isSystem: true },
  { code: "5100", name: "Rent Expense", type: "expense", isSystem: false },
  { code: "5200", name: "Salaries & Wages", type: "expense", isSystem: true },
  { code: "5300", name: "Utilities Expense", type: "expense", isSystem: false },
  { code: "5400", name: "Marketing Expense", type: "expense", isSystem: false },
  {
    code: "5900",
    name: "Miscellaneous Expense",
    type: "expense",
    isSystem: false,
  },
];

async function seedStoreAccounts(storeId: string, storeName: string) {
  console.log(
    `  Seeding chart of accounts for store: ${storeName} (${storeId})`,
  );

  for (const acct of DEFAULT_CHART_OF_ACCOUNTS) {
    await prisma.account.upsert({
      where: {
        storeId_code: { storeId, code: acct.code },
      },
      update: {
        // Only update name/type if the account exists — don't clobber
        // openingBalance or isActive if the user has customized them.
        name: acct.name,
        type: acct.type,
        isSystem: acct.isSystem,
      },
      create: {
        storeId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        isSystem: acct.isSystem,
        openingBalance: 0,
      },
    });
  }
  console.log(`    ✓ ${DEFAULT_CHART_OF_ACCOUNTS.length} accounts ensured`);
}

async function main() {
  console.log("Seeding chart of accounts...");

  const stores = await prisma.store.findMany();
  console.log(`Found ${stores.length} store(s)`);

  if (stores.length === 0) {
    console.log(
      "\n⚠️  No stores found. Run `npm run db:seed` first to create the default store, then re-run this script.",
    );
    return;
  }

  for (const store of stores) {
    await seedStoreAccounts(store.id, store.name);
  }

  const totalAccounts = stores.length * DEFAULT_CHART_OF_ACCOUNTS.length;
  console.log(`\n✅ Chart of accounts seeded for all stores.`);
  console.log(`   Total accounts: ${totalAccounts}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
