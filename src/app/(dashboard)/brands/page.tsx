// src/app/(dashboard)/brands/page.tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Plus,
  Pencil,
  Trash2,
  Tag,
  Loader2,
  AlertCircle,
  X,
  RotateCcw,
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/fetcher";
import { toast } from "sonner";
import { PageContainer, PageHeader, EmptyState } from "@/components/layout/PageContainer";
import { PaginationBar, type PaginationMeta } from "@/components/ui/pagination";

interface Brand {
  id: string;
  name: string;
  isActive: boolean;
  _count?: { products: number };
  store?: { name: string } | null;
}

export default function BrandsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Fetch Brands (paginated)
  const { data, error: fetchError, isLoading, mutate } = useSWR<{
    brands: Brand[];
  } & PaginationMeta>(
    `/api/brands?includeInactive=${includeInactive ? "true" : "false"}&page=${page}&limit=${limit}`,
    (url: string) =>
      apiGet<{ brands: Brand[] } & PaginationMeta>(url) as Promise<
        { brands: Brand[] } & PaginationMeta
      >,
  );
  const brands = data?.brands || [];
  const meta: PaginationMeta | null = data
    ? {
        page: data.page ?? 1,
        limit: data.limit ?? limit,
        total: data.total ?? 0,
        pages: data.pages ?? 0,
        hasNext: data.hasNext ?? false,
        hasPrev: data.hasPrev ?? false,
      }
    : null;

  // Reset to page 1 when filter changes
  function toggleIncludeInactive(v: boolean) {
    setIncludeInactive(v);
    setPage(1);
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: "" });
    setError("");
    setShowModal(true);
  }

  function openEdit(b: Brand) {
    setEditing(b);
    setForm({ name: b.name });
    setError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError("Brand name is required");
      return;
    }
    if (form.name.trim().length > 100) {
      setError("Name must be under 100 characters");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = { name: form.name.trim() };

      if (editing) {
        await apiPatch(`/api/brands/${editing.id}`, payload, {
          showToast: false,
        });
        toast.success("Brand updated successfully");
      } else {
        await apiPost("/api/brands", payload, { showToast: false });
        toast.success("Brand created successfully");
      }
      setShowModal(false);
      mutate(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(b: Brand) {
    if ((b._count?.products ?? 0) > 0) {
      toast.error(
        `Cannot delete — this brand has ${b._count?.products} product(s). Reassign them first.`,
      );
      return;
    }
    if (!confirm("Delete this brand?")) return;

    try {
      await apiDelete(`/api/brands/${b.id}`);
      toast.success("Brand deactivated successfully");
      mutate(); // Refresh list
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete brand",
      );
    }
  }

  async function handleReactivate(b: Brand) {
    try {
      await apiPatch(`/api/brands/${b.id}`, { isActive: true });
      toast.success(`Brand "${b.name}" reactivated`);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reactivate brand",
      );
    }
  }

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PageContainer>
    );
  }

  if (fetchError) {
    return (
      <PageContainer>
        <div className="flex items-center gap-2 text-destructive dark:text-destructive/70 bg-destructive/10 dark:bg-destructive/95/40 px-4 py-3 rounded-xl border border-destructive/25 dark:border-destructive/80">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{fetchError.message}</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Brands"
        description="Manage product brands (e.g., National, Shan, Olpers)"
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => toggleIncludeInactive(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="hidden sm:inline">Show Inactive</span>
              <span className="sm:hidden">Inactive</span>
            </label>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Brand</span><span className="sm:hidden">Add</span>
            </button>
          </>
        }
      />

      {/* Grid */}
      {brands.length === 0 ? (
        <EmptyState
          icon={<Tag className="w-5 h-5" />}
          title="No brands yet"
          description="Add your first brand to organise products"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {brands.map((b) => (
              <div
                key={b.id}
                className={`bg-card rounded-xl border border-border shadow-soft p-4 hover:shadow-md transition flex flex-col items-center text-center relative group ${
                  !b.isActive ? "opacity-60" : ""
                }`}
              >
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                  <Tag className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground truncate w-full">
                  {b.name}
                </h3>
                {b.store?.name && (
                  <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                    {b.store.name}
                  </span>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {b._count?.products ?? 0} product
                  {(b._count?.products ?? 0) !== 1 ? "s" : ""}
                </p>
                {!b.isActive && (
                  <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                    Inactive
                  </span>
                )}

                {/* Action buttons: always visible on mobile (no hover), hover on desktop */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition bg-background/80 backdrop-blur-sm rounded-lg p-0.5 shadow-soft">
                  <button
                    onClick={() => openEdit(b)}
                    className="flex h-9 w-9 items-center justify-center rounded-md p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary transition"
                    aria-label="Edit brand"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {b.isActive ? (
                    <button
                      onClick={() => handleDelete(b)}
                      className="flex h-9 w-9 items-center justify-center rounded-md p-2 hover:bg-destructive/10 dark:hover:bg-destructive/95/40 text-muted-foreground hover:text-destructive dark:hover:text-destructive/70 transition"
                      aria-label="Delete brand"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(b)}
                      className="flex h-9 w-9 items-center justify-center rounded-md p-2 hover:bg-success/10 dark:hover:bg-emerald-950/40 text-muted-foreground hover:text-success dark:hover:text-success/70 transition"
                      aria-label="Reactivate brand"
                      title="Reactivate"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {meta && <PaginationBar meta={meta} onPageChange={setPage} className="mt-6" />}
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editing ? "Edit Brand" : "Add Brand"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Close brand dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Brand Name *
                </label>
                <input
                  type="text"
                  maxLength={100}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all bg-background text-foreground"
                  placeholder="e.g. National Foods"
                  value={form.name}
                  onChange={(e) => setForm({ name: e.target.value })}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !submitting && handleSubmit()
                  }
                  autoFocus
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive dark:text-destructive/70 text-sm bg-destructive/10 dark:bg-destructive/95/40 px-4 py-3 rounded-xl border border-destructive/25 dark:border-destructive/80">
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
                className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg font-medium transition-all flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : editing ? (
                  "Update"
                ) : (
                  "Add Brand"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
