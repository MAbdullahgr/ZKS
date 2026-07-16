"use client";

import useSWR from "swr";
import Link from "next/link";
import { apiGet } from "@/lib/fetcher";
import { Loader2, BookOpen, Receipt, FileText } from "lucide-react";

interface TrialBalance {
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

interface PnL {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

interface BalanceSheet {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;
}

export default function AccountingPage() {
  const {
    data: tb,
    isLoading: tbLoading,
    error: tbError,
  } = useSWR<TrialBalance>(
    "/api/reports/trial-balance",
    (url: string) =>
      apiGet<TrialBalance>(url, { showToast: false }) as Promise<TrialBalance>,
  );
  const { data: pnl, isLoading: pnlLoading } = useSWR<PnL>(
    "/api/reports/profit-loss",
    (url: string) => apiGet<PnL>(url, { showToast: false }) as Promise<PnL>,
  );
  const { data: bs, isLoading: bsLoading } = useSWR<BalanceSheet>(
    "/api/reports/balance-sheet",
    (url: string) =>
      apiGet<BalanceSheet>(url, { showToast: false }) as Promise<BalanceSheet>,
  );

  // FIX P1-25: Show a helpful message when in All Stores mode instead of
  // misleading "Rs 0" KPIs. The report APIs return 400 STORE_NOT_SELECTED.
  const isAllStoresMode = tbError?.status === 400;

  if (isAllStoresMode) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Accounting</h1>
          <p className="text-sm text-muted-foreground">
            Double-entry bookkeeping & financial statements
          </p>
        </div>
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-8 text-center">
          <p className="text-lg font-bold text-warning">
            Please select a specific store
          </p>
          <p className="mt-2 text-sm text-warning">
            Accounting reports are not available in &quot;All Stores&quot; mode.
            Use the store selector in the top bar to pick a specific store, then
            return to this page.
          </p>
        </div>
        {/* Still show the quick links */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Link
            href="/accounting/chart-of-accounts"
            className="group rounded-xl border p-5 transition hover:border-success hover:shadow-md"
          >
            <BookOpen className="mb-2 h-8 w-8 text-success" />
            <h3 className="font-bold">Chart of Accounts</h3>
            <p className="text-sm text-muted-foreground">
              View and manage all accounts
            </p>
          </Link>
          <Link
            href="/accounting/journal-entries"
            className="group rounded-xl border p-5 transition hover:border-primary hover:shadow-md"
          >
            <Receipt className="mb-2 h-8 w-8 text-primary" />
            <h3 className="font-bold">Journal Entries</h3>
            <p className="text-sm text-muted-foreground">
              View entries and create manual entries
            </p>
          </Link>
          <Link
            href="/accounting/reports"
            className="group rounded-xl border p-5 transition hover:border-violet-500 hover:shadow-md"
          >
            <FileText className="mb-2 h-8 w-8 text-violet-600" />
            <h3 className="font-bold">Financial Reports</h3>
            <p className="text-sm text-muted-foreground">
              Trial Balance, P&L, Balance Sheet
            </p>
          </Link>
        </div>
      </div>
    );
  }

  if (tbLoading || pnlLoading || bsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-success" />
      </div>
    );
  }

  const cards = [
    {
      label: "Total Assets",
      value: bs?.totalAssets ?? 0,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Liabilities",
      value: bs?.totalLiabilities ?? 0,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "Total Equity",
      value: bs?.totalEquity ?? 0,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Net Profit (MTD)",
      value: pnl?.netProfit ?? 0,
      color:
        pnl?.netProfit && pnl.netProfit >= 0
          ? "text-success"
          : "text-destructive",
      bg: "bg-success/10",
    },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Accounting</h1>
          <p className="text-sm text-muted-foreground">
            Double-entry bookkeeping & financial statements
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl border p-5 ${card.bg}`}>
            <p className="text-sm font-medium text-muted-foreground">
              {card.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${card.color}`}>
              Rs {card.value.toLocaleString("en-PK")}
            </p>
          </div>
        ))}
      </div>

      {/* Trial Balance Status */}
      <div className="rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Trial Balance Status</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              tb?.isBalanced
                ? "bg-success/15 text-success"
                : "bg-destructive/15 text-destructive"
            }`}
          >
            {tb?.isBalanced ? "BALANCED" : "NOT BALANCED"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Debits</p>
            <p className="text-xl font-bold">
              Rs {(tb?.totalDebit ?? 0).toLocaleString("en-PK")}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Credits</p>
            <p className="text-xl font-bold">
              Rs {(tb?.totalCredit ?? 0).toLocaleString("en-PK")}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/accounting/chart-of-accounts"
          className="group rounded-xl border p-5 transition hover:border-success hover:shadow-md"
        >
          <BookOpen className="mb-2 h-8 w-8 text-success" />
          <h3 className="font-bold">Chart of Accounts</h3>
          <p className="text-sm text-muted-foreground">
            View and manage all accounts
          </p>
        </Link>
        <Link
          href="/accounting/journal-entries"
          className="group rounded-xl border p-5 transition hover:border-primary hover:shadow-md"
        >
          <Receipt className="mb-2 h-8 w-8 text-primary" />
          <h3 className="font-bold">Journal Entries</h3>
          <p className="text-sm text-muted-foreground">
            View entries and create manual entries
          </p>
        </Link>
        <Link
          href="/accounting/reports"
          className="group rounded-xl border p-5 transition hover:border-violet-500 hover:shadow-md"
        >
          <FileText className="mb-2 h-8 w-8 text-violet-600" />
          <h3 className="font-bold">Financial Reports</h3>
          <p className="text-sm text-muted-foreground">
            Trial Balance, P&L, Balance Sheet
          </p>
        </Link>
      </div>
    </div>
  );
}
