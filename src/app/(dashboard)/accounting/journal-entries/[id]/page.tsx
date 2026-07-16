"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

interface JournalEntryDetail {
  entry: {
    id: string;
    entryNumber: string;
    entryDate: string;
    description: string;
    referenceType: string;
    referenceId: string | null;
    status: string;
    postedByName: string;
    postedAt: string | null;
    lines: Array<{
      id: string;
      debit: number;
      credit: number;
      description: string | null;
      accountCode: string;
      accountName: string;
      accountType: string;
    }>;
    reversalOf: { id: string; entryNumber: string; description: string } | null;
    reversedBy: { id: string; entryNumber: string; description: string } | null;
  };
}

export default function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [reversing, setReversing] = useState(false);

  // Unwrap params promise — use useEffect, not useState initializer
  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const { data, isLoading, error } = useSWR<JournalEntryDetail>(
    id ? `/api/journal-entries/${id}` : null,
    (url: string) =>
      apiGet<JournalEntryDetail>(url, {
        showToast: false,
      }) as Promise<JournalEntryDetail>,
  );

  const handleReverse = async () => {
    if (!data?.entry) return;
    const reason = prompt("Enter reason for reversal:");
    if (!reason) return;

    setReversing(true);
    try {
      await apiPost(`/api/journal-entries/${data.entry.id}/reverse`, {
        reason,
      });
      toast.success("Entry reversed");
      router.push("/accounting/journal-entries");
    } catch {
      toast.error("Failed to reverse entry");
    } finally {
      setReversing(false);
    }
  };

  // FIX P1-26: Handle error state separately from loading state. The old
  // `if (isLoading || !data)` never exits when data is undefined due to a 404
  // or API error — the spinner spins forever.
  if (error) {
    return (
      <div className="space-y-6 p-6">
        <button
          onClick={() => router.push("/accounting/journal-entries")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back to Journal Entries
        </button>
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-8 text-center">
          <p className="text-lg font-bold text-destructive">
            Failed to load journal entry
          </p>
          <p className="mt-2 text-sm text-destructive">
            {error?.message ??
              "The entry may have been deleted or you may not have access."}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-success" />
      </div>
    );
  }

  const { entry } = data;
  const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <button
        onClick={() => router.push("/accounting/journal-entries")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Back to Journal Entries
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{entry.entryNumber}</h1>
          <p className="text-sm text-muted-foreground">{entry.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              entry.status === "posted"
                ? "bg-success/15 text-success"
                : entry.status === "reversed"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {entry.status}
          </span>
          {entry.status === "posted" && (
            <button
              onClick={handleReverse}
              disabled={reversing}
              className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive/15 disabled:opacity-50"
            >
              {reversing ? "Reversing..." : "Reverse Entry"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Date</p>
          <p className="font-bold">
            {new Date(entry.entryDate).toLocaleDateString("en-PK")}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Type</p>
          <p className="font-bold capitalize">{entry.referenceType}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Posted By</p>
          <p className="font-bold">{entry.postedByName}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Lines</p>
          <p className="font-bold">{entry.lines.length}</p>
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full whitespace-nowrap">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2">Account Code</th>
              <th className="px-4 py-2">Account Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line) => (
              <tr key={line.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono font-bold">
                  {line.accountCode}
                </td>
                <td className="px-4 py-3">{line.accountName}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs capitalize">
                    {line.accountType}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {line.description || "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  {line.debit > 0 ? line.debit.toLocaleString("en-PK") : "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  {line.credit > 0 ? line.credit.toLocaleString("en-PK") : "-"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-bold">
              <td colSpan={4} className="px-4 py-3 text-right">
                Totals
              </td>
              <td className="px-4 py-3 text-right">
                {totalDebit.toLocaleString("en-PK")}
              </td>
              <td className="px-4 py-3 text-right">
                {totalCredit.toLocaleString("en-PK")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {entry.reversalOf && (
        <div className="rounded-lg border border-warning/25 bg-warning/10 p-4">
          <p className="text-sm">
            <strong>This entry reverses:</strong> {entry.reversalOf.entryNumber}{" "}
            — {entry.reversalOf.description}
          </p>
        </div>
      )}
      {entry.reversedBy && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-4">
          <p className="text-sm">
            <strong>This entry was reversed by:</strong>{" "}
            {entry.reversedBy.entryNumber} — {entry.reversedBy.description}
          </p>
        </div>
      )}
    </div>
  );
}
