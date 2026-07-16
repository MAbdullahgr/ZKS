"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  ArrowLeft,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Minus,
  Plus,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";

interface SaleItem {
  id: string;
  productId: string;
  product: { name: string; sku: string };
  quantity: number;
  unitPrice: number;
  total: number;
  returnedQty: number;
}

interface Sale {
  id: string;
  saleNumber: string;
  total: number;
  subtotal: number;
  paidAmount: number;
  paymentMethod: string;
  createdAt: string;
  customer?: { id: string; name: string };
  customerName?: string;
  items: SaleItem[];
  registerSessionId?: string;
}

interface ReturnItem {
  saleItemId: string;
  productId: string;
  quantity: number;
  maxQuantity: number;
  productName: string;
  unitPrice: number;
  effectivePrice: number;
}

export default function ReturnPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<"cash" | "khata">("cash");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{
    returnNumber: string;
    totalReturn: number;
  } | null>(null);
  const [error, setError] = useState("");

  const {
    data,
    error: fetchError,
    isLoading,
  } = useSWR<{ sale: Sale }>(
    `/api/sales/${id}`,
    (url: string) => apiGet<{ sale: Sale }>(url) as Promise<{ sale: Sale }>,
  );
  const sale = data?.sale;

  const { mutate: globalMutate } = useSWRConfig();

  const [initializedSaleId, setInitializedSaleId] = useState<string | null>(
    null,
  );
  if (sale && sale.id !== initializedSaleId) {
    setInitializedSaleId(sale.id);
    const discountRatio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1;
    setReturnItems(
      sale.items.map((item) => ({
        saleItemId: item.id,
        productId: item.productId,
        quantity: 0,
        maxQuantity: Math.max(0, item.quantity - (item.returnedQty || 0)),
        productName: item.product.name,
        unitPrice: item.unitPrice,
        effectivePrice: item.unitPrice * discountRatio,
      })),
    );
  }

  function updateQty(saleItemId: string, qty: number) {
    setReturnItems((prev) =>
      prev.map((i) =>
        i.saleItemId === saleItemId
          ? { ...i, quantity: Math.max(0, Math.min(qty, i.maxQuantity)) }
          : i,
      ),
    );
  }

  const selectedItems = returnItems.filter((i) => i.quantity > 0);
  const returnTotal = selectedItems.reduce(
    (sum, i) => sum + i.effectivePrice * i.quantity,
    0,
  );

  async function handleReturn() {
    if (selectedItems.length === 0) {
      setError("Select at least one item to return");
      return;
    }
    if (!sale) return;

    setLoading(true);
    setError("");

    try {
      const payload = {
        items: selectedItems.map((i) => ({
          saleItemId: i.saleItemId,
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.effectivePrice,
        })),
        refundLines: [{ method: refundMethod, amount: returnTotal }],
        reason: reason || "Customer return",
        registerSessionId: sale.registerSessionId || null,
      };

      const data = await apiPost<{
        saleReturn: { returnNumber: string };
        totalReturn: number;
      }>(`/api/sales/${id}/return`, payload);

      setSuccess({
        returnNumber: data?.saleReturn?.returnNumber ?? "RETURN",
        totalReturn: data?.totalReturn ?? returnTotal,
      });
      toast.success("Return processed successfully");
      await globalMutate(`/api/sales/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="h-10 w-40 shimmer rounded-lg" />
        <div className="h-64 shimmer rounded-xl" />
      </div>
    );
  }

  if (fetchError || !sale) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium">
            {fetchError ? fetchError.message : "Sale not found"}
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="p-6 flex items-center justify-center min-h-96">
        <div className="bg-card rounded-2xl shadow-soft-lg ring-1 ring-border p-10 text-center max-w-sm w-full animate-scale-in">
          <div className="w-16 h-16 bg-success/15 rounded-full flex items-center justify-center mx-auto mb-4 ring-1 ring-success/25">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-1">
            Return Processed
          </h2>
          <p className="text-muted-foreground text-sm mb-1">
            {success.returnNumber}
          </p>
          <p className="text-2xl font-bold text-warning dark:text-warning/80 mb-2">
            Rs. {success.totalReturn.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Refund via:{" "}
            <span className="font-medium capitalize text-foreground">
              {refundMethod}
            </span>
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/sales")}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-semibold transition text-sm shadow-soft"
            >
              Sales History
            </button>
            <button
              onClick={() => router.push(`/sales/${id}`)}
              className="flex-1 border border-border text-foreground hover:bg-muted py-2.5 rounded-xl font-semibold transition text-sm"
            >
              View Sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-2xl mx-auto animate-fade-in">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 text-sm transition"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Sale
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Process Return</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Original sale:{" "}
          <span className="font-medium text-foreground">{sale.saleNumber}</span>
          {(sale.customer?.name ?? sale.customerName) && (
            <> · {sale.customer?.name ?? sale.customerName}</>
          )}
        </p>
      </div>

      {/* Items selection */}
      <div className="bg-card rounded-2xl border border-border shadow-soft mb-4 overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-foreground">
            Select Items to Return
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set quantity to 0 to exclude an item
          </p>
        </div>
        <div className="divide-y divide-border">
          {returnItems.map((item) => (
            <div
              key={item.saleItemId}
              className="p-4 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.productName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Rs. {item.effectivePrice.toFixed(0)} per unit
                  {item.effectivePrice !== item.unitPrice && (
                    <span className="line-through ml-1 opacity-60">
                      Rs. {item.unitPrice.toLocaleString()}
                    </span>
                  )}
                  · max {item.maxQuantity}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      updateQty(item.saleItemId, item.quantity - 1)
                    }
                    aria-label={`Decrease return quantity for ${item.productName}`}
                    className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted transition text-muted-foreground"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={item.maxQuantity}
                    value={item.quantity}
                    onChange={(e) =>
                      updateQty(item.saleItemId, parseInt(e.target.value) || 0)
                    }
                    className="w-12 text-center border border-input rounded-md py-1 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 bg-background"
                  />
                  <button
                    onClick={() =>
                      updateQty(item.saleItemId, item.quantity + 1)
                    }
                    aria-label={`Increase return quantity for ${item.productName}`}
                    className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted transition text-muted-foreground"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-sm font-bold text-foreground w-24 text-right">
                  Rs. {(item.effectivePrice * item.quantity).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Refund method */}
      <div className="bg-card rounded-2xl border border-border shadow-soft p-4 mb-4">
        <h2 className="font-semibold text-foreground mb-3">Refund Method</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setRefundMethod("cash")}
            className={`p-3 rounded-lg border-2 text-sm font-medium text-left transition ${
              refundMethod === "cash"
                ? "border-success bg-success/10 text-success"
                : "border-border text-foreground hover:bg-muted"
            }`}
          >
            <p className="flex items-center gap-1.5">💵 Cash Refund</p>
            <p className="text-xs font-normal mt-0.5 opacity-70">
              Return money to customer
            </p>
          </button>
          <button
            onClick={() => setRefundMethod("khata")}
            disabled={!sale.customer}
            className={`p-3 rounded-lg border-2 text-sm font-medium text-left transition ${
              refundMethod === "khata"
                ? "border-info bg-info/10 text-info"
                : "border-border text-foreground hover:bg-muted"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <p className="flex items-center gap-1.5">📒 Add to Khata</p>
            <p className="text-xs font-normal mt-0.5 opacity-70">
              {sale.customer ? "Add credit to account" : "No customer account"}
            </p>
          </button>
        </div>

        <div className="mt-3">
          <label className="block text-sm font-medium text-foreground mb-1">
            Reason (optional)
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
            placeholder="Reason for return..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      {/* Summary + Submit */}
      <div className="bg-card rounded-2xl border border-border shadow-soft p-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <div>
            <p className="text-sm text-muted-foreground">Return Total</p>
            <p className="text-2xl font-bold text-warning dark:text-warning/80">
              Rs. {returnTotal.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedItems.length} item type
              {selectedItems.length !== 1 ? "s" : ""} selected
            </p>
          </div>
          <button
            onClick={handleReturn}
            disabled={loading || selectedItems.length === 0}
            className="flex items-center justify-center gap-2 bg-warning hover:bg-warning/90 disabled:opacity-50 text-warning-foreground px-6 py-3 rounded-xl font-semibold transition shrink-0 shadow-soft"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            {loading ? "Processing..." : "Confirm Return"}
          </button>
        </div>
        {error && (
          <p className="text-destructive text-sm flex items-center gap-1.5 bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}
