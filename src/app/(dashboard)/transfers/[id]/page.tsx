"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Truck, ArrowRight } from "lucide-react";

interface TransferItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitCost: number;
  total: number;
}

interface TransferDetail {
  id: string;
  transferNumber: string;
  sourceStoreId: string;
  destStoreId: string;
  status: string;
  notes: string | null;
  totalValue: number;
  createdAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  sourceStore: { id: string; name: string };
  destStore: { id: string; name: string };
  dispatchedByName: string | null;
  receivedByName: string | null;
  cancelledByName: string | null;
  items: TransferItem[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  in_transit: "bg-info/15 text-info border-info/25",
  received: "bg-success/15 text-success border-success/20",
  cancelled: "bg-destructive/15 text-destructive border-destructive/20",
};

export default function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const { data, isLoading, error } = useSWR<{ transfer: TransferDetail }>(
    id ? `/api/transfers/${id}` : null,
    (url: string) =>
      apiGet<{ transfer: TransferDetail }>(url, {
        showToast: false,
      }) as Promise<{ transfer: TransferDetail }>,
  );

  const transfer = data?.transfer;

  const { data: sessionData } = useSWR<{
    user: { storeId?: string | null; role: string };
  }>(
    "/api/auth",
    (url: string) =>
      apiGet<{ user: { storeId?: string | null; role: string } }>(url, {
        showToast: false,
      }) as Promise<{ user: { storeId?: string | null; role: string } }>,
  );
  const currentStoreId = sessionData?.user?.storeId;

  const handleAction = async (action: "dispatch" | "receive" | "cancel") => {
    if (!id) return;
    if (!confirm(`Are you sure you want to ${action} this transfer?`)) return;

    setActionLoading(action);
    try {
      await apiPost(`/api/transfers/${id}/${action}`, {});
      toast.success(`Transfer ${action}ed successfully`);
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Failed to ${action} transfer`,
      );
    } finally {
      setActionLoading(null);
    }
  };

  if (error) {
    return (
      <div className="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
        <button
          onClick={() => router.push("/transfers")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back to Transfers
        </button>
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-8 text-center">
          <p className="text-lg font-bold text-destructive">
            Failed to load transfer
          </p>
          <p className="mt-2 text-sm text-destructive">
            {error?.message ??
              "The transfer may not exist or you may not have access."}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !transfer) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isSourceStore = transfer.sourceStoreId === currentStoreId;
  const isDestStore = transfer.destStoreId === currentStoreId;

  return (
    <div className="space-y-6 p-4 sm:p-6 md:p-8 max-w-4xl mx-auto animate-fade-in">
      <button
        onClick={() => router.push("/transfers")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Back to Transfers
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
            {transfer.transferNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {transfer.sourceStore.name}{" "}
            <ArrowRight size={12} className="inline" />{" "}
            {transfer.destStore.name}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize border ${
              STATUS_STYLES[transfer.status] ??
              "bg-muted text-muted-foreground border-border"
            }`}
          >
            {transfer.status.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {transfer.status === "draft" && isSourceStore && (
          <button
            onClick={() => handleAction("dispatch")}
            disabled={actionLoading === "dispatch"}
            className="flex items-center gap-2 rounded-xl bg-info px-5 py-2.5 text-sm font-bold text-info-foreground hover:bg-info/90 disabled:opacity-50 transition shadow-soft"
          >
            {actionLoading === "dispatch" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Truck size={16} />
            )}
            Dispatch Transfer
          </button>
        )}
        {transfer.status === "in_transit" && isDestStore && (
          <button
            onClick={() => handleAction("receive")}
            disabled={actionLoading === "receive"}
            className="flex items-center gap-2 rounded-xl bg-success px-5 py-2.5 text-sm font-bold text-success-foreground hover:bg-success/90 disabled:opacity-50 transition shadow-soft"
          >
            {actionLoading === "receive" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight size={16} />
            )}
            Receive Transfer
          </button>
        )}
        {(transfer.status === "draft" || transfer.status === "in_transit") &&
          isSourceStore && (
            <button
              onClick={() => handleAction("cancel")}
              disabled={actionLoading === "cancel"}
              className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/15 disabled:opacity-50 transition"
            >
              {actionLoading === "cancel" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Cancel Transfer
            </button>
          )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            From
          </p>
          <p className="font-bold text-foreground truncate">
            {transfer.sourceStore.name}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            To
          </p>
          <p className="font-bold text-foreground truncate">
            {transfer.destStore.name}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Total Value
          </p>
          <p className="font-bold text-foreground">
            {transfer.totalValue.toLocaleString("en-PK")} Rs.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Created
          </p>
          <p className="font-bold text-foreground">
            {new Date(transfer.createdAt).toLocaleDateString("en-PK")}
          </p>
        </div>
      </div>

      {/* Audit Info */}
      {(transfer.dispatchedAt || transfer.receivedAt) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {transfer.dispatchedAt && (
            <div className="rounded-lg border border-info/25 bg-info/10 p-3">
              <p className="text-xs text-info uppercase tracking-wider font-medium">
                Dispatched
              </p>
              <p className="text-sm font-medium text-foreground mt-1">
                {transfer.dispatchedByName ?? "Unknown"} ·{" "}
                {new Date(transfer.dispatchedAt).toLocaleString("en-PK")}
              </p>
            </div>
          )}
          {transfer.receivedAt && (
            <div className="rounded-lg border border-success/25 bg-success/10 p-3">
              <p className="text-xs text-success uppercase tracking-wider font-medium">
                Received
              </p>
              <p className="text-sm font-medium text-foreground mt-1">
                {transfer.receivedByName ?? "Unknown"} ·{" "}
                {new Date(transfer.receivedAt).toLocaleString("en-PK")}
              </p>
            </div>
          )}
          {transfer.status === "cancelled" && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3">
              <p className="text-xs text-destructive uppercase tracking-wider font-medium">
                Cancelled
              </p>
              <p className="text-sm font-medium text-foreground mt-1">
                {transfer.cancelledByName ?? "Unknown"} ·{" "}
                {new Date(transfer.createdAt).toLocaleString("en-PK")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {transfer.notes && (
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Notes
          </p>
          <p className="text-sm text-foreground mt-1">{transfer.notes}</p>
        </div>
      )}

      {/* Items Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-soft">
        <div className="table-scroll">
          <table className="w-full whitespace-nowrap">
            <thead className="bg-muted/40 border-b border-border">
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold text-right">Qty</th>
                <th className="px-4 py-3 font-semibold text-right">Unit Cost</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transfer.items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {item.productName}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                    {item.productSku}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-foreground/80">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-foreground/80">
                    {item.unitCost.toLocaleString("en-PK")} Rs.
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-foreground">
                    {item.total.toLocaleString("en-PK")} Rs.
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/40">
              <tr className="font-bold">
                <td colSpan={4} className="px-4 py-3 text-right text-foreground">
                  Total
                </td>
                <td className="px-4 py-3 text-right text-foreground">
                  {transfer.totalValue.toLocaleString("en-PK")} Rs.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
