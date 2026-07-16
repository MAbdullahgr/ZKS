"use client";

import { useState } from "react";
import {
  Wallet,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { apiPost, apiPatch } from "@/lib/fetcher";
import { toast } from "sonner";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";

interface Employee {
  id: string;
  name: string;
  employeeCode: string;
  jobTitle: string | null;
}

interface Payroll {
  id: string;
  employeeId: string;
  month: number;
  year: number;
  baseSalary: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  salaryDeduction: number;
  advanceDeduction: number;
  bonus: number;
  netPayable: number;
  status: "draft" | "paid";
  paidAt: string | null;
  createdAt: string;
  employee: Employee;
  store?: { name: string } | null;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1; // 1-12
const CURRENT_YEAR = now.getFullYear();

function formatRs(n: number): string {
  return `Rs ${n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function PayrollPage() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [generating, setGenerating] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const {
    items: payrollRecords,
    meta,
    setPage,
    isLoading,
    error,
    mutate,
  } = usePaginatedList<{ payrolls: Payroll[] }>(
    "/api/payroll",
    "payroll", // or whatever the API's itemsKey is — verify in the route
    {
      limit: 20,
      filters: { month, year: String(year) },
    },
  );

  const payrolls = payrollRecords[0]?.payrolls ?? [];

  async function handleGenerate() {
    if (generating) return;
    if (
      !confirm(
        `Generate payroll for ${MONTH_NAMES[month - 1]} ${year}? This will create payroll records for all active employees who don't already have one.`,
      )
    )
      return;

    setGenerating(true);
    try {
      const res = await apiPost<{
        generated: number;
        skipped: number;
      }>("/api/payroll", { month, year }, { showToast: false });
      toast.success(
        `Generated ${res?.generated ?? 0} payroll record(s) (${res?.skipped ?? 0} already existed)`,
      );
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate payroll",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleMarkPaid(p: Payroll) {
    if (payingId) return;
    if (p.status === "paid") return;
    if (
      !confirm(
        `Mark payroll for ${p.employee.name} as paid? (Rs ${p.netPayable})`,
      )
    )
      return;

    setPayingId(p.id);
    try {
      await apiPatch(
        `/api/payroll/${p.id}`,
        { status: "paid" },
        { showToast: false },
      );
      toast.success(`Marked ${p.employee.name} as paid`);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark paid");
    } finally {
      setPayingId(null);
    }
  }

  // Summary stats
  const totalNet = payrolls.reduce((s, p) => s + p.netPayable, 0);
  const paidCount = payrolls.filter((p) => p.status === "paid").length;
  const draftCount = payrolls.filter((p) => p.status === "draft").length;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 flex items-center justify-center min-h-100px">
        <Loader2 className="w-8 h-8 animate-spin text-success" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
          <AlertCircle className="w-5 h-5" />
          <span>{error instanceof Error ? error.message : String(error)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            Payroll
          </h1>
          <p className="text-muted-foreground text-sm">
            Generate and manage monthly payroll
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 bg-success hover:bg-success/90 active:bg-success/85 disabled:opacity-50 text-success-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> Generate Payroll
            </>
          )}
        </button>
      </div>

      {/* Month / Year Selector */}
      <div className="bg-card rounded-xl border border-border shadow-soft p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Month:</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-success/40 focus:ring-2 focus:ring-success/20 bg-card"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Year:</label>
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-success/40 focus:ring-2 focus:ring-success/20"
          />
        </div>
        <div className="text-sm text-muted-foreground ml-auto">
          {payrolls.length} record(s) • {paidCount} paid • {draftCount} draft
        </div>
      </div>

      {/* Summary cards */}
      {payrolls.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-card rounded-xl border border-border shadow-soft p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total Net Payable
                </p>
                <p className="text-xl font-bold text-foreground mt-1">
                  {formatRs(totalNet)}
                </p>
              </div>
              <div className="w-10 h-10 bg-success/15 rounded-lg flex items-center justify-center">
                <Wallet className="w-5 h-5 text-success" />
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border shadow-soft p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Paid
                </p>
                <p className="text-xl font-bold text-foreground mt-1">
                  {paidCount} / {payrolls.length}
                </p>
              </div>
              <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-sky-600" />
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border shadow-soft p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Pending
                </p>
                <p className="text-xl font-bold text-foreground mt-1">
                  {draftCount}
                </p>
              </div>
              <div className="w-10 h-10 bg-warning/15 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-warning" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {payrolls.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Wallet className="w-10 h-10 text-border mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            No payroll for {MONTH_NAMES[month - 1]} {year}
          </p>
          <p className="text-muted-foreground/70 text-sm mt-1">
            Click &quot;Generate Payroll&quot; to create records for active
            employees
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Employee</th>
                  <th className="text-left px-4 py-3 font-medium">Store</th>
                  <th className="text-left px-4 py-3 font-medium">Code</th>
                  <th className="text-right px-4 py-3 font-medium">Base</th>
                  <th className="text-center px-2 py-3 font-medium">P</th>
                  <th className="text-center px-2 py-3 font-medium">A</th>
                  <th className="text-center px-2 py-3 font-medium">L</th>
                  <th className="text-right px-4 py-3 font-medium">Sal Ded</th>
                  <th className="text-right px-4 py-3 font-medium">Adv Ded</th>
                  <th className="text-right px-4 py-3 font-medium">Bonus</th>
                  <th className="text-right px-4 py-3 font-medium">Net</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payrolls.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/50 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {p.employee.name}
                      </div>
                      {p.employee.jobTitle && (
                        <div className="text-xs text-muted-foreground">
                          {p.employee.jobTitle}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.store?.name ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium border border-border">
                          {p.store.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {p.employee.employeeCode}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatRs(p.baseSalary)}
                    </td>
                    <td className="px-2 py-3 text-center text-success font-medium">
                      {p.presentDays}
                    </td>
                    <td className="px-2 py-3 text-center text-destructive font-medium">
                      {p.absentDays}
                    </td>
                    <td className="px-2 py-3 text-center text-warning font-medium">
                      {p.leaveDays}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-destructive">
                      {p.salaryDeduction > 0
                        ? formatRs(p.salaryDeduction)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-destructive">
                      {p.advanceDeduction > 0
                        ? formatRs(p.advanceDeduction)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-success">
                      {p.bonus > 0 ? formatRs(p.bonus) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                      {formatRs(p.netPayable)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.status === "paid" ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-warning/15 text-warning">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.status === "paid" ? (
                        <span className="text-xs text-muted-foreground/70">—</span>
                      ) : (
                        <button
                          onClick={() => handleMarkPaid(p)}
                          disabled={payingId === p.id}
                          className="text-xs bg-success hover:bg-success/90 disabled:opacity-50 text-success-foreground px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 ml-auto"
                        >
                          {payingId === p.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {meta && (
        <PaginationBar meta={meta} onPageChange={setPage} className="pt-2" />
      )}
    </div>
  );
}
