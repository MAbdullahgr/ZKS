"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Tag,
  Loader2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { apiPost, apiPatch, apiDelete } from "@/lib/fetcher";
import { toast } from "sonner";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";
import { PageContainer, PageHeader } from "@/components/layout/PageContainer";

interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count?: { products: number };
  store?: { name: string } | null;
}

const emptyForm = { name: "", description: "" };

export default function CategoriesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Unified paginated list (fixes F1/F5/F6).
  // /api/categories does NOT support ?search= — omit search.
  // Pass counts=true (always needed for product counts) + includeInactive as filters.
  const {
    items: categories,
    meta,
    isLoading,
    error: fetchError,
    filters,
    setFilter,
    setPage,
    mutate,
  } = usePaginatedList<Category>("/api/categories", "categories", {
    limit: 20,
    filters: { counts: "true", includeInactive: "false" },
  });

  // includeInactive is read from the hook's filter state so toggling it
  // triggers a server re-fetch + page-1 reset (F8).
  const includeInactive = filters.includeInactive === "true";

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, description: c.description ?? "" });
    setError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (form.name.trim().length > 100) {
      setError("Name must be under 100 characters");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
      };

      if (editing) {
        await apiPatch(`/api/categories/${editing.id}`, payload, {
          showToast: false,
        });
        toast.success("Category updated successfully");
      } else {
        await apiPost("/api/categories", payload, { showToast: false });
        toast.success("Category created successfully");
      }
      setShowModal(false);
      mutate(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, productCount: number) {
    if (productCount > 0) {
      toast.error(
        `Cannot delete — this category has ${productCount} product(s). Reassign them first.`,
      );
      return;
    }
    if (!confirm("Delete this category?")) return;

    try {
      await apiDelete(`/api/categories/${id}`);
      toast.success("Category deactivated successfully");
      mutate(); // Refresh list
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete category",
      );
    }
  }

  async function handleReactivate(c: Category) {
    try {
      await apiPatch(`/api/categories/${c.id}`, { isActive: true });
      toast.success(`Category "${c.name}" reactivated`);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reactivate category",
      );
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
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Categories"
        description="Organise your products into categories"
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) =>
                  setFilter("includeInactive", e.target.checked ? "true" : "false")
                }
                className="w-4 h-4 accent-blue-600"
              />
              Show Inactive
            </label>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 active:bg-primary/95 text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            >
              <Plus className="w-4 h-4" /> Add Category
            </button>
          </div>
        }
      />

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-5 animate-pulse"
            >
              <div className="h-10 w-10 bg-muted rounded-lg mb-3" />
              <div className="h-4 bg-muted rounded w-2/3 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {!isLoading && categories.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Tag className="w-10 h-10 text-border mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            {includeInactive ? "No categories found" : "No categories yet"}
          </p>
          <p className="text-muted-foreground/70 text-sm mt-1">
            {includeInactive
              ? "Try disabling the 'Show Inactive' filter"
              : "Add your first category to organise products"}
          </p>
        </div>
      ) : (
        !isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {categories.map((c) => (
              <div
                key={c.id}
                className={`bg-card rounded-xl border border-border shadow-soft p-5 hover:shadow-md transition ${
                  !c.isActive ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-primary/15 rounded-lg flex items-center justify-center">
                    <Tag className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(c)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-primary/10 text-muted-foreground/70 hover:text-primary transition"
                      aria-label="Edit category"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {c.isActive ? (
                      <button
                        onClick={() =>
                          handleDelete(c.id, c._count?.products ?? 0)
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-destructive/10 text-muted-foreground/70 hover:text-destructive transition"
                        aria-label="Delete category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(c)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-success/10 text-muted-foreground/70 hover:text-success transition"
                        aria-label="Reactivate category"
                        title="Reactivate"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
                  {c.name}
                  {c.store?.name && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                      {c.store.name}
                    </span>
                  )}
                </h3>
                {c.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {c.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-muted-foreground/70">
                    {c._count?.products ?? 0} product
                    {(c._count?.products ?? 0) !== 1 ? "s" : ""}
                  </p>
                  {c.isActive ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Pagination */}
      {meta && <PaginationBar meta={meta} onPageChange={setPage} className="pt-4" />}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {editing ? "Edit Category" : "Add Category"}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  maxLength={100}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all"
                  placeholder="e.g. Beverages, Grocery, Household"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" && !submitting && handleSubmit()
                  }
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Description
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all resize-none"
                  placeholder="Optional description"
                  rows={3}
                  maxLength={500}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                disabled={submitting}
                className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:text-foreground transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 active:bg-primary/95 disabled:opacity-50 text-primary-foreground rounded-lg font-medium transition-all flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting
                  ? "Saving..."
                  : editing
                    ? "Update"
                    : "Add Category"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
