"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Printer,
  Plus,
  Loader2,
  X,
  Receipt,
  ShoppingCart,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CreditCard,
  MessageCircle,
  CalendarDays,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";

interface KhataTransaction {
  id: string;
  type: "credit" | "payment" | "advance" | "return_credit" | "return_cash";
  amount: number;
  balanceAfter: number;
  note?: string;
  createdAt: string;
  sale?: { saleNumber: string; total: number };
}

interface SaleItem {
  product: { name: string };
  quantity: number;
  unitPrice: number;
}

interface Sale {
  id: string;
  saleNumber: string;
  total: number;
  paidAmount: number;
  paymentMethod: string;
  createdAt: string;
  items: SaleItem[];
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  balance: number;
  creditLimit: number;
  khataTransactions: KhataTransaction[];
  sales: Sale[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // FIX: Use SWR for data fetching and auto-unwrapping
  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<{ customer: Customer }>(
    `/api/customers/${id}`,
    (url: string) =>
      apiGet<{ customer: Customer }>(url) as Promise<{
        customer: Customer;
      }>,
  );
  const customer = data?.customer;

  const [activeTab, setActiveTab] = useState<"ledger" | "sales">("ledger");

  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payType, setPayType] = useState<"payment" | "advance">("payment");
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");

  // ─── Monthly Statement (WhatsApp) ───────────────────────────────────
  // Default to last month — a statement is most useful after a month closes.
  // Format: "YYYY-MM" so it round-trips through <input type="month">.
  const [statementMonth, setStatementMonth] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // never roll over into the next month
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7); // "YYYY-MM"
  });

  async function handlePayment() {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      setPayError("Enter a valid amount");
      return;
    }
    setPayLoading(true);
    setPayError("");

    try {
      await apiPost(`/api/customers/${id}/khata`, {
        amount,
        type: payType,
        note: payNote || undefined,
      });
      toast.success("Payment recorded successfully");
      closePayment();
      mutate(); // FIX: Instantly refresh customer data
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Failed to record");
    } finally {
      setPayLoading(false);
    }
  }

  function closePayment() {
    setShowPayment(false);
    setPayAmount("");
    setPayNote("");
    setPayError("");
    setPayType("payment");
  }

  function getLedgerRows() {
    if (!customer) return [];
    const txs = [...customer.khataTransactions].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    let balance = 0;
    return txs.map((t) => {
      const isDebit = t.type === "credit";
      const isCredit = [
        "payment",
        "advance",
        "return_credit",
        "return_cash",
      ].includes(t.type);

      if (isDebit) balance += t.amount;
      else balance -= t.amount;

      return {
        ...t,
        debit: isDebit ? t.amount : 0,
        credit: isCredit ? t.amount : 0,
        balance,
      };
    });
  }

  function shareOnWhatsApp() {
    if (!customer) return;
    const cleanPhone = customer.phone?.replace(/\D/g, "");
    if (!cleanPhone) {
      // FIX: Use toast instead of alert
      toast.error("No valid phone number available");
      return;
    }

    const rows = getLedgerRows();
    const balance = customer.balance;

    let msg = `*Khata Statement - ${customer.name}*\n`;
    msg += `Phone: ${customer.phone || "N/A"}\n`;
    msg += `Date: ${new Date().toLocaleDateString("en-PK")}\n\n`;
    msg += `*Transactions:*\n`;

    rows.slice(-10).forEach((r) => {
      const date = new Date(r.createdAt).toLocaleDateString("en-PK", {
        day: "numeric",
        month: "short",
      });
      if (r.debit > 0)
        msg += `${date} - Purchase: Rs. ${r.debit.toLocaleString()}\n`;
      else msg += `${date} - Payment: Rs. ${r.credit.toLocaleString()}\n`;
    });

    msg += `\n*Current Balance:* `;
    if (balance > 0) msg += `You Owe Rs. ${balance.toLocaleString()}`;
    else if (balance < 0)
      msg += `Advance Rs. ${Math.abs(balance).toLocaleString()}`;
    else msg += `Clear`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  /**
   * Build a full monthly khata statement for the customer and open it in
   * WhatsApp. Includes:
   *   - Customer name + statement month
   *   - Opening balance (last transaction's balanceAfter before the month)
   *   - Every khata transaction in that month (date, type, amount, balance)
   *   - Closing balance (current customer.balance)
   *   - A payment reminder if the customer owes money
   *
   * The message is URL-encoded and sent via https://wa.me/<phone>?text=… so
   * the user lands in WhatsApp's share sheet with the message pre-filled.
   *
   * If the customer has no phone number on file, we toast an error instead.
   * If the month has no transactions, we still send a "no activity this
   * month" statement so the customer knows their balance is unchanged.
   */
  function sendMonthlyStatementWhatsApp() {
    if (!customer) return;
    const cleanPhone = customer.phone?.replace(/\D/g, "");
    if (!cleanPhone) {
      toast.error("No valid phone number available");
      return;
    }

    // Parse "YYYY-MM" into the first and last instant of that month (local
    // time — the customer and store are both in PKT).
    const [yearStr, monthStr] = statementMonth.split("-");
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1; // 0-based
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(monthIdx) ||
      monthIdx < 0 ||
      monthIdx > 11
    ) {
      toast.error("Please pick a valid month");
      return;
    }
    const monthStart = new Date(year, monthIdx, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, monthIdx + 1, 1, 0, 0, 0, 0); // exclusive

    // Sort all khata transactions ascending by date so we can find the
    // opening balance and walk forward.
    const txs = [...customer.khataTransactions].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    // Opening balance = balanceAfter of the last transaction BEFORE monthStart,
    // or 0 if there is no prior transaction.
    let openingBalance = 0;
    for (const t of txs) {
      if (new Date(t.createdAt).getTime() < monthStart.getTime()) {
        openingBalance = Number(t.balanceAfter);
      } else {
        break;
      }
    }

    // All transactions in the month.
    const monthTxs = txs.filter((t) => {
      const ts = new Date(t.createdAt).getTime();
      return ts >= monthStart.getTime() && ts < monthEnd.getTime();
    });

    // Closing balance = balanceAfter of the LAST transaction in the month,
    // or the opening balance if there were no transactions this month.
    const closingBalance =
      monthTxs.length > 0
        ? Number(monthTxs[monthTxs.length - 1].balanceAfter)
        : openingBalance;

    const monthLabel = monthStart.toLocaleDateString("en-PK", {
      month: "long",
      year: "numeric",
    });

    const fmtAmount = (n: number) =>
      Math.abs(n).toLocaleString("en-PK", { maximumFractionDigits: 2 });
    const fmtDate = (iso: string) =>
      new Date(iso).toLocaleDateString("en-PK", {
        day: "numeric",
        month: "short",
      });

    let msg = `*ZKR Monthly Statement*\n`;
    msg += `Customer: ${customer.name}\n`;
    msg += `Month: ${monthLabel}\n`;
    msg += `Phone: ${customer.phone || "N/A"}\n`;
    msg += `\n*Opening Balance: Rs. ${fmtAmount(openingBalance)}`;
    if (openingBalance > 0) msg += ` (debit)`;
    else if (openingBalance < 0) msg += ` (advance)`;
    msg += `\n\n*Transactions (${monthTxs.length}):*\n`;

    if (monthTxs.length === 0) {
      msg += `No transactions this month.\n`;
    } else {
      monthTxs.forEach((t) => {
        const amount = Number(t.amount);
        // Debit increases the customer's debt (they owe more);
        // Credit decreases it (they paid or returned).
        const isDebit = t.type === "credit";
        const label =
          t.type === "credit"
            ? "Purchase"
            : t.type === "payment"
              ? "Payment"
              : t.type === "advance"
                ? "Advance"
                : t.type === "return_credit"
                  ? "Return (credit)"
                  : t.type === "return_cash"
                    ? "Return (cash)"
                    : "Adjustment";
        const sign = isDebit ? "+" : "-";
        msg += `${fmtDate(t.createdAt)} — ${label}: ${sign}Rs. ${fmtAmount(amount)} → Bal Rs. ${fmtAmount(Number(t.balanceAfter))}\n`;
        if (t.note) msg += `    Note: ${t.note}\n`;
      });
    }

    msg += `\n*Closing Balance: Rs. ${fmtAmount(closingBalance)}`;
    if (closingBalance > 0) msg += ` (you owe)`;
    else if (closingBalance < 0) msg += ` (advance)`;
    else msg += ` (clear)`;
    msg += `\n`;

    // Payment reminder — only when the customer actually owes money.
    if (closingBalance > 0) {
      msg += `\n_Please clear your outstanding balance of Rs. ${fmtAmount(closingBalance)} at your earliest convenience. Contact us if you have any questions._\n`;
    }

    msg += `\n— ZKR Store`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  if (isLoading) {
    return (
      <div className="min-h-96 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchError || !customer) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium">
            {fetchError ? fetchError.message : "Customer not found"}
          </p>
          <Link
            href="/customers"
            className="text-primary text-sm mt-3 inline-flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to customers
          </Link>
        </div>
      </div>
    );
  }

  const balance = customer.balance;
  const owes = balance > 0;
  const advance = balance < 0;
  const ledgerRows = getLedgerRows();
  const totalSpent = customer.sales.reduce((s, sale) => s + sale.total, 0);

  return (
    <div className="min-h-screen animate-fade-in">
      {/* Header Card */}
      <div className="bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 sm:py-6">
          <button
            onClick={() => router.push("/customers")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-4 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Customers
          </button>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 ring-1 ${
                  owes
                    ? "bg-destructive/15 text-destructive ring-destructive/25"
                    : advance
                      ? "bg-success/15 text-success ring-success/25"
                      : "bg-muted text-muted-foreground ring-border"
                }`}
              >
                {customer.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">
                  {customer.name}
                </h1>
                <div className="flex flex-wrap gap-3 mt-1.5">
                  {customer.phone && (
                    <a
                      href={`tel:${customer.phone}`}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition"
                    >
                      <Phone className="w-3.5 h-3.5" /> {customer.phone}
                    </a>
                  )}
                  {customer.address && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" /> {customer.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-left md:text-right shrink-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Current Balance
              </p>
              {owes ? (
                <p className="text-3xl font-bold text-destructive">
                  Rs. {balance.toLocaleString()}
                </p>
              ) : advance ? (
                <p className="text-3xl font-bold text-success">
                  Rs. {Math.abs(balance).toLocaleString()}
                </p>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground">Clear ✓</p>
              )}
              <p
                className={`text-sm mt-1 ${owes ? "text-destructive" : advance ? "text-success" : "text-muted-foreground"}`}
              >
                {owes
                  ? "Outstanding Debt"
                  : advance
                    ? "Advance Payment"
                    : "No pending balance"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-muted/50 rounded-xl p-3 text-center border border-border">
              <p className="text-xs text-muted-foreground mb-1">Total Sales</p>
              <p className="text-lg font-bold text-foreground">
                {customer.sales.length}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center border border-border">
              <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
              <p className="text-lg font-bold text-foreground">
                Rs. {totalSpent.toLocaleString()}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center border border-border">
              <p className="text-xs text-muted-foreground mb-1">Last Active</p>
              <p className="text-lg font-bold text-foreground">
                {customer.sales.length > 0
                  ? new Date(customer.sales[0].createdAt).toLocaleDateString(
                      "en-PK",
                      { day: "numeric", month: "short" },
                    )
                  : "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-5 pb-2">
            <button
              onClick={() => setShowPayment(true)}
              className="flex items-center gap-2 bg-success hover:bg-success/90 text-success-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-soft"
            >
              <Plus className="w-4 h-4" /> Record Payment
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-card border border-border hover:bg-muted text-foreground px-4 py-2.5 rounded-xl text-sm font-medium transition"
            >
              <Printer className="w-4 h-4" /> Download / Print PDF
            </button>
            {customer.phone && (
              <button
                onClick={shareOnWhatsApp}
                className="flex items-center gap-2 bg-card border border-border hover:bg-muted text-foreground px-4 py-2.5 rounded-xl text-sm font-medium transition"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
            )}
            {customer.phone && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2">
                <label
                  className="flex items-center gap-2 bg-card border border-border hover:bg-muted text-foreground px-3 py-2.5 rounded-xl text-sm font-medium transition has-[:focus]:border-ring has-[:focus]:ring-2 has-[:focus]:ring-ring/30"
                  aria-label="Statement month"
                >
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="month"
                    value={statementMonth}
                    onChange={(e) => setStatementMonth(e.target.value)}
                    className="bg-transparent outline-none text-sm text-foreground cursor-pointer"
                    aria-label="Statement month"
                  />
                </label>
                <button
                  onClick={sendMonthlyStatementWhatsApp}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-soft"
                >
                  <CalendarDays className="w-4 h-4" /> Send Monthly Statement
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 mt-6">
        <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit mb-4 border border-border">
          <button
            onClick={() => setActiveTab("ledger")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "ledger"
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCard className="w-4 h-4" /> Khata Ledger
            <span className="bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded-full">
              {customer.khataTransactions.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("sales")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "sales"
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingCart className="w-4 h-4" /> Sales
            <span className="bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded-full">
              {customer.sales.length}
            </span>
          </button>
        </div>

        {/* Khata Ledger */}
        {activeTab === "ledger" && (
          <div
            id="print-area"
            className="bg-card rounded-xl border border-border shadow-soft overflow-hidden mb-8"
          >
            {ledgerRows.length === 0 ? (
              <div className="p-12 text-center">
                <CreditCard className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-foreground font-medium">No transactions yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Credit purchases and payments will appear here
                </p>
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
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
                      {ledgerRows.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-muted/30 transition"
                        >
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(row.createdAt).toLocaleDateString(
                                "en-PK",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">
                              {new Date(row.createdAt).toLocaleTimeString(
                                "en-PK",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {row.debit > 0 ? (
                                <ArrowUpRight className="w-4 h-4 text-destructive shrink-0" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4 text-success shrink-0" />
                              )}
                              <div>
                                <p className="font-medium text-foreground">
                                  {row.sale
                                    ? `Sale #${row.sale.saleNumber}`
                                    : row.note || "Payment"}
                                </p>
                                {row.sale && (
                                  <p className="text-xs text-muted-foreground">
                                    Total: Rs. {row.sale.total.toLocaleString()}
                                  </p>
                                )}
                                {row.note && !row.sale && (
                                  <p className="text-xs text-muted-foreground">
                                    {row.note}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {row.debit > 0 ? (
                              <span className="font-semibold text-destructive">
                                {row.debit.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {row.credit > 0 ? (
                              <span className="font-semibold text-success">
                                {row.credit.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`font-bold ${
                                row.balance > 0
                                  ? "text-destructive"
                                  : row.balance < 0
                                    ? "text-success"
                                    : "text-foreground"
                              }`}
                            >
                              {Math.abs(row.balance).toLocaleString()}
                              {row.balance < 0 && (
                                <span className="text-xs font-normal ml-1">
                                  (adv)
                                </span>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden divide-y divide-border">
                  {ledgerRows.map((row) => (
                    <div key={row.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {row.debit > 0 ? (
                            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                              <ArrowUpRight className="w-4 h-4 text-destructive" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                              <ArrowDownRight className="w-4 h-4 text-success" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {row.sale
                                ? `Sale #${row.sale.saleNumber}`
                                : row.note || "Payment"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(row.createdAt).toLocaleDateString(
                                "en-PK",
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {row.debit > 0 ? (
                            <p className="text-sm font-bold text-destructive">
                              +{row.debit.toLocaleString()}
                            </p>
                          ) : (
                            <p className="text-sm font-bold text-success">
                              -{row.credit.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground">Balance</span>
                        <span
                          className={`text-sm font-bold ${
                            row.balance > 0
                              ? "text-destructive"
                              : row.balance < 0
                                ? "text-success"
                                : "text-foreground"
                          }`}
                        >
                          Rs. {Math.abs(row.balance).toLocaleString()}
                          {row.balance < 0 && (
                            <span className="text-xs font-normal ml-1">
                              adv
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-4 py-3 bg-muted/40 border-t border-border flex justify-between items-center">
                  <span className="text-sm font-medium text-foreground">
                    Closing Balance
                  </span>
                  <span
                    className={`text-lg font-bold ${
                      balance > 0
                        ? "text-destructive"
                        : balance < 0
                          ? "text-success"
                          : "text-foreground"
                    }`}
                  >
                    {balance > 0
                      ? `Owes Rs. ${balance.toLocaleString()}`
                      : balance < 0
                        ? `Advance Rs. ${Math.abs(balance).toLocaleString()}`
                        : "Clear ✓"}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Sales History */}
        {activeTab === "sales" && (
          <div className="bg-card rounded-xl border border-border shadow-soft mb-8">
            {customer.sales.length === 0 ? (
              <div className="p-12 text-center">
                <ShoppingCart className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-foreground font-medium">No sales yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Sales made to this customer will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {customer.sales.map((sale) => {
                  const due = sale.total - sale.paidAmount;
                  return (
                    <div
                      key={sale.id}
                      className="p-4 hover:bg-muted/30 transition"
                    >
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Receipt className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="font-mono text-sm font-medium text-foreground truncate">
                            {sale.saleNumber}
                          </span>
                          {due > 0 ? (
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-xs bg-destructive/15 text-destructive font-medium">
                              Due Rs. {due.toLocaleString()}
                            </span>
                          ) : (
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-xs bg-success/15 text-success font-medium">
                              Paid
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-foreground shrink-0">
                          Rs. {sale.total.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-1">
                        {sale.items
                          .map((i) => `${i.product.name} ×${i.quantity}`)
                          .join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {new Date(sale.createdAt).toLocaleDateString("en-PK", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        <span className="capitalize">{sale.paymentMethod}</span>
                      </p>
                    </div>
                  );
                })}
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
                  Record Payment
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {customer.name} —{" "}
                  {owes ? `Owes Rs. ${balance.toLocaleString()}` : "Clear"}
                </p>
              </div>
              <button
                onClick={closePayment}
                aria-label="Close payment dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPayType("payment")}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition ${
                    payType === "payment"
                      ? "bg-success text-success-foreground shadow-soft"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  Pay Debt
                </button>
                <button
                  onClick={() => setPayType("advance")}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition ${
                    payType === "advance"
                      ? "bg-info text-info-foreground shadow-soft"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  Add Advance
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

              {owes && payType === "payment" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setPayAmount(Math.round(balance).toString())}
                    className="flex-1 py-2 text-xs bg-success/10 text-success rounded-lg font-medium hover:bg-success/15 transition border border-success/20"
                  >
                    Full Amount (Rs. {Math.round(balance).toLocaleString()})
                  </button>
                  <button
                    onClick={() =>
                      setPayAmount(Math.round(balance / 2).toString())
                    }
                    className="flex-1 py-2 text-xs bg-muted text-muted-foreground rounded-lg font-medium hover:bg-muted/70 transition border border-border"
                  >
                    Half (Rs. {Math.round(balance / 2).toLocaleString()})
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                  Note (optional)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-input rounded-xl bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
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
                onClick={closePayment}
                className="px-4 py-2 text-sm text-foreground border border-border rounded-xl hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={payLoading}
                className="px-4 py-2 text-sm bg-success hover:bg-success/90 disabled:opacity-50 text-success-foreground rounded-xl font-semibold transition shadow-soft"
              >
                {payLoading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                    Recording...
                  </span>
                ) : (
                  "Record Payment"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          /* Hide everything on the page */
          body * {
            visibility: hidden;
          }

          /* Show only the print area and its children */
          #print-area,
          #print-area * {
            visibility: visible;
          }

          /* Position the print area at the top of the page */
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          /* Remove background colors for printing to save ink */
          .bg-card,
          .bg-muted,
          .bg-muted\/50,
          .bg-destructive\/10,
          .bg-success\/10 {
            background: white !important;
          }

          /* Hide buttons and tabs */
          button,
          .no-print {
            display: none !important;
          }

          /* Ensure tables fit on the page */
          table {
            width: 100% !important;
            font-size: 12px !important;
          }

          /* Show the hidden print header */
          .print\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
