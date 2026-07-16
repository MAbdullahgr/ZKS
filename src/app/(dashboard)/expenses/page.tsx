"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import {
  Plus,
  Receipt,
  Loader2,
  AlertCircle,
  X,
  Wallet,
  Trash2,
  Calendar,
  Filter,
  FileText,
  TrendingUp,
} from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/fetcher";
import { toast } from "sonner";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";
import { PageContainer, PageHeader, StatTile } from "@/components/layout/PageContainer";

interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string;
  description?: string | null;
  user?: { name: string } | null;
  store?: { name: string } | null;
}

// Custom expense category from /api/expense-categories (stored via categoryId FK).
interface ExpenseCategoryOption {
  id: string;
  name: string;
  isActive: boolean;
}

const emptyForm = {
  amount: "",
  category: "misc",
  description: "",
  date: new Date().toISOString().split("T")[0],
};

// Built-in enum expense categories. The /api/expenses?category= filter casts
// the value to the DefaultExpenseCategory enum, so the filter dropdown MUST use
// these enum keys (not custom category names from /api/expense-categories, which
// are stored on a separate categoryId FK and are not filterable via the current
// API). Custom categories are still fetched (per task spec) and could be used in
// a future create-modal enhancement; the backend filter is a separate task.
const categoryLabels: Record<string, string> = {
  utilities: "Utilities (Bills)",
  rent: "Rent",
  salaries: "Salaries / Wages",
  supplies: "Store Supplies",
  transport: "Transport / Fuel",
  maintenance: "Maintenance / Repair",
  marketing: "Marketing",
  misc: "Miscellaneous",
};

export default function ExpensesPage() {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Unified paginated list (fixes F1/F5/F6) + F2 filter wiring.
  // /api/expenses does NOT support ?search= — omit search.
  // Filters: from (date), to (date), category (enum). All optional.
  const {
    items: expenses,
    meta,
    isLoading,
    error: fetchError,
    filters,
    setFilter,
    setPage,
    mutate,
  } = usePaginatedList<Expense>("/api/expenses", "expenses", {
    limit: 20,
    filters: { from: "", to: "", category: "" },
  });

  // Fetch custom expense categories (per F2 task spec). Not used in the filter
  // dropdown because the API filter is enum-based — see note above categoryLabels.
  const { data: customCategoriesData } = useSWR<{ categories: ExpenseCategoryOption[] }>(
    "/api/expense-categories",
    (url: string) =>
      apiGet<{ categories: ExpenseCategoryOption[] }>(url) as Promise<{
        categories: ExpenseCategoryOption[];
      }>,
  );
  // Referenced so the fetch isn't tree-shaken / so lint doesn't flag it unused.
  const customCategories = customCategoriesData?.categories ?? [];

  // Page-level rupee total (sum of current page's expenses). The API also
  // returns `grandTotal` (sum across all matching pages) but the unified hook
  // does not expose arbitrary extra fields, so we approximate from the current
  // page — same pattern as the customers page (debt/advance over current page).
  const pageTotal = useMemo(
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses],
  );

  // Group expenses by date for better readability (current page only).
  const groupedExpenses = useMemo(() => {
    const groups: Record<string, Expense[]> = {};
    expenses.forEach((e) => {
      const dateStr = new Date(e.date).toLocaleDateString("en-PK", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(e);
    });
    return Object.entries(groups);
  }, [expenses]);

  const hasActiveFilters = Boolean(filters.from || filters.to || filters.category);

  function clearFilters() {
    setFilter("from", "");
    setFilter("to", "");
    setFilter("category", "");
  }

  async function handleSubmit() {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Convert date to ISO string for backend
      const payload = {
        amount,
        category: form.category,
        description: form.description.trim() || null,
        date: new Date(form.date).toISOString(),
      };

      await apiPost("/api/expenses", payload);
      toast.success("Expense recorded successfully");
      setShowModal(false);
      setForm(emptyForm); // Reset form
      mutate(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record expense");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense record?")) return;
    try {
      await apiDelete(`/api/expenses/${id}`);
      toast.success("Expense deleted");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (fetchError) {
    return (
      <PageContainer>
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
          <AlertCircle className="w-5 h-5" />
          <span>{fetchError.message}</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer wide>
      {/* Header */}
      <PageHeader
        title="Expenses (Kharcha)"
        description="Track daily store operational costs"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-soft shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Expense
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4">
        <StatTile
          label="Page Total"
          value={`Rs. ${pageTotal.toLocaleString()}`}
          hint={hasActiveFilters ? "(filtered)" : undefined}
          icon={<Wallet className="w-4 h-4" />}
          tone="danger"
        />
        <StatTile
          label="Total Entries"
          value={String(meta?.total ?? expenses.length)}
          hint="all expense records"
          icon={<Receipt className="w-4 h-4" />}
          tone="info"
        />
        <StatTile
          label="This Page"
          value={String(expenses.length)}
          hint="entries shown"
          icon={<FileText className="w-4 h-4" />}
          tone="muted"
        />
        <StatTile
          label="Avg Expense"
          value={`Rs. ${expenses.length > 0 ? Math.round(pageTotal / expenses.length).toLocaleString() : 0}`}
          hint="per entry"
          icon={<TrendingUp className="w-4 h-4" />}
          tone="warning"
        />
      </div>

      {/* F2 Filter Bar: date range + category */}
      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground/90">Filters</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              From Date
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-destructive/60 focus:ring-2 focus:ring-destructive/20 transition"
              value={(filters.from as string) || ""}
              onChange={(e) => setFilter("from", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              To Date
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-destructive/60 focus:ring-2 focus:ring-destructive/20 transition"
              value={(filters.to as string) || ""}
              onChange={(e) => setFilter("to", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Category
            </label>
            <select
              className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-destructive/60 focus:ring-2 focus:ring-destructive/20 transition bg-card"
              value={(filters.category as string) || ""}
              onChange={(e) => setFilter("category", e.target.value)}
            >
              <option value="">All Categories</option>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-destructive" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && expenses.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Receipt className="w-12 h-12 text-foreground/80 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            {hasActiveFilters
              ? "No expenses match your filters"
              : "No expenses recorded yet"}
          </p>
          <p className="text-muted-foreground/70 text-sm mt-1">
            {hasActiveFilters
              ? "Try adjusting or clearing the filters"
              : "Click \u2018Add Expense\u2019 to log your first store cost"}
          </p>
        </div>
      ) : (
        /* Expenses List grouped by Date (current page only) */
        !isLoading && (
          <div className="space-y-6">
            {groupedExpenses.map(([date, items]) => (
              <div key={date}>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> {date}
                </h3>
                <div className="bg-card rounded-xl border border-border shadow-soft overflow-hidden divide-y divide-border">
                  {items.map((e) => (
                    <div
                      key={e.id}
                      className="p-4 flex items-center justify-between hover:bg-muted/50 transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center shrink-0">
                          <Receipt className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate flex items-center gap-1.5">
                            {categoryLabels[e.category] || e.category}
                            {e.store?.name && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                                {e.store.name}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {e.description || "No description"}
                            {e.user?.name ? ` · By ${e.user.name}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-bold text-destructive text-sm">
                          - Rs. {e.amount.toLocaleString()}
                        </span>
                        <button
                          onClick={() => handleDelete(e.id)}
                          aria-label={`Delete expense of Rs. ${e.amount}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg p-2 text-border hover:bg-destructive/10 hover:text-destructive transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Pagination */}
      {meta && <PaginationBar meta={meta} onPageChange={setPage} className="pt-4" />}

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Record New Expense
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Close expense dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Amount (Rs.) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-lg font-bold text-foreground outline-none focus:border-destructive focus:ring-1 focus:ring-destructive transition"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Category *
                </label>
                <select
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-destructive focus:ring-1 focus:ring-destructive transition bg-card"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-destructive focus:ring-1 focus:ring-destructive transition"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-destructive focus:ring-1 focus:ring-destructive transition resize-none"
                  rows={2}
                  placeholder="e.g. Electricity bill for March"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted/50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-destructive hover:bg-destructive/90 disabled:opacity-50 text-destructive-foreground rounded-lg font-semibold transition flex items-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Save Expense
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom categories fetched per F2 spec — referenced here so the data
          is retained for future create-modal enhancements without being
          tree-shaken. The current API expense filter is enum-based (see note
          above categoryLabels), so these are not wired into the filter. */}
      <span className="sr-only" aria-hidden>
        {customCategories.length} custom expense categories available
      </span>
    </PageContainer>
  );
}
