// src/services/accounting/reports.ts
//
// Financial report queries: account balance, trial balance, profit & loss,
// balance sheet. Pure reads — no mutation, no JEs.
//
// Split out from the original accountingService.ts (1,614 lines) so that
// report routes can import just the queries they need without pulling in
// the posting helpers (which are larger).

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api-error";
import type { AccountType } from "@generated/prisma/client";
import type { Tx } from "./types";
import { getAccountByCode } from "./core";

// ─── Account balance ──────────────────────────────────────────────────────

export interface AccountBalanceResult {
  code: string;
  name: string;
  type: AccountType;
  balance: number;
}

export async function getAccountBalance(
  storeId: string,
  accountCode: string,
  asOfDate?: Date,
  tx?: Tx,
): Promise<AccountBalanceResult> {
  const client = tx ?? prisma;

  const account = await getAccountByCode(storeId, accountCode, client);
  if (!account) {
    throw new HttpError(
      `Account ${accountCode} not found`,
      404,
      "ACCOUNT_NOT_FOUND",
    );
  }

  const agg = await client.journalLine.aggregate({
    where: {
      accountId: account.id,
      journalEntry: {
        storeId,
        status: "posted",
        ...(asOfDate && { entryDate: { lte: asOfDate } }),
      },
    },
    _sum: { debit: true, credit: true },
  });

  const totalDebit = Number(agg._sum.debit ?? 0);
  const totalCredit = Number(agg._sum.credit ?? 0);

  // Assets + expenses: balance = debit - credit (debit-normal).
  // Liabilities + equity + revenue: balance = credit - debit (credit-normal).
  const isDebitNormal = account.type === "asset" || account.type === "expense";
  const balance = isDebitNormal
    ? totalDebit - totalCredit
    : totalCredit - totalDebit;

  return {
    code: accountCode,
    name: account.name,
    type: account.type,
    balance,
  };
}

// ─── Trial Balance ────────────────────────────────────────────────────────

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export interface TrialBalanceResult {
  asOfDate: Date;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export async function getTrialBalance(
  storeId: string,
  asOfDate?: Date,
): Promise<TrialBalanceResult> {
  const accounts = await prisma.account.findMany({
    where: { storeId, isActive: true },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  });

  // FIX P1-22: Single groupBy query instead of N per-account aggregates.
  const aggregatedLines = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      journalEntry: {
        storeId,
        status: "posted",
        ...(asOfDate && { entryDate: { lte: asOfDate } }),
      },
    },
    _sum: { debit: true, credit: true },
  });

  const balanceMap = new Map(
    aggregatedLines.map((a) => [
      a.accountId,
      {
        debit: Number(a._sum.debit ?? 0),
        credit: Number(a._sum.credit ?? 0),
      },
    ]),
  );

  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const account of accounts) {
    const agg = balanceMap.get(account.id) ?? { debit: 0, credit: 0 };
    const opening = Number(account.openingBalance ?? 0);
    const isDebitNormal =
      account.type === "asset" || account.type === "expense";
    const balance = isDebitNormal
      ? opening + agg.debit - agg.credit
      : -opening + agg.credit - agg.debit;

    if (Math.abs(balance) > 0.01) {
      const isDebitBalance = isDebitNormal ? balance > 0 : balance < 0;
      if (isDebitBalance) {
        rows.push({
          code: account.code,
          name: account.name,
          type: account.type,
          debit: Math.abs(balance),
          credit: 0,
        });
        totalDebit += Math.abs(balance);
      } else {
        rows.push({
          code: account.code,
          name: account.name,
          type: account.type,
          debit: 0,
          credit: Math.abs(balance),
        });
        totalCredit += Math.abs(balance);
      }
    }
  }

  return {
    asOfDate: asOfDate ?? new Date(),
    rows,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
}

// ─── Profit & Loss ────────────────────────────────────────────────────────

export interface ProfitAndLossResult {
  fromDate: Date;
  toDate: Date;
  revenue: Array<{ code: string; name: string; balance: number }>;
  expenses: Array<{ code: string; name: string; balance: number }>;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

export async function getProfitAndLoss(
  storeId: string,
  fromDate: Date,
  toDate: Date,
): Promise<ProfitAndLossResult> {
  const [revenueAccounts, expenseAccounts] = await Promise.all([
    prisma.account.findMany({
      where: { storeId, isActive: true, type: "revenue" },
      orderBy: { code: "asc" },
    }),
    prisma.account.findMany({
      where: { storeId, isActive: true, type: "expense" },
      orderBy: { code: "asc" },
    }),
  ]);

  // FIX P1-22: Single groupBy for all revenue+expense accounts.
  const allAccountIds = [
    ...revenueAccounts.map((a) => a.id),
    ...expenseAccounts.map((a) => a.id),
  ];
  const aggregatedLines = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: allAccountIds },
      journalEntry: {
        storeId,
        status: "posted",
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    _sum: { debit: true, credit: true },
  });
  const balanceMap = new Map(
    aggregatedLines.map((a) => [
      a.accountId,
      {
        debit: Number(a._sum.debit ?? 0),
        credit: Number(a._sum.credit ?? 0),
      },
    ]),
  );

  const revenue: Array<{ code: string; name: string; balance: number }> = [];
  let totalRevenue = 0;
  for (const account of revenueAccounts) {
    const agg = balanceMap.get(account.id) ?? { debit: 0, credit: 0 };
    const balance = agg.credit - agg.debit; // revenue is credit-normal
    if (Math.abs(balance) > 0.01) {
      revenue.push({ code: account.code, name: account.name, balance });
      totalRevenue += balance;
    }
  }

  const expenses: Array<{ code: string; name: string; balance: number }> = [];
  let totalExpenses = 0;
  for (const account of expenseAccounts) {
    const agg = balanceMap.get(account.id) ?? { debit: 0, credit: 0 };
    const balance = agg.debit - agg.credit; // expense is debit-normal
    if (Math.abs(balance) > 0.01) {
      expenses.push({ code: account.code, name: account.name, balance });
      totalExpenses += balance;
    }
  }

  return {
    fromDate,
    toDate,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
  };
}

// ─── Balance Sheet ────────────────────────────────────────────────────────

export interface BalanceSheetResult {
  asOfDate: Date;
  assets: Array<{ code: string; name: string; balance: number }>;
  liabilities: Array<{ code: string; name: string; balance: number }>;
  equity: Array<{ code: string; name: string; balance: number }>;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  retainedEarnings: number;
  isBalanced: boolean;
}

export async function getBalanceSheet(
  storeId: string,
  asOfDate?: Date,
): Promise<BalanceSheetResult> {
  const date = asOfDate ?? new Date();

  const [assetAccounts, liabilityAccounts, equityAccounts] = await Promise.all([
    prisma.account.findMany({
      where: { storeId, isActive: true, type: "asset" },
      orderBy: { code: "asc" },
    }),
    prisma.account.findMany({
      where: { storeId, isActive: true, type: "liability" },
      orderBy: { code: "asc" },
    }),
    prisma.account.findMany({
      where: { storeId, isActive: true, type: "equity" },
      orderBy: { code: "asc" },
    }),
  ]);

  // FIX P1-22: Single groupBy for ALL accounts (assets + liabilities + equity).
  const allAccounts = [
    ...assetAccounts,
    ...liabilityAccounts,
    ...equityAccounts,
  ];
  const allAccountIds = allAccounts.map((a) => a.id);
  const aggregatedLines = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: allAccountIds },
      journalEntry: {
        storeId,
        status: "posted",
        entryDate: { lte: date },
      },
    },
    _sum: { debit: true, credit: true },
  });
  const balanceMap = new Map(
    aggregatedLines.map((a) => [
      a.accountId,
      {
        debit: Number(a._sum.debit ?? 0),
        credit: Number(a._sum.credit ?? 0),
      },
    ]),
  );

  function computeBalances(
    accounts: Array<{
      id: string;
      code: string;
      name: string;
      openingBalance: unknown;
    }>,
    isDebitNormal: boolean,
  ) {
    const result: Array<{ code: string; name: string; balance: number }> = [];
    let total = 0;
    for (const account of accounts) {
      const agg = balanceMap.get(account.id) ?? { debit: 0, credit: 0 };
      const opening = Number(account.openingBalance ?? 0);
      const balance = isDebitNormal
        ? opening + agg.debit - agg.credit
        : -opening + agg.credit - agg.debit;
      if (Math.abs(balance) > 0.01) {
        result.push({ code: account.code, name: account.name, balance });
        total += balance;
      }
    }
    return { result, total };
  }

  const assets = computeBalances(assetAccounts, true);
  const liabilities = computeBalances(liabilityAccounts, false);
  const equity = computeBalances(equityAccounts, false);

  // Retained earnings = YTD net profit.
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const pnl = await getProfitAndLoss(storeId, yearStart, date);
  const retainedEarnings = pnl.netProfit;

  const totalEquity = equity.total + retainedEarnings;
  const isBalanced =
    Math.abs(assets.total - (liabilities.total + totalEquity)) < 0.01;

  return {
    asOfDate: date,
    assets: assets.result,
    liabilities: liabilities.result,
    equity: equity.result,
    totalAssets: assets.total,
    totalLiabilities: liabilities.total,
    totalEquity,
    retainedEarnings,
    isBalanced,
  };
}
