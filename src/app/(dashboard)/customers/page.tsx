"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Phone,
  User,
  CreditCard,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Copy,
  Check,
  MapPin,
} from "lucide-react";
import { apiPost, apiPatch, apiDelete } from "@/lib/fetcher";
import { toast } from "sonner";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";
import {
  PageContainer,
  PageHeader,
  StatTile,
  EmptyState,
} from "@/components/layout/PageContainer";

interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  balance: number;
  creditLimit: number;
  _count?: { sales: number; khataTransactions: number };
  store?: { name: string } | null;
}

const emptyForm = { name: "", phone: "", address: "", creditLimit: "" };

export default function CustomersPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    items: customers,
    meta,
    isLoading,
    error: fetchError,
    search,
    setSearch,
    setPage,
    mutate,
  } = usePaginatedList<Customer>("/api/customers", "customers", {
    search: true,
    limit: 20,
  });

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      address: c.address ?? "",
      creditLimit: String(c.creditLimit ?? 0),
    });
    setError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone || null,
        address: form.address || null,
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : 0,
      };

      if (editing) {
        await apiPatch(`/api/customers/${editing.id}`, payload);
        toast.success("Customer updated successfully");
      } else {
        await apiPost("/api/customers", payload);
        toast.success("Customer added successfully");
      }
      setShowModal(false);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: Customer) {
    if (!confirm(`Delete ${c.name}?`)) return;

    try {
      await apiDelete(`/api/customers/${c.id}`);
      toast.success("Customer deleted successfully");
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete customer",
      );
    }
  }

  const handleCopyPhone = useCallback((phone: string, id: string) => {
    navigator.clipboard.writeText(phone).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  const debtors = customers.filter((c) => c.balance > 0.01);
  const totalDebt = debtors.reduce((s, c) => s + c.balance, 0);
  const advanceHolders = customers.filter((c) => c.balance < -0.01);
  const totalAdvance = advanceHolders.reduce(
    (s, c) => s + Math.abs(c.balance),
    0,
  );

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
        title="Customers"
        description="Khata accounts & credit ledger"
        icon={<User className="w-5 h-5" />}
        actions={
          <button
            onClick={openAdd}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-soft hover:shadow-soft-lg shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatTile
          label="Total"
          value={meta?.total ?? 0}
          icon={<User className="w-4 h-4" />}
          tone="muted"
        />
        <StatTile
          label="Debtors"
          value={debtors.length}
          icon={<ArrowUpRight className="w-4 h-4" />}
          tone="danger"
        />
        <StatTile
          label="Total Debt"
          value={`Rs. ${totalDebt.toLocaleString()}`}
          icon={<CreditCard className="w-4 h-4" />}
          tone="danger"
        />
        <StatTile
          label="Advance"
          value={`Rs. ${totalAdvance.toLocaleString()}`}
          icon={<ArrowDownRight className="w-4 h-4" />}
          tone="success"
        />
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-4 py-2.5 border border-input rounded-xl bg-card text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition shadow-soft"
          placeholder="Search by name, phone or email..."
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
              className="bg-card rounded-xl border border-border p-5 shimmer h-40"
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && customers.length === 0 && (
        <EmptyState
          icon={<User className="w-7 h-7" />}
          title={search ? "No customers match your search" : "No customers yet"}
          description={
            search
              ? "Try a different search term."
              : "Add your first customer to start tracking their khata balance."
          }
          action={
            !search && (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-soft hover:shadow-soft-lg"
              >
                <Plus className="w-4 h-4" /> Add your first customer
              </button>
            )
          }
        />
      )}

      {/* Customer Cards */}
      {!isLoading && customers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => {
            const balance = c.balance;
            const limit = c.creditLimit;
            const owes = balance > 0.01;
            const advance = balance < -0.01;
            const atLimit = owes && limit > 0 && balance >= limit;
            const nearLimit =
              owes && limit > 0 && balance >= limit * 0.8 && !atLimit;

            return (
              <div
                key={c.id}
                className={`bg-card rounded-2xl border p-5 shadow-soft transition-all hover:shadow-soft-lg hover:-translate-y-0.5 ${
                  atLimit
                    ? "border-destructive/30 ring-1 ring-destructive/15"
                    : nearLimit
                      ? "border-warning/30"
                      : owes
                        ? "border-destructive/20"
                        : advance
                          ? "border-success/20"
                          : "border-border"
                }`}
              >
                <div className="flex items-start justify-between mb-4 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ring-1 ${
                        atLimit
                          ? "bg-destructive/15 text-destructive ring-destructive/25"
                          : owes
                            ? "bg-destructive/10 text-destructive ring-destructive/20"
                            : advance
                              ? "bg-success/15 text-success ring-success/25"
                              : "bg-muted text-muted-foreground ring-border"
                      }`}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-semibold text-foreground truncate block hover:text-primary transition"
                      >
                        {c.name}
                      </Link>
                      {c.store?.name && (
                        <span className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                          {c.store.name}
                        </span>
                      )}
                      {c.phone && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <a
                            href={`tel:${c.phone}`}
                            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary transition"
                          >
                            <Phone className="w-3 h-3" /> {c.phone}
                          </a>
                          <button
                            onClick={() => handleCopyPhone(c.phone!, c.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition"
                            title="Copy phone"
                            aria-label={`Copy phone number ${c.phone}`}
                          >
                            {copiedId === c.id ? (
                              <Check className="w-3 h-3 text-success" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(c)}
                      aria-label={`Edit customer ${c.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      aria-label={`Delete customer ${c.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {c._count?.sales
                        ? `${c._count.sales} sales`
                        : "No sales yet"}
                      {c._count?.khataTransactions
                        ? ` · ${c._count.khataTransactions} txns`
                        : ""}
                    </p>
                    {c.address && (
                      <p className="text-xs text-muted-foreground truncate max-w-[12rem] flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" /> {c.address}
                      </p>
                    )}
                    {limit > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Limit: Rs. {limit.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {atLimit && (
                      <p className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-0.5">
                        At Limit
                      </p>
                    )}
                    {nearLimit && (
                      <p className="text-[10px] font-bold text-warning uppercase tracking-wider mb-0.5">
                        Near Limit
                      </p>
                    )}
                    {owes ? (
                      <>
                        <p className="text-xs text-destructive font-medium">
                          Owes
                        </p>
                        <p className="text-xl font-bold text-destructive">
                          Rs. {balance.toLocaleString()}
                        </p>
                      </>
                    ) : advance ? (
                      <>
                        <p className="text-xs text-success font-medium">
                          Advance
                        </p>
                        <p className="text-xl font-bold text-success">
                          Rs. {Math.abs(balance).toLocaleString()}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-muted-foreground">
                        Clear ✓
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {meta && <PaginationBar meta={meta} onPageChange={setPage} className="pt-6" />}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-soft-lg ring-1 ring-border w-full max-w-md animate-scale-in">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editing ? "Edit Customer" : "New Customer"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Close customer dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                  Name *
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-input rounded-xl bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                  Phone
                </label>
                <input
                  type="tel"
                  className="w-full px-3 py-2.5 border border-input rounded-xl bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
                  placeholder="0300-1234567"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                  Address
                </label>
                <textarea
                  className="w-full px-3 py-2.5 border border-input rounded-xl bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition resize-none"
                  rows={2}
                  placeholder="Optional"
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                  Credit Limit (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-full px-3 py-2.5 border border-input rounded-xl bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
                  placeholder="0 = unlimited"
                  value={form.creditLimit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, creditLimit: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  0 = unlimited credit
                </p>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-foreground border border-border rounded-xl hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-semibold transition shadow-soft"
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </span>
                ) : editing ? (
                  "Update"
                ) : (
                  "Add Customer"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
