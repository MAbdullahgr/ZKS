"use client";

import Link from "next/link";
import useSWR from "swr";
import { apiGet } from "@/lib/fetcher";
import {
  AlertTriangle,
  PackageX,
  Clock,
  TrendingDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

// ─── Types matching the /api/dashboard response (new fields) ───────────────
interface LowStockProduct {
  id: string;
  name: string;
  sku: string | null;
  stockQuantity: number;
  minStockLevel: number;
  sellingPrice: number;
  category: { name: string } | null;
}

interface ExpiryAlert {
  batchId: string;
  productId: string;
  productName: string;
  sku: string | null;
  batchNumber: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
  severity: "expired" | "critical" | "warning";
  quantity: number;
  costPrice: number;
  potentialLoss: number;
}

interface DashboardData {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount?: number;
  totalStockUnits: number;
  lowStockProducts: LowStockProduct[];
  expiryAlerts?: ExpiryAlert[];
  expiredCount?: number;
  criticalExpiryCount?: number;
  roleScope: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatQty(n: number): string {
  return n.toLocaleString("en-PK", { maximumFractionDigits: 3 });
}

function formatRs(n: number): string {
  return "Rs " + n.toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

function formatExpiryLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

// Severity → tailwind classes for badges + left-border accents
const SEVERITY_STYLES: Record<
  ExpiryAlert["severity"],
  { badge: string; border: string; dot: string; label: string }
> = {
  expired: {
    badge: "bg-destructive/15 text-destructive dark:bg-destructive/95 dark:text-destructive/60",
    border: "border-l-red-500",
    dot: "bg-destructive/100",
    label: "EXPIRED",
  },
  critical: {
    badge:
      "bg-warning/15 text-warning dark:bg-warning/95 dark:text-warning/70",
    border: "border-l-orange-500",
    dot: "bg-warning/100",
    label: "CRITICAL",
  },
  warning: {
    badge: "bg-warning/15 text-warning dark:bg-warning/95 dark:text-warning/70",
    border: "border-l-amber-500",
    dot: "bg-warning/100",
    label: "WARNING",
  },
};

// ─── Main component ────────────────────────────────────────────────────────
// AUDIT-FIX (lint): Use SWR instead of manual useEffect + setState. The old
// pattern called setState synchronously inside useEffect (cascading renders +
// react-hooks/set-state-in-effect lint error). SWR handles fetching, caching,
// loading/error state, and revalidation declaratively — no effect needed.
export function AlertsWidget() {
  const { data, error, isLoading, mutate } = useSWR<DashboardData>(
    "/api/dashboard",
    (url: string) => apiGet<DashboardData>(url) as Promise<DashboardData>,
    { revalidateOnFocus: false },
  );

  const lowStock = data?.lowStockProducts ?? [];
  const expiry = data?.expiryAlerts ?? [];
  const outOfStock = data?.outOfStockCount ?? 0;
  const expired = data?.expiredCount ?? 0;
  const critical = data?.criticalExpiryCount ?? 0;

  // Total potential loss from already-expired stock (cost × qty)
  const totalPotentialLoss = expiry
    .filter((a) => a.severity === "expired")
    .reduce((s, a) => s + a.potentialLoss, 0);

  // Nothing to show — don't render the widget at all (clean dashboard for
  // well-stocked stores with no batch-tracked goods).
  const hasAnyAlert =
    lowStock.length > 0 || expiry.length > 0 || outOfStock > 0;

  if (isLoading) {
    return (
      <div className="mt-10">
        <div className="animate-pulse rounded-2xl border border-border bg-card p-6">
          <div className="h-6 w-48 bg-muted rounded mb-4" />
          <div className="h-24 bg-muted/50 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-10 rounded-2xl border border-destructive/25 bg-destructive/10 p-6 dark:border-destructive/80 dark:bg-destructive/95/50">
        <div className="flex items-center gap-2 text-destructive dark:text-destructive/60">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Couldn&apos;t load alerts</span>
        </div>
        <p className="text-sm text-destructive dark:text-destructive/70 mt-1">
          {error instanceof Error ? error.message : "Failed to load alerts"}
        </p>
        <button
          onClick={() => mutate()}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-destructive hover:underline dark:text-destructive/60"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (!hasAnyAlert) {
    return (
      <div className="mt-10 rounded-2xl border border-success/25 bg-success/10 p-6 dark:border-emerald-900 dark:bg-emerald-950/50">
        <div className="flex items-center gap-2 text-success dark:text-success/70">
          <span className="text-lg">✓</span>
          <span className="font-medium">All clear</span>
        </div>
        <p className="text-sm text-success dark:text-success/70 mt-1">
          No low-stock, out-of-stock, or expiring-batch alerts. Inventory is
          healthy.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-6">
      {/* ─── KPI summary tiles ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          icon={<TrendingDown className="h-4 w-4" />}
          label="Low Stock"
          value={data?.lowStockCount ?? 0}
          tone="amber"
          href="/inventory?filter=low-stock"
        />
        <KpiTile
          icon={<PackageX className="h-4 w-4" />}
          label="Out of Stock"
          value={outOfStock}
          tone="red"
          href="/inventory?filter=out-of-stock"
        />
        <KpiTile
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Expired Batches"
          value={expired}
          tone="red"
          href="/inventory?filter=expired"
        />
        <KpiTile
          icon={<Clock className="h-4 w-4" />}
          label="Expiring ≤ 7d"
          value={critical}
          tone="orange"
          href="/inventory?filter=expiring"
        />
      </div>

      {/* ─── Potential loss banner (only if expired stock exists) ──────── */}
      {totalPotentialLoss > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 dark:border-destructive/70 dark:bg-destructive/95/60">
          <AlertTriangle className="h-5 w-5 text-destructive dark:text-destructive/70 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive dark:text-destructive/50">
              Potential write-off: {formatRs(totalPotentialLoss)}
            </p>
            <p className="text-xs text-destructive dark:text-destructive/70">
              Already-expired batches at cost value. Dispose of or write off to
              keep the GL accurate.
            </p>
          </div>
        </div>
      )}

      {/* ─── Two-column: Low stock list + Expiry list ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low stock */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-warning/10/50 dark:bg-warning/95/20">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-warning/100" />
              <h2 className="font-semibold text-foreground">
                Low Stock ({lowStock.length})
              </h2>
            </div>
            <Link
              href="/inventory"
              className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </header>
          <ul className="divide-y divide-border max-h-80 overflow-y-auto">
            {lowStock.length === 0 && (
              <li className="px-5 py-6 text-sm text-muted-foreground text-center">
                No low-stock products.
              </li>
            )}
            {lowStock.map((p) => {
              const isOut = p.stockQuantity <= 0;
              const ratio =
                p.minStockLevel > 0 ? p.stockQuantity / p.minStockLevel : 0;
              return (
                <li
                  key={p.id}
                  className="px-5 py-3 hover:bg-accent/40 transition-colors"
                >
                  <Link
                    href={`/inventory/${p.id}`}
                    className="flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku ?? "—"}
                        {p.category ? ` · ${p.category.name}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-semibold ${
                          isOut
                            ? "text-destructive dark:text-destructive/70"
                            : "text-warning dark:text-warning/80"
                        }`}
                      >
                        {formatQty(p.stockQuantity)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        min {formatQty(p.minStockLevel)}
                      </p>
                    </div>
                    {/* Mini stock bar */}
                    <div className="hidden sm:block w-16 shrink-0">
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isOut
                              ? "bg-destructive/100"
                              : ratio < 0.5
                                ? "bg-warning/100"
                                : "bg-yellow-400"
                          }`}
                          style={{
                            width: `${Math.max(4, Math.min(100, ratio * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Expiry alerts */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-warning/10/50 dark:bg-warning/95/20">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-warning/100" />
              <h2 className="font-semibold text-foreground">
                Expiry Alerts ({expiry.length})
              </h2>
            </div>
            <Link
              href="/inventory?filter=expiring"
              className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </header>
          <ul className="divide-y divide-border max-h-80 overflow-y-auto">
            {expiry.length === 0 && (
              <li className="px-5 py-6 text-sm text-muted-foreground text-center">
                No batches expiring within 30 days.
              </li>
            )}
            {expiry.map((a) => {
              const sty = SEVERITY_STYLES[a.severity];
              return (
                <li
                  key={a.batchId}
                  className={`px-5 py-3 border-l-4 ${sty.border} hover:bg-accent/40 transition-colors`}
                >
                  <Link
                    href={`/inventory/${a.productId}`}
                    className="flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {a.productName}
                        </p>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${sty.badge}`}
                        >
                          {sty.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.sku ?? "—"}
                        {a.batchNumber ? ` · Batch ${a.batchNumber}` : ""}
                        {` · ${formatQty(a.quantity)} units`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-foreground">
                        {formatExpiryLabel(a.daysUntilExpiry)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        exp {new Date(a.expiryDate).toLocaleDateString("en-PK")}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ─── KPI tile sub-component ────────────────────────────────────────────────
function KpiTile({
  icon,
  label,
  value,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "amber" | "red" | "orange" | "emerald";
  href: string;
}) {
  const toneClasses = {
    amber: {
      ring: "border-warning/25 dark:border-warning/80",
      bg: "bg-warning/10 dark:bg-warning/95/40",
      iconBg:
        "bg-warning/15 text-warning dark:bg-warning/90 dark:text-warning/70",
      value: "text-warning dark:text-warning/70",
    },
    red: {
      ring: "border-destructive/25 dark:border-destructive/80",
      bg: "bg-destructive/10 dark:bg-destructive/95/40",
      iconBg: "bg-destructive/15 text-destructive dark:bg-destructive/90 dark:text-destructive/60",
      value: "text-destructive dark:text-destructive/60",
    },
    orange: {
      ring: "border-warning/25 dark:border-orange-900",
      bg: "bg-warning/10 dark:bg-warning/95/40",
      iconBg:
        "bg-warning/15 text-warning dark:bg-orange-900 dark:text-warning/70",
      value: "text-warning dark:text-warning/70",
    },
    emerald: {
      ring: "border-success/25 dark:border-emerald-900",
      bg: "bg-success/10 dark:bg-emerald-950/40",
      iconBg:
        "bg-success/15 text-success dark:bg-success/90 dark:text-success/70",
      value: "text-success dark:text-success/70",
    },
  }[tone];

  const dim = value === 0;

  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl border ${toneClasses.ring} ${toneClasses.bg} p-3 transition-all hover:shadow-md hover:-translate-y-0.5 ${
        dim ? "opacity-50" : ""
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses.iconBg}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-xl font-bold ${toneClasses.value}`}>{value}</p>
      </div>
    </Link>
  );
}
