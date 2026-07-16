"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  RotateCcw,
  CheckCircle2,
  User,
  Phone,
  CreditCard,
  Package,
  StickyNote,
  AlertCircle,
} from "lucide-react";
import { apiGet } from "@/lib/fetcher";

interface SalePayment {
  id: string;
  method: string;
  amount: number;
}

interface SaleItem {
  id: string;
  product: { name: string; sku: string; imageUrl?: string };
  quantity: number;
  unitPrice: number;
  costPrice: number;
  total: number;
  profit: number;
  returnedQty: number;
  note?: string;
}

interface SaleReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  total: number;
  reason?: string;
}

interface Sale {
  id: string;
  saleNumber: string;
  total: number;
  subtotal: number;
  tax: number;
  discount: number;
  paidAmount: number;
  paymentMethod: string;
  saleDate: string;
  createdAt: string;
  status: string;
  returnStatus: string;
  notes?: string;
  customerName?: string;
  customer?: { id: string; name: string; phone?: string };
  items: SaleItem[];
  payments: SalePayment[];
  returns: SaleReturn[];
  registerSessionId?: string;
  store?: { name: string };
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-success/15 text-success border-success/20",
  pending: "bg-warning/15 text-warning border-warning/25",
  cancelled: "bg-destructive/15 text-destructive border-destructive/20",
  returned:
    "bg-warning/15 text-warning border-warning/25",
};

const PAYMENT_DOT: Record<string, string> = {
  cash: "bg-success",
  card: "bg-info",
  mobile: "bg-primary",
  easypaisa: "bg-primary",
  jazzcash: "bg-primary",
  credit: "bg-destructive",
  khata: "bg-warning",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  mobile: "Mobile",
  easypaisa: "Easypaisa",
  jazzcash: "JazzCash",
  credit: "Credit",
  khata: "Khata",
};

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const {
    data,
    error: fetchError,
    isLoading,
  } = useSWR<{ sale: Sale }>(
    `/api/sales/${id}`,
    (url: string) => apiGet<{ sale: Sale }>(url) as Promise<{ sale: Sale }>,
  );
  const sale = data?.sale;

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="h-10 w-32 shimmer rounded-lg" />
        <div className="h-48 shimmer rounded-xl" />
        <div className="h-64 shimmer rounded-xl" />
      </div>
    );
  }

  if (fetchError || !sale) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium">
            {fetchError ? fetchError.message : "Sale not found"}
          </p>
          <Link
            href="/sales"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Sales
          </Link>
        </div>
      </div>
    );
  }

  const due = sale.total - sale.paidAmount;
  const isFullyReturned = sale.returnStatus === "full";
  const canReturn = sale.status === "completed" && !isFullyReturned;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto print-area animate-fade-in">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 text-sm transition no-print"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Sales
      </button>

      {/* Header */}
      <div className="bg-card rounded-2xl border border-border shadow-soft p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                {sale.saleNumber}
              </h1>
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[sale.status] || "bg-muted text-muted-foreground border-border"}`}
              >
                {sale.status}
              </span>
              {sale.returnStatus !== "none" && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-warning/15 text-warning dark:text-warning/80 border-warning/25">
                  {sale.returnStatus} return
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {new Date(sale.saleDate).toLocaleDateString("en-PK", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              at{" "}
              {new Date(sale.saleDate).toLocaleTimeString("en-PK", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {sale.store?.name && (
              <p className="text-xs text-muted-foreground mt-1">
                Store: <span className="font-medium">{sale.store.name}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => window.print()}
            className="shrink-0 flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-muted transition no-print"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>

        {/* Customer + Payment */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">
              Customer
            </p>
            {sale.customer ? (
              <div>
                <Link
                  href={`/customers/${sale.customer.id}`}
                  className="text-sm font-medium text-primary hover:underline flex items-center gap-1.5"
                >
                  <User className="w-3.5 h-3.5" /> {sale.customer.name}
                </Link>
                {sale.customer.phone && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {sale.customer.phone}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {sale.customerName ?? "Walk-in Customer"}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">
              Payment Method
            </p>
            <p className="text-sm font-medium text-foreground capitalize">
              {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
            </p>
          </div>
          {due > 0 && (
            <div className="col-span-1 sm:col-span-2 bg-destructive/10 rounded-lg p-3 flex justify-between items-center border border-destructive/20">
              <p className="text-sm text-destructive font-medium">
                Outstanding Balance
              </p>
              <p className="text-sm font-bold text-destructive">
                Rs. {due.toLocaleString()}
              </p>
            </div>
          )}
          {sale.notes && (
            <div className="col-span-1 sm:col-span-2 bg-muted/60 rounded-lg p-3 flex items-start gap-2 border border-border">
              <StickyNote className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-foreground/80">{sale.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Breakdown */}
      {sale.payments && sale.payments.length > 0 && (
        <div className="bg-card rounded-2xl border border-border shadow-soft p-4 mb-4">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" /> Payment
            Breakdown
          </h2>
          <div className="space-y-2">
            {sale.payments.map((p) => (
              <div
                key={p.id}
                className="flex justify-between items-center text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${PAYMENT_DOT[p.method] ?? "bg-muted-foreground"}`}
                  />
                  <span className="capitalize text-foreground/80">
                    {p.method}
                  </span>
                </span>
                <span className="font-medium text-foreground">
                  Rs. {p.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-card rounded-2xl border border-border shadow-soft mb-4 overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" /> Items
            Purchased
          </h2>
          <span className="text-xs text-muted-foreground">
            {sale.items.length} item{sale.items.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-2 font-semibold">Product</th>
                <th className="px-4 py-2 font-semibold text-right">Qty</th>
                <th className="px-4 py-2 font-semibold text-right">Unit Price</th>
                <th className="px-4 py-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sale.items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.product.sku}
                    </p>
                    {item.note && (
                      <p className="text-xs text-warning mt-0.5">
                        Note: {item.note}
                      </p>
                    )}
                    {item.returnedQty > 0 && (
                      <p className="text-xs text-warning dark:text-warning/80 mt-0.5">
                        {item.returnedQty} returned
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground/80">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground/80">
                    Rs. {item.unitPrice.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    Rs. {item.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-4 border-t border-border space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>Rs. {sale.subtotal.toLocaleString()}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Discount</span>
              <span className="text-destructive">
                - Rs. {sale.discount.toLocaleString()}
              </span>
            </div>
          )}
          {sale.tax > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tax</span>
              <span>Rs. {sale.tax.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-foreground text-base pt-2 border-t border-border">
            <span>Total</span>
            <span>Rs. {sale.total.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Paid</span>
            <span className="text-success font-medium">
              Rs. {sale.paidAmount.toLocaleString()}
            </span>
          </div>
          {due > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Due (Khata)</span>
              <span className="text-destructive font-medium">
                Rs. {due.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Return History */}
      {sale.returns && sale.returns.length > 0 && (
        <div className="bg-card rounded-2xl border border-border shadow-soft p-4 mb-4">
          <h2 className="font-semibold text-foreground mb-3">Return History</h2>
          <div className="space-y-2">
            {sale.returns.map((ret) => (
              <div
                key={ret.id}
                className="flex justify-between items-center text-sm p-3 bg-warning/10 rounded-lg border border-warning/20"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {ret.returnNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(ret.returnDate).toLocaleDateString("en-PK")}
                    {ret.reason && ` · ${ret.reason}`}
                  </p>
                </div>
                <p className="font-bold text-warning dark:text-warning/80">
                  Rs. {ret.total.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 no-print">
        {canReturn && (
          <button
            onClick={() => router.push(`/sales/${sale.id}/return`)}
            className="flex items-center gap-2 px-4 py-2 border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 rounded-lg text-sm font-medium transition"
          >
            <RotateCcw className="w-4 h-4" /> Process Return
          </button>
        )}
        {isFullyReturned && (
          <span className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-lg text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" /> Fully Returned
          </span>
        )}
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area,
          .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
