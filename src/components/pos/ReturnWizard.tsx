"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { usePos } from "@/lib/pos-store";
import { apiGet } from "@/lib/fetcher";
import {
  X,
  MagnifyingGlass,
  ArrowLeft,
  ArrowRight,
  Check,
  Calendar,
  User,
  Receipt,
  Minus,
  Plus,
  Money,
  BookOpen,
} from "@phosphor-icons/react";
import { toast } from "sonner";

interface SaleItemDetail {
  id: string;
  productId: string;
  productName: string;
  productImage?: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  returnedQty: number;
  availableQty: number;
  taxRate: number;
  taxAmount: number;
}

interface SaleSummary {
  id: string;
  saleNumber: string;
  customerName: string;
  total: number;
  saleDate: number;
  itemCount: number;
  paymentLines: { method: string; amount: number }[];
}

interface SaleDetail {
  id: string;
  saleNumber: string;
  customerName: string | null;
  customerId: string | null;
  subtotal: number;
  tax: number;
  total: number;
  saleDate: number;
  items: SaleItemDetail[];
  paymentLines: { method: string; amount: number }[];
}

function getPaymentMethodLabel(method: string): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "khata":
      return "Khata";
    case "card":
      return "Card";
    case "mobile":
      return "Mobile";
    default:
      return method;
  }
}

function getPaymentMethodIcon(method: string) {
  switch (method) {
    case "cash":
      return <Money size={12} weight="fill" />;
    case "khata":
      return <BookOpen size={12} weight="fill" />;
    default:
      return <Receipt size={12} weight="fill" />;
  }
}

function getPaymentMethodBadgeColor(method: string): string {
  switch (method) {
    case "cash":
      return "bg-success/15 text-success dark:bg-success/90/20 dark:text-success/70";
    case "khata":
      return "bg-warning/15 text-warning dark:bg-warning/90/20 dark:text-warning/80";
    case "card":
      return "bg-primary/15 text-primary dark:bg-primary/90/20 dark:text-primary/70";
    case "mobile":
      return "bg-info/15 text-info dark:bg-purple-900/20 dark:text-purple-400";
    default:
      return "bg-muted text-foreground/80 dark:bg-muted dark:text-muted-foreground";
  }
}

export default function ReturnWizard({ onClose }: { onClose: () => void }) {
  const { state, dispatch, customers } = usePos();
  const [step, setStep] = useState<"list" | "detail">("list");
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [returnItems, setReturnItems] = useState<Map<string, number>>(
    new Map(),
  );
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<
    "today" | "week" | "month" | "all" | "custom"
  >("today");
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dbSales, setDbSales] = useState<SaleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const fetchSales = async () => {
      setLoading(true);
      try {
        const response = await apiGet<{
          sales: Array<{
            id: string;
            saleNumber: string;
            customerName: string | null;
            total: number;
            saleDate: string;
            items: Array<{ quantity: number }>;
            payments: Array<{ method: string; amount: number }>;
          }>;
        }>("/api/sales?status=completed&limit=100");

        const list = response?.sales || [];
        const mapped: SaleSummary[] = list.map((s) => ({
          id: s.id,
          saleNumber: s.saleNumber,
          customerName: s.customerName || "Walk-in",
          total: Number(s.total),
          saleDate: new Date(s.saleDate).getTime(),
          itemCount: s.items.length,
          paymentLines: (s.payments || []).map((p) => ({
            method: p.method,
            amount: p.amount,
          })),
        }));
        setDbSales(mapped);
      } catch (err) {
        console.error("Failed to fetch sales:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSales();
  }, []);

  const allSales = useMemo(() => {
    // FIX: Strictly prefer DB records. Only use local if DB is completely empty (offline mode).
    if (dbSales.length > 0) return dbSales;

    return state.completedOrders.map((o) => ({
      id: o.id,
      saleNumber: String(o.saleNumber),
      customerName: o.customer?.name || "Walk-in",
      total: o.total,
      saleDate: o.createdAt,
      itemCount: o.items.length,
      paymentLines: o.paymentLines.map((p) => ({
        method: p.method,
        amount: p.amount,
      })),
    }));
  }, [dbSales, state.completedOrders]);

  const [stableNow] = useState(() => Date.now());

  const sales = useMemo(() => {
    let orders = allSales;
    if (dateFilter === "today") {
      const startOfDay = new Date().setHours(0, 0, 0, 0);
      orders = orders.filter((o) => o.saleDate >= startOfDay);
    } else if (dateFilter === "week") {
      const weekAgo = stableNow - 7 * 24 * 60 * 60 * 1000;
      orders = orders.filter((o) => o.saleDate >= weekAgo);
    } else if (dateFilter === "month") {
      const monthAgo = stableNow - 30 * 24 * 60 * 60 * 1000;
      orders = orders.filter((o) => o.saleDate >= monthAgo);
    } else if (dateFilter === "custom") {
      // Custom date range — inclusive of both bounds.
      const fromMs = customFromDate
        ? new Date(customFromDate).setHours(0, 0, 0, 0)
        : null;
      const toMs = customToDate
        ? new Date(customToDate).setHours(23, 59, 59, 999)
        : null;
      orders = orders.filter((o) => {
        if (fromMs !== null && o.saleDate < fromMs) return false;
        if (toMs !== null && o.saleDate > toMs) return false;
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      orders = orders.filter(
        (o) =>
          o.saleNumber.toString().toLowerCase().includes(q) ||
          o.customerName?.toLowerCase().includes(q),
      );
    }
    if (customerFilter.trim()) {
      const q = customerFilter.toLowerCase();
      orders = orders.filter((o) => o.customerName?.toLowerCase().includes(q));
    }
    return orders.sort((a, b) => b.saleDate - a.saleDate);
  }, [
    allSales,
    dateFilter,
    search,
    customerFilter,
    customFromDate,
    customToDate,
    stableNow,
  ]);

  const selectSale = useCallback(async (saleId: string) => {
    setLoadingDetail(true);
    try {
      interface ApiSaleItem {
        id: string;
        productId: string;
        quantity: number;
        unitPrice: string | number;
        returnedQty: number;
        taxRate?: string | number;
        taxAmount?: string | number;
        product: { name: string; sku: string; imageUrl?: string };
      }

      const response = await apiGet<{
        sale: {
          id: string;
          saleNumber: string;
          customerName: string | null;
          customerId: string | null;
          subtotal: number;
          tax: number;
          total: number;
          saleDate: string;
          items: ApiSaleItem[];
          payments: Array<{ method: string; amount: number }>;
        };
      }>(`/api/sales/${saleId}`);

      const sale = response?.sale;
      if (sale) {
        const items: SaleItemDetail[] = sale.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          productImage: item.product.imageUrl,
          sku: item.product.sku,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          returnedQty: item.returnedQty || 0,
          availableQty: item.quantity - (item.returnedQty || 0),
          taxRate: item.taxRate ? Number(item.taxRate) : 0,
          taxAmount: item.taxAmount ? Number(item.taxAmount) : 0,
        }));

        const detail: SaleDetail = {
          id: sale.id,
          saleNumber: sale.saleNumber,
          customerName: sale.customerName || "Walk-in",
          customerId: sale.customerId,
          subtotal: Number(sale.subtotal ?? 0),
          tax: Number(sale.tax ?? 0),
          total: Number(sale.total),
          saleDate: new Date(sale.saleDate).getTime(),
          items,
          paymentLines: (sale.payments || []).map((p) => ({
            method: p.method,
            amount: p.amount,
          })),
        };

        setSelectedSale(detail);
        const initialMap = new Map<string, number>();
        items.forEach((item) => initialMap.set(item.id, 0));
        setReturnItems(initialMap);
        setStep("detail");
        return;
      }
    } catch (err) {
      console.error("Failed to fetch sale detail:", err);
      toast.error(
        "Failed to load sale details. Please check your internet connection.",
      );
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // FIX: Keyboard navigation for the list
  useEffect(() => {
    if (step !== "list") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // FIX: Allow Escape to close the modal even if the search input is focused
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (document.activeElement === searchInputRef.current) {
        if (e.key === "ArrowDown" && sales.length > 0) {
          e.preventDefault();
          listRefs.current[0]?.focus();
          setSelectedIndex(0);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(selectedIndex + 1, sales.length - 1);
        setSelectedIndex(next);
        listRefs.current[next]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(prev);
        listRefs.current[prev]?.focus();
      } else if (e.key === "Enter" && sales[selectedIndex]) {
        e.preventDefault();
        selectSale(sales[selectedIndex].id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, sales, selectedIndex, onClose, selectSale]);

  const updateReturnQty = useCallback(
    (itemId: string, qty: number) => {
      setReturnItems((prev) => {
        const newMap = new Map(prev);
        const item = selectedSale?.items.find((i) => i.id === itemId);
        if (!item) return prev;
        const clamped = Math.max(0, Math.min(qty, item.availableQty));
        newMap.set(itemId, clamped);
        return newMap;
      });
    },
    [selectedSale],
  );

  const returnTotal = useMemo(() => {
    if (!selectedSale) return 0;
    let total = 0;
    returnItems.forEach((qty, itemId) => {
      const item = selectedSale.items.find((i) => i.id === itemId);
      if (item && qty > 0) total += qty * item.unitPrice;
    });
    return total;
  }, [selectedSale, returnItems]);

  // FIX (issue 10): Show tax in the return summary. Compute the refund tax
  // proportionally from each item's taxRate (or fall back to the sale-level
  // tax ratio if item-level tax is unavailable).
  const returnTax = useMemo(() => {
    if (!selectedSale) return 0;
    let tax = 0;
    returnItems.forEach((qty, itemId) => {
      const item = selectedSale.items.find((i) => i.id === itemId);
      if (!item || qty <= 0) return;
      const lineTotal = qty * item.unitPrice;
      if (item.taxAmount && item.quantity > 0) {
        // Per-line proportional tax from recorded taxAmount
        tax += (Number(item.taxAmount) / item.quantity) * qty;
      } else if (item.taxRate) {
        tax += Math.round(lineTotal * item.taxRate) / 100;
      }
    });
    return tax;
  }, [selectedSale, returnItems]);

  const returnGrandTotal = returnTotal + returnTax;

  const hasSelectedItems = useMemo(() => {
    for (const qty of returnItems.values()) if (qty > 0) return true;
    return false;
  }, [returnItems]);

  const handleLoadRefund = useCallback(() => {
    if (!selectedSale || !hasSelectedItems) return;
    const refundItems = selectedSale.items
      .filter((item) => (returnItems.get(item.id) || 0) > 0)
      .map((item) => {
        const returnQty = returnItems.get(item.id) || 0;
        return {
          id: item.id,
          productId: item.productId,
          name: item.productName,
          image: item.productImage,
          unitPrice: item.unitPrice,
          quantity: returnQty,
          isReturn: true,
          isZeroed: false,
          taxRate: item.taxRate || 0,
          originalCustomer: selectedSale.customerId
            ? customers.find((c) => c.id === selectedSale.customerId) || {
                id: selectedSale.customerId,
                name: selectedSale.customerName || "Walk-in",
                phone: "",
                balance: 0,
                creditLimit: 0,
              }
            : null,
        };
      });

    dispatch({
      type: "ENTER_RETURN_MODE",
      payload: {
        saleId: selectedSale.id,
        saleNumber: selectedSale.saleNumber,
        customerId: selectedSale.customerId || undefined,
        // FIX (issue 10): Do NOT pre-fill payment lines — they were confusing.
        // The cashier will add refund lines explicitly on the payment screen.
      },
    });
    dispatch({ type: "LOAD_REFUND_CART", payload: refundItems });
    onClose();
  }, [
    selectedSale,
    returnItems,
    hasSelectedItems,
    dispatch,
    onClose,
    customers,
  ]);

  useEffect(() => {
    if (step === "detail") {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setStep("list");
          setSelectedSale(null);
          setReturnItems(new Map());
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [step]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  if (loadingDetail) {
    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-primary-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <p className="text-sm">Loading sale details...</p>
        </div>
      </div>
    );
  }

  if (step === "list") {
    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-soft-lg dark:bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-4 dark:border-border">
            <div>
              <h2 className="text-xl font-bold text-foreground dark:text-foreground">
                Select Order to Return
              </h2>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                Choose a completed order to process a refund
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close return wizard"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground/80 dark:hover:bg-muted dark:hover:text-muted-foreground/60"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 border-b border-border px-4 sm:px-6 py-3 dark:border-border">
            <div className="relative flex-1 min-w-40">
              <MagnifyingGlass
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={18}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by sale number or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border py-2.5 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring dark:border-border dark:bg-muted dark:text-foreground"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {[
                { key: "today", label: "Today" },
                { key: "week", label: "This Week" },
                { key: "month", label: "This Month" },
                { key: "all", label: "All" },
                { key: "custom", label: "Custom" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setDateFilter(f.key as typeof dateFilter)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition whitespace-nowrap ${dateFilter === f.key ? "bg-card text-primary-foreground dark:bg-card dark:text-foreground" : "border border-border text-foreground/80 hover:bg-muted/30 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Customer filter + custom date range row (always shown for filtering) */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 sm:px-6 py-2 dark:border-border">
            <div className="flex items-center gap-2 flex-1 min-w-40">
              <User size={14} className="text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by customer name..."
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-full sm:w-56 rounded-lg border border-border py-1.5 px-3 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring dark:border-border dark:bg-muted dark:text-foreground"
              />
            </div>
            {dateFilter === "custom" && (
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-muted-foreground" />
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="rounded-lg border border-border py-1.5 px-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring dark:border-border dark:bg-muted dark:text-foreground dark:[color-scheme:dark]"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="rounded-lg border border-border py-1.5 px-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring dark:border-border dark:bg-muted dark:text-foreground dark:[color-scheme:dark]"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
            {loading ? (
              <div className="grid gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-xl border border-border p-4 dark:border-border"
                  >
                    <div className="h-12 w-12 animate-pulse rounded-lg bg-muted dark:bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/4 animate-pulse rounded bg-muted dark:bg-muted" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-muted dark:bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sales.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2">
                <Receipt size={32} className="text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  {allSales.length === 0
                    ? "No completed orders yet. Make a sale first!"
                    : "No orders match your filters"}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {sales.map((sale, index) => (
                  <button
                    key={sale.id}
                    ref={(el) => {
                      listRefs.current[index] = el;
                    }}
                    onClick={() => selectSale(sale.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 text-left transition outline-none ${
                      selectedIndex === index
                        ? "border-foreground/30 bg-muted/30 ring-2 ring-ring dark:border-white dark:bg-muted dark:ring-white"
                        : "border-border hover:border-border hover:bg-muted/30 dark:border-border dark:hover:border-border dark:hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted dark:bg-muted shrink-0">
                        <Receipt size={20} className="text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground dark:text-foreground">
                          #{sale.saleNumber}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User size={12} />
                          {sale.customerName}
                          <span>•</span>
                          <Calendar size={12} />
                          {new Date(sale.saleDate).toLocaleDateString("en-PK")}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {sale.paymentLines.map((line, idx) => (
                            <span
                              key={idx}
                              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${getPaymentMethodBadgeColor(line.method)}`}
                            >
                              {getPaymentMethodIcon(line.method)}
                              {getPaymentMethodLabel(line.method)}
                            </span>
                          ))}
                          {sale.paymentLines.length === 0 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground dark:bg-muted">
                              Unknown
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 self-end sm:self-auto shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground dark:text-foreground">
                          {sale.total.toLocaleString("en-PK")} Rs
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sale.itemCount} items
                        </p>
                      </div>
                      <ArrowRight size={18} className="text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-border px-6 py-3 dark:border-border">
            <p className="text-xs text-muted-foreground">
              {sales.length} order{sales.length !== 1 ? "s" : ""} found
              {allSales.length > 0 && ` (total: ${allSales.length})`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Detail View
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-soft-lg dark:bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-4 dark:border-border">
          <button
            onClick={() => {
              setStep("list");
              setSelectedSale(null);
              setReturnItems(new Map());
            }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 transition hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted"
          >
            <ArrowLeft size={16} /> Back to Orders
          </button>
          <div className="text-center">
            <h2 className="text-lg font-bold text-foreground dark:text-foreground">
              #{selectedSale?.saleNumber}
            </h2>
            <p className="text-xs text-muted-foreground">
              {selectedSale?.customerName} •{" "}
              {new Date(selectedSale?.saleDate || 0).toLocaleDateString(
                "en-PK",
              )}
            </p>
          </div>
          <div className="w-24" />
        </div>

        <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-border bg-muted/30 p-3 dark:border-border dark:bg-muted">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
            Original Payment
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {selectedSale?.paymentLines.map((line, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${getPaymentMethodBadgeColor(line.method)}`}
              >
                {getPaymentMethodIcon(line.method)}
                <span>{getPaymentMethodLabel(line.method)}</span>
                <span className="opacity-70">
                  {line.amount.toLocaleString("en-PK")} Rs
                </span>
              </div>
            ))}
            {selectedSale?.paymentLines.length === 0 && (
              <span className="text-xs text-muted-foreground dark:text-muted-foreground">
                Payment method unknown
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground dark:text-muted-foreground">
            Refund will default to the same payment split
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">
              Select items and quantities to return:
            </p>
            {selectedSale?.items.map((item) => {
              const returnQty = returnItems.get(item.id) || 0;
              const isFullyReturned = item.availableQty === 0;
              return (
                <div
                  key={item.id}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl border p-4 transition ${
                    returnQty > 0
                      ? "border-warning/25 bg-warning/10 dark:border-amber-800 dark:bg-warning/90/10"
                      : "border-border dark:border-border"
                  } ${isFullyReturned ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted dark:bg-muted">
                    {item.productImage ? (
                      <Image
                        src={item.productImage}
                        alt={item.productName}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Receipt size={20} className="text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground dark:text-foreground">
                      {item.productName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sold: {item.quantity}
                    </p>
                    <p className="text-xs font-medium text-foreground/80 dark:text-muted-foreground/60">
                      {item.unitPrice.toLocaleString("en-PK")} Rs each
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto shrink-0">
                    {isFullyReturned ? (
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground dark:bg-muted">
                        Fully Returned
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() =>
                            updateReturnQty(item.id, returnQty - 1)
                          }
                          disabled={returnQty <= 0}
                          aria-label={`Decrease return quantity for ${item.productName}`}
                          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-foreground/80 transition hover:bg-muted disabled:opacity-30 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"
                        >
                          <Minus size={14} weight="bold" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-foreground dark:text-foreground">
                          {returnQty}
                        </span>
                        <button
                          onClick={() =>
                            updateReturnQty(item.id, returnQty + 1)
                          }
                          disabled={returnQty >= item.availableQty}
                          aria-label={`Increase return quantity for ${item.productName}`}
                          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-foreground/80 transition hover:bg-muted disabled:opacity-30 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"
                        >
                          <Plus size={14} weight="bold" />
                        </button>
                        <button
                          onClick={() =>
                            updateReturnQty(item.id, item.availableQty)
                          }
                          className="ml-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-bold text-foreground/80 transition hover:bg-muted dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted"
                        >
                          All
                        </button>
                      </>
                    )}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border px-4 sm:px-6 py-4 dark:border-border">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-6">
                <p className="text-xs text-muted-foreground">Items subtotal</p>
                <p className="text-sm font-semibold text-foreground/80 dark:text-muted-foreground/60">
                  {returnTotal.toLocaleString("en-PK")} Rs
                </p>
              </div>
              <div className="flex items-baseline justify-between gap-6">
                <p className="text-xs text-muted-foreground">Tax</p>
                <p className="text-sm font-semibold text-foreground/80 dark:text-muted-foreground/60">
                  {returnTax.toLocaleString("en-PK", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{" "}
                  Rs
                </p>
              </div>
              <div className="flex items-baseline justify-between gap-6 pt-1 border-t border-border dark:border-border">
                <p className="text-sm text-muted-foreground">Refund total</p>
                {/* FIX (issue 10): Show tax + subtotal as the grand total */}
                <p
                  className={`text-2xl font-black ${returnGrandTotal === selectedSale?.total ? "text-warning dark:text-warning/80" : "text-foreground dark:text-foreground"}`}
                >
                  {returnGrandTotal.toLocaleString("en-PK")}
                  <span className="ml-1 text-sm font-bold text-muted-foreground">
                    Rs
                  </span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Original total</p>
              <p className="text-lg font-bold text-muted-foreground">
                {selectedSale?.total.toLocaleString("en-PK")} Rs
              </p>
              {selectedSale && selectedSale.tax > 0 && (
                <p className="text-xs text-muted-foreground">
                  (incl. {selectedSale.tax.toLocaleString("en-PK")} Rs tax)
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep("list");
                setSelectedSale(null);
                setReturnItems(new Map());
              }}
              className="flex-1 rounded-xl border border-border py-3 text-sm font-semibold text-foreground/80 transition hover:bg-muted/30 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleLoadRefund}
              disabled={!hasSelectedItems}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold text-primary-foreground transition ${
                hasSelectedItems
                  ? "bg-warning hover:bg-warning/90 dark:bg-warning dark:hover:bg-warning/80"
                  : "cursor-not-allowed bg-muted-foreground/40 dark:bg-muted"
              }`}
            >
              {hasSelectedItems ? (
                <span className="flex items-center justify-center gap-2">
                  <Check size={16} weight="bold" /> Load Return Cart
                </span>
              ) : (
                "Select items to return"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
