"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Code2 } from "lucide-react";

// ─── Static route registry ──────────────────────────────────────────────
//
// This list is hand-maintained to mirror src/app/api/**/route.ts.
// When you add a new route, add an entry here too. The page itself is a
// plain client component — no server fetch, no auth call — because the
// route list is static and the page is gated by the proxy (manager+ only).

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiRoute {
  method: Method;
  path: string;
  desc: string;
  domain: string;
}

const API_ROUTES: ApiRoute[] = [
  // ─── Auth ────────────────────────────────────────────────────────────
  { domain: "Auth", method: "POST", path: "/api/auth", desc: "Login (email + password)" },
  { domain: "Auth", method: "GET", path: "/api/auth", desc: "Get current session" },
  { domain: "Auth", method: "DELETE", path: "/api/auth", desc: "Logout (clear session cookie)" },
  { domain: "Auth", method: "POST", path: "/api/auth/forgot-password", desc: "Reset password via recovery code" },
  { domain: "Auth", method: "POST", path: "/api/auth/password", desc: "Change password (self-service)" },
  { domain: "Auth", method: "PATCH", path: "/api/auth/store", desc: "Switch active store" },

  // ─── Sales ───────────────────────────────────────────────────────────
  { domain: "Sales", method: "GET", path: "/api/sales", desc: "List sales (paginated, filterable)" },
  { domain: "Sales", method: "POST", path: "/api/sales", desc: "Create a new sale" },
  { domain: "Sales", method: "GET", path: "/api/sales/[id]", desc: "Get sale detail (role-aware)" },
  { domain: "Sales", method: "POST", path: "/api/sales/[id]/return", desc: "Process a return against a sale" },

  // ─── Products ────────────────────────────────────────────────────────
  { domain: "Products", method: "GET", path: "/api/products", desc: "List products (paginated)" },
  { domain: "Products", method: "POST", path: "/api/products", desc: "Create a product" },
  { domain: "Products", method: "GET", path: "/api/products/[id]", desc: "Get product detail" },
  { domain: "Products", method: "PATCH", path: "/api/products/[id]", desc: "Update product fields" },
  { domain: "Products", method: "DELETE", path: "/api/products/[id]", desc: "Delete (deactivate) a product" },
  { domain: "Products", method: "POST", path: "/api/products/import", desc: "Import products from CSV" },
  { domain: "Products", method: "GET", path: "/api/products/export", desc: "Export products as CSV" },

  // ─── Inventory ───────────────────────────────────────────────────────
  { domain: "Inventory", method: "POST", path: "/api/inventory/receive", desc: "Receive stock into a store (creates a batch)" },

  // ─── Customers ───────────────────────────────────────────────────────
  { domain: "Customers", method: "GET", path: "/api/customers", desc: "List customers" },
  { domain: "Customers", method: "POST", path: "/api/customers", desc: "Create a customer" },
  { domain: "Customers", method: "GET", path: "/api/customers/[id]", desc: "Get customer detail (with khata + sales)" },
  { domain: "Customers", method: "PATCH", path: "/api/customers/[id]", desc: "Update customer" },
  { domain: "Customers", method: "DELETE", path: "/api/customers/[id]", desc: "Delete (deactivate) a customer" },
  { domain: "Customers", method: "POST", path: "/api/customers/[id]/khata", desc: "Record a khata payment / advance / adjustment" },

  // ─── Suppliers ───────────────────────────────────────────────────────
  { domain: "Suppliers", method: "GET", path: "/api/suppliers", desc: "List suppliers" },
  { domain: "Suppliers", method: "POST", path: "/api/suppliers", desc: "Create a supplier" },
  { domain: "Suppliers", method: "GET", path: "/api/suppliers/[id]", desc: "Get supplier detail (with ledger)" },
  { domain: "Suppliers", method: "PATCH", path: "/api/suppliers/[id]", desc: "Update supplier" },
  { domain: "Suppliers", method: "DELETE", path: "/api/suppliers/[id]", desc: "Delete (deactivate) a supplier" },
  { domain: "Suppliers", method: "POST", path: "/api/suppliers/[id]/pay", desc: "Pay a supplier (or record a debit/refund)" },

  // ─── Categories & Brands ─────────────────────────────────────────────
  { domain: "Categories", method: "GET", path: "/api/categories", desc: "List categories" },
  { domain: "Categories", method: "POST", path: "/api/categories", desc: "Create a category" },
  { domain: "Categories", method: "PATCH", path: "/api/categories/[id]", desc: "Update category" },
  { domain: "Categories", method: "DELETE", path: "/api/categories/[id]", desc: "Delete category" },

  { domain: "Brands", method: "GET", path: "/api/brands", desc: "List brands" },
  { domain: "Brands", method: "POST", path: "/api/brands", desc: "Create a brand" },
  { domain: "Brands", method: "PATCH", path: "/api/brands/[id]", desc: "Update brand" },
  { domain: "Brands", method: "DELETE", path: "/api/brands/[id]", desc: "Delete brand" },

  // ─── Taxes ───────────────────────────────────────────────────────────
  { domain: "Taxes", method: "GET", path: "/api/taxes", desc: "List tax rates" },
  { domain: "Taxes", method: "POST", path: "/api/taxes", desc: "Create a tax rate" },
  { domain: "Taxes", method: "GET", path: "/api/taxes/[id]", desc: "Get tax detail" },
  { domain: "Taxes", method: "PATCH", path: "/api/taxes/[id]", desc: "Update tax rate" },
  { domain: "Taxes", method: "DELETE", path: "/api/taxes/[id]", desc: "Delete tax rate" },

  // ─── Stores ──────────────────────────────────────────────────────────
  { domain: "Stores", method: "GET", path: "/api/stores", desc: "List stores" },
  { domain: "Stores", method: "POST", path: "/api/stores", desc: "Create a store" },
  { domain: "Stores", method: "PATCH", path: "/api/stores/[id]", desc: "Update store" },
  { domain: "Stores", method: "DELETE", path: "/api/stores/[id]", desc: "Delete (deactivate) a store (owner only)" },

  // ─── Purchases ───────────────────────────────────────────────────────
  { domain: "Purchases", method: "GET", path: "/api/purchases", desc: "List purchase orders" },
  { domain: "Purchases", method: "POST", path: "/api/purchases", desc: "Create a purchase order" },
  { domain: "Purchases", method: "GET", path: "/api/purchases/[id]", desc: "Get purchase order detail" },
  { domain: "Purchases", method: "PATCH", path: "/api/purchases/[id]", desc: "Update purchase order (status / notes)" },
  { domain: "Purchases", method: "DELETE", path: "/api/purchases/[id]", desc: "Delete a draft purchase order" },
  { domain: "Purchases", method: "POST", path: "/api/purchases/[id]/send", desc: "Send purchase order to supplier" },
  { domain: "Purchases", method: "POST", path: "/api/purchases/[id]/receive", desc: "Receive items against a purchase order" },

  // ─── Transfers (stock between stores) ───────────────────────────────
  { domain: "Transfers", method: "GET", path: "/api/transfers", desc: "List stock transfers" },
  { domain: "Transfers", method: "POST", path: "/api/transfers", desc: "Create a stock transfer" },
  { domain: "Transfers", method: "GET", path: "/api/transfers/[id]", desc: "Get transfer detail" },
  { domain: "Transfers", method: "POST", path: "/api/transfers/[id]/dispatch", desc: "Dispatch a transfer (source store)" },
  { domain: "Transfers", method: "POST", path: "/api/transfers/[id]/receive", desc: "Receive a transfer (dest store)" },
  { domain: "Transfers", method: "POST", path: "/api/transfers/[id]/cancel", desc: "Cancel a transfer" },
  { domain: "Transfers", method: "POST", path: "/api/transfers/settle", desc: "Settle a multi-store transfer" },

  // ─── Register Sessions ───────────────────────────────────────────────
  { domain: "Register Sessions", method: "GET", path: "/api/register-sessions", desc: "List register sessions (current + history)" },
  { domain: "Register Sessions", method: "POST", path: "/api/register-sessions", desc: "Open a new register session" },
  { domain: "Register Sessions", method: "GET", path: "/api/register-sessions/[id]", desc: "Get register session detail" },
  { domain: "Register Sessions", method: "PATCH", path: "/api/register-sessions/[id]", desc: "Close a register session" },
  { domain: "Register Sessions", method: "GET", path: "/api/register-sessions/[id]/cash", desc: "List cash in/out transactions" },
  { domain: "Register Sessions", method: "POST", path: "/api/register-sessions/[id]/cash", desc: "Record a cash in / cash out" },

  // ─── Expenses ────────────────────────────────────────────────────────
  { domain: "Expenses", method: "GET", path: "/api/expenses", desc: "List expenses" },
  { domain: "Expenses", method: "POST", path: "/api/expenses", desc: "Create an expense" },
  { domain: "Expenses", method: "DELETE", path: "/api/expenses/[id]", desc: "Delete an expense (reverses the journal entry)" },

  // ─── Payroll ─────────────────────────────────────────────────────────
  { domain: "Payroll", method: "GET", path: "/api/payroll", desc: "List payroll records" },
  { domain: "Payroll", method: "POST", path: "/api/payroll", desc: "Generate payroll for a month" },
  { domain: "Payroll", method: "PATCH", path: "/api/payroll/[id]", desc: "Update payroll (bonus / deduction / status)" },

  // ─── Employees ───────────────────────────────────────────────────────
  { domain: "Employees", method: "GET", path: "/api/employees", desc: "List employees" },
  { domain: "Employees", method: "POST", path: "/api/employees", desc: "Create an employee" },
  { domain: "Employees", method: "GET", path: "/api/employees/[id]", desc: "Get employee detail" },
  { domain: "Employees", method: "PATCH", path: "/api/employees/[id]", desc: "Update employee profile" },
  { domain: "Employees", method: "GET", path: "/api/employees/[id]/leaves", desc: "List leave requests" },
  { domain: "Employees", method: "POST", path: "/api/employees/[id]/leaves", desc: "Apply for leave" },
  { domain: "Employees", method: "PATCH", path: "/api/employees/[id]/leaves", desc: "Approve / reject leave" },
  { domain: "Employees", method: "GET", path: "/api/employees/[id]/attendance", desc: "List attendance records" },
  { domain: "Employees", method: "POST", path: "/api/employees/[id]/attendance", desc: "Record attendance" },
  { domain: "Employees", method: "GET", path: "/api/employees/[id]/advances", desc: "List salary advances" },
  { domain: "Employees", method: "POST", path: "/api/employees/[id]/advances", desc: "Give a salary advance" },
  { domain: "Employees", method: "PATCH", path: "/api/employees/[id]/advances", desc: "Deduct an advance from payroll" },
  { domain: "Employees", method: "GET", path: "/api/employees/[id]/notes", desc: "List employee notes" },
  { domain: "Employees", method: "POST", path: "/api/employees/[id]/notes", desc: "Add a note (warning / appreciation / etc.)" },
  { domain: "Employees", method: "POST", path: "/api/employees/[id]/promote", desc: "Promote an employee (title / role / salary)" },
  { domain: "Employees", method: "POST", path: "/api/employees/[id]/documents", desc: "Upload an employee document" },
  { domain: "Employees", method: "DELETE", path: "/api/employees/[id]/documents/[docId]", desc: "Delete an employee document" },

  // ─── Staff (User accounts) ───────────────────────────────────────────
  { domain: "Staff", method: "GET", path: "/api/staff", desc: "List staff (user accounts with employee links)" },
  { domain: "Staff", method: "POST", path: "/api/staff", desc: "Create a user account + link to employee" },
  { domain: "Staff", method: "GET", path: "/api/users/[id]", desc: "Get a user" },
  { domain: "Staff", method: "PATCH", path: "/api/users/[id]", desc: "Update a user (role / active status)" },
  { domain: "Staff", method: "DELETE", path: "/api/users/[id]", desc: "Delete a user" },
  { domain: "Staff", method: "POST", path: "/api/users/[id]/reset-password", desc: "Admin-triggered password reset" },

  // ─── Dashboard & Reports ─────────────────────────────────────────────
  { domain: "Dashboard", method: "GET", path: "/api/dashboard", desc: "Dashboard summary (KPIs + recent activity)" },

  { domain: "Reports", method: "GET", path: "/api/reports", desc: "List available report types" },
  { domain: "Reports", method: "GET", path: "/api/reports/profit-loss", desc: "Profit & loss report" },
  { domain: "Reports", method: "GET", path: "/api/reports/trial-balance", desc: "Trial balance report" },
  { domain: "Reports", method: "GET", path: "/api/reports/balance-sheet", desc: "Balance sheet report" },

  // ─── Audit Logs ──────────────────────────────────────────────────────
  { domain: "Audit Logs", method: "GET", path: "/api/audit-logs", desc: "List audit logs (filterable)" },

  // ─── Settings ────────────────────────────────────────────────────────
  { domain: "Settings", method: "GET", path: "/api/settings", desc: "Get store settings" },
  { domain: "Settings", method: "PATCH", path: "/api/settings", desc: "Update store settings" },
  { domain: "Settings", method: "GET", path: "/api/settings/pin", desc: "Verify the store PIN (used for protected actions)" },
  { domain: "Settings", method: "POST", path: "/api/settings/pin", desc: "Set the store PIN (first time)" },
  { domain: "Settings", method: "PUT", path: "/api/settings/pin", desc: "Replace the store PIN" },
  { domain: "Settings", method: "PATCH", path: "/api/settings/pin", desc: "Update the store PIN (current + new)" },

  // ─── Accounting ──────────────────────────────────────────────────────
  { domain: "Accounting", method: "GET", path: "/api/accounts", desc: "List chart-of-accounts" },
  { domain: "Accounting", method: "POST", path: "/api/accounts", desc: "Create an account" },
  { domain: "Accounting", method: "GET", path: "/api/accounts/[id]", desc: "Get account detail (with balance)" },
  { domain: "Accounting", method: "PATCH", path: "/api/accounts/[id]", desc: "Update account" },
  { domain: "Accounting", method: "DELETE", path: "/api/accounts/[id]", desc: "Delete account (if unreferenced)" },

  { domain: "Accounting", method: "GET", path: "/api/journal-entries", desc: "List journal entries" },
  { domain: "Accounting", method: "POST", path: "/api/journal-entries", desc: "Create a manual journal entry" },
  { domain: "Accounting", method: "GET", path: "/api/journal-entries/[id]", desc: "Get journal entry detail" },
  { domain: "Accounting", method: "POST", path: "/api/journal-entries/[id]/reverse", desc: "Reverse a journal entry (with reason)" },

  // ─── Cron (Vercel scheduled) ─────────────────────────────────────────
  { domain: "Cron", method: "GET", path: "/api/cron/low-stock-alert", desc: "Daily 9 AM PKT — email + SMS low-stock alert" },
  { domain: "Cron", method: "GET", path: "/api/cron/fbr-retry", desc: "Hourly — retry pending FBR submissions" },

  // ─── System ──────────────────────────────────────────────────────────
  { domain: "System", method: "GET", path: "/api/health", desc: "Health check (no auth required)" },
  { domain: "System", method: "GET", path: "/api/[...not-found]", desc: "Catch-all 404 for unmatched API routes" },
  { domain: "System", method: "POST", path: "/api/[...not-found]", desc: "Catch-all 404 for unmatched API routes" },
  { domain: "System", method: "PUT", path: "/api/[...not-found]", desc: "Catch-all 404 for unmatched API routes" },
  { domain: "System", method: "PATCH", path: "/api/[...not-found]", desc: "Catch-all 404 for unmatched API routes" },
  { domain: "System", method: "DELETE", path: "/api/[...not-found]", desc: "Catch-all 404 for unmatched API routes" },
];

// ─── Method badge styling ────────────────────────────────────────────────
const METHOD_STYLES: Record<Method, string> = {
  GET: "bg-primary/15 text-primary dark:bg-primary/90 dark:text-primary/60",
  POST: "bg-success/15 text-success dark:bg-green-950 dark:text-green-300",
  PUT: "bg-warning/15 text-warning dark:bg-warning/95 dark:text-warning",
  PATCH: "bg-warning/15 text-warning dark:bg-warning/95 dark:text-warning/70",
  DELETE: "bg-destructive/15 text-destructive dark:bg-destructive/95 dark:text-destructive/60",
};

const METHOD_COUNT_COLOR: Record<Method, string> = {
  GET: "text-primary dark:text-primary/70",
  POST: "text-success dark:text-success/70",
  PUT: "text-warning dark:text-warning/80",
  PATCH: "text-warning dark:text-warning/80",
  DELETE: "text-destructive dark:text-destructive/70",
};

export default function ApiDocsPage() {
  const [query, setQuery] = useState("");
  const [activeDomain, setActiveDomain] = useState<string>("All");

  const domains = useMemo(() => {
    const set = new Set<string>();
    API_ROUTES.forEach((r) => set.add(r.domain));
    return ["All", ...Array.from(set).sort()];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return API_ROUTES.filter((r) => {
      if (activeDomain !== "All" && r.domain !== activeDomain) return false;
      if (!q) return true;
      return (
        r.path.toLowerCase().includes(q) ||
        r.desc.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q) ||
        r.domain.toLowerCase().includes(q)
      );
    });
  }, [query, activeDomain]);

  // Group the filtered routes by domain for display
  const grouped = useMemo(() => {
    const map = new Map<string, ApiRoute[]>();
    for (const r of filtered) {
      const arr = map.get(r.domain) ?? [];
      arr.push(r);
      map.set(r.domain, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const methodCounts = useMemo(() => {
    const counts: Record<Method, number> = {
      GET: 0,
      POST: 0,
      PUT: 0,
      PATCH: 0,
      DELETE: 0,
    };
    API_ROUTES.forEach((r) => {
      counts[r.method] += 1;
    });
    return counts;
  }, []);

  return (
    <div
      id="main-content"
      className="min-h-screen bg-background"
    >
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground/80 dark:text-muted-foreground dark:hover:text-foreground text-sm mb-4 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-warning/15 text-warning dark:bg-warning/95 dark:text-warning flex items-center justify-center">
              <Code2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground dark:text-foreground">
                API Documentation
              </h1>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-0.5">
                {API_ROUTES.length} endpoints across {domains.length - 1}{" "}
                domains. Available to manager+ roles only.
              </p>
            </div>
          </div>

          {/* Method legend */}
          <div className="flex flex-wrap gap-3 mt-5">
            {(Object.keys(methodCounts) as Method[]).map((m) => (
              <span
                key={m}
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${METHOD_COUNT_COLOR[m]}`}
              >
                <span
                  className={`inline-block px-2 py-0.5 rounded font-mono font-bold ${METHOD_STYLES[m]}`}
                >
                  {m}
                </span>
                {methodCounts[m]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by path, description, or method…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-border dark:border-border rounded-lg text-sm bg-input/30 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 dark:focus:ring-ring/30 transition"
              aria-label="Search API routes"
            />
          </div>
          <select
            value={activeDomain}
            onChange={(e) => setActiveDomain(e.target.value)}
            className="px-3 py-2 border border-border dark:border-border rounded-lg text-sm bg-input/30 outline-none focus:border-ring transition"
            aria-label="Filter by domain"
          >
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Route table grouped by domain */}
        {grouped.length === 0 ? (
          <div className="bg-card rounded-xl border border-border dark:border-border p-12 text-center">
            <p className="text-muted-foreground dark:text-muted-foreground">
              No routes match your search.
            </p>
          </div>
        ) : (
          <div className="space-y-6 pb-12">
            {grouped.map(([domain, routes]) => (
              <section key={domain}>
                <h2 className="text-sm font-semibold text-foreground/80 dark:text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {domain}{" "}
                  <span className="text-muted-foreground dark:text-muted-foreground/60 font-normal normal-case">
                    ({routes.length})
                  </span>
                </h2>
                <div className="bg-card rounded-xl border border-border dark:border-border shadow-soft overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 dark:bg-muted/40 border-b border-border dark:border-border sr-only md:not-sr-only">
                        <tr className="text-left text-muted-foreground dark:text-muted-foreground text-xs uppercase tracking-wider">
                          <th className="px-4 py-3 font-medium w-24">Method</th>
                          <th className="px-4 py-3 font-medium">Path</th>
                          <th className="px-4 py-3 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border dark:divide-border">
                        {routes.map((r) => (
                          <tr
                            key={`${r.method}-${r.path}`}
                            className="hover:bg-muted/40 dark:hover:bg-muted/30 transition"
                          >
                            <td className="px-4 py-3 align-top">
                              <span
                                className={`inline-block px-2 py-0.5 rounded font-mono text-xs font-bold ${METHOD_STYLES[r.method]}`}
                              >
                                {r.method}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <code className="font-mono text-xs md:text-sm text-foreground dark:text-foreground break-all">
                                {r.path}
                              </code>
                            </td>
                            <td className="px-4 py-3 align-top text-foreground/80 dark:text-muted-foreground">
                              {r.desc}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
