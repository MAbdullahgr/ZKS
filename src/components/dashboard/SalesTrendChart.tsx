"use client";

import useSWR from "swr";
import { apiGet } from "@/lib/fetcher";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, YAxis, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────
interface TrendPoint {
  date: string;
  revenue: number;
  count: number;
}

interface TrendData {
  days: number;
  trend: TrendPoint[];
  totalRevenue: number;
  totalSales: number;
  avgDailyRevenue: number;
  roleScope: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatRs(n: number): string {
  return "Rs " + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-PK", { day: "numeric", month: "short" });
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────
function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-soft-lg">
      <p className="text-xs font-medium text-foreground">
        {formatDayLabel(point.date)}
      </p>
      <p className="text-sm font-semibold text-primary mt-0.5">
        {formatRs(point.revenue)}
      </p>
      <p className="text-xs text-muted-foreground">
        {point.count} sale{point.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-soft overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="h-4 w-32 shimmer rounded" />
        <div className="h-3 w-20 shimmer rounded" />
      </div>
      <div className="p-5">
        <div className="h-40 w-full shimmer rounded" />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function SalesTrendChart({ showRevenue }: { showRevenue: boolean }) {
  const { data, isLoading } = useSWR<TrendData>(
    "/api/dashboard/sales-trend?days=7",
    (url: string) => apiGet<TrendData>(url) as Promise<TrendData>,
  );

  if (!showRevenue) return null;

  if (isLoading) {
    return (
      <div className="mb-4 sm:mb-6">
        <ChartSkeleton />
      </div>
    );
  }

  if (!data || data.trend.length === 0) return null;

  const hasData = data.totalRevenue > 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-soft overflow-hidden animate-rise mb-4 sm:mb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Sales Trend
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Last {data.days} days
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-foreground tabular-nums">
            {formatRs(data.totalRevenue)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            avg {formatRs(data.avgDailyRevenue)}/day
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4 sm:p-5">
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={data.trend}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
                opacity={0.5}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDayLabel}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)", fontWeight: 500 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval="preserveStartEnd"
                dy={8}
              />
              <YAxis
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
                }
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={35}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#trendGrad)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "var(--chart-1)",
                  stroke: "var(--background)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-44 flex flex-col items-center justify-center text-center">
            <TrendingUp className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No sales in the last {data.days} days
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Sales will appear here once you start making transactions
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
