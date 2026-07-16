"use client";

// src/app/(dashboard)/reports/daily-z/page.tsx
//
// Printable daily Z-report. The "Z-report" is the end-of-day reconciliation
// report a cashier or manager prints before closing the register: it shows
// the day's total sales, returns, payment-method breakdown, cash drawer
// reconciliation, expenses, and the net cash position. The cashier counts
// the drawer, compares to "Expected Cash", and investigates any variance.
//
// Data sources:
//   - /api/sales?from={date}&to={date}      → sales + payment lines
//   - /api/reports?period=1                 → daily KPIs (revenue, profit, expenses)
//   - /api/expenses?from={date}&to={date}   → expense rows for the day
//
// Print: window.print() with print CSS that hides everything except the
// report area (see globals.css `@media print` rules + inline `print:hidden`
// utility classes on chrome elements).

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Printer, ArrowLeft, Calendar } from "lucide-react";
import Link from "next/link";
import { apiGet } from "@/lib/fetcher";

interface SalesResponse {
  sales: Array<{
    id: string;
    saleNumber: string;
    total: number;
    paidAmount: number;
    status: string;
    returnStatus: string;
    payments: Array<{ method: string; amount: number }>;
    saleDate: string;
  }>;
  total: number;
}

interface ExpensesResponse {
  expenses: Array<{
    id: string;
    amount: number;
    category: string;
    description: string | null;
    date: string;
  }>;
  total: number;
}

interface ReportsResponse {
  summary: {
    totalRevenue: number;
    totalProfit: number;
    totalExpenses: number;
    netProfit: number;
    totalSales: number;
  };
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  mobile: "Mobile",
  khata: "Khata",
  credit: "Khata",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
};

function todayISO(): string {
  // Local date in YYYY-MM-DD — avoids the off-by-one from toISOString() which
  // returns UTC.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatPKR(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-PK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DailyZReportPage() {
  const [date, setDate] = useState<string>(todayISO());

  // Always fetch period=1 for the daily KPI snapshot. The from/to params on
  // /api/sales + /api/expenses scope to the chosen day.
  const salesUrl = `/api/sales?from=${date}&to=${date}&limit=50`;
  const expensesUrl = `/api/expenses?from=${date}&to=${date}`;
  const reportsUrl = `/api/reports?period=1`;

  const { data: salesData, isLoading: salesLoading } =
    useSWR<SalesResponse>(salesUrl, (u: string) =>
      apiGet<SalesResponse>(u) as Promise<SalesResponse>,
    );
  const { data: expensesData, isLoading: expensesLoading } =
    useSWR<ExpensesResponse>(expensesUrl, (u: string) =>
      apiGet<ExpensesResponse>(u) as Promise<ExpensesResponse>,
    );
  const { data: reportsData, isLoading: reportsLoading } =
    useSWR<ReportsResponse>(reportsUrl, (u: string) =>
      apiGet<ReportsResponse>(u) as Promise<ReportsResponse>,
    );

  // ─── Compute aggregates from the sales list ──────────────────────────
  const aggregates = useMemo(() => {
    const sales = salesData?.sales ?? [];
    const salesCount = sales.length;
    const grossRevenue = sales.reduce((s, x) => s + Number(x.total ?? 0), 0);

    // Returns: sale.returnStatus === 'full' or 'partial' counts as a return
    // (we count rows, not amount — the amount is already netted out of total)
    const returnsCount = sales.filter(
      (s) => s.returnStatus === "full" || s.returnStatus === "partial",
    ).length;

    // Refund amount: sum of all payments on returned sales, scaled by the
    // return ratio. For simplicity we estimate refundAmount = 0 if returnStatus
    // is 'none', otherwise use the sale.total as the refunded amount (a full
    // return refunds the whole sale; a partial return refunds roughly the
    // returned items — we approximate by halving).
    const refundAmount = sales.reduce((sum, s) => {
      if (s.returnStatus === "full") return sum + Number(s.total ?? 0);
      if (s.returnStatus === "partial") return sum + Number(s.total ?? 0) * 0.5;
      return sum;
    }, 0);

    // Payment method breakdown
    const methodTotals: Record<string, { total: number; count: number }> = {};
    for (const sale of sales) {
      for (const p of sale.payments ?? []) {
        const key = String(p.method).toLowerCase();
        if (!methodTotals[key]) methodTotals[key] = { total: 0, count: 0 };
        methodTotals[key].total += Number(p.amount ?? 0);
        methodTotals[key].count += 1;
      }
    }

    return {
      salesCount,
      grossRevenue,
      returnsCount,
      refundAmount,
      methodTotals,
    };
  }, [salesData]);

  // ─── Cash drawer reconciliation ──────────────────────────────────────
  // Expected Cash = Opening Cash + Cash In − Cash Out + Cash Sales − Cash Refunds
  // The opening cash + cash in/out transactions live on the open register
  // session; we don't fetch them separately here. Instead, we surface the
  // cash sales + cash refund lines so the cashier can manually reconcile
  // against the counted drawer. The reports API returns the period expenses.
  const cashSales = aggregates.methodTotals["cash"]?.total ?? 0;
  const cashSalesCount = aggregates.methodTotals["cash"]?.count ?? 0;
  // Cash refund estimate: if there were returns and they were cash-paid,
  // assume ~50% were refunded in cash (rough — the data doesn't distinguish
  // cash vs khata refunds at the sale list level).
  const cashRefunds = aggregates.returnsCount > 0
    ? Math.min(cashSales, aggregates.refundAmount * 0.5)
    : 0;

  const totalExpenses = expensesData?.total ?? 0;
  const netCashPosition = cashSales - cashRefunds - totalExpenses;

  const isLoading = salesLoading || expensesLoading || reportsLoading;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* ─── Header (hidden when printing) ─────────────────────────── */}
      <div className="print:hidden flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground/90"
            aria-label="Back to reports"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Daily Z-Report</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="w-4 h-4 text-muted-foreground/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-card"
              aria-label="Report date"
            />
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground/90 text-white rounded-lg text-sm font-medium hover:bg-foreground/80 transition"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-xl p-8 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4" />
          <div className="h-4 bg-muted rounded w-1/4 mb-8" />
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="h-20 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
          <div className="h-40 bg-muted rounded" />
        </div>
      ) : (
        <div
          id="z-report-print-area"
          className="bg-card border border-border rounded-xl p-6 md:p-8 print:border-0 print:p-0 print:rounded-none"
        >
          {/* ─── Report header (visible when printing) ─────────────── */}
          <div className="text-center mb-6 pb-4 border-b-2 border-foreground/30">
            <h1 className="text-2xl font-bold text-foreground">
              ZKR Store — Daily Z-Report
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDateLabel(date)}
            </p>
          </div>

          {/* ─── Sales + Returns summary ─────────────────────────── */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Sales Summary
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Total Sales</p>
                <p className="text-xl font-bold text-foreground mt-1">
                  {aggregates.salesCount}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Gross revenue: {formatPKR(aggregates.grossRevenue)}
                </p>
              </div>
              <div className="border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Total Returns</p>
                <p className="text-xl font-bold text-foreground mt-1">
                  {aggregates.returnsCount}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Est. refund amount: {formatPKR(aggregates.refundAmount)}
                </p>
              </div>
            </div>
          </section>

          {/* ─── Payment method breakdown ─────────────────────────── */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Payment Method Breakdown
            </h2>
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-muted-foreground/70">
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium text-right">Count</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.entries(aggregates.methodTotals).map(([method, m]) => (
                  <tr key={method}>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {PAYMENT_METHOD_LABELS[method] ?? method}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {m.count}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground font-medium">
                      {formatPKR(m.total)}
                    </td>
                  </tr>
                ))}
                {Object.keys(aggregates.methodTotals).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground/70">
                      No sales for this day
                    </td>
                  </tr>
                )}
              </tbody>
              {Object.keys(aggregates.methodTotals).length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-3 py-2 text-foreground">Total</td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {Object.values(aggregates.methodTotals).reduce(
                        (s, m) => s + m.count,
                        0,
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {formatPKR(
                        Object.values(aggregates.methodTotals).reduce(
                          (s, m) => s + m.total,
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </section>

          {/* ─── Cash drawer reconciliation ───────────────────────── */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Cash Drawer Reconciliation
            </h2>
            <div className="bg-muted/40 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash Sales ({cashSalesCount} txns)</span>
                <span className="font-medium text-foreground">
                  + {formatPKR(cashSales)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Cash Refunds</span>
                <span className="font-medium text-destructive">
                  − {formatPKR(cashRefunds)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expenses Paid (cash)</span>
                <span className="font-medium text-destructive">
                  − {formatPKR(totalExpenses)}
                </span>
              </div>
              <div className="border-t border-border pt-2 mt-2 flex justify-between">
                <span className="text-foreground font-semibold">
                  Expected Net Cash (excludes opening float)
                </span>
                <span className="font-bold text-foreground">
                  {formatPKR(netCashPosition)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Note: Add opening cash + cash-in transactions, then subtract
                cash-out transactions to reconcile against the counted drawer.
                Use the Register Close screen to record the counted amount.
              </p>
            </div>
          </section>

          {/* ─── Expense summary ──────────────────────────────────── */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Expense Summary
            </h2>
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-muted-foreground/70">
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(expensesData?.expenses ?? []).map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 capitalize text-foreground/90">
                      {e.category}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.description ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-destructive font-medium">
                      {formatPKR(Number(e.amount))}
                    </td>
                  </tr>
                ))}
                {(expensesData?.expenses ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground/70">
                      No expenses recorded for this day
                    </td>
                  </tr>
                )}
              </tbody>
              {(expensesData?.expenses ?? []).length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td colSpan={2} className="px-3 py-2 text-foreground">
                      Total Expenses
                    </td>
                    <td className="px-3 py-2 text-right text-destructive">
                      {formatPKR(totalExpenses)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </section>

          {/* ─── Period KPIs from /api/reports ────────────────────── */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Day KPIs (from reports API)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-lg font-bold text-foreground mt-1">
                  {formatPKR(reportsData?.summary.totalRevenue ?? 0)}
                </p>
              </div>
              <div className="border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Gross Profit</p>
                <p className="text-lg font-bold text-success mt-1">
                  {formatPKR(reportsData?.summary.totalProfit ?? 0)}
                </p>
              </div>
              <div className="border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Expenses</p>
                <p className="text-lg font-bold text-destructive mt-1">
                  {formatPKR(reportsData?.summary.totalExpenses ?? 0)}
                </p>
              </div>
              <div className="border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Net Profit</p>
                <p className="text-lg font-bold text-foreground mt-1">
                  {formatPKR(reportsData?.summary.netProfit ?? 0)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground/70 mt-2">
              KPIs are based on a 1-day window from the reports API. For
              multi-day views use the main Reports page.
            </p>
          </section>

          {/* ─── Footer / signature lines ─────────────────────────── */}
          <section className="mt-8 pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-8 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Cashier Signature</p>
                <div className="border-b border-border h-8" />
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Manager Signature</p>
                <div className="border-b border-border h-8" />
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground/70 mt-6">
              Generated {new Date().toLocaleString("en-PK")} · ZKR Store
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
