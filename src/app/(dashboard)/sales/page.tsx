"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Search,
  Receipt,
  Eye,
  AlertCircle,
  Calendar,
  User,
  CreditCard,
  Package,
  ArrowUpRight,
  RotateCcw,
  Ban,
  Clock,
  CheckCircle2,
  X,
} from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { PaginationBar, type PaginationMeta } from "@/components/ui/pagination";
import {
  PageContainer,
  PageHeader,
  StatTile,
  EmptyState,
} from "@/components/layout/PageContainer";

interface SaleItem {
  product: { name: string };
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Sale {
  id: string;
  saleNumber: string;
  total: number;
  paidAmount: number;
  discount: number;
  paymentMethod: string;
  saleDate: string;
  createdAt: string;
  status: string;
  returnStatus: string;
  customerName?: string;
  customer?: { name: string };
  store?: { name: string } | null;
  registerSession?: {
    user?: {
      email: string;
      employee?: { name: string | null } | null;
    } | null;
  } | null;
  items: SaleItem[];
}

interface SalesResponse {
  sales: Sale[];
  total: number;
  page: number;
  pages: number;
  limit?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

const PAYMENT_METHODS = ["cash", "card", "mobile", "easypaisa", "jazzcash", "credit", "khata"];
const SALE_STATUSES = ["completed", "pending", "cancelled", "returned"];

// Human-readable labels for payment methods
const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  mobile: "Mobile",
  easypaisa: "Easypaisa",
  jazzcash: "JazzCash",
  credit: "Credit",
  khata: "Khata",
};

// Semantic-tinted pill styles — work in light + dark.
const PAYMENT_STYLES: Record<string, string> = {
  cash: "bg-success/15 text-success border-success/20",
  card: "bg-info/15 text-info border-info/25",
  mobile: "bg-primary/15 text-primary border-primary/20",
  easypaisa: "bg-primary/15 text-primary border-primary/20",
  jazzcash: "bg-primary/15 text-primary border-primary/20",
  credit: "bg-destructive/15 text-destructive border-destructive/20",
  khata: "bg-warning/15 text-warning border-warning/25",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-success/15 text-success border-success/20",
  pending: "bg-warning/15 text-warning border-warning/25",
  cancelled: "bg-destructive/15 text-destructive border-destructive/20",
  returned: "bg-warning/15 text-warning border-warning/25",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  completed: CheckCircle2,
  pending: Clock,
  cancelled: Ban,
  returned: RotateCcw,
};

export default function SalesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [status, setStatus] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build query params
  const queryParams = new URLSearchParams();
  queryParams.set("page", page.toString());
  queryParams.set("limit", "20");
  if (debouncedSearch) queryParams.set("search", debouncedSearch);
  if (from) queryParams.set("from", from);
  if (to) queryParams.set("to", to);
  if (paymentMethod) queryParams.set("paymentMethod", paymentMethod);
  if (status) queryParams.set("status", status);

  const {
    data,
    error: fetchError,
    isLoading,
  } = useSWR<SalesResponse>(
    `/api/sales?${queryParams.toString()}`,
    (url: string) => apiGet<SalesResponse>(url) as Promise<SalesResponse>,
  );

  const pageRevenue = data?.sales?.reduce((s, sale) => s + sale.total, 0) ?? 0;
  const totalSalesCount = data?.total ?? 0;
  const avgSale =
    data && data.sales && data.sales.length > 0
      ? Math.round(pageRevenue / data.sales.length)
      : 0;

  const clearFilters = () => {
    setSearch("");
    setFrom("");
    setTo("");
    setPaymentMethod("");
    setStatus("");
    setPage(1);
  };

  const hasFilters = search || from || to || paymentMethod || status;

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Sales History"
        description="All transactions recorded in the system"
        icon={<Receipt className="w-5 h-5" />}
        actions={
          <Link
            href="/pos"
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-soft hover:shadow-soft-lg shrink-0"
          >
            <Receipt className="w-4 h-4" /> New Sale
          </Link>
        }
      />

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <StatTile
            label="Total Sales"
            value={totalSalesCount.toLocaleString()}
            icon={<Receipt className="w-4 h-4" />}
            tone="primary"
          />
          <StatTile
            label="Page Revenue"
            value={`Rs. ${pageRevenue.toLocaleString()}`}
            icon={<ArrowUpRight className="w-4 h-4" />}
            tone="success"
          />
          <StatTile
            label="Avg Sale"
            value={`Rs. ${avgSale.toLocaleString()}`}
            icon={<CreditCard className="w-4 h-4" />}
            tone="info"
          />
          <StatTile
            label="This Page"
            value={`${data.sales.length} sales`}
            icon={<Package className="w-4 h-4" />}
            tone="muted"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-3 md:p-4 space-y-3 shadow-soft mb-6">
        <div className="flex flex-wrap gap-2 md:gap-3">
          <div className="relative flex-1 min-w-[140px] sm:min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-4 py-2.5 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
              placeholder="Search sale # or customer..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 flex-1 min-w-[140px] sm:min-w-[16rem]">
            <div className="relative flex-1">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                className="w-full pl-9 pr-3 py-2.5 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="relative flex-1">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                className="w-full pl-9 pr-3 py-2.5 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <select
            className="min-w-[100px] sm:min-w-32 flex-1 sm:flex-none px-3 py-2.5 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>

          <select
            className="min-w-[100px] sm:min-w-32 flex-1 sm:flex-none px-3 py-2.5 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Status</option>
            {SALE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 text-destructive mb-6">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{fetchError.message}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-4 shimmer h-16"
            />
          ))}
        </div>
      )}

      {/* Desktop Table */}
      {!isLoading && data && data.sales.length > 0 && (
        <div className="hidden md:block bg-card rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3 font-bold whitespace-nowrap">
                    Sale #
                  </th>
                  <th className="px-4 py-3 font-bold">Store</th>
                  <th className="px-4 py-3 font-bold">Cashier</th>
                  <th className="px-4 py-3 font-bold">Customer</th>
                  <th className="px-4 py-3 font-bold">Items</th>
                  <th className="px-4 py-3 font-bold">Payment</th>
                  <th className="px-4 py-3 font-bold text-right">Total</th>
                  <th className="px-4 py-3 font-bold whitespace-nowrap">
                    Date
                  </th>
                  <th className="px-4 py-3 font-bold text-center">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.sales.map((sale, idx) => {
                  const due = sale.total - sale.paidAmount;
                  const StatusIcon = STATUS_ICONS[sale.status] || CheckCircle2;
                  return (
                    <tr
                      key={sale.id}
                      className={`hover:bg-muted/50 transition-colors ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-mono text-xs font-medium text-foreground">
                          {sale.saleNumber}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${STATUS_STYLES[sale.status] || "bg-muted text-muted-foreground border-border"}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {sale.status}
                          </span>
                          {sale.returnStatus !== "none" && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border bg-warning/15 text-warning dark:text-warning/80 border-warning/25">
                              {sale.returnStatus} return
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {sale.store?.name ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium border border-border">
                            {sale.store.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground/80">
                        {sale.registerSession?.user?.employee?.name ||
                          sale.registerSession?.user?.email ||
                          "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-foreground/80">
                            {sale.customer?.name ??
                              sale.customerName ??
                              "Walk-in"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-48">
                        <p className="truncate text-xs">
                          {sale.items
                            .map((i) => `${i.product.name} ×${i.quantity}`)
                            .join(", ")}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {sale.items.length} item
                          {sale.items.length > 1 ? "s" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${PAYMENT_STYLES[sale.paymentMethod] ?? "bg-muted text-muted-foreground border-border"}`}
                        >
                          {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
                        </span>
                        {due > 0 && (
                          <p className="text-xs text-destructive mt-1 font-medium">
                            Due Rs. {due.toLocaleString()}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-bold text-foreground">
                          Rs. {sale.total.toLocaleString()}
                        </p>
                        {sale.discount > 0 && (
                          <p className="text-xs text-muted-foreground">
                            -{sale.discount.toLocaleString()} disc
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        <p>
                          {new Date(sale.saleDate).toLocaleDateString("en-PK", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                        <p className="text-muted-foreground/70">
                          {new Date(sale.saleDate).toLocaleTimeString("en-PK", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/sales/${sale.id}`}
                          aria-label={`View sale ${sale.saleNumber}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary transition"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile Cards */}
      {!isLoading && data && data.sales.length > 0 && (
        <div className="md:hidden space-y-3">
          {data.sales.map((sale) => {
            const due = sale.total - sale.paidAmount;
            const StatusIcon = STATUS_ICONS[sale.status] || CheckCircle2;
            return (
              <div
                key={sale.id}
                className="bg-card rounded-xl border border-border p-4 space-y-3 shadow-soft"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-muted-foreground">
                      {sale.saleNumber}
                    </p>
                    <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                      {sale.customer?.name ?? sale.customerName ?? "Walk-in"}
                    </p>
                    {sale.store?.name && (
                      <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                        {sale.store.name}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${STATUS_STYLES[sale.status] || "bg-muted text-muted-foreground border-border"}`}
                      >
                        <StatusIcon className="w-3 h-3" /> {sale.status}
                      </span>
                      {sale.returnStatus !== "none" && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border bg-warning/15 text-warning dark:text-warning/80 border-warning/25">
                          {sale.returnStatus}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${PAYMENT_STYLES[sale.paymentMethod] ?? "bg-muted text-muted-foreground border-border"}`}
                  >
                    {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Package className="w-3.5 h-3.5" />
                  <span className="line-clamp-1">
                    {sale.items
                      .map((i) => `${i.product.name} ×${i.quantity}`)
                      .join(", ")}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <p className="text-lg font-bold text-foreground">
                      Rs. {sale.total.toLocaleString()}
                    </p>
                    {due > 0 && (
                      <p className="text-xs text-destructive font-medium">
                        Due Rs. {due.toLocaleString()}
                      </p>
                    )}
                    {sale.discount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        -{sale.discount.toLocaleString()} discount
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(sale.saleDate).toLocaleDateString("en-PK", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <Link
                      href={`/sales/${sale.id}`}
                      className="inline-flex items-center gap-1 mt-1 text-xs text-primary font-medium"
                    >
                      View <Eye className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && data && data.sales.length === 0 && (
        <EmptyState
          icon={<Receipt className="w-7 h-7" />}
          title="No sales found"
          description={
            hasFilters
              ? "Try adjusting your filters"
              : "Make your first sale at the POS to see it appear here."
          }
          action={
            !hasFilters && (
              <Link
                href="/pos"
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-soft hover:shadow-soft-lg"
              >
                <Receipt className="w-4 h-4" /> Open POS
              </Link>
            )
          }
        />
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <PaginationBar
          meta={
            {
              page: data.page,
              limit: data.limit ?? 20,
              total: data.total,
              pages: data.pages,
              hasNext: data.hasNext ?? data.page < data.pages,
              hasPrev: data.hasPrev ?? data.page > 1,
            } satisfies PaginationMeta
          }
          onPageChange={setPage}
          className="pt-4"
        />
      )}
    </PageContainer>
  );
}
