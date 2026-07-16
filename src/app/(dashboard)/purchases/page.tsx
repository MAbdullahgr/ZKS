"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";
import {
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Package,
  ArrowRight,
  Calendar,
  Clock,
  FileText,
  ShoppingCart,
  Truck,
  DollarSign,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";
import { StatTile } from "@/components/layout/PageContainer";

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: "draft" | "ordered" | "partial" | "received" | "cancelled";
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  supplier: { name: string; email?: string };
  store?: { name: string } | null;
  items: { quantity: number; receivedQty: number }[];
  notes?: string;
}

interface CountsResponse {
  counts: Record<string, number>;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  draft: {
    label: "RFQ",
    color: "bg-muted text-muted-foreground border-border",
    icon: Clock,
  },
  ordered: {
    label: "Purchase Order",
    color: "bg-info/15 text-info border-info/25",
    icon: CheckCircle,
  },
  partial: {
    label: "Partially Received",
    color: "bg-warning/15 text-warning border-warning/25",
    icon: Package,
  },
  received: {
    label: "Done",
    color: "bg-success/15 text-success border-success/20",
    icon: CheckCircle,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-destructive/15 text-destructive border-destructive/20",
    icon: XCircle,
  },
};

const STATUS_ORDER = ["draft", "ordered", "partial", "received", "cancelled"];

export default function PurchasesPage() {
  const router = useRouter();
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const {
    items: orders,
    meta,
    isLoading,
    search,
    setSearch,
    page,
    setPage,
    mutate,
  } = usePaginatedList<PurchaseOrder>("/api/purchases", "orders", {
    search: true,
    limit: 20,
    filters: { status: "" },
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build query params
  const queryParams = new URLSearchParams();
  queryParams.set("page", page.toString());
  if (debouncedSearch) queryParams.set("search", debouncedSearch);
  if (statusFilter) queryParams.set("status", statusFilter);

  // FIX: Cast fetcher return to Promise<T> to satisfy SWR strict types
  const { data: countsData } = useSWR<CountsResponse>(
    "/api/purchases?countOnly=true",
    (url: string) => apiGet<CountsResponse>(url) as Promise<CountsResponse>,
  );
  const counts = countsData?.counts || {};

  const activeStatus = (s: string) => statusFilter === s;

  // FIX P3-7: Wire up the Confirm button — it was rendered with no onClick,
  // making it dead UI. Now it sends the PO (marks as "ordered" status).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  async function handleConfirmOrder(orderId: string, orderNumber: string) {
    if (!confirm(`Confirm and send purchase order ${orderNumber}?`)) return;
    setConfirmingId(orderId);
    try {
      await apiPost(`/api/purchases/${orderId}/send`, {});
      toast.success(`PO ${orderNumber} confirmed and sent`);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm PO");
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            Purchase Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage RFQs, orders, and receipts
          </p>
        </div>
        <button
          onClick={() => router.push("/purchases/new")}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-soft hover:shadow-soft-lg shrink-0"
        >
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatTile
            label="Total Orders"
            value={String(meta?.total ?? orders.length)}
            icon={<ShoppingCart className="w-4 h-4" />}
            tone="primary"
          />
          <StatTile
            label="Received"
            value={String(orders.filter((p) => p.status === "received").length)}
            hint="completed orders"
            icon={<CheckCircle className="w-4 h-4" />}
            tone="success"
          />
          <StatTile
            label="Pending"
            value={String(orders.filter((p) => p.status === "ordered" || p.status === "partial").length)}
            hint="awaiting receipt"
            icon={<Truck className="w-4 h-4" />}
            tone="info"
          />
          <StatTile
            label="Page Value"
            value={`Rs. ${orders.reduce((sum, p) => sum + (p.totalAmount || 0), 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`}
            hint="total order value"
            icon={<DollarSign className="w-4 h-4" />}
            tone="warning"
          />
        </div>
      )}

      {/* Status Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            setStatusFilter("");
            setPage(1);
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
            !statusFilter
              ? "bg-primary text-primary-foreground border-primary shadow-soft"
              : "bg-card text-foreground border-border hover:bg-muted"
          }`}
        >
          All
          <span className="ml-1.5 text-xs opacity-75">
            {Object.values(counts).reduce((a, b) => a + b, 0) || 0}
          </span>
        </button>
        {STATUS_ORDER.map((s) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          return (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(activeStatus(s) ? "" : s);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                activeStatus(s)
                  ? "bg-primary text-primary-foreground border-primary shadow-soft"
                  : `${cfg.color} hover:brightness-95`
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {cfg.label}
              <span className="ml-1 text-xs opacity-75">{counts[s] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2.5 border border-input rounded-xl bg-card text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition shadow-soft"
            placeholder="Search by order number, vendor..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-4 shimmer h-14"
            />
          ))}
        </div>
      )}

      {/* Table */}
      {!isLoading && (
        <div className="bg-card rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Order #</th>
                  <th className="px-4 py-3 font-semibold">Store</th>
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Order Date</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-foreground font-medium">
                        No purchase orders
                      </p>
                      <p className="text-muted-foreground text-sm mt-1">
                        Create a new RFQ to get started
                      </p>
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const cfg = STATUS_CONFIG[order.status];
                    const Icon = cfg.icon;
                    const totalItems = order.items.reduce(
                      (s, i) => s + i.quantity,
                      0,
                    );
                    const receivedItems = order.items.reduce(
                      (s, i) => s + i.receivedQty,
                      0,
                    );
                    const progress =
                      totalItems > 0
                        ? Math.round((receivedItems / totalItems) * 100)
                        : 0;

                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/purchases/${order.id}`}
                            className="font-mono text-xs font-semibold text-primary hover:underline transition"
                          >
                            {order.orderNumber}
                          </Link>
                          {order.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-48">
                              {order.notes}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {order.store?.name ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium border border-border">
                              {order.store.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold ring-1 ring-border">
                              {order.supplier.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground text-sm truncate">
                                {order.supplier.name}
                              </p>
                              {order.supplier.email && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {order.supplier.email}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(order.orderDate).toLocaleDateString(
                              "en-PK",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </div>
                          {order.expectedDate && (
                            <p className="mt-0.5 text-muted-foreground/70">
                              Expected:{" "}
                              {new Date(order.expectedDate).toLocaleDateString(
                                "en-PK",
                                { day: "numeric", month: "short" },
                              )}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-bold text-foreground">
                            Rs. {order.totalAmount.toLocaleString()}
                          </p>
                          {order.status === "partial" && (
                            <div className="mt-1">
                              <div className="w-full bg-muted rounded-full h-1.5 max-w-24 ml-auto">
                                <div
                                  className="bg-warning h-1.5 rounded-full"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {progress}% received
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}
                          >
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition focus-within:opacity-100">
                            <Link
                              href={`/purchases/${order.id}`}
                              aria-label={`View purchase order ${order.orderNumber}`}
                              className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary transition"
                              title="View"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                            {order.status === "draft" && (
                              <button
                                onClick={() =>
                                  handleConfirmOrder(
                                    order.id,
                                    order.orderNumber,
                                  )
                                }
                                disabled={confirmingId === order.id}
                                aria-label={`Confirm and send purchase order ${order.orderNumber}`}
                                className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-success/10 text-muted-foreground hover:text-success transition disabled:opacity-50"
                                title="Confirm and Send"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
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
