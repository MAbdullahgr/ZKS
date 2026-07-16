"use client";

import {
  ScrollText,
  Loader2,
  AlertCircle,
  Filter,
  X,
} from "lucide-react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";

interface AuditLog {
  id: string;
  userId: string | null;
  storeId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: {
    email: string;
    employee?: { name: string | null } | null;
  } | null;
  store?: { name: string } | null;
}

const actionColors: Record<string, string> = {
  LOGIN_SUCCESS: "bg-success/15 text-success",
  LOGIN_FAILED: "bg-destructive/15 text-destructive",
  LOGOUT: "bg-muted text-foreground",
  FIRST_SETUP: "bg-info/15 text-info",
  SALE_CREATED: "bg-primary/15 text-primary",
  SALE_RETURNED: "bg-warning/15 text-warning",
  PRODUCT_CREATED: "bg-primary/15 text-primary",
  PRODUCT_UPDATED: "bg-primary/15 text-primary",
  PRODUCT_DELETED: "bg-destructive/15 text-destructive",
  STOCK_RECEIVED: "bg-success/15 text-success",
  PURCHASE_ORDER_CREATED: "bg-violet-100 text-violet-800",
  PURCHASE_ORDER_RECEIVED: "bg-violet-100 text-violet-800",
  EXPENSE_RECORDED: "bg-warning/15 text-orange-800",
  EXPENSE_DELETED: "bg-destructive/15 text-destructive",
  USER_CREATED: "bg-info/15 text-info",
  USER_UPDATED: "bg-info/15 text-info",
  USER_DELETED: "bg-destructive/15 text-destructive",
  STAFF_CREATED: "bg-info/15 text-info",
  EMPLOYEE_CREATED: "bg-info/15 text-info",
  PIN_CHANGED: "bg-info/15 text-info",
  REGISTER_OPENED: "bg-success/15 text-success",
  REGISTER_CLOSED: "bg-success/15 text-success",
  CASH_IN: "bg-success/15 text-success",
  CASH_OUT: "bg-warning/15 text-orange-800",
};

const PAGE_SIZE = 20;

export default function AuditLogsPage() {
  // AUDIT-FIX F7: the old "search" box actually set the action filter —
  // misleading. Now the API supports real text ?search= (on action +
  // entityType), so the search box does free-text search, and the action
  // filter is a separate dropdown. usePaginatedList handles debounce +
  // page-reset + empty-page recovery.
  const {
    items: logs,
    meta,
    isLoading,
    error,
    search: searchInput,
    setSearch: setSearchInput,
    filters,
    setFilter,
    setPage,
    resetFilters,
  } = usePaginatedList<AuditLog>("/api/audit-logs", "logs", {
    search: true,
    limit: PAGE_SIZE,
    filters: { entityType: "" },
  });

  const entityFilter = (filters.entityType as string) ?? "";

  const total = meta?.total ?? 0;

  const formatDetails = (details: unknown): string => {
    if (!details || typeof details !== "object") return "-";
    try {
      const obj = details as Record<string, unknown>;
      const parts: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "string" || typeof value === "number") {
          parts.push(`${key}: ${value}`);
        }
      }
      return parts.length > 0 ? parts.join(", ") : "-";
    } catch {
      return "-";
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ScrollText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
            <p className="text-sm text-muted-foreground">
              Track every action across the system
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Filters:
            </span>
          </div>
          <input
            type="text"
            placeholder="Search actions or entities (e.g. SALE, login, Product)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 min-w-50 rounded-lg border border-border bg-background pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 relative"
          />
          <select
            value={entityFilter}
            onChange={(e) => setFilter("entityType", e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">All Entities</option>
            <option value="Sale">Sales</option>
            <option value="SaleReturn">Returns</option>
            <option value="Product">Products</option>
            <option value="PurchaseOrder">Purchases</option>
            <option value="Expense">Expenses</option>
            <option value="User">Users</option>
            <option value="Employee">Employees</option>
            <option value="RegisterSession">Register</option>
            <option value="Customer">Customers</option>
            <option value="Supplier">Suppliers</option>
            <option value="Settings">Settings</option>
          </select>
          {(searchInput || entityFilter) && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>

        {/* Stats bar */}
        <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {logs.length} of {total} log entries
          </span>
          {meta && meta.pages > 1 && (
            <span>
              Page {meta.page} of {meta.pages}
            </span>
          )}
        </div>

        {/* Loading / Error / Empty states */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "Failed to load audit logs"}
            </p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <ScrollText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No audit logs found</p>
          </div>
        ) : (
          <>
            {/* Logs table — Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Date &amp; Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Store
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Entity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Details
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      IP Address
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                        {log.user?.employee?.name || log.user?.email || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {log.store?.name || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            actionColors[log.action] ||
                            "bg-muted text-foreground"
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {log.entityType || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                        {formatDetails(log.details)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                        {log.ipAddress || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-card rounded-lg border border-border p-3 shadow-soft space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        actionColors[log.action] || "bg-muted text-foreground"
                      }`}
                    >
                      {log.action}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-foreground">
                      <span className="text-muted-foreground">User:</span>{" "}
                      {log.user?.employee?.name || log.user?.email || "-"}
                    </p>
                    <p className="text-muted-foreground">
                      <span>Entity:</span>{" "}
                      {log.entityType || "-"}
                      {log.store?.name && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                          {log.store.name}
                        </span>
                      )}
                    </p>
                    {log.ipAddress && (
                      <p className="text-muted-foreground font-mono">
                        IP: {log.ipAddress}
                      </p>
                    )}
                    {formatDetails(log.details) !== "-" && (
                      <p className="text-muted-foreground pt-1 border-t border-border">
                        {formatDetails(log.details)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination — AUDIT-FIX F5: shared PaginationBar */}
            {meta && (
              <PaginationBar meta={meta} onPageChange={setPage} className="mt-6" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
