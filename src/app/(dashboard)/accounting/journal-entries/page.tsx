"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPost } from "@/lib/fetcher";
import { toast } from "sonner";
import { Loader2, Plus, X, Search } from "lucide-react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";

interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  referenceType: string;
  status: string;
  totalDebit: number;
  totalCredit: number;
  postedByName: string;
  _count: { lines: number };
}

export default function JournalEntriesPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    description: "",
    entryDate: "",
    lines: [
      { accountCode: "", debit: 0, credit: 0 },
      { accountCode: "", debit: 0, credit: 0 },
    ],
  });
  const [loading, setLoading] = useState(false);

  // AUDIT-FIX F3: replaced `?limit=50` (no page, no pager — only first 50
  // entries visible) with the unified hook. The API supports ?search= on
  // entryNumber + description, so we wire a search box too.
  const {
    items: entries,
    meta,
    isLoading,
    search,
    setSearch,
    setPage,
    mutate,
  } = usePaginatedList<JournalEntry>("/api/journal-entries", "entries", {
    search: true,
    limit: 20,
  });

  const totalDebit = form.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleAddLine = () => {
    setForm({
      ...form,
      lines: [...form.lines, { accountCode: "", debit: 0, credit: 0 }],
    });
  };

  const handleRemoveLine = (index: number) => {
    if (form.lines.length <= 2) return;
    setForm({
      ...form,
      lines: form.lines.filter((_, i) => i !== index),
    });
  };

  const handleLineChange = (
    index: number,
    field: "accountCode" | "debit" | "credit",
    value: string | number,
  ) => {
    const newLines = [...form.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setForm({ ...form, lines: newLines });
  };

  const handleCreate = async () => {
    if (!isBalanced) {
      toast.error("Entry not balanced. Debits must equal credits.");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/journal-entries", {
        description: form.description,
        entryDate: form.entryDate || undefined,
        lines: form.lines
          .filter((l) => l.accountCode)
          .map((l) => ({
            accountCode: l.accountCode,
            debit: l.debit || undefined,
            credit: l.credit || undefined,
          })),
      });
      toast.success("Journal entry posted");
      setShowCreateModal(false);
      setForm({
        description: "",
        entryDate: "",
        lines: [
          { accountCode: "", debit: 0, credit: 0 },
          { accountCode: "", debit: 0, credit: 0 },
        ],
      });
      mutate();
    } catch {
      toast.error("Failed to post entry");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-success" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Journal Entries</h1>
          <p className="text-sm text-muted-foreground">
            {meta?.total ?? entries.length} entries
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-bold text-success-foreground hover:bg-success/90"
        >
          <Plus size={16} /> New Entry
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm outline-none focus:border-success/40 focus:ring-2 focus:ring-success/20 transition"
          placeholder="Search by entry number or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="hidden md:block rounded-xl border">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2">Entry #</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b last:border-0 hover:bg-muted/50"
              >
                <td className="px-4 py-3 font-mono text-xs font-bold">
                  {entry.entryNumber}
                </td>
                <td className="px-4 py-3 text-sm">
                  {new Date(entry.entryDate).toLocaleDateString("en-PK")}
                </td>
                <td className="px-4 py-3 text-sm">{entry.description}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">
                    {entry.referenceType}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {entry.totalDebit.toLocaleString("en-PK")}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {entry.totalCredit.toLocaleString("en-PK")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      entry.status === "posted"
                        ? "bg-success/15 text-success"
                        : entry.status === "reversed"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {entry.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/accounting/journal-entries/${entry.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {entries.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No journal entries found
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-card rounded-lg border border-border p-3 shadow-soft space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-foreground">
                    {entry.entryNumber}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(entry.entryDate).toLocaleDateString("en-PK", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    entry.status === "posted"
                      ? "bg-success/15 text-success"
                      : entry.status === "reversed"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {entry.status}
                </span>
              </div>
              <p className="text-sm text-foreground line-clamp-2">
                {entry.description}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {entry.referenceType}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-xs text-muted-foreground">
                  <span>Dr: </span>
                  <span className="font-semibold text-foreground">
                    {entry.totalDebit.toLocaleString("en-PK")}
                  </span>
                  <span className="ml-2">Cr: </span>
                  <span className="font-semibold text-foreground">
                    {entry.totalCredit.toLocaleString("en-PK")}
                  </span>
                </div>
                <Link
                  href={`/accounting/journal-entries/${entry.id}`}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  View →
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {meta && <PaginationBar meta={meta} onPageChange={setPage} className="pt-2" />}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">New Journal Entry</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                aria-label="Close journal entry dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70 transition hover:bg-muted hover:text-foreground/90"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Description
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full rounded-lg border p-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Date (optional)
                  </label>
                  <input
                    type="date"
                    value={form.entryDate}
                    onChange={(e) =>
                      setForm({ ...form, entryDate: e.target.value })
                    }
                    className="w-full rounded-lg border p-2"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold">Lines</label>
                  <button
                    onClick={handleAddLine}
                    className="text-xs text-success hover:underline"
                  >
                    + Add Line
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-muted-foreground">
                    <div className="col-span-5">Account Code</div>
                    <div className="col-span-3 text-right">Debit</div>
                    <div className="col-span-3 text-right">Credit</div>
                    <div className="col-span-1"></div>
                  </div>
                  {form.lines.map((line, i) => (
                    <div key={i} className="flex flex-col sm:grid sm:grid-cols-12 gap-2">
                      <input
                        type="text"
                        placeholder="Account Code"
                        value={line.accountCode}
                        onChange={(e) =>
                          handleLineChange(i, "accountCode", e.target.value)
                        }
                        className="rounded-lg border p-2 text-sm sm:col-span-5 w-full"
                      />
                      <input
                        type="number"
                        placeholder="Debit 0"
                        value={line.debit || ""}
                        onChange={(e) =>
                          handleLineChange(
                            i,
                            "debit",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="rounded-lg border p-2 text-right text-sm sm:col-span-3 w-full"
                      />
                      <input
                        type="number"
                        placeholder="Credit 0"
                        value={line.credit || ""}
                        onChange={(e) =>
                          handleLineChange(
                            i,
                            "credit",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="rounded-lg border p-2 text-right text-sm sm:col-span-3 w-full"
                      />
                      <button
                        onClick={() => handleRemoveLine(i)}
                        disabled={form.lines.length <= 2}
                        className="flex items-center justify-center py-2 text-destructive disabled:opacity-30 sm:col-span-1"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <span className="text-sm font-bold">Totals:</span>
                  <div className="flex gap-6">
                    <span className="text-sm">
                      Debit:{" "}
                      <strong>{totalDebit.toLocaleString("en-PK")}</strong>
                    </span>
                    <span className="text-sm">
                      Credit:{" "}
                      <strong>{totalCredit.toLocaleString("en-PK")}</strong>
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        isBalanced ? "text-success" : "text-destructive"
                      }`}
                    >
                      {isBalanced ? "✓ Balanced" : "✗ Not Balanced"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={loading || !isBalanced || !form.description}
                className="w-full rounded-lg bg-success py-2.5 text-sm font-bold text-success-foreground hover:bg-success/90 disabled:opacity-50"
              >
                {loading ? "Posting..." : "Post Journal Entry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
