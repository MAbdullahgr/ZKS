"use client";

import { useState } from "react";
import { apiPost, apiPatch, apiDelete } from "@/lib/fetcher";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  isSystem: boolean;
  isActive: boolean;
  balance: number;
  openingBalance: number;
  transactionCount: number;
  parent: { code: string; name: string } | null;
}

export default function ChartOfAccountsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "asset" as const,
    openingBalance: 0,
  });
  const [loading, setLoading] = useState(false);

  const {
    items: accounts,
    meta,
    isLoading,
    setPage,
    mutate,
  } = usePaginatedList<Account>("/api/accounts", "accounts", {
    search: true,
    limit: 20,
  });

  const handleCreate = async () => {
    setLoading(true);
    try {
      await apiPost("/api/accounts", {
        code: form.code,
        name: form.name,
        type: form.type,
        openingBalance: form.openingBalance,
      });
      toast.success("Account created");
      setShowCreateModal(false);
      setForm({ code: "", name: "", type: "asset", openingBalance: 0 });
      mutate();
    } catch {
      toast.error("Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (account: Account) => {
    try {
      await apiPatch(`/api/accounts/${account.id}`, {
        isActive: !account.isActive,
      });
      toast.success(
        account.isActive ? "Account deactivated" : "Account activated",
      );
      mutate();
    } catch {
      toast.error("Failed to update account");
    }
  };

  const handleDelete = async (account: Account) => {
    if (!confirm(`Delete account ${account.code} - ${account.name}?`)) return;
    try {
      await apiDelete(`/api/accounts/${account.id}`);
      toast.success("Account deleted");
      mutate();
    } catch {
      toast.error("Failed to delete account");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-success" />
      </div>
    );
  }

  const grouped = {
    asset: accounts.filter((a) => a.type === "asset"),
    liability: accounts.filter((a) => a.type === "liability"),
    equity: accounts.filter((a) => a.type === "equity"),
    revenue: accounts.filter((a) => a.type === "revenue"),
    expense: accounts.filter((a) => a.type === "expense"),
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.length} accounts
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-bold text-success-foreground hover:bg-success/90"
        >
          <Plus size={16} /> New Account
        </button>
      </div>

      {(["asset", "liability", "equity", "revenue", "expense"] as const).map(
        (type) => {
          if (grouped[type].length === 0) return null;
          return (
            <div key={type} className="rounded-xl border">
              <div className="border-b px-4 py-3">
                <h2 className="font-bold capitalize">{type}s</h2>
              </div>
              {/* Desktop Table */}
              <div>
                <div className="hidden md:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2">Code</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2 text-right">Opening</th>
                        <th className="px-4 py-2 text-right">Balance</th>
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[type].map((account) => (
                        <tr key={account.id} className="border-b last:border-0">
                          <td className="px-4 py-3 font-mono font-bold">
                            {account.code}
                          </td>
                          <td className="px-4 py-3">
                            {account.name}
                            {account.isSystem && (
                              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                System
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {account.openingBalance.toLocaleString("en-PK")}
                          </td>
                          <td className="px-4 py-3 text-right font-bold">
                            {account.balance.toLocaleString("en-PK")}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                account.isActive
                                  ? "bg-success/15 text-success"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {account.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!account.isSystem && (
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => handleToggleActive(account)}
                                  className="text-xs text-primary hover:underline"
                                >
                                  {account.isActive ? "Deactivate" : "Activate"}
                                </button>
                                {!account.isActive && (
                                  <button
                                    onClick={() => handleDelete(account)}
                                    className="text-xs text-destructive hover:underline"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {meta && (
                  <PaginationBar
                    meta={meta}
                    onPageChange={setPage}
                    className="pt-2"
                  />
                )}
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-border">
                {grouped[type].map((account) => (
                  <div key={account.id} className="bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-foreground">
                          {account.code}
                        </p>
                        <p className="text-sm text-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {account.name}
                          {account.isSystem && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              System
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          account.isActive
                            ? "bg-success/15 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {account.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="text-muted-foreground">
                        <span>Opening: </span>
                        <span className="font-semibold text-foreground">
                          {account.openingBalance.toLocaleString("en-PK")}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        <span>Balance: </span>
                        <span className="font-bold text-foreground">
                          {account.balance.toLocaleString("en-PK")}
                        </span>
                      </div>
                    </div>
                    {!account.isSystem && (
                      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
                        <button
                          onClick={() => handleToggleActive(account)}
                          className="text-xs text-primary font-medium hover:underline cursor-pointer"
                        >
                          {account.isActive ? "Deactivate" : "Activate"}
                        </button>
                        {!account.isActive && (
                          <button
                            onClick={() => handleDelete(account)}
                            className="text-xs text-destructive font-medium hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        },
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">New Account</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                aria-label="Close account dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70 transition hover:bg-muted hover:text-foreground/90"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold">Code</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g., 1200"
                  className="w-full rounded-lg border p-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Bank Account"
                  className="w-full rounded-lg border p-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">Type</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type: e.target.value as typeof form.type,
                    })
                  }
                  className="w-full rounded-lg border p-2"
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Opening Balance
                </label>
                <input
                  type="number"
                  value={form.openingBalance}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      openingBalance: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-lg border p-2"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={loading || !form.code || !form.name}
                className="w-full rounded-lg bg-success py-2.5 text-sm font-bold text-success-foreground hover:bg-success/90 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
