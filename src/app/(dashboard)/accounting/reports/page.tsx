"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiGet } from "@/lib/fetcher";
import { Loader2 } from "lucide-react";

type Tab = "trial-balance" | "profit-loss" | "balance-sheet";

interface TrialBalanceData {
  asOfDate: string;
  rows: Array<{
    code: string;
    name: string;
    type: string;
    debit: number;
    credit: number;
  }>;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

interface PnLData {
  fromDate: string;
  toDate: string;
  revenue: Array<{ code: string; name: string; balance: number }>;
  expenses: Array<{ code: string; name: string; balance: number }>;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

interface BalanceSheetData {
  asOfDate: string;
  assets: Array<{ code: string; name: string; balance: number }>;
  liabilities: Array<{ code: string; name: string; balance: number }>;
  equity: Array<{ code: string; name: string; balance: number }>;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  retainedEarnings: number;
  isBalanced: boolean;
}

export default function AccountingReportsPage() {
  const [tab, setTab] = useState<Tab>("trial-balance");
  const [pnlFrom, setPnlFrom] = useState("");
  const [pnlTo, setPnlTo] = useState("");

  const {
    data: tb,
    isLoading: tbLoading,
    error: tbError,
  } = useSWR<TrialBalanceData>(
    "/api/reports/trial-balance",
    (url: string) =>
      apiGet<TrialBalanceData>(url, {
        showToast: false,
      }) as Promise<TrialBalanceData>,
  );

  const pnlUrl = `/api/reports/profit-loss${
    pnlFrom || pnlTo
      ? `?${pnlFrom ? `from=${pnlFrom}&` : ""}${pnlTo ? `to=${pnlTo}` : ""}`
      : ""
  }`;
  const { data: pnl, isLoading: pnlLoading } = useSWR<PnLData>(
    tab === "profit-loss" ? pnlUrl : null,
    (url: string) =>
      apiGet<PnLData>(url, { showToast: false }) as Promise<PnLData>,
  );

  const { data: bs, isLoading: bsLoading } = useSWR<BalanceSheetData>(
    tab === "balance-sheet" ? "/api/reports/balance-sheet" : null,
    (url: string) =>
      apiGet<BalanceSheetData>(url, {
        showToast: false,
      }) as Promise<BalanceSheetData>,
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "trial-balance", label: "Trial Balance" },
    { id: "profit-loss", label: "Profit & Loss" },
    { id: "balance-sheet", label: "Balance Sheet" },
  ];

  // FIX: Show a helpful message when in All Stores mode instead of "can't load"
  const isAllStoresMode = tbError?.status === 400;
  if (isAllStoresMode) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Financial Reports</h1>
          <p className="text-sm text-muted-foreground">
            Trial Balance, Profit & Loss, and Balance Sheet
          </p>
        </div>
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-8 text-center">
          <p className="text-lg font-bold text-warning">
            Please select a specific store
          </p>
          <p className="mt-2 text-sm text-warning">
            Financial reports are not available in &quot;All Stores&quot; mode.
            Use the store selector in the top bar to pick a specific store.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Financial Reports</h1>
        <p className="text-sm text-muted-foreground">
          Trial Balance, Profit & Loss, and Balance Sheet
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-4 py-2 text-sm font-bold transition whitespace-nowrap ${
              tab === t.id
                ? "border-emerald-600 text-success"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Trial Balance Tab */}
      {tab === "trial-balance" && (
        <div>
          {tbLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-success" />
          ) : tb ? (
            <>
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  As of {new Date(tb.asOfDate).toLocaleDateString("en-PK")}
                </p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    tb.isBalanced
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {tb.isBalanced ? "✓ Balanced" : "✗ Not Balanced"}
                </span>
              </div>
              <div className="rounded-xl border overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2">Code</th>
                      <th className="px-4 py-2">Account</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2 text-right">Debit</th>
                      <th className="px-4 py-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tb.rows.map((row) => (
                      <tr key={row.code} className="border-b last:border-0">
                        <td className="px-4 py-3 font-mono font-bold">
                          {row.code}
                        </td>
                        <td className="px-4 py-3">{row.name}</td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-muted px-2 py-0.5 text-xs capitalize">
                            {row.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.debit > 0
                            ? row.debit.toLocaleString("en-PK")
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.credit > 0
                            ? row.credit.toLocaleString("en-PK")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td colSpan={3} className="px-4 py-3 text-right">
                        Totals
                      </td>
                      <td className="px-4 py-3 text-right">
                        {tb.totalDebit.toLocaleString("en-PK")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {tb.totalCredit.toLocaleString("en-PK")}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Failed to load trial balance
            </p>
          )}
        </div>
      )}

      {/* P&L Tab */}
      {tab === "profit-loss" && (
        <div>
          <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold">From</label>
              <input
                type="date"
                value={pnlFrom}
                onChange={(e) => setPnlFrom(e.target.value)}
                className="rounded-lg border p-2 w-full sm:w-auto"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">To</label>
              <input
                type="date"
                value={pnlTo}
                onChange={(e) => setPnlTo(e.target.value)}
                className="rounded-lg border p-2 w-full sm:w-auto"
              />
            </div>
          </div>

          {pnlLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-success" />
          ) : pnl ? (
            <div className="space-y-6">
              {/* Revenue */}
              <div className="rounded-xl border overflow-hidden">
                <div className="border-b bg-success/10 px-4 py-2 font-bold">
                  Revenue
                </div>
                <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <tbody>
                    {pnl.revenue.map((r) => (
                      <tr key={r.code} className="border-b last:border-0">
                        <td className="px-4 py-3 font-mono text-xs">
                          {r.code}
                        </td>
                        <td className="px-4 py-3">{r.name}</td>
                        <td className="px-4 py-3 text-right">
                          {r.balance.toLocaleString("en-PK")}
                        </td>
                      </tr>
                    ))}
                    {pnl.revenue.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-3 text-center text-muted-foreground"
                        >
                          No revenue in this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
                <div className="border-t-2 bg-success/10 px-4 py-2 font-bold">
                  Total Revenue: Rs {pnl.totalRevenue.toLocaleString("en-PK")}
                </div>
              </div>

              {/* Expenses */}
              <div className="rounded-xl border overflow-hidden">
                <div className="border-b bg-destructive/10 px-4 py-2 font-bold">
                  Expenses
                </div>
                <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <tbody>
                    {pnl.expenses.map((e) => (
                      <tr key={e.code} className="border-b last:border-0">
                        <td className="px-4 py-3 font-mono text-xs">
                          {e.code}
                        </td>
                        <td className="px-4 py-3">{e.name}</td>
                        <td className="px-4 py-3 text-right">
                          {e.balance.toLocaleString("en-PK")}
                        </td>
                      </tr>
                    ))}
                    {pnl.expenses.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-3 text-center text-muted-foreground"
                        >
                          No expenses in this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
                <div className="border-t-2 bg-destructive/10 px-4 py-2 font-bold">
                  Total Expenses: Rs {pnl.totalExpenses.toLocaleString("en-PK")}
                </div>
              </div>

              {/* Net Profit */}
              <div
                className={`rounded-xl border-2 p-4 text-center ${
                  pnl.netProfit >= 0
                    ? "border-success bg-success/10"
                    : "border-destructive bg-destructive/10"
                }`}
              >
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p
                  className={`text-3xl font-bold ${
                    pnl.netProfit >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  Rs {pnl.netProfit.toLocaleString("en-PK")}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Failed to load P&L</p>
          )}
        </div>
      )}

      {/* Balance Sheet Tab */}
      {tab === "balance-sheet" && (
        <div>
          {bsLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-success" />
          ) : bs ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  As of {new Date(bs.asOfDate).toLocaleDateString("en-PK")}
                </p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    bs.isBalanced
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {bs.isBalanced ? "✓ Balanced" : "✗ Not Balanced"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Assets */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="border-b bg-primary/10 px-4 py-2 font-bold">
                    Assets
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap">
                    <tbody>
                      {bs.assets.map((a) => (
                        <tr key={a.code} className="border-b last:border-0">
                          <td className="px-4 py-3 font-mono text-xs">
                            {a.code}
                          </td>
                          <td className="px-4 py-3">{a.name}</td>
                          <td className="px-4 py-3 text-right">
                            {a.balance.toLocaleString("en-PK")}
                          </td>
                        </tr>
                      ))}
                      {bs.assets.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-3 text-center text-muted-foreground"
                          >
                            No assets
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                  <div className="border-t-2 bg-primary/10 px-4 py-2 font-bold">
                    Total Assets: Rs {bs.totalAssets.toLocaleString("en-PK")}
                  </div>
                </div>

                {/* Liabilities + Equity */}
                <div className="space-y-6">
                  <div className="rounded-xl border overflow-hidden">
                    <div className="border-b bg-destructive/10 px-4 py-2 font-bold">
                      Liabilities
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap">
                      <tbody>
                        {bs.liabilities.map((l) => (
                          <tr key={l.code} className="border-b last:border-0">
                            <td className="px-4 py-3 font-mono text-xs">
                              {l.code}
                            </td>
                            <td className="px-4 py-3">{l.name}</td>
                            <td className="px-4 py-3 text-right">
                              {l.balance.toLocaleString("en-PK")}
                            </td>
                          </tr>
                        ))}
                        {bs.liabilities.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-4 py-3 text-center text-muted-foreground"
                            >
                              No liabilities
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    </div>
                    <div className="border-t-2 bg-destructive/10 px-4 py-2 font-bold">
                      Total Liabilities: Rs{" "}
                      {bs.totalLiabilities.toLocaleString("en-PK")}
                    </div>
                  </div>

                  <div className="rounded-xl border overflow-hidden">
                    <div className="border-b bg-success/10 px-4 py-2 font-bold">
                      Equity
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap">
                      <tbody>
                        {bs.equity.map((e) => (
                          <tr key={e.code} className="border-b last:border-0">
                            <td className="px-4 py-3 font-mono text-xs">
                              {e.code}
                            </td>
                            <td className="px-4 py-3">{e.name}</td>
                            <td className="px-4 py-3 text-right">
                              {e.balance.toLocaleString("en-PK")}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-b">
                          <td className="px-4 py-3 font-mono text-xs">—</td>
                          <td className="px-4 py-3 italic">
                            Retained Earnings (YTD)
                          </td>
                          <td className="px-4 py-3 text-right">
                            {bs.retainedEarnings.toLocaleString("en-PK")}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                    <div className="border-t-2 bg-success/10 px-4 py-2 font-bold">
                      Total Equity: Rs {bs.totalEquity.toLocaleString("en-PK")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Failed to load balance sheet
            </p>
          )}
        </div>
      )}
    </div>
  );
}
