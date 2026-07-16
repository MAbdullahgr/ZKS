"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  CheckCircle,
  Package,
  Loader2,
  Mail,
  Printer,
  XCircle,
  Clock,
  MapPin,
  Phone,
  MailIcon,
  FileText,
  Truck,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";

interface PurchaseOrderItem {
  id: string;
  quantity: number;
  unitCost: number;
  total: number;
  receivedQty: number;
  product: { name: string; sku: string; stockQuantity: number };
}

interface Supplier {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: "draft" | "ordered" | "partial" | "received" | "cancelled";
  totalAmount: number;
  subtotal: number;
  taxAmount: number;
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  notes?: string;
  supplier: Supplier;
  items: PurchaseOrderItem[];
}

const STATUS_FLOW = [
  { key: "draft", label: "RFQ", icon: Clock },
  { key: "ordered", label: "Purchase Order", icon: CheckCircle },
  { key: "partial", label: "Partial", icon: Package },
  { key: "received", label: "Done", icon: CheckCircle },
];

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  draft: {
    label: "RFQ",
    color: "text-foreground/80",
    bg: "bg-muted/40",
    border: "border-border",
  },
  ordered: {
    label: "Purchase Order",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  partial: {
    label: "Partially Received",
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/25",
  },
  received: {
    label: "Done",
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/20",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
  },
};

type TabKey = "products" | "deliveries" | "notes";

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // FIX: Use SWR for data fetching and auto-unwrapping
  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<{ order: PurchaseOrder }>(
    `/api/purchases/${id}`,
    (url: string) =>
      apiGet<{ order: PurchaseOrder }>(url) as Promise<{
        order: PurchaseOrder;
      }>,
  );
  const order = data?.order;

  const [activeTab, setActiveTab] = useState<TabKey>("products");
  const [receivingMode, setReceivingMode] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [newCostPrices, setNewCostPrices] = useState<Record<string, number>>(
    {},
  );
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // FIX P1 + P3 + lint: React 19 disallows calling setState inside useEffect.
  // The proper pattern for "reset state when a prop changes" is to adjust
  // state DURING RENDER (React supports this — it re-renders immediately
  // without committing). This runs only when order.id changes, preserving
  // user edits during SWR revalidation.
  // See: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [initializedOrderId, setInitializedOrderId] = useState<string | null>(
    null,
  );
  if (order && order.id !== initializedOrderId) {
    const qtys: Record<string, number> = {};
    const costs: Record<string, number> = {};
    order.items.forEach((item) => {
      qtys[item.id] = item.quantity - item.receivedQty;
      costs[item.id] = item.unitCost;
    });
    setReceiveQtys(qtys);
    setNewCostPrices(costs);
    setInitializedOrderId(order.id);
  }

  async function doAction(action: string, body?: object) {
    setActionLoading(action);
    try {
      await apiPatch(`/api/purchases/${id}`, body || { status: action });
      toast.success(`Order marked as ${action}`);
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSendEmail() {
    setActionLoading("email");
    try {
      await apiPost(`/api/purchases/${id}/send`, {});
      toast.success("RFQ sent to vendor by email");
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePrint() {
    window.print();
  }

  async function handleReceive() {
    if (!order) return;
    const items = order.items
      .filter((item) => (receiveQtys[item.id] ?? 0) > 0)
      .map((item) => ({
        purchaseOrderItemId: item.id,
        receivedQty: receiveQtys[item.id],
        newCostPrice: newCostPrices[item.id],
      }));

    if (items.length === 0) {
      setReceiveError("Enter quantity for at least one item");
      return;
    }

    setReceiving(true);
    setReceiveError("");
    try {
      await apiPost(`/api/purchases/${id}/receive`, { items });
      toast.success("Stock received successfully");
      setReceivingMode(false);
      mutate(); // Refresh data
    } catch (err) {
      setReceiveError(err instanceof Error ? err.message : "Failed to receive");
    } finally {
      setReceiving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-muted/40">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchError || !order) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">
          {fetchError ? fetchError.message : "Order not found"}
        </p>
        <button
          onClick={() => router.push("/purchases")}
          className="text-primary text-sm mt-2"
        >
          Back to Purchases
        </button>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[order.status];
  const currentFlowIndex = STATUS_FLOW.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === "cancelled";
  const isDone = order.status === "received";

  const canConfirm = order.status === "draft";
  const canCancel = !isDone && !isCancelled;
  const canReceive =
    (order.status === "ordered" || order.status === "partial") && !isCancelled;
  const canSendEmail = order.status === "draft";

  return (
    <div className="min-h-screen bg-muted/40 print:bg-card">
      {/* Breadcrumb */}
      <div className="bg-card border-b border-border print:hidden">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3">
          <button
            onClick={() => router.push("/purchases")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" /> Purchases
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="bg-card no-print border-b border-border print:hidden">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.color} border ${cfg.border}`}
              >
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-bold text-foreground">
                    {order.orderNumber}
                  </h1>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}
                  >
                    {cfg.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {order.supplier.name} ·{" "}
                  {new Date(order.orderDate).toLocaleDateString("en-PK", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {canSendEmail && (
                <button
                  onClick={handleSendEmail}
                  disabled={actionLoading === "email"}
                  className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border hover:bg-muted/40 text-foreground/80 rounded-xl text-sm font-medium transition"
                >
                  <Mail className="w-4 h-4" />
                  {actionLoading === "email" ? "Sending..." : "Send by Email"}
                </button>
              )}
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border hover:bg-muted/40 text-foreground/80 rounded-xl text-sm font-medium transition"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              {canConfirm && (
                <button
                  onClick={() => doAction("ordered")}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition shadow-soft"
                >
                  <CheckCircle className="w-4 h-4" /> Confirm Order
                </button>
              )}
              {canReceive && !receivingMode && (
                <button
                  onClick={() => setReceivingMode(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-success hover:bg-success/90 text-success-foreground rounded-xl text-sm font-semibold transition shadow-soft"
                >
                  <Package className="w-4 h-4" /> Receive
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => {
                    if (confirm("Cancel this order?")) doAction("cancelled");
                  }}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-card border border-destructive/20 hover:bg-destructive/10 text-destructive rounded-xl text-sm font-medium transition"
                >
                  <XCircle className="w-4 h-4" /> Cancel
                </button>
              )}
            </div>
          </div>

          {/* Status Flow Bar */}
          {!isCancelled && (
            <div className=" no-print mt-6 flex items-center gap-0">
              {STATUS_FLOW.map((step, idx) => {
                const StepIcon = step.icon;
                const isActive = idx <= currentFlowIndex;
                const isCurrent = idx === currentFlowIndex;
                return (
                  <div key={step.key} className="flex items-center flex-1">
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        isActive
                          ? isCurrent
                            ? "bg-primary text-primary-foreground shadow-soft"
                            : "bg-primary/10 text-primary"
                          : "bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <StepIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">{step.label}</span>
                    </div>
                    {idx < STATUS_FLOW.length - 1 && (
                      <ChevronRight
                        className={`w-4 h-4 mx-1 shrink-0 ${
                          idx < currentFlowIndex
                            ? "text-primary/70"
                            : "text-muted-foreground/60"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="print-area max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Vendor Card */}
            <div className="bg-card rounded-xl border border-border shadow-soft p-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                Vendor
              </h3>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {order.supplier.name.charAt(0).toUpperCase()}
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {order.supplier.name}
                  </p>
                  {order.supplier.address && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                      {order.supplier.address}
                    </p>
                  )}
                  {order.supplier.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                      {order.supplier.phone}
                    </p>
                  )}
                  {order.supplier.email && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <MailIcon className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                      {order.supplier.email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-card rounded-xl border border-border shadow-soft overflow-hidden">
              <div className="border-b border-border">
                <div className="flex">
                  {[
                    { id: "products", label: "Products", icon: Package },
                    { id: "deliveries", label: "Deliveries", icon: Truck },
                    { id: "notes", label: "Notes", icon: FileText },
                  ].map((tab) => {
                    const TabIcon = tab.icon;
                    const active = activeTab === (tab.id as TabKey);
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabKey)}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
                          active
                            ? "border-primary text-primary bg-primary/10/50"
                            : "border-transparent text-muted-foreground hover:text-foreground/80 hover:bg-muted/40"
                        }`}
                      >
                        <TabIcon className="w-4 h-4" /> {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-5">
                {/* Products Tab */}
                {activeTab === "products" && (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b border-border">
                          <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                            <th className="px-3 py-2 font-medium">Product</th>
                            <th className="px-3 py-2 font-medium text-right">
                              Ordered
                            </th>
                            <th className="px-3 py-2 font-medium text-right">
                              Received
                            </th>
                            <th className="px-3 py-2 font-medium text-right">
                              Unit Cost
                            </th>
                            <th className="px-3 py-2 font-medium text-right">
                              Subtotal
                            </th>
                            {receivingMode && (
                              <th className="px-3 py-2 font-medium text-right text-success">
                                Receive
                              </th>
                            )}
                            {receivingMode && (
                              <th className="px-3 py-2 font-medium text-right">
                                New Cost
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {order.items.map((item) => {
                            const remaining = item.quantity - item.receivedQty;
                            return (
                              <tr
                                key={item.id}
                                className="hover:bg-muted/40 transition"
                              >
                                <td className="px-3 py-3">
                                  <p className="font-medium text-foreground">
                                    {item.product.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.product.sku} · Stock:{" "}
                                    {item.product.stockQuantity}
                                  </p>
                                </td>
                                <td className="px-3 py-3 text-right text-foreground/80">
                                  {item.quantity}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <span
                                    className={
                                      item.receivedQty >= item.quantity
                                        ? "text-success font-medium"
                                        : "text-foreground/80"
                                    }
                                  >
                                    {item.receivedQty}
                                  </span>
                                  {remaining > 0 && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      ({remaining} pending)
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-right text-foreground/80">
                                  Rs. {item.unitCost.toLocaleString()}
                                </td>
                                <td className="px-3 py-3 text-right font-medium text-foreground">
                                  Rs. {item.total.toLocaleString()}
                                </td>
                                {receivingMode && (
                                  <td className="px-3 py-3 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.001" // FIX: Allow decimals
                                      value={receiveQtys[item.id] ?? 0}
                                      onChange={(e) =>
                                        setReceiveQtys((prev) => ({
                                          ...prev,
                                          // FIX: Use parseFloat instead of parseInt
                                          [item.id]: Math.min(
                                            parseFloat(e.target.value) || 0,
                                            remaining,
                                          ),
                                        }))
                                      }
                                      className="w-20 px-2 py-1 border border-border rounded text-sm text-right outline-none focus:border-ring"
                                    />
                                  </td>
                                )}
                                {receivingMode && (
                                  <td className="px-3 py-3 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      value={
                                        newCostPrices[item.id] ?? item.unitCost
                                      }
                                      onChange={(e) =>
                                        setNewCostPrices((prev) => ({
                                          ...prev,
                                          [item.id]:
                                            parseFloat(e.target.value) || 0,
                                        }))
                                      }
                                      className="w-24 px-2 py-1 border border-border rounded text-sm text-right outline-none focus:border-ring"
                                    />
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Receive Actions */}
                    {receivingMode && (
                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Update cost price if supplier charged differently
                          </p>
                          {receiveError && (
                            <p className="text-destructive text-sm mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />{" "}
                              {receiveError}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setReceivingMode(false)}
                            className="px-4 py-2 text-sm text-foreground/80 border border-border rounded-lg hover:text-foreground transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleReceive}
                            disabled={receiving}
                            className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success/90 disabled:opacity-50 text-success-foreground rounded-lg text-sm font-semibold transition"
                          >
                            <Package className="w-4 h-4" />
                            {receiving ? "Receiving..." : "Validate Receipt"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Deliveries Tab */}
                {activeTab === "deliveries" && (
                  <div className="space-y-3">
                    {order.items.some((i) => i.receivedQty > 0) ? (
                      <div className="bg-muted/40 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Truck className="w-5 h-5 text-primary" />
                          <h4 className="font-semibold text-foreground">
                            Receipts
                          </h4>
                        </div>
                        <div className="space-y-2">
                          {order.items
                            .filter((i) => i.receivedQty > 0)
                            .map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between bg-card rounded-lg p-3 border border-border"
                              >
                                <div>
                                  <p className="font-medium text-sm text-foreground">
                                    {item.product.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.receivedQty} of {item.quantity}{" "}
                                    received
                                  </p>
                                </div>
                                <div className="w-24 bg-muted rounded-full h-2">
                                  <div
                                    className="bg-primary/100 h-2 rounded-full"
                                    style={{
                                      width: `${Math.min(100, (item.receivedQty / item.quantity) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                        {order.receivedDate && (
                          <p className="text-xs text-muted-foreground mt-3">
                            Fully received on{" "}
                            {new Date(order.receivedDate).toLocaleDateString(
                              "en-PK",
                              {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              },
                            )}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Truck className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">
                          No deliveries yet
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes Tab */}
                {activeTab === "notes" && (
                  <div>
                    {order.notes ? (
                      <div className="bg-warning/10 border border-amber-100 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-warning mb-2">
                          Terms & Conditions
                        </h4>
                        <p className="text-sm text-warning whitespace-pre-wrap">
                          {order.notes}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">No notes</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Order Info */}
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border shadow-soft p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Order Info
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Order Date</span>
                  <span className="text-sm font-medium text-foreground">
                    {new Date(order.orderDate).toLocaleDateString("en-PK")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Expected Date</span>
                  <span className="text-sm font-medium text-foreground">
                    {order.expectedDate
                      ? new Date(order.expectedDate).toLocaleDateString("en-PK")
                      : "—"}
                  </span>
                </div>
                {order.receivedDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Received Date</span>
                    <span className="text-sm font-medium text-success">
                      {new Date(order.receivedDate).toLocaleDateString("en-PK")}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Untaxed Amount</span>
                  <span className="font-medium text-foreground">
                    Rs. {order.subtotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Taxes</span>
                  <span className="font-medium text-foreground">
                    Rs. {order.taxAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-base font-semibold text-foreground">
                    Total
                  </span>
                  <span className="text-base font-bold text-foreground">
                    Rs. {order.totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Totals Card */}
            <div className="bg-card rounded-xl border border-border shadow-soft p-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">
                Totals
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Products</span>
                  <span className="font-medium text-foreground">
                    {order.items.length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Qty</span>
                  <span className="font-medium text-foreground">
                    {order.items.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Received Qty</span>
                  <span
                    className={`font-medium ${
                      order.items.every((i) => i.receivedQty >= i.quantity)
                        ? "text-success"
                        : "text-warning"
                    }`}
                  >
                    {order.items.reduce((s, i) => s + i.receivedQty, 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
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
