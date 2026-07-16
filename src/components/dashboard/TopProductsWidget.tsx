"use client";

import useSWR from "swr";
import { apiGet } from "@/lib/fetcher";
import { Package, ArrowUpRight } from "lucide-react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────
interface TopProduct {
  productId: string;
  productName: string;
  revenue: number;
  profit: number;
  quantity: number;
}

interface ReportData {
  topProducts: TopProduct[];
}

function formatRs(n: number): string {
  return "Rs " + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

// ─── Skeleton ───────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-soft overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border bg-muted/30">
        <div className="h-4 w-32 shimmer rounded" />
      </div>
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 shimmer rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 shimmer rounded" />
              <div className="h-2 w-20 shimmer rounded" />
            </div>
            <div className="h-4 w-16 shimmer rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function TopProductsWidget() {
  const { data, isLoading } = useSWR<ReportData>(
    "/api/reports?period=30",
    (url: string) => apiGet<ReportData>(url) as Promise<ReportData>,
  );

  if (isLoading) {
    return (
      <div className="mb-4 sm:mb-6">
        <Skeleton />
      </div>
    );
  }

  const products = data?.topProducts?.slice(0, 5) ?? [];

  if (products.length === 0) return null;

  const maxRevenue = Math.max(...products.map((p) => p.revenue), 1);

  return (
    <div className="rounded-xl border border-border bg-card shadow-soft overflow-hidden animate-rise">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Top Products
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Last 30 days by revenue
            </p>
          </div>
        </div>
        <Link
          href="/reports"
          className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
        >
          View all <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Product List with revenue bars */}
      <div className="p-4 space-y-3">
        {products.map((product, idx) => {
          const widthPct = Math.max((product.revenue / maxRevenue) * 100, 8);
          return (
            <div key={product.productId} className="group">
              <div className="flex items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground truncate">
                    {product.productName}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {formatRs(product.revenue)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {product.quantity} sold
                  </p>
                </div>
              </div>
              {/* Revenue bar */}
              <div className="ml-8 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-500"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
