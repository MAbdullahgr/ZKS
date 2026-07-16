"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash,
  ArrowsClockwiseIcon,
  Storefront,
  Warehouse,
  Spinner,
  WarningCircleIcon,
  X,
  MapPin,
  Phone,
} from "@phosphor-icons/react";
import { apiPost, apiPatch } from "@/lib/fetcher";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";

interface Store {
  id: string;
  name: string;
  type: "retail" | "warehouse";
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
}

const emptyForm = {
  name: "",
  type: "retail" as "retail" | "warehouse",
  address: "",
  phone: "",
};

export default function StoresPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const {
    items: stores,
    meta,
    setPage,
    mutate,
    isLoading,
    error: fetchError,
  } = usePaginatedList<Store>("/api/stores", "stores", { limit: 20 });

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function openEdit(s: Store) {
    setEditing(s);
    setForm({
      name: s.name,
      type: s.type,
      address: s.address ?? "",
      phone: s.phone ?? "",
    });
    setError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError("Store name is required");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
      };

      if (editing) {
        await apiPatch(`/api/stores/${editing.id}`, payload);
        toast.success("Store updated successfully");
      } else {
        await apiPost("/api/stores", payload);
        toast.success("Store created successfully");
      }
      setShowModal(false);
      mutate(); // Refreshes the list on this page
      router.refresh(); // FIX: Tells Next.js to re-fetch Server Component data (TopBar)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    const action = currentActive ? "Deactivate" : "Reactivate";
    if (!confirm(`${action} this store?`)) return;

    try {
      await apiPatch(`/api/stores/${id}`, { isActive: !currentActive });
      toast.success(`Store ${action}d`);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Failed to ${action.toLowerCase()} store`,
      );
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-100px">
        <Spinner className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
          <WarningCircleIcon className="w-5 h-5" />
          <span>{fetchError.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            Stores & Warehouses
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage your retail locations and storage facilities
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 shrink-0 bg-primary hover:bg-primary/90 active:bg-primary/95 text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
        >
          <Plus className="w-4 h-4" /> Add Location
        </button>
      </div>

      {stores.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Storefront className="w-10 h-10 text-border mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            No stores or warehouses found
          </p>
          <p className="text-muted-foreground/70 text-sm mt-1">
            Add your first location to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((s) => (
            <div
              key={s.id}
              className={`bg-card rounded-xl border p-5 shadow-soft flex flex-col transition hover:shadow-md ${
                !s.isActive
                  ? "opacity-60 border-border"
                  : s.type === "warehouse"
                    ? "border-warning/25"
                    : "border-primary/30"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    s.type === "warehouse"
                      ? "bg-warning/15 text-warning"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  {s.type === "warehouse" ? (
                    <Warehouse className="w-5 h-5" />
                  ) : (
                    <Storefront className="w-5 h-5" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(s)}
                    aria-label={`Edit location ${s.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-primary/10 text-muted-foreground/70 hover:text-primary transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(s.id, s.isActive)}
                    aria-label={
                      s.isActive
                        ? `Deactivate location ${s.name}`
                        : `Reactivate location ${s.name}`
                    }
                    className={`flex h-9 w-9 items-center justify-center rounded-lg p-2 transition ${
                      s.isActive
                        ? "hover:bg-destructive/10 text-muted-foreground/70 hover:text-destructive"
                        : "hover:bg-success/10 text-muted-foreground/70 hover:text-success"
                    }`}
                  >
                    {s.isActive ? (
                      <Trash className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowsClockwiseIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-foreground mb-1">{s.name}</h3>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${
                  s.type === "warehouse"
                    ? "bg-warning/10 text-warning border border-warning/25"
                    : "bg-primary/10 text-primary border border-primary/30"
                }`}
              >
                {s.type}
              </span>

              <div className="mt-4 pt-3 border-t border-border space-y-2">
                {s.phone && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 shrink-0" /> {s.phone}
                  </p>
                )}
                {s.address && (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />{" "}
                    {s.address}
                  </p>
                )}
                {!s.isActive && (
                  <p className="text-xs font-medium text-destructive">Inactive</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {meta && (
        <PaginationBar meta={meta} onPageChange={setPage} className="pt-2" />
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editing ? "Edit Location" : "Add Location"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Close location dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition"
                  placeholder="e.g. Main Store, Central Warehouse"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setForm({ ...form, type: "retail" })}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition ${
                      form.type === "retail"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-border"
                    }`}
                  >
                    <Storefront className="w-4 h-4" /> Retail Store
                  </button>
                  <button
                    onClick={() => setForm({ ...form, type: "warehouse" })}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition ${
                      form.type === "warehouse"
                        ? "border-warning bg-warning/10 text-warning"
                        : "border-border text-muted-foreground hover:border-border"
                    }`}
                  >
                    <Warehouse className="w-4 h-4" /> Warehouse
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition"
                  placeholder="0300-1234567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Address
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition resize-none"
                  rows={2}
                  placeholder="Full address"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
                  <WarningCircleIcon className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg font-medium transition flex items-center gap-2"
              >
                {submitting ? (
                  <Spinner className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {editing ? "Update Location" : "Add Location"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
