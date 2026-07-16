"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import Link from "next/link";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { Plus, X, Search, ArrowRight, Loader2, Package, Truck, CheckCircle2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";
import { PageContainer, PageHeader, StatTile } from "@/components/layout/PageContainer";

interface Transfer {
  id: string;
  transferNumber: string;
  sourceStoreId: string;
  destStoreId: string;
  status: string;
  totalValue: number;
  itemCount: number;
  createdAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  sourceStore: { id: string; name: string };
  destStore: { id: string; name: string };
  dispatchedByName: string | null;
  receivedByName: string | null;
}

interface Store {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  costPrice: number;
}

type Direction = "all" | "outgoing" | "incoming";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  in_transit: "bg-info/15 text-info border-info/25",
  received: "bg-success/15 text-success border-success/20",
  cancelled: "bg-destructive/15 text-destructive border-destructive/20",
};

export default function TransfersPage() {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Unified paginated list (fixes F1/F5/F6).
  // /api/transfers does NOT support ?search= — the previous client-side search
  // box only filtered the first 20 rows (silent truncation). It has been removed.
  // direction (all/outgoing/incoming) is passed as a filter.
  const {
    items: transfers,
    meta,
    isLoading,
    error: fetchError,
    filters,
    setFilter,
    setPage,
    mutate,
  } = usePaginatedList<Transfer>("/api/transfers", "transfers", {
    limit: 20,
    filters: { direction: "all" as Direction },
  });

  const direction = (filters.direction as Direction) || "all";

  async function handleSettle() {
    if (
      !confirm(
        "Settle all received transfers? This clears inter-store balances in the books.",
      )
    )
      return;
    try {
      const res = await apiPost("/api/transfers/settle", {});
      toast.success(
        (res as { message?: string })?.message ?? "Transfers settled",
      );
      mutate();
    } catch {
      toast.error("Failed to settle transfers");
    }
  }

  if (fetchError) {
    return (
      <PageContainer>
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
          <X className="w-5 h-5" />
          <span>{fetchError.message}</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer wide>
      {/* Header */}
      <PageHeader
        title="Stock Transfers"
        description="Move inventory between stores"
        actions={
          <div className="flex gap-2 justify-center items-center flex-wrap">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition shadow-soft hover:shadow-soft-lg"
            >
              <Plus size={16} /> New Transfer
            </button>

            <button
              onClick={handleSettle}
              className="flex items-center gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-2 text-sm font-bold text-info hover:bg-info/15 transition"
            >
              Settle Transfers
            </button>
          </div>
        }
      />

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <StatTile
            label="Total Transfers"
            value={String(meta?.total ?? transfers.length)}
            icon={<ArrowsLeftRight className="w-4 h-4" />}
            tone="primary"
          />
          <StatTile
            label="In Transit"
            value={String(transfers.filter((t) => t.status === "in_transit").length)}
            hint="awaiting receipt"
            icon={<Truck className="w-4 h-4" />}
            tone="info"
          />
          <StatTile
            label="Received"
            value={String(transfers.filter((t) => t.status === "received").length)}
            hint="completed transfers"
            icon={<CheckCircle2 className="w-4 h-4" />}
            tone="success"
          />
          <StatTile
            label="Page Value"
            value={`Rs. ${transfers.reduce((sum, t) => sum + (t.totalValue || 0), 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`}
            hint="total stock value"
            icon={<Package className="w-4 h-4" />}
            tone="warning"
          />
        </div>
      )}

      {/* Tabs — wired to setFilter("direction", ...) which re-fetches + resets page (F8) */}
      <div className="flex gap-2 border-b border-border mb-4">
        {(["all", "outgoing", "incoming"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter("direction", t)}
            className={`border-b-2 px-4 py-2 text-sm font-bold capitalize transition ${
              direction === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : transfers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <ArrowsLeftRight className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No {direction !== "all" ? direction + " " : ""}transfers found
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-soft">
          <div className="table-scroll">
            <table className="w-full whitespace-nowrap">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Transfer #</th>
                  <th className="px-4 py-3 font-semibold">From</th>
                  <th className="px-4 py-3 font-semibold">To</th>
                  <th className="px-4 py-3 font-semibold">Items</th>
                  <th className="px-4 py-3 font-semibold text-right">Value</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfers.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-muted/30 cursor-pointer transition"
                    onClick={() => router.push(`/transfers/${t.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-bold text-foreground">
                      {t.transferNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground/80">{t.sourceStore.name}</td>
                    <td className="px-4 py-3 text-sm text-foreground/80">
                      <span className="flex items-center gap-1">
                        <ArrowRight size={12} className="text-muted-foreground" />
                        {t.destStore.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground/80">{t.itemCount}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                      {t.totalValue.toLocaleString("en-PK")} Rs.
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold capitalize border ${STATUS_STYLES[t.status] ?? "bg-muted text-muted-foreground border-border"}`}
                      >
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString("en-PK")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/transfers/${t.id}`}
                        className="text-xs text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {meta && <PaginationBar meta={meta} onPageChange={setPage} className="pt-4" />}

      {showCreateModal && (
        <CreateTransferModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => mutate()}
        />
      )}
    </PageContainer>
  );
}

// ─── Create Transfer Modal ───────────────────────────────────────────────

function CreateTransferModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { mutate: globalMutate } = useSWRConfig();
  const [destStoreId, setDestStoreId] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<
    Record<string, { product: Product; quantity: number }>
  >({});
  const [loading, setLoading] = useState(false);

  const { data: storesData } = useSWR<{ stores: Store[] }>(
    "/api/stores",
    (url: string) =>
      apiGet<{ stores: Store[] }>(url, { showToast: false }) as Promise<{
        stores: Store[];
      }>,
  );
  // FIX: Exclude current store from destination dropdown — can't transfer to yourself
  const { data: sessionData } = useSWR<{ user: { storeId?: string | null } }>(
    "/api/auth",
    (url: string) =>
      apiGet<{ user: { storeId?: string | null } }>(url, {
        showToast: false,
      }) as Promise<{ user: { storeId?: string | null } }>,
  );
  const currentStoreId = sessionData?.user?.storeId;
  const stores = (storesData?.stores ?? []).filter(
    (s) => s.id !== "" && s.id !== currentStoreId,
  );

  // FIX: Fetch products on-demand based on search query (was limited to 100)
  const { data: productsData } = useSWR<{ products: Product[] }>(
    search
      ? `/api/products?search=${encodeURIComponent(search)}&limit=50`
      : `/api/products?limit=20`,
    (url: string) =>
      apiGet<{ products: Product[] }>(url, { showToast: false }) as Promise<{
        products: Product[];
      }>,
    { dedupingInterval: 300 },
  );
  const filteredProducts = productsData?.products ?? [];

  const totalValue = Object.values(selectedItems).reduce(
    (s, i) => s + i.quantity * i.product.costPrice,
    0,
  );

  const handleToggleProduct = (product: Product) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[product.id]) {
        delete next[product.id];
      } else {
        next[product.id] = { product, quantity: 1 };
      }
      return next;
    });
  };

  const handleQtyChange = (productId: string, qty: number) => {
    setSelectedItems((prev) => {
      const item = prev[productId];
      if (!item) return prev;
      const maxQty = item.product.stockQuantity;
      return {
        ...prev,
        [productId]: { ...item, quantity: Math.min(qty, maxQty) },
      };
    });
  };

  const handleSubmit = async () => {

    if (!destStoreId || destStoreId === "") {
      toast.error("Please select a destination store");
      return;
    }
    if (Object.keys(selectedItems).length === 0) {
      toast.error("Please select at least one product");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        destStoreId: destStoreId,
        notes: notes || null,
        items: Object.values(selectedItems).map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
        })),
      };

      await apiPost("/api/transfers", payload);
      toast.success("Transfer created successfully");
      onClose();
      // AUDIT-FIX: Use mutate() instead of window.location.reload().
      // Call the parent's hook mutate (revalidates the paginated list) AND
      // globalMutate any other SWR keys that may cache transfers.
      onCreated();
      globalMutate(
        (key) => typeof key === "string" && key.startsWith("/api/transfers"),
      );
    } catch (err) {
      console.error("Transfer creation failed:", err);
      toast.error("Failed to create transfer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Dialog calls onOpenChange(false) on Escape / overlay click / X.
        // Guard against closing while submitting.
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] gap-0 overflow-y-auto rounded-2xl bg-card p-6 sm:max-w-3xl"
      >
        <DialogHeader className="mb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold text-foreground">
              New Stock Transfer
            </DialogTitle>
            <button
              onClick={onClose}
              disabled={loading}
              aria-label="Close new transfer dialog"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>
        </DialogHeader>

        {/* Destination Store */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-semibold">
            Destination Store
          </label>
          <select
            value={destStoreId}
            onChange={(e) => {
              setDestStoreId(e.target.value);
            }}
            className="w-full rounded-lg border border-input bg-background p-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition"
          >
            <option value="">Select destination store...</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {stores.length === 0 && (
            <p className="mt-1 text-xs text-warning">
              No other stores available. You can only transfer to a different
              store.
            </p>
          )}
        </div>

        {/* Product Search */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-semibold">
            Select Products
          </label>
          <div className="relative mb-2">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition"
            />
          </div>

          {/* Product List */}
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
            {filteredProducts.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-3 border-b border-border last:border-0 p-2 hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!selectedItems[p.id]}
                  onChange={() => handleToggleProduct(p)}
                  className="h-4 w-4"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    SKU: {p.sku} · Stock: {p.stockQuantity} · Cost:{" "}
                    {p.costPrice} Rs.
                  </p>
                </div>
                {selectedItems[p.id] && (
                  <input
                    type="number"
                    min="1"
                    max={p.stockQuantity}
                    value={selectedItems[p.id].quantity}
                    onChange={(e) =>
                      handleQtyChange(p.id, parseInt(e.target.value) || 1)
                    }
                    className="w-20 rounded border border-input bg-background p-1 text-right text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none"
                  />
                )}
              </label>
            ))}
            {filteredProducts.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No products found
              </p>
            )}
          </div>
        </div>

        {/* Selected Items Summary */}
        {Object.keys(selectedItems).length > 0 && (
          <div className="mb-4 rounded-lg bg-muted/60 p-3 border border-border">
            <p className="text-sm font-semibold text-foreground">
              {Object.keys(selectedItems).length} item(s) selected · Total
              value: {totalValue.toLocaleString("en-PK")} Rs.
            </p>
          </div>
        )}

        {/* Notes */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-semibold">
            Notes (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note..."
            className="w-full rounded-lg border border-input bg-background p-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={
              loading || !destStoreId || Object.keys(selectedItems).length === 0
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition shadow-soft"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Creating..." : "Create Transfer"}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 transition"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
