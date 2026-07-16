"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Truck,
  Phone,
  User,
  Users,
  Loader2,
  AlertCircle,
  Wallet,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { apiPost, apiPatch, apiDelete } from "@/lib/fetcher";
import { toast } from "sonner";
import Link from "next/link";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";
import {
  PageContainer,
  PageHeader,
  EmptyState,
  StatTile,
} from "@/components/layout/PageContainer";

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  balance: number;
  isActive: boolean;
  store?: { name: string } | null;
}

const emptyForm = {
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: "",
};

export default function SuppliersPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const {
    items: suppliers,
    meta,
    isLoading,
    error: fetchError,
    search,
    setSearch,
    setPage,
    mutate,
  } = usePaginatedList<Supplier>("/api/suppliers", "suppliers", {
    search: true,
    limit: 20,
  });

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
    });
    setError("");
    setShowModal(true);
  }

  function validateForm(): string | null {
    if (!form.name.trim()) return "Supplier name is required";
    if (form.name.trim().length > 100)
      return "Name must be under 100 characters";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return "Invalid email format";
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      };

      if (editing) {
        await apiPatch(`/api/suppliers/${editing.id}`, payload);
        toast.success("Supplier updated successfully");
      } else {
        await apiPost("/api/suppliers", payload);
        toast.success("Supplier added successfully");
      }
      setShowModal(false);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this supplier?")) return;

    try {
      await apiDelete(`/api/suppliers/${id}`);
      toast.success("Supplier deleted successfully");
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete supplier",
      );
    }
  }

  const fields = [
    {
      label: "Supplier Name *",
      key: "name" as const,
      placeholder: "e.g. Ahmed Traders",
      maxLength: 100,
    },
    {
      label: "Contact Person",
      key: "contactPerson" as const,
      placeholder: "e.g. Ahmed Khan",
      maxLength: 100,
    },
    {
      label: "Phone",
      key: "phone" as const,
      placeholder: "e.g. 0300-1234567",
      maxLength: 30,
    },
    {
      label: "Email",
      key: "email" as const,
      placeholder: "e.g. ahmed@traders.com",
      maxLength: 254,
    },
  ];

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
        title="Suppliers"
        description="Manage your product suppliers & Bakaya"
        icon={<Truck className="w-5 h-5" />}
        actions={
          <button
            onClick={openAdd}
            className="flex items-center gap-2 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-soft hover:shadow-soft-lg"
          >
            <Plus className="w-4 h-4" /> Add Supplier
          </button>
        }
      />

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <StatTile
            label="Total Suppliers"
            value={String(meta?.total ?? suppliers.length)}
            icon={<Truck className="w-4 h-4" />}
            tone="primary"
          />
          <StatTile
            label="This Page"
            value={String(suppliers.length)}
            hint="suppliers shown"
            icon={<Users className="w-4 h-4" />}
            tone="info"
          />
          <StatTile
            label="Total Bakaya"
            value={`Rs. ${suppliers.reduce((sum, s) => sum + (s.balance || 0), 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`}
            hint="outstanding balance"
            icon={<Wallet className="w-4 h-4" />}
            tone="warning"
          />
          <StatTile
            label="With Balance"
            value={String(suppliers.filter((s) => (s.balance || 0) > 0).length)}
            hint="suppliers owe money"
            icon={<AlertCircle className="w-4 h-4" />}
            tone="danger"
          />
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-4 py-2.5 border border-input rounded-xl bg-card text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition shadow-soft"
          placeholder="Search by name, phone or contact person..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-5 shimmer h-44"
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && suppliers.length === 0 && (
        <EmptyState
          icon={<Truck className="w-7 h-7" />}
          title={search ? "No suppliers match your search" : "No suppliers yet"}
          description={
            search
              ? "Try a different search term."
              : "Add your first supplier to start tracking Bakaya (payables)."
          }
          action={
            !search && (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-soft hover:shadow-soft-lg"
              >
                <Plus className="w-4 h-4" /> Add your first supplier
              </button>
            )
          }
        />
      )}

      {/* Grid */}
      {!isLoading && suppliers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((s) => (
            <Link
              href={`/suppliers/${s.id}`}
              key={s.id}
              className="bg-card rounded-2xl border border-border shadow-soft p-5 hover:shadow-soft-lg hover:-translate-y-0.5 transition-all flex flex-col group"
            >
              <div className="flex items-start justify-between mb-3 gap-2">
                <div className="w-10 h-10 bg-info/15 text-info rounded-lg flex items-center justify-center ring-1 ring-info/25 group-hover:scale-105 transition-transform">
                  <Truck className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      openEdit(s);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition"
                    aria-label="Edit supplier"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(s.id);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                    aria-label="Delete supplier"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 flex-wrap">
                {s.name}
                {s.store?.name && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                    {s.store.name}
                  </span>
                )}
              </h3>
              <div className="space-y-1.5 flex-1">
                {s.contactPerson && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{s.contactPerson}</span>
                  </div>
                )}
                {s.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{s.phone}</span>
                  </div>
                )}
                {s.address && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{s.address}</span>
                  </div>
                )}
              </div>

              {s.balance > 0 && (
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                    <Wallet className="w-3.5 h-3.5" /> We Owe
                  </span>
                  <span className="text-sm font-bold text-destructive">
                    Rs. {s.balance.toLocaleString()}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && <PaginationBar meta={meta} onPageChange={setPage} className="pt-6" />}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-soft-lg ring-1 ring-border w-full max-w-md animate-scale-in">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editing ? "Edit Supplier" : "Add Supplier"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Close dialog"
                disabled={submitting}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {fields.map(({ label, key, placeholder, maxLength }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                    {label}
                  </label>
                  <input
                    type="text"
                    maxLength={maxLength}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition-all"
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                  Address
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition-all resize-none"
                  placeholder="Full address"
                  rows={2}
                  maxLength={500}
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
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
                className="px-4 py-2 text-sm text-foreground border border-border rounded-lg hover:bg-muted transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 active:bg-primary/95 disabled:opacity-50 text-primary-foreground rounded-lg font-semibold transition-all flex items-center gap-2 shadow-soft"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Saving..." : editing ? "Update" : "Add Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
