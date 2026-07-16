"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Truck,
  Receipt,
  Wallet,
  Calendar,
  Loader2,
  X,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";

interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  note?: string | null;
  createdAt: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  balance: number;
  ledgerEntries: LedgerEntry[];
  purchaseOrders: PurchaseOrder[];
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"ledger" | "orders">("ledger");

  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");

  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<{ supplier: Supplier }>(
    `/api/suppliers/${id}`,
    (url: string) =>
      apiGet<{ supplier: Supplier }>(url) as Promise<{ supplier: Supplier }>,
  );
  const supplier = data?.supplier;

  const [payType, setPayType] = useState<"payment" | "debit">("payment");

  async function handlePayment() {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      setPayError("Enter a valid amount");
      return;
    }

    setPayLoading(true);
    setPayError("");

    try {
      await apiPost(`/api/suppliers/${id}/pay`, {
        amount,
        note: payNote || undefined,
        type: payType,
      });

      toast.success(
        payType === "payment"
          ? "Payment recorded successfully"
          : "Refund/Return recorded successfully",
      );
      setShowPayment(false);
      setPayAmount("");
      setPayNote("");
      setPayType("payment");
      mutate();
    } catch (err) {
      setPayError(
        err instanceof Error ? err.message : "Failed to record transaction",
      );
    } finally {
      setPayLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-96 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchError || !supplier) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium">
            {fetchError ? fetchError.message : "Supplier not found"}
          </p>
          <Link
            href="/suppliers"
            className="text-primary text-sm mt-3 inline-flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Suppliers
          </Link>
        </div>
      </div>
    );
  }

  const owes = supplier.balance > 0;

  return (
    <div className="min-h-screen animate-fade-in">
      {/* Header Card */}
      <div className="bg-card mx-auto max-w-5xl border-b border-border rounded-xl p-5 shadow-soft">
        <button
          onClick={() => router.push("/suppliers")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Suppliers
        </button>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 ring-1 ${supplier.balance > 0 ? "bg-destructive/15 text-destructive ring-destructive/25" : supplier.balance < 0 ? "bg-success/15 text-success ring-success/25" : "bg-info/15 text-info ring-info/25"}`}
            >
              <Truck className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">
                {supplier.name}
              </h1>
              <div className="flex flex-wrap gap-3 mt-1.5">
                {supplier.phone && (
                  <a
                    href={`tel:${supplier.phone}`}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                  >
                    <Phone className="w-3.5 h-3.5" /> {supplier.phone}
                  </a>
                )}
                {supplier.email && (
                  <a
                    href={`mailto:${supplier.email}`}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                  >
                    <Mail className="w-3.5 h-3.5" /> {supplier.email}
                  </a>
                )}
                {supplier.address && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" /> {supplier.address}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-left md:text-right shrink-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
              Outstanding Bakaya
            </p>
            {supplier.balance > 0 ? (
              <p className="text-3xl font-bold text-destructive">
                Rs. {supplier.balance.toLocaleString()}
              </p>
            ) : supplier.balance < 0 ? (
              <p className="text-3xl font-bold text-success">
                Rs. {Math.abs(supplier.balance).toLocaleString()}
              </p>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">Clear ✓</p>
            )}
            <p
              className={`text-sm mt-1 ${supplier.balance > 0 ? "text-destructive" : supplier.balance < 0 ? "text-success" : "text-muted-foreground"}`}
            >
              {supplier.balance > 0
                ? "You owe this supplier"
                : supplier.balance < 0
                  ? "Supplier owes you (Advance)"
                  : "No pending balance"}
            </p>
            <button
              onClick={() => setShowPayment(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary hover:bg-primary/90 px-4 py-2 text-sm font-bold text-primary-foreground transition shadow-soft"
            >
              <Wallet className="w-4 h-4" />
              Record Payment
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 mt-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit mb-4 border border-border">
          <button
            onClick={() => setActiveTab("ledger")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === "ledger" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Wallet className="w-4 h-4" /> Ledger
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === "orders" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Receipt className="w-4 h-4" /> Purchase Orders
          </button>
        </div>

        {/* Ledger Tab */}
        {activeTab === "ledger" && (
          <div className="bg-card rounded-xl border border-border shadow-soft overflow-hidden mb-8">
            {supplier.ledgerEntries.length === 0 ? (
              <div className="p-12 text-center">
                <Wallet className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-foreground font-medium">
                  No transactions yet
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  Purchase receipts and payments will appear here
                </p>
              </div>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Details</th>
                        <th className="px-4 py-3 font-semibold text-right text-destructive">
                          Debit (Rs.)
                        </th>
                        <th className="px-4 py-3 font-semibold text-right text-success">
                          Credit (Rs.)
                        </th>
                        <th className="px-4 py-3 font-semibold text-right">
                          Balance (Rs.)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {supplier.ledgerEntries.map((entry) => {
                        const isDebit = entry.type === "credit";
                        const isCredit =
                          entry.type === "payment" || entry.type === "debit";
                        return (
                          <tr
                            key={entry.id}
                            className="hover:bg-muted/30 transition"
                          >
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" />
                                {new Date(entry.createdAt).toLocaleDateString(
                                  "en-PK",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground capitalize">
                                {entry.type.replace("_", " ")}
                              </p>
                              {entry.note && (
                                <p className="text-xs text-muted-foreground truncate max-w-xs">
                                  {entry.note}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isDebit ? (
                                <span className="font-semibold text-destructive">
                                  {entry.amount.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isCredit ? (
                                <span className="font-semibold text-success">
                                  {entry.amount.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`font-bold ${entry.balanceAfter > 0 ? "text-destructive" : entry.balanceAfter < 0 ? "text-success" : "text-foreground"}`}
                              >
                                {Math.abs(entry.balanceAfter).toLocaleString()}{" "}
                                {entry.balanceAfter < 0 && (
                                  <span className="text-xs">(adv)</span>
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="px-4 py-3 bg-muted/40 border-t border-border flex justify-between items-center">
                  <span className="text-sm font-medium text-foreground">
                    Closing Balance
                  </span>
                  <span
                    className={`text-lg font-bold ${supplier.balance > 0 ? "text-destructive" : supplier.balance < 0 ? "text-success" : "text-foreground"}`}
                  >
                    {supplier.balance > 0
                      ? `You Owe Rs. ${supplier.balance.toLocaleString()}`
                      : supplier.balance < 0
                        ? `Supplier Owes Rs. ${Math.abs(supplier.balance).toLocaleString()}`
                        : "Clear ✓"}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === "orders" && (
          <div className="bg-card rounded-xl border border-border shadow-soft mb-8">
            {supplier.purchaseOrders.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-foreground font-medium">
                  No purchase orders yet
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  Orders placed with this supplier will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {supplier.purchaseOrders.map((po) => (
                  <Link
                    href={`/purchases/${po.id}`}
                    key={po.id}
                    className="p-4 flex items-center justify-between hover:bg-muted/30 transition gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground ring-1 ring-border shrink-0">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {po.orderNumber}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />{" "}
                          {new Date(po.createdAt).toLocaleDateString("en-PK")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-foreground">
                        Rs. {po.totalAmount.toLocaleString()}
                      </p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full capitalize ${po.status === "received" ? "bg-success/15 text-success" : po.status === "cancelled" ? "bg-destructive/15 text-destructive" : "bg-info/15 text-info"}`}
                      >
                        {po.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-soft-lg ring-1 ring-border w-full max-w-sm animate-scale-in">
            <div className="p-5 border-b border-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">
                  Record Transaction
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {supplier.name} —{" "}
                  {owes
                    ? `You Owe Rs. ${supplier.balance.toLocaleString()}`
                    : "No balance due"}
                </p>
              </div>
              <button
                onClick={() => setShowPayment(false)}
                aria-label="Close payment dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg border border-border">
                <button
                  onClick={() => setPayType("payment")}
                  className={`py-2 rounded-md text-sm font-medium transition ${payType === "payment" ? "bg-card text-success shadow-soft" : "text-muted-foreground"}`}
                >
                  Pay Supplier
                </button>
                <button
                  onClick={() => setPayType("debit")}
                  className={`py-2 rounded-md text-sm font-medium transition ${payType === "debit" ? "bg-card text-info shadow-soft" : "text-muted-foreground"}`}
                >
                  Supplier Refund/Return
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                  Amount (Rs.) *
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2.5 border border-input rounded-xl bg-background text-lg font-bold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition text-center"
                  placeholder="0"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  autoFocus
                />
              </div>

              {owes && (
                <button
                  onClick={() =>
                    setPayAmount(Math.round(supplier.balance).toString())
                  }
                  className="w-full py-2 text-xs bg-success/10 text-success rounded-lg font-medium hover:bg-success/15 transition border border-success/20"
                >
                  Pay Full Balance (Rs.{" "}
                  {Math.round(supplier.balance).toLocaleString()})
                </button>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                  Note (optional)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
                  placeholder="e.g. Cash, Bank transfer"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>

              {payError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{payError}</span>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowPayment(false)}
                className="px-4 py-2 text-sm text-foreground border border-border rounded-xl hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={payLoading}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-semibold transition flex items-center gap-2 shadow-soft"
              >
                {payLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Recording...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" /> Record Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
