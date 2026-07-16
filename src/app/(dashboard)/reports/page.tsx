"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  TrendingUp,
  DollarSign,
  Users,
  AlertTriangle,
  Package,
  Receipt,
  Printer,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { apiGet } from "@/lib/fetcher";

interface ReportData {
  period: number;
  summary: {
    totalRevenue: number;
    totalProfit: number;
    totalSales: number;
    avgSaleValue: number;
    profitMargin: number;
    totalOutstanding: number;
    totalCustomers: number;
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
    inventoryCostValue: number;
    inventoryRetailValue: number;
    potentialProfit: number;
  };
  dailySales: { date: string; revenue: number; count: number }[];
  topProducts: {
    productId: string; // FIX: Changed to string
    productName: string;
    revenue: number;
    profit: number;
    quantity: number;
  }[];
  paymentBreakdown: { method: string; total: number; count: number }[];
  lowStockProducts: {
    id: string; // FIX: Changed to string
    name: string;
    stockQuantity: number;
    minStockLevel: number;
    unit: string;
  }[];
}

const PERIODS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Last year", value: "365" },
];

// Chart colors aligned with the emerald design system.
// Use CSS variables so charts adapt to light/dark mode automatically.
const CHART_PRIMARY = "var(--chart-1)";
const CHART_GRID = "var(--border)";
const CHART_TEXT = "var(--muted-foreground)";
const CHART_TEXT_STRONG = "var(--foreground)";
const PIE_COLORS = [
  "var(--chart-1)", // emerald
  "var(--chart-2)", // amber
  "var(--chart-3)", // info
  "var(--chart-4)", // purple
  "var(--chart-5)", // orange
];

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-soft p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div
          className={`${color} w-9 h-9 rounded-lg flex items-center justify-center`}
        >
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-1">{sub}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState("30");

  // FIX: Use SWR for data fetching
  const {
    data,
    error: fetchError,
    isLoading,
  } = useSWR<ReportData>(
    `/api/reports?period=${period}`,
    (url: string) => apiGet<ReportData>(url) as Promise<ReportData>,
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-5 animate-pulse"
            >
              <div className="h-4 bg-muted rounded mb-3 w-24" />
              <div className="h-8 bg-muted rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // FIX P3-6: Show a helpful message when in All Stores mode instead of the
  // generic "Failed to load reports" error. The reports API requires a store.
  if (fetchError) {
    const isAllStoresMode =
      fetchError.status === 400 || fetchError.status === 403;
    if (isAllStoresMode) {
      return (
        <div className="p-6 max-w-7xl mx-auto">
          <div className="rounded-xl border border-warning/25 bg-warning/10 p-8 text-center">
            <p className="text-lg font-bold text-warning">
              Please select a specific store
            </p>
            <p className="mt-2 text-sm text-warning">
              Reports are not available in &quot;All Stores&quot; mode. Use the
              store selector in the top bar to pick a specific store.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-destructive">
          {fetchError.message || "Failed to load reports"}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-destructive">Failed to load reports</p>
      </div>
    );
  }

  const {
    summary,
    dailySales,
    topProducts,
    paymentBreakdown,
    lowStockProducts,
  } = data;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground text-sm">Business performance overview</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/reports/daily-z"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-foreground/90 text-white hover:bg-foreground/80 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            Daily Z-Report
          </Link>
          <div className="flex gap-1 bg-muted p-1 rounded-lg overflow-x-auto no-scrollbar">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                  period === p.value
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground/90"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard
          label="Total Revenue"
          value={`Rs. ${summary.totalRevenue.toLocaleString()}`}
          sub={`${summary.totalSales} sales`}
          icon={DollarSign}
          color="bg-primary/100"
        />
        <StatCard
          label="Gross Profit"
          value={`Rs. ${summary.grossProfit.toLocaleString()}`}
          sub={`${summary.profitMargin.toFixed(1)}% margin`}
          icon={TrendingUp}
          color="bg-success/100"
        />
        <StatCard
          label="Total Expenses"
          value={`Rs. ${summary.totalExpenses.toLocaleString()}`}
          sub="Operating costs"
          icon={Receipt}
          color="bg-destructive"
        />
        <StatCard
          label="Net Profit"
          value={`Rs. ${summary.netProfit.toLocaleString()}`}
          sub="Revenue − Expenses"
          icon={TrendingUp}
          color="bg-success"
        />
        <StatCard
          label="Outstanding Khata"
          value={`Rs. ${summary.totalOutstanding.toLocaleString()}`}
          sub={`${summary.totalCustomers} customers`}
          icon={Users}
          color="bg-warning/100"
        />
      </div>

      {/* Inventory Valuation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Inventory Cost Value"
          value={`Rs. ${summary.inventoryCostValue.toLocaleString()}`}
          sub="Capital tied in stock"
          icon={Package}
          color="bg-primary/100"
        />
        <StatCard
          label="Inventory Retail Value"
          value={`Rs. ${summary.inventoryRetailValue.toLocaleString()}`}
          sub="Expected revenue if sold"
          icon={DollarSign}
          color="bg-info"
        />
        <StatCard
          label="Potential Profit"
          value={`Rs. ${summary.potentialProfit.toLocaleString()}`}
          sub="If all stock is sold"
          icon={TrendingUp}
          color="bg-info"
        />
      </div>

      {/* Revenue chart */}
      <div className="bg-card rounded-xl border border-border shadow-soft p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-4">Revenue Over Time</h2>
        {dailySales.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground/70 text-sm">
            No sales data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailySales}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_PRIMARY} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: CHART_TEXT }}
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString("en-PK", {
                    day: "numeric",
                    month: "short",
                  })
                }
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_TEXT }}
                tickFormatter={(v) => `Rs.${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v) => [`Rs. ${v?.toLocaleString()}`, "Revenue"]}
                labelFormatter={(d) =>
                  new Date(d).toLocaleDateString("en-PK", {
                    day: "numeric",
                    month: "long",
                  })
                }
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={CHART_PRIMARY}
                strokeWidth={2}
                fill="url(#revenueGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top Products */}
        <div className="bg-card rounded-xl border border-border shadow-soft p-5">
          <h2 className="font-semibold text-foreground mb-4">
            Top Products by Revenue
          </h2>
          {topProducts.length === 0 ? (
            <p className="text-muted-foreground/70 text-sm text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={CHART_GRID}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: CHART_TEXT }}
                  tickFormatter={(v) => `Rs.${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="productName"
                  tick={{ fontSize: 10, fill: CHART_TEXT_STRONG }}
                  width={100}
                />
                <Tooltip
                  formatter={(v) => [
                    `Rs. ${v ? Number(v).toLocaleString() : 0}`,
                    "Revenue",
                  ]}
                />
                <Bar dataKey="revenue" fill={CHART_PRIMARY} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Payment breakdown */}
        <div className="bg-card rounded-xl border border-border shadow-soft p-5">
          <h2 className="font-semibold text-foreground mb-4">Payment Methods</h2>
          {paymentBreakdown.length === 0 ? (
            <p className="text-muted-foreground/70 text-sm text-center py-8">No data</p>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie
                    data={paymentBreakdown}
                    dataKey="total"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                  >
                    {paymentBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [
                      `Rs. ${v ? Number(v).toLocaleString() : 0}`,
                      "",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {paymentBreakdown.map((p, i) => (
                  <div key={p.method} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{
                        backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground/90 capitalize">
                        {p.method}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        Rs. {p.total.toLocaleString()} · {p.count} sales
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top products table */}
      <div className="bg-card rounded-xl border border-border shadow-soft mb-6">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Product Performance</h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-muted/40 border-b border-border">
            <tr className="text-left text-muted-foreground/70">
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium text-right">Units Sold</th>
              <th className="px-4 py-2 font-medium text-right">Revenue</th>
              <th className="px-4 py-2 font-medium text-right">Profit</th>
              <th className="px-4 py-2 font-medium text-right">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {topProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground/70">
                  No sales data for this period
                </td>
              </tr>
            ) : (
              topProducts.map((p) => (
                <tr key={p.productId} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {p.productName}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {p.quantity}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground font-medium">
                    Rs. {p.revenue.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-success font-medium">
                    Rs. {p.profit.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.revenue > 0 && p.profit / p.revenue > 0.2 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {p.revenue > 0
                        ? ((p.profit / p.revenue) * 100).toFixed(1)
                        : 0}
                      %
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Low stock warning */}
      {lowStockProducts.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-soft">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <h2 className="font-semibold text-foreground">Low Stock Alert</h2>
          </div>
          <div className="divide-y divide-border">
            {lowStockProducts.map((p) => (
              <div
                key={p.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <p className="text-sm font-medium text-foreground">{p.name}</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {p.stockQuantity} {p.unit} left
                  </span>
                  {p.stockQuantity === 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-destructive/15 text-destructive font-medium">
                      Out of Stock
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-warning/15 text-warning font-medium">
                      Low Stock
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
