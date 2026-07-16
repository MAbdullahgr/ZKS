"use client";

import useSWR from "swr";
import { apiGet } from "@/lib/fetcher";
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Package,
  AlertTriangle,
  PackageX,
  Boxes,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { SalesTrendChart } from "./SalesTrendChart";
import { TopProductsWidget } from "./TopProductsWidget";

// ─── Types matching the /api/dashboard response ───────────────────────────
interface RecentSale {
  id: string;
  invoiceNumber: string;
  total: number;
  saleDate: string;
  status: string;
  customer: { name: string } | null;
}

interface DashboardData {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount?: number;
  totalStockUnits: number;
  todayRevenue?: number;
  todayProfit?: number;
  todaySalesCount?: number;
  yesterdayRevenue?: number;
  yesterdaySalesCount?: number;
  revenueTrendPct?: number;
  salesCountTrendPct?: number;
  recentSales?: RecentSale[];
  roleScope: string;
}

function formatRs(n: number): string {
  return "Rs " + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

function formatQty(n: number): string {
  return n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Trend Badge ───────────────────────────────────────────────────────────
function TrendBadge({ pct }: { pct: number }) {
  const isUp = pct > 0;
  const isFlat = pct === 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
        isFlat
          ? "bg-muted text-muted-foreground"
          : isUp
            ? "bg-success/15 text-success"
            : "bg-destructive/15 text-destructive"
      }`}
    >
      {isFlat ? (
        "—"
      ) : isUp ? (
        <TrendingUp className="w-2.5 h-2.5" />
      ) : (
        <TrendingDown className="w-2.5 h-2.5" />
      )}
      {isFlat ? "0%" : `${isUp ? "+" : ""}${pct}%`}
    </span>
  );
}

// ─── KPI Tile ──────────────────────────────────────────────────────────────
function KPITile({
  label,
  value,
  icon,
  tone,
  href,
  hint,
  trendPct,
  delay = 0,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "primary" | "success" | "warning" | "danger" | "info" | "muted";
  href?: string;
  hint?: string;
  trendPct?: number;
  delay?: number;
}) {
  const tones: Record<string, string> = {
    primary:
      "bg-primary/10 text-primary ring-primary/15 dark:bg-primary/15 dark:text-primary",
    success:
      "bg-success/15 text-success ring-success/20 dark:bg-success/20 dark:text-success",
    warning:
      "bg-warning/15 text-warning ring-warning/25 dark:bg-warning/20 dark:text-warning",
    danger:
      "bg-destructive/10 text-destructive ring-destructive/20 dark:bg-destructive/20 dark:text-destructive",
    info: "bg-info/15 text-info ring-info/25 dark:bg-info/20 dark:text-info",
    muted: "bg-muted text-muted-foreground ring-border dark:bg-muted/60",
  };

  const content = (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-soft transition-all hover:shadow-soft-lg hover:-translate-y-0.5 animate-rise"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            {trendPct !== undefined && <TrendBadge pct={trendPct} />}
          </div>
          <p className="text-lg sm:text-2xl font-bold tracking-tight text-foreground mt-1.5 tabular-nums">
            {value}
          </p>
          {hint && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {hint}
            </p>
          )}
        </div>
        <div
          className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>
      {href && (
        <div className="absolute bottom-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-2">
          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

// ─── Skeleton ───────────────────────────────────────────────────────────────
function StatSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 shimmer rounded" />
          <div className="h-6 w-24 shimmer rounded" />
        </div>
        <div className="h-10 w-10 shimmer rounded-lg" />
      </div>
    </div>
  );
}

// ─── Recent Sales List ──────────────────────────────────────────────────────
function RecentSalesList({ sales }: { sales: RecentSale[] }) {
  if (sales.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <ShoppingBag className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No sales today yet</p>
        <Link
          href="/pos"
          className="inline-flex items-center gap-1 text-xs text-primary font-medium mt-2 hover:underline"
        >
          Open POS to make a sale <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border max-h-64 overflow-y-auto">
      {sales.map((sale) => (
        <Link
          key={sale.id}
          href={`/sales/${sale.id}`}
          className="flex items-center justify-between gap-3 py-2.5 px-1 hover:bg-muted/40 -mx-1 px-2 rounded transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {sale.invoiceNumber}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {sale.customer?.name ?? "Walk-in customer"} ·{" "}
              {formatTime(sale.saleDate)}
            </p>
          </div>
          <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">
            {formatRs(sale.total)}
          </p>
        </Link>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function DashboardStats({ roleScope }: { roleScope: string }) {
  const { data, isLoading } = useSWR<DashboardData>(
    "/api/dashboard",
    (url: string) => apiGet<DashboardData>(url) as Promise<DashboardData>,
  );

  // Cashiers see limited data — don't render revenue tiles for them
  const showRevenue = roleScope !== "cashier";

  if (isLoading) {
    return (
      <div className="space-y-4 mb-6 sm:mb-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const todayRevenue = data.todayRevenue ?? 0;
  const todaySalesCount = data.todaySalesCount ?? 0;
  const todayProfit = data.todayProfit ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {showRevenue && (
          <KPITile
            label="Today's Revenue"
            value={formatRs(todayRevenue)}
            hint={`Profit: ${formatRs(todayProfit)}`}
            icon={<TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />}
            tone="success"
            href="/reports"
            trendPct={data.revenueTrendPct}
            delay={0}
          />
        )}
        <KPITile
          label="Today's Sales"
          value={formatQty(todaySalesCount)}
          hint="transactions"
          icon={<ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />}
          tone="primary"
          href="/sales"
          trendPct={data.salesCountTrendPct}
          delay={showRevenue ? 50 : 0}
        />
        <KPITile
          label="Low Stock"
          value={formatQty(data.lowStockCount)}
          hint={
            data.outOfStockCount
              ? `${data.outOfStockCount} out of stock`
              : "items need restock"
          }
          icon={<AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />}
          tone="warning"
          href="/inventory"
          delay={showRevenue ? 100 : 50}
        />
        <KPITile
          label="Total Products"
          value={formatQty(data.totalProducts)}
          hint={`${formatQty(data.totalStockUnits)} units in stock`}
          icon={<Boxes className="w-4 h-4 sm:w-5 sm:h-5" />}
          tone="info"
          href="/inventory"
          delay={showRevenue ? 150 : 100}
        />
      </div>

      {/* Sales Trend Mini-Chart */}
      <SalesTrendChart showRevenue={showRevenue} />

      {/* Recent Sales + Quick Actions */}
      {showRevenue && data.recentSales && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Recent Sales */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card shadow-soft overflow-hidden animate-rise">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">
                  Recent Sales
                </h2>
              </div>
              <Link
                href="/sales"
                className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
              >
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="px-5 py-3">
              <RecentSalesList sales={data.recentSales} />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-border bg-card shadow-soft overflow-hidden animate-rise">
            <div className="px-5 py-3.5 border-b border-border bg-muted/30">
              <h2 className="text-sm font-semibold text-foreground">
                Quick Actions
              </h2>
            </div>
            <div className="p-3 space-y-1.5">
              <Link
                href="/pos"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary/10 transition-colors group"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    New Sale
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Open POS register
                  </p>
                </div>
              </Link>
              <Link
                href="/purchases/new"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary/10 transition-colors group"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info group-hover:bg-info group-hover:text-info-foreground transition-colors">
                  <Package className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    New Purchase
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Record stock received
                  </p>
                </div>
              </Link>
              <Link
                href="/inventory"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary/10 transition-colors group"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning group-hover:bg-warning group-hover:text-warning-foreground transition-colors">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Low Stock Items
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.lowStockCount} items need attention
                  </p>
                </div>
              </Link>
              <Link
                href="/customers"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary/10 transition-colors group"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success group-hover:bg-success group-hover:text-success-foreground transition-colors">
                  <PackageX className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Customers
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Manage khata &amp; contacts
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Top Products Widget */}
      {showRevenue && <TopProductsWidget />}
    </div>
  );
}
