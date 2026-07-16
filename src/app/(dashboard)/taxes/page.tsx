"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Percent,
  Loader2,
  AlertCircle,
  X,
  RotateCcw,
} from "lucide-react";
import { apiPost, apiPatch, apiDelete } from "@/lib/fetcher";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";
import { PageContainer, PageHeader } from "@/components/layout/PageContainer";

interface Tax {
  id: string;
  name: string;
  rate: number;
  type: "standard" | "fixed" | "exempt" | "zero_rated";
  fbrCode: string | null;
  description: string | null;
  isActive: boolean;
  _count?: { products: number };
  store?: { name: string } | null;
}

const TAX_TYPE_LABELS: Record<Tax["type"], string> = {
  standard: "Standard",
  fixed: "Fixed",
  exempt: "Exempt",
  zero_rated: "Zero Rated",
};

const TAX_TYPE_COLORS: Record<Tax["type"], string> = {
  standard: "bg-success/15 text-success",
  fixed: "bg-sky-100 text-sky-700",
  exempt: "bg-muted text-foreground/90",
  zero_rated: "bg-warning/15 text-warning",
};

const emptyForm = {
  name: "",
  rate: 0,
  type: "standard" as Tax["type"],
  fbrCode: "",
  description: "",
  isActive: true,
};

export default function TaxesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tax | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Unified paginated list (fixes F1/F5/F6).
  // /api/taxes does NOT support ?search= — omit search.
  // includeInactive is passed as a filter so toggling it re-fetches + resets page (F8).
  const {
    items: taxes,
    meta,
    isLoading,
    error: fetchError,
    filters,
    setFilter,
    setPage,
    mutate,
  } = usePaginatedList<Tax>("/api/taxes", "taxes", {
    limit: 20,
    filters: { includeInactive: "false" },
  });

  const includeInactive = filters.includeInactive === "true";

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function openEdit(t: Tax) {
    setEditing(t);
    setForm({
      name: t.name,
      rate: t.rate,
      type: t.type,
      fbrCode: t.fbrCode ?? "",
      description: t.description ?? "",
      isActive: t.isActive,
    });
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
    if (form.rate < 0 || form.rate > 100) {
      setError("Rate must be between 0 and 100");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        rate: form.rate,
        type: form.type,
        fbrCode: form.fbrCode.trim() || null,
        description: form.description.trim() || null,
        isActive: form.isActive,
      };

      if (editing) {
        await apiPatch(`/api/taxes/${editing.id}`, payload, {
          showToast: false,
        });
        toast.success("Tax updated successfully");
      } else {
        await apiPost("/api/taxes", payload, { showToast: false });
        toast.success("Tax created successfully");
      }
      setShowModal(false);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(t: Tax) {
    if (t._count && t._count.products > 0) {
      toast.error(
        `Cannot delete — ${t._count.products} product(s) are using this tax. Reassign them first.`,
      );
      return;
    }
    if (!confirm(`Deactivate tax "${t.name}"?`)) return;

    try {
      await apiDelete(`/api/taxes/${t.id}`);
      toast.success("Tax deactivated successfully");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tax");
    }
  }

  async function handleReactivate(t: Tax) {
    try {
      await apiPatch(`/api/taxes/${t.id}`, { isActive: true });
      toast.success(`Tax "${t.name}" reactivated`);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reactivate tax",
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
        title="Tax Rates"
        description="Configure per-product taxes (FBR-compliant)"
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) =>
                  setFilter("includeInactive", e.target.checked ? "true" : "false")
                }
                className="w-4 h-4 accent-emerald-600"
              />
              Show Inactive
            </label>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-success hover:bg-success/90 active:bg-success/85 text-success-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            >
              <Plus className="w-4 h-4" /> Add Tax
            </button>
          </div>
        }
      />

      {/* Table */}
      {isLoading ? (
        <div className="bg-card rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-success" />
          </div>
        </div>
      ) : taxes.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Percent className="w-10 h-10 text-border mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            {includeInactive ? "No tax rates found" : "No tax rates configured"}
          </p>
          <p className="text-muted-foreground/70 text-sm mt-1">
            {includeInactive
              ? "Try disabling the 'Show Inactive' filter"
              : "Add a tax rate (e.g. Standard 17%) to apply to products"}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Store</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-right px-4 py-3 font-medium">Rate</th>
                  <th className="text-left px-4 py-3 font-medium">FBR Code</th>
                  <th className="text-right px-4 py-3 font-medium">Products</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {taxes.map((t) => (
                  <tr
                    key={t.id}
                    className={`hover:bg-muted/50 transition ${
                      !t.isActive ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {t.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.store?.name ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium border border-border">
                          {t.store.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          TAX_TYPE_COLORS[t.type]
                        }`}
                      >
                        {TAX_TYPE_LABELS[t.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {t.type === "exempt" || t.type === "zero_rated"
                        ? "—"
                        : `${t.rate}%`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.fbrCode || "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {t._count?.products ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.isActive ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(t)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-success/10 text-muted-foreground/70 hover:text-success transition"
                          aria-label="Edit tax"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {!t.isActive ? (
                          <button
                            onClick={() => handleReactivate(t)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-success/10 text-muted-foreground/70 hover:text-success transition"
                            aria-label="Reactivate tax"
                            title="Reactivate"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDelete(t)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-destructive/10 text-muted-foreground/70 hover:text-destructive transition"
                            aria-label="Delete tax"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {meta && <PaginationBar meta={meta} onPageChange={setPage} className="pt-4" />}

      {/* Modal */}
      <Dialog
        open={showModal}
        onOpenChange={(open) => {
          // Dialog calls onOpenChange(false) on Escape / overlay click / X.
          // Guard against closing while submitting.
          if (!open && !submitting) setShowModal(false);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[90vh] gap-0 overflow-y-auto rounded-2xl bg-card p-0 sm:max-w-md"
        >
          <div className="flex items-center justify-between border-b border-border p-6 sticky top-0 bg-card rounded-t-2xl">
            <DialogHeader className="mb-0">
              <DialogTitle className="text-lg font-semibold text-foreground">
                {editing ? "Edit Tax" : "Add Tax"}
              </DialogTitle>
            </DialogHeader>
            <button
              onClick={() => setShowModal(false)}
              disabled={submitting}
              aria-label="Close tax dialog"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70 transition hover:bg-muted hover:text-muted-foreground disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                Tax Name *
              </label>
              <input
                type="text"
                maxLength={100}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-success/40 focus:ring-2 focus:ring-success/20 transition-all"
                placeholder="e.g. Standard GST, Fixed Sale Tax"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Rate (%) *
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-success/40 focus:ring-2 focus:ring-success/20 transition-all"
                  value={form.rate}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      rate: Math.max(
                        0,
                        Math.min(100, Number(e.target.value)),
                      ),
                    }))
                  }
                  disabled={
                    form.type === "exempt" || form.type === "zero_rated"
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Type
                </label>
                <select
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-success/40 focus:ring-2 focus:ring-success/20 transition-all bg-card"
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      type: e.target.value as Tax["type"],
                      // Reset rate for exempt/zero_rated
                      ...(e.target.value === "exempt" ||
                      e.target.value === "zero_rated"
                        ? { rate: 0 }
                        : {}),
                    }))
                  }
                >
                  <option value="standard">Standard (%)</option>
                  <option value="fixed">Fixed (Rs)</option>
                  <option value="exempt">Exempt</option>
                  <option value="zero_rated">Zero Rated</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                FBR Code
              </label>
              <input
                type="text"
                maxLength={50}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-success/40 focus:ring-2 focus:ring-success/20 transition-all"
                placeholder="Optional FBR tax code"
                value={form.fbrCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fbrCode: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                Description
              </label>
              <textarea
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-success/40 focus:ring-2 focus:ring-success/20 transition-all resize-none"
                placeholder="Optional description"
                rows={2}
                maxLength={500}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground/90 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isActive: e.target.checked }))
                }
                className="w-4 h-4 accent-emerald-600"
              />
              Active (available for assignment)
            </label>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="p-6 border-t border-border flex gap-3 justify-end sticky bottom-0 bg-card rounded-b-2xl">
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
              className="px-4 py-2 text-sm bg-success hover:bg-success/90 active:bg-success/85 disabled:opacity-50 text-success-foreground rounded-lg font-medium transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : editing ? (
                "Update"
              ) : (
                "Add Tax"
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
