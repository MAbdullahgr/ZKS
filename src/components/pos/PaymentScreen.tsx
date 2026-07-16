"use client";

import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import {
  usePos,
  type CartItem,
  type Customer,
  type PaymentLine,
} from "@/lib/pos-store";
import { apiPost } from "@/lib/fetcher";
import {
  Money,
  BookOpen,
  X,
  User,
  FileText,
  ArrowLeft,
  Backspace,
  PencilSimple,
  ArrowCounterClockwise,
  CreditCard,
  DeviceMobileCamera,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { announceSaleComplete } from "@/lib/voice";

type PaymentMethod =
  "cash" | "khata" | "card" | "mobile" | "easypaisa" | "jazzcash";

interface PaymentMethodConfig {
  id: PaymentMethod;
  label: string;
  icon: React.ReactNode;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-PK");
}

function getChangeBreakdown(amount: number): string {
  if (amount <= 0) return "";
  const notes = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];
  let remaining = Math.round(amount);
  const parts: string[] = [];
  for (const n of notes) {
    if (remaining >= n) {
      const count = Math.floor(remaining / n);
      remaining %= n;
      parts.push(`${count}×${n}`);
    }
  }
  return parts.join(", ");
}

// Human-readable label for a payment method id
function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    card: "Card",
    mobile: "Mobile",
    easypaisa: "Easypaisa",
    jazzcash: "JazzCash",
    khata: "Customer Account",
    credit: "Credit",
  };
  return labels[method] ?? method;
}

function getPaymentMethodConfig(): PaymentMethodConfig[] {
  return [
    { id: "cash", label: "Cash", icon: <Money size={20} weight="fill" /> },
    { id: "card", label: "Card", icon: <CreditCard size={20} weight="fill" /> },
    {
      id: "easypaisa",
      label: "Easypaisa",
      icon: <DeviceMobileCamera size={20} weight="fill" />,
    },
    {
      id: "jazzcash",
      label: "JazzCash",
      icon: <DeviceMobileCamera size={20} weight="fill" />,
    },
    {
      id: "mobile",
      label: "Mobile",
      icon: <DeviceMobileCamera size={20} weight="fill" />,
    },
    {
      id: "khata",
      label: "Customer Account",
      icon: <BookOpen size={20} weight="fill" />,
    },
  ];
}

export default function PaymentScreen() {
  const {
    state,
    dispatch,
    cartTotal: cartSubtotal,
    cartTax,
    cartTotalWithTax,
    remainingPayment,
    totalPaid,
    changeDue,
    displayTaxBreakdown,
    // AUDIT-FIX H-5: Pull store info from settings via usePos() for receipts.
    storeInfo,
  } = usePos();
  const { mutate } = useSWRConfig();
  const [saving, setSaving] = useState(false);

  // ─── Stable refs ───
  const stateRef = useRef(state);
  const dispatchRef = useRef(dispatch);
  const cartTotalRef = useRef(cartTotalWithTax);
  const remainingPaymentRef = useRef(remainingPayment);
  const totalPaidRef = useRef(totalPaid);
  const changeDueRef = useRef(changeDue);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  useEffect(() => {
    cartTotalRef.current = cartTotalWithTax;
  }, [cartTotalWithTax]);
  useEffect(() => {
    remainingPaymentRef.current = remainingPayment;
  }, [remainingPayment]);
  useEffect(() => {
    totalPaidRef.current = totalPaid;
  }, [totalPaid]);
  useEffect(() => {
    changeDueRef.current = changeDue;
  }, [changeDue]);

  const customer = state.customer;
  const isKhata = state.activePaymentMethod === "khata";
  const isRefund = cartTotalWithTax < 0;

  const bufferTouched = useRef(false);
  const paymentMethods = useMemo(() => getPaymentMethodConfig(), []);

  const wouldExceedLimit = useMemo(() => {
    if (!isKhata || !customer) return false;
    if (customer.creditLimit === 0) return false;
    if (isRefund && remainingPayment < 0) return false;
    return customer.balance + remainingPayment > customer.creditLimit;
  }, [isKhata, customer, remainingPayment, isRefund]);

  const canValidate = useMemo(() => {
    if (!state.activePaymentMethod) return false;
    const rawAmount = parseFloat(state.paymentBuffer) || 0;
    if (rawAmount <= 0) return false;

    const projectedPaid = isRefund
      ? totalPaid - rawAmount
      : totalPaid + rawAmount;

    if (isRefund) {
      if (Math.abs(projectedPaid) > Math.abs(cartTotalWithTax) + 0.01)
        return false;
    } else {
      // AUDIT-FIX C-3: Block overpayment on ALL non-khata methods.
      // Previously only khata was capped, allowing a cashier to enter
      // Rs 1500 on card for a Rs 1000 sale — the backend would then
      // receive paymentLines=[{card,1500}], create Sale.paidAmount=1500,
      // and postSaleJournalEntry would try to balance Dr Cash 1500 vs
      // Cr Revenue 1000 — an unbalanced JE that silently throws and
      // leaves the sale orphaned (no JE, paidAmount overstated, change
      // never given back).
      //
      // Cash overpayment is still allowed (customer gets change). Card
      // and mobile overpayment is blocked because there's no concept of
      // "card change" — the customer's card is charged the full amount.
      if (projectedPaid > Math.abs(cartTotalWithTax) + 0.01) {
        // Cash can overpay (change due). Card/mobile/khata cannot.
        if (state.activePaymentMethod !== "cash") return false;
      }
    }

    if (isKhata && !customer) return false;
    if (isKhata && wouldExceedLimit) return false;
    return true;
  }, [
    state.activePaymentMethod,
    state.paymentBuffer,
    isKhata,
    customer,
    wouldExceedLimit,
    totalPaid,
    cartTotalWithTax,
    isRefund,
  ]);

  const hasKhataPayment = useMemo(
    () => state.paymentLines.some((p: PaymentLine) => p.method === "khata"),
    [state.paymentLines],
  );

  const canComplete = useMemo(() => {
    if (isRefund) {
      if (state.paymentLines.length === 0) return false;
      if (Math.abs(totalPaid) > Math.abs(cartTotalWithTax) + 0.01) return false;
      if (!customer && hasKhataPayment) return false;
      return true;
    }
    if (totalPaid < Math.abs(cartTotalWithTax) - 0.01) return false;
    const khataLine = state.paymentLines.find(
      (p: PaymentLine) => p.method === "khata",
    );
    if (khataLine && customer) {
      if (
        customer.creditLimit !== 0 &&
        customer.balance + khataLine.amount > customer.creditLimit
      )
        return false;
    }
    return true;
  }, [
    isRefund,
    totalPaid,
    cartTotalWithTax,
    state.paymentLines,
    customer,
    hasKhataPayment,
  ]);

  const khataPaid = useMemo(
    () =>
      state.paymentLines
        .filter((p: PaymentLine) => p.method === "khata")
        .reduce((s: number, p: PaymentLine) => s + p.amount, 0),
    [state.paymentLines],
  );

  // ─── UI Callbacks ───
  const selectMethod = useCallback(
    (method: PaymentMethod) => {
      dispatch({ type: "SET_ACTIVE_PAYMENT_METHOD", payload: method });
      bufferTouched.current = false;
      const targetAmount = isRefund
        ? -Math.abs(remainingPayment)
        : Math.abs(remainingPayment);
      if (Math.abs(remainingPayment) > 0.01) {
        dispatch({
          type: "SET_PAYMENT_BUFFER",
          payload: String(Math.abs(targetAmount)),
        });
      } else {
        dispatch({ type: "CLEAR_PAYMENT_BUFFER" });
      }
    },
    [dispatch, remainingPayment, isRefund],
  );

  const appendToBuffer = useCallback(
    (digit: string) => {
      const buffer = state.paymentBuffer;
      if (!bufferTouched.current) {
        bufferTouched.current = true;
        if (digit === "0") {
          dispatch({ type: "SET_PAYMENT_BUFFER", payload: "0" });
          return;
        }
        if (digit === ".") {
          dispatch({ type: "SET_PAYMENT_BUFFER", payload: "0." });
          return;
        }
        dispatch({ type: "SET_PAYMENT_BUFFER", payload: digit });
        return;
      }
      if (digit === "0" && buffer === "0") return;
      if (digit !== "0" && digit !== "." && buffer === "0") {
        dispatch({ type: "SET_PAYMENT_BUFFER", payload: digit });
        return;
      }
      if (digit === "." && buffer.includes(".")) return;
      if (buffer.replace(".", "").length >= 8) return;
      dispatch({ type: "SET_PAYMENT_BUFFER", payload: buffer + digit });
    },
    [dispatch, state.paymentBuffer],
  );

  const handleQuickAdd = useCallback(
    (amount: number) => {
      const current = parseFloat(state.paymentBuffer) || 0;
      bufferTouched.current = true;
      dispatch({
        type: "SET_PAYMENT_BUFFER",
        payload: String(current + amount),
      });
    },
    [dispatch, state.paymentBuffer],
  );

  const handleBackspace = useCallback(() => {
    bufferTouched.current = true;
    dispatch({
      type: "SET_PAYMENT_BUFFER",
      payload: state.paymentBuffer.slice(0, -1),
    });
  }, [dispatch, state.paymentBuffer]);

  const handleToggleSign = useCallback(() => {
    bufferTouched.current = true;
    const current = parseFloat(state.paymentBuffer) || 0;
    dispatch({ type: "SET_PAYMENT_BUFFER", payload: String(-current) });
  }, [dispatch, state.paymentBuffer]);

  const handleDecimal = useCallback(() => {
    if (!state.paymentBuffer.includes(".")) {
      bufferTouched.current = true;
      dispatch({
        type: "SET_PAYMENT_BUFFER",
        payload: state.paymentBuffer + ".",
      });
    }
  }, [dispatch, state.paymentBuffer]);

  const handleExactAmount = useCallback(() => {
    if (state.activePaymentMethod && !wouldExceedLimit) {
      bufferTouched.current = false;
      const targetAmount = isRefund
        ? -Math.abs(remainingPayment)
        : Math.abs(remainingPayment);
      dispatch({
        type: "ADD_PAYMENT_LINE",
        payload: {
          method: state.activePaymentMethod,
          amount: targetAmount,
          replace: true,
        },
      });
    } else if (wouldExceedLimit) {
      toast.error("Credit limit exceeded. Cannot add exact amount to Khata.");
    }
  }, [
    dispatch,
    remainingPayment,
    state.activePaymentMethod,
    isRefund,
    wouldExceedLimit,
  ]);

  const handleValidate = useCallback(() => {
    if (!canValidate) {
      if (isKhata && !customer)
        toast.error("Please select a customer for Khata payment.");
      else if (isKhata && wouldExceedLimit)
        toast.error("Credit limit exceeded.");
      else toast.error("Invalid amount.");
      return;
    }
    const rawAmount = parseFloat(state.paymentBuffer);
    const amount = isRefund ? -Math.abs(rawAmount) : rawAmount;
    const targetRemaining = Math.abs(remainingPayment);
    const isExact = Math.abs(Math.abs(amount) - targetRemaining) < 0.01;
    dispatch({
      type: "ADD_PAYMENT_LINE",
      payload: { method: state.activePaymentMethod!, amount, replace: isExact },
    });
  }, [
    canValidate,
    state.paymentBuffer,
    state.activePaymentMethod,
    dispatch,
    remainingPayment,
    isRefund,
    isKhata,
    customer,
    wouldExceedLimit,
  ]);

  const handleEditLine = useCallback(
    (line: PaymentLine) => {
      dispatch({ type: "REMOVE_PAYMENT_LINE", payload: line.id });
      dispatch({
        type: "SET_ACTIVE_PAYMENT_METHOD",
        payload: line.method as PaymentMethod,
      });
      bufferTouched.current = false;
      dispatch({
        type: "SET_PAYMENT_BUFFER",
        payload: String(Math.abs(line.amount)),
      });
    },
    [dispatch],
  );

  const handleClosePayment = useCallback(
    () => dispatch({ type: "CLOSE_PAYMENT" }),
    [dispatch],
  );
  const handleOpenCustomerModal = useCallback(
    () => dispatch({ type: "OPEN_MODAL", payload: { modal: "customer" } }),
    [dispatch],
  );
  const handleRemovePaymentLine = useCallback(
    (id: string) => dispatch({ type: "REMOVE_PAYMENT_LINE", payload: id }),
    [dispatch],
  );

  const saveSaleToDB = useCallback(
    async (order: {
      id: string;
      saleNumber: number;
      items: CartItem[];
      customer: Customer | null;
      note: string;
      total: number;
      paymentLines: PaymentLine[];
      changeDue: number;
      registerSessionId: string | null;
    }) => {
      try {
        // FIX: Adjust cash payment lines to account for change given back.
        // The POS collects the TENDERED amount (e.g., 500 for a 360 sale).
        // The backend should record the ACTUAL cash that stays in the drawer (360).
        // We subtract the change from the last cash payment line.
        const change = order.changeDue || changeDueRef.current || 0;
        const adjustedPaymentLines = order.paymentLines.map((p) => ({
          method: p.method,
          amount: p.amount,
        }));

        if (change > 0) {
          // Find the last cash payment line and subtract the change
          for (let i = adjustedPaymentLines.length - 1; i >= 0; i--) {
            if (
              adjustedPaymentLines[i].method === "cash" &&
              adjustedPaymentLines[i].amount > 0
            ) {
              adjustedPaymentLines[i] = {
                method: "cash",
                amount: Math.max(0, adjustedPaymentLines[i].amount - change),
              };
              break;
            }
          }
        }

        const payload = {
          idempotencyKey: order.id,
          customerId: order.customer?.id || null,
          customerName: order.customer?.name || null,
          registerSessionId: order.registerSessionId,
          items: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.unitPrice,
            note: item.note || null,
            variantId: item.variantId || null,
          })),
          paymentLines: adjustedPaymentLines,
          notes: order.note,
        };

        const result = await apiPost<{ saleId: string; saleNumber: string }>(
          "/api/sales",
          payload,
        );
        return result;
      } catch (err) {
        console.error("Failed to save sale:", err);
        throw err;
      }
    },
    [],
  );

  const processSale = useCallback(async () => {
    if (!canComplete) return;
    setSaving(true);

    // FIX: Filter out items with 0 quantity or isZeroed flag before saving
    const validItems = state.cart.filter((i) => !i.isZeroed && i.quantity > 0);
    if (validItems.length === 0) {
      toast.error("Cart is empty. Add items before completing the sale.");
      setSaving(false);
      return;
    }

    // AUDIT-FIX C-13/H-4: Use the persistent idempotency key from state
    // (set by OPEN_PAYMENT reducer action) instead of generating a fresh
    // UUID on every invocation. This closes the "duplicate sale on network
    // retry" hole — if the network drops after the server commits but
    // before the client receives the response, the cashier clicks
    // "Complete Sale" again and the SAME idempotency key is sent, so the
    // backend dedup returns the original sale instead of creating a
    // duplicate.
    //
    // If currentSaleId is somehow null (e.g. payment screen opened via a
    // path that bypassed OPEN_PAYMENT), fall back to a fresh UUID — but
    // this is a defensive fallback, not the normal path.
    const idempotencyKey = state.currentSaleId ?? crypto.randomUUID();

    const order = {
      id: idempotencyKey,
      saleNumber: state.currentSaleNumber,
      items: validItems, // FIX: Use the filtered array
      customer: state.customer,
      note: state.internalNote,
      total: cartTotalWithTax,
      createdAt: Date.now(),
      paymentLines: state.paymentLines,
      changeDue,
      registerSessionId: state.registerSession?.id || null,
    };

    try {
      const saved = await saveSaleToDB(order);
      if (!saved) {
        toast.error("Failed to save sale to database. Please try again.");
        setSaving(false);
        return;
      }

      const updatedOrder = {
        ...order,
        id: saved.saleId,
        saleNumber: Number(saved.saleNumber) || order.saleNumber,
      };

      dispatch({ type: "COMPLETE_SALE", payload: updatedOrder });

      // Refresh customer data so the modal shows updated balances
      mutate("/api/customers?forPos=true");
      // Issue 11: Refresh product data so the grid reflects the new stock
      // quantities after the sale is persisted.
      //
      // OPTIMISTIC UPDATE: before the refetch returns, immediately decrement
      // the local SWR cache so the product grid updates INSTANTLY when the
      // cashier clicks "Complete Sale". Without this, the grid shows stale
      // stock for 200-500ms while the refetch round-trips — cashiers would
      // sometimes re-sell an out-of-stock item in that window. The
      // `{ revalidate: true }` option then fetches the server truth and
      // overwrites our optimistic guess.
      mutate(
        "/api/products?forPos=true",
        (
          current:
            { products?: Array<{ id: string; stock: number }> } | undefined,
        ) => {
          if (!current?.products) return current;
          return {
            ...current,
            products: current.products.map((p) => {
              const soldItem = updatedOrder.items.find(
                (i) => i.id === p.id || i.productId === p.id,
              );
              if (soldItem) {
                return {
                  ...p,
                  stock: Math.max(0, p.stock - soldItem.quantity),
                };
              }
              return p;
            }),
          };
        },
        { revalidate: true },
      );

      if (typeof window !== "undefined") {
        // FIX: Map the POS cart object to the exact ReceiptData structure expected by the printer
        // AUDIT-FIX H-5: Pull storeName/address/phone from settings via usePos()
        // (was hardcoded "ZKS Store" — every printed receipt showed wrong store info).
        // AUDIT-FIX H-6: Receipt now includes subtotal/tax/discount breakdown
        // (was zeroed — customer receipt didn't show tax breakdown).
        // AUDIT-FIX H-6: Item totals now respect isReturn sign for return receipts.
        const receiptData = {
          storeName: storeInfo.storeName,
          storeAddress: storeInfo.storeAddress,
          storePhone: storeInfo.storePhone,
          invoiceNumber: String(updatedOrder.saleNumber),
          date: new Date(updatedOrder.createdAt).toLocaleDateString("en-PK", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          time: new Date(updatedOrder.createdAt).toLocaleTimeString("en-PK", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          cashier: undefined, // Can be added later from session
          customerName: updatedOrder.customer?.name,
          items: updatedOrder.items.map((item: CartItem) => ({
            name: item.name,
            variantName: item.variantName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            // AUDIT-FIX H-6: Respect isReturn sign so return receipts show
            // negative totals instead of positive.
            total: item.unitPrice * item.quantity * (item.isReturn ? -1 : 1),
            note: item.note,
          })),
          // AUDIT-FIX H-6: Use actual subtotal/tax/discount from cart
          // (was zeroed — receipt misrepresented the sale).
          subtotal: cartSubtotal,
          discount: 0,
          tax: cartTax,
          total: cartTotalWithTax,
          // FIX: Map paymentLines to payments array
          payments: updatedOrder.paymentLines.map((p: PaymentLine) => ({
            method: p.method,
            label: p.method.charAt(0).toUpperCase() + p.method.slice(1),
            amount: p.amount,
          })),
          changeDue: updatedOrder.changeDue,
          itemCount: updatedOrder.items.reduce((s, i) => s + i.quantity, 0),
        };

        window.dispatchEvent(
          new CustomEvent("pos:print-receipt", { detail: receiptData }),
        );

        // Voice announcement — the computer speaks the sale total + change
        announceSaleComplete({
          total: cartTotalWithTax,
          paymentMethod: state.paymentLines
            .map((p: PaymentLine) => p.method)
            .join(" + "),
          changeDue,
          itemCount: updatedOrder.items.reduce((s, i) => s + i.quantity, 0),
        });
      }
    } catch (err) {
      console.error("Sale failed:", err);
      toast.error(
        "Sale failed: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setSaving(false);
    }
  }, [
    canComplete,
    state.currentSaleNumber,
    state.currentSaleId,
    state.cart,
    state.customer,
    state.internalNote,
    cartTotalWithTax,
    cartSubtotal,
    cartTax,
    storeInfo,
    changeDue,
    state.paymentLines,
    state.registerSession?.id,
    dispatch,
    saveSaleToDB,
    mutate,
  ]);

  const processReturn = useCallback(async () => {
    if (!canComplete) return;
    setSaving(true);

    const refundLines = state.paymentLines.map((p) => ({
      method: p.method,
      amount: Math.abs(p.amount),
    }));
    const order = {
      id: crypto.randomUUID(),
      saleNumber: state.currentSaleNumber,
      items: state.cart,
      customer: state.customer,
      note:
        state.internalNote ||
        `Return for ${state.originalSale?.saleNumber || "unknown"}`,
      total: Math.abs(cartTotalWithTax),
      createdAt: Date.now(),
      paymentLines: state.paymentLines,
      changeDue: 0,
    };

    try {
      if (state.originalSale?.id) {
        try {
          const payload = {
            items: state.cart.map((item) => ({
              saleItemId: item.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
            reason: state.internalNote || "Customer return",
            refundLines,
            registerSessionId: state.registerSession?.id || null,
          };
          await apiPost(`/api/sales/${state.originalSale.id}/return`, payload);
        } catch (err) {
          console.warn("Return API call failed, processing locally:", err);
          throw err;
        }
      }

      dispatch({ type: "EXIT_RETURN_MODE" });
      dispatch({ type: "COMPLETE_SALE", payload: order });
      mutate("/api/customers?forPos=true");
      // Issue 11: Refresh product data so the grid reflects the updated stock
      // quantities after a return is processed.
      mutate("/api/products?forPos=true");

      if (typeof window !== "undefined") {
        // AUDIT-FIX H-6: Build a proper ReceiptData-shaped payload for the
        // return receipt. Previously this spread `...order` which had
        // storeName: undefined, invoiceNumber missing, items[i].total
        // missing — return receipts printed with "undefined" store name
        // and blank invoice number.
        const returnReceiptData = {
          storeName: storeInfo.storeName,
          storeAddress: storeInfo.storeAddress,
          storePhone: storeInfo.storePhone,
          invoiceNumber: String(order.saleNumber),
          date: new Date(order.createdAt).toLocaleDateString("en-PK", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          time: new Date(order.createdAt).toLocaleTimeString("en-PK", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          cashier: undefined,
          customerName: order.customer?.name,
          items: order.items.map((item: CartItem) => ({
            name: item.name,
            variantName: item.variantName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            // Return items have isReturn: true → negative total on receipt.
            total: item.unitPrice * item.quantity * (item.isReturn ? -1 : 1),
            note: item.note,
          })),
          subtotal: cartSubtotal,
          discount: 0,
          tax: cartTax,
          total: cartTotalWithTax,
          payments: refundLines.map(
            (p: { method: string; amount: number }) => ({
              method: p.method,
              label: p.method.charAt(0).toUpperCase() + p.method.slice(1),
              amount: p.amount,
            }),
          ),
          changeDue: 0,
          itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
          isReturn: true,
          originalSaleNumber: state.originalSale?.saleNumber,
        };
        window.dispatchEvent(
          new CustomEvent("pos:print-receipt", {
            detail: returnReceiptData,
          }),
        );
      }
    } catch (err) {
      console.error("Return failed:", err);
      toast.error(
        "Return failed: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setSaving(false);
    }
  }, [
    canComplete,
    state,
    cartTotalWithTax,
    cartSubtotal,
    cartTax,
    storeInfo,
    dispatch,
    mutate,
  ]);

  const isFullyPaid = isRefund
    ? Math.abs(totalPaid) >= Math.abs(cartTotalWithTax) - 0.01
    : totalPaid >= Math.abs(cartTotalWithTax) - 0.01;

  const handleComplete = useCallback(() => {
    if (!canComplete) {
      if (isRefund)
        toast.error("Refund amount cannot exceed the return total.");
      else if (!isFullyPaid)
        toast.error(
          `Remaining: ${Math.abs(remainingPayment).toLocaleString("en-PK")} Rs.`,
        );
      return;
    }

    if (isRefund && state.originalSale) processReturn();
    else processSale();
  }, [
    canComplete,
    isFullyPaid,
    remainingPayment,
    isRefund,
    state.originalSale,
    processReturn,
    processSale,
  ]);

  const handleCompleteRef = useRef(handleComplete);
  useEffect(() => {
    handleCompleteRef.current = handleComplete;
  }, [handleComplete]);

  useEffect(() => {
    // AUDIT-FIX H-24: Detect barcode scanner input on the payment screen.
    // USB scanners emit rapid keystrokes (<50ms apart). If we detect a
    // scanner-like burst, ignore the keystrokes entirely — otherwise a
    // 13-digit barcode would be appended to the payment buffer, turning
    // "5012345678900" into a Rs. 5,012,345,678,900 cash tender.
    let lastKeyTime = 0;
    let scannerActive = false;

    const handler = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s.isPaymentScreen) return;

      // AUDIT-FIX H-24: Scanner detection. If keystrokes are <30ms apart,
      // treat as scanner input. Buffer the chars; on Enter, discard the
      // buffer and toast a warning. This prevents barcode digits from
      // leaking into the payment amount.
      const now = Date.now();
      const timeDiff = now - lastKeyTime;
      lastKeyTime = now;
      const isRapidKeystroke = timeDiff < 30;

      if (isRapidKeystroke && e.key.length === 1) {
        scannerActive = true;
        e.preventDefault();
        return;
      }
      // If we were in scanner mode and now get an Enter, it's the scan terminator
      if (scannerActive && e.key === "Enter") {
        toast.error(
          `Barcode scanned on payment screen — ignored. Close payment screen to scan products.`,
        );
        scannerActive = false;
        e.preventDefault();
        return;
      }
      // If we were in scanner mode but the next keystroke is slow, the burst ended
      if (scannerActive && !isRapidKeystroke) {
        scannerActive = false;
      }

      if (document.activeElement?.tagName !== "INPUT") {
        const preventKeys = ["Escape", "Enter", "Backspace"];
        if (
          preventKeys.includes(e.key) ||
          (e.key >= "0" && e.key <= "9") ||
          e.key === "."
        ) {
          e.preventDefault();
        }
      }

      if (e.key === "Escape") {
        dispatchRef.current({ type: "CLOSE_PAYMENT" });
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        const buffer = s.paymentBuffer;
        if (!bufferTouched.current) {
          bufferTouched.current = true;
          if (e.key === "0") {
            dispatchRef.current({ type: "SET_PAYMENT_BUFFER", payload: "0" });
            return;
          }
          if (e.key === ".") {
            dispatchRef.current({ type: "SET_PAYMENT_BUFFER", payload: "0." });
            return;
          }
          dispatchRef.current({ type: "SET_PAYMENT_BUFFER", payload: e.key });
          return;
        }
        if (e.key === "0" && buffer === "0") return;
        if (e.key !== "0" && e.key !== "." && buffer === "0") {
          dispatchRef.current({ type: "SET_PAYMENT_BUFFER", payload: e.key });
          return;
        }
        if (e.key === "." && buffer.includes(".")) return;
        if (buffer.replace(".", "").length >= 8) return;
        dispatchRef.current({
          type: "SET_PAYMENT_BUFFER",
          payload: buffer + e.key,
        });
        return;
      }

      if (e.key === ".") {
        if (!s.paymentBuffer.includes(".")) {
          bufferTouched.current = true;
          dispatchRef.current({
            type: "SET_PAYMENT_BUFFER",
            payload: s.paymentBuffer + ".",
          });
        }
        return;
      }

      if (e.key === "Backspace") {
        bufferTouched.current = true;
        dispatchRef.current({
          type: "SET_PAYMENT_BUFFER",
          payload: s.paymentBuffer.slice(0, -1),
        });
        return;
      }

      if (e.key === "Enter") {
        const currentMethod = s.activePaymentMethod;
        if (!currentMethod) {
          toast.error("Please select a payment method.");
          return;
        }

        const currentAmount = parseFloat(s.paymentBuffer) || 0;
        const refundAmount = s.returnMode
          ? -Math.abs(currentAmount)
          : currentAmount;
        const currentRemaining = Math.abs(remainingPaymentRef.current);

        const fullyPaid = s.returnMode
          ? Math.abs(totalPaidRef.current) >=
            Math.abs(cartTotalRef.current) - 0.01
          : totalPaidRef.current >= Math.abs(cartTotalRef.current) - 0.01;

        if (fullyPaid) {
          handleCompleteRef.current();
          return;
        }

        let canVal = false;
        if (currentAmount > 0 && currentRemaining > 0.01) {
          canVal = true;
          if (currentMethod === "khata") {
            const cust = s.customer;
            if (!cust) {
              canVal = false;
              toast.error("Please select a customer for Khata payment.");
            } else if (
              cust.creditLimit !== 0 &&
              cust.balance + Math.abs(refundAmount) > cust.creditLimit
            ) {
              canVal = false;
              toast.error("Credit limit exceeded.");
            }
          }
          if (s.returnMode) {
            const projected = totalPaidRef.current + refundAmount;
            if (Math.abs(projected) > Math.abs(cartTotalRef.current) + 0.01) {
              canVal = false;
              toast.error("Refund amount cannot exceed the return total.");
            }
          }
        }

        if (canVal) {
          const isExact =
            Math.abs(Math.abs(refundAmount) - currentRemaining) < 0.01;
          dispatchRef.current({
            type: "ADD_PAYMENT_LINE",
            payload: {
              method: currentMethod,
              amount: refundAmount,
              replace: isExact,
            },
          });
        } else if (currentRemaining <= 0.01) {
          handleCompleteRef.current();
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const numpadRows = [
    ["1", "2", "3", "+10"],
    ["4", "5", "6", "+20"],
    ["7", "8", "9", "+50"],
    ["+/-", "0", ".", "⌫"],
  ];

  if (!state.isPaymentScreen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
      <div className="flex w-full md:w-110 md:min-w-110 md:max-h-screen md:shrink-0 flex-col border-t md:border-t-0 md:border-r border-border bg-muted/30 order-2 md:order-1 md:overflow-y-auto">
        <div className="flex flex-col gap-2 p-3">
          {paymentMethods.map((method) => {
            const isSelected = state.activePaymentMethod === method.id;
            const disabled = method.id === "khata" && !customer;

            return (
              <button
                key={method.id}
                onClick={() => !disabled && selectMethod(method.id)}
                disabled={disabled}
                className={`flex h-16 w-full items-center gap-4 rounded-md border px-5 text-left transition-all ${
                  isSelected
                    ? "border-primary bg-accent shadow-soft"
                    : disabled
                      ? "cursor-not-allowed border-border bg-muted/40 opacity-50"
                      : "border-border bg-muted hover:bg-muted hover:border-border"
                }`}
              >
                <span
                  className={
                    isSelected
                      ? "text-muted-foreground"
                      : disabled
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground"
                  }
                >
                  {method.icon}
                </span>
                <span
                  className={`text-[17px] ${isSelected ? "font-semibold text-foreground" : disabled ? "text-muted-foreground/50" : "text-foreground/80"}`}
                >
                  {method.label}
                </span>
                {disabled && (
                  <span className="ml-auto text-[13px] font-medium text-destructive">
                    Select customer
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* FIX: Clear Khata Limit Warning */}
        {isKhata && customer && wouldExceedLimit && (
          <div className="mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-center text-xs font-medium text-destructive">
            Credit Limit Exceeded! Limit:{" "}
            {customer.creditLimit.toLocaleString("en-PK")} Rs
          </div>
        )}

        <div className="hidden md:block flex-1 min-h-4" />

        <div className="grid grid-cols-2 gap-2 px-3 pb-2">
          <button
            onClick={handleOpenCustomerModal}
            className={`flex h-13 items-center justify-center gap-2 rounded-md border text-[15px] font-medium transition-colors ${
              customer
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
            }`}
          >
            <User size={18} weight={customer ? "fill" : "regular"} />
            <span className="truncate max-w-35">
              {customer ? customer.name : "Customer"}
            </span>
          </button>

          <button className="flex h-13 items-center justify-center gap-2 rounded-md border border-border bg-muted/30 text-[15px] font-medium text-muted-foreground hover:bg-muted">
            <FileText size={18} />
            Invoice
          </button>
        </div>

        <div className="px-3 pb-2">
          <div className="overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-4">
              {numpadRows.flat().map((key) => {
                const isQuickAdd = key.startsWith("+");
                const isBackspace = key === "⌫";
                const isToggle = key === "+/-";

                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (isQuickAdd)
                        handleQuickAdd(parseInt(key.replace("+", "")));
                      else if (isBackspace) handleBackspace();
                      else if (isToggle) handleToggleSign();
                      else if (key === ".") handleDecimal();
                      else appendToBuffer(key);
                    }}
                    aria-label={
                      isBackspace
                        ? "Backspace"
                        : isQuickAdd
                          ? `Add ${key} rupees`
                          : key
                    }
                    className={`flex h-14 items-center justify-center border border-border text-[20px] font-medium transition-colors active:scale-[0.98] ${
                      isQuickAdd
                        ? "bg-success/15 text-success hover:bg-success/25"
                        : isBackspace
                          ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                          : isToggle
                            ? "bg-warning/15 text-warning hover:bg-warning/25"
                            : "bg-muted/40 text-foreground hover:bg-muted"
                    }`}
                  >
                    {isBackspace ? <Backspace size={20} /> : key}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {state.activePaymentMethod && !isFullyPaid && (
          <div className="px-3 pb-2">
            <button
              onClick={handleExactAmount}
              disabled={wouldExceedLimit}
              className="w-full rounded-md border border-border bg-info/10 py-2 text-[14px] font-medium text-info transition-colors hover:bg-info/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Exact: {formatAmount(Math.abs(remainingPayment))} Rs.
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 p-3 pt-0 sticky bottom-0 bg-muted/30 backdrop-blur-sm border-t border-border">
          <button
            onClick={handleClosePayment}
            disabled={saving}
            className="flex h-17 items-center justify-center gap-2 rounded-md border border-border bg-card text-[17px] font-medium text-muted-foreground shadow-soft transition-colors hover:bg-muted/30 disabled:opacity-50"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <button
            onClick={isFullyPaid ? handleComplete : handleValidate}
            disabled={saving || (isFullyPaid ? !canComplete : !canValidate)}
            className={`flex h-17 items-center justify-center rounded-md text-[17px] font-semibold text-primary-foreground shadow-soft transition-all active:scale-[0.98] ${
              saving
                ? "bg-muted-foreground cursor-wait"
                : isFullyPaid
                  ? canComplete
                    ? isRefund
                      ? "bg-destructive hover:bg-destructive/90 shadow-md"
                      : "bg-success hover:bg-success/90 shadow-md"
                    : "bg-muted cursor-not-allowed"
                  : canValidate
                    ? "bg-primary hover:bg-primary/90 shadow-md"
                    : "bg-muted cursor-not-allowed"
            }`}
          >
            {saving
              ? "Saving..."
              : isFullyPaid
                ? isRefund
                  ? "Complete Refund"
                  : "Complete Sale"
                : "Validate"}
          </button>
        </div>
      </div>

      <div className="flex flex-col bg-muted/30 order-1 md:order-2 md:flex-1 md:min-h-0">
        <div className="flex flex-col items-center pt-6 pb-4 md:pt-10 md:pb-6">
          <p className="mb-1 text-[11px] sm:text-[13px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
            {isRefund ? "Refund Amount" : "Total Amount"}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-5xl sm:text-7xl md:text-[120px] font-bold leading-none tracking-tight text-foreground">
              {Math.abs(cartTotalWithTax).toFixed(2).split(".")[0]}
            </span>
            <span className="text-3xl sm:text-5xl md:text-[70px] font-bold leading-none text-muted-foreground">
              .{Math.abs(cartTotalWithTax).toFixed(2).split(".")[1]}
            </span>
            <span className="ml-2 text-xl sm:text-3xl md:text-[40px] font-medium text-muted-foreground">
              Rs.
            </span>
          </div>
          {isRefund && (
            <div className="mt-2 flex items-center gap-2 text-destructive">
              <ArrowCounterClockwise size={20} weight="bold" />
              <p className="text-sm sm:text-[18px] font-bold">
                REFUND — {state.originalSale?.saleNumber}
              </p>
            </div>
          )}
          {displayTaxBreakdown && cartTax > 0 && !isRefund && (
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:gap-6 text-xs sm:text-sm text-muted-foreground/70">
              <span>Subtotal: {cartSubtotal.toLocaleString("en-PK")} Rs</span>
              <span>Tax: {cartTax.toLocaleString("en-PK")} Rs</span>
            </div>
          )}
        </div>

        <div className="md:flex-1 px-4 sm:px-8 md:px-20 md:overflow-y-auto pb-4 md:pb-0">
          {state.paymentLines.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-border">
              <p className="text-[15px] text-muted-foreground/60">
                {isRefund ? "No refund lines added" : "No payment lines added"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {state.paymentLines.map((line: PaymentLine) => (
                <div
                  key={line.id}
                  onClick={() => handleEditLine(line)}
                  className="group flex cursor-pointer items-center justify-between rounded-md border border-primary/30 bg-primary/10 px-5 py-3.5 shadow-soft transition-colors hover:bg-primary/20"
                >
                  <div className="flex items-center gap-3">
                    {line.method === "cash" ? (
                      <Money size={18} weight="fill" className="text-success" />
                    ) : line.method === "card" ? (
                      <CreditCard
                        size={18}
                        weight="fill"
                        className="text-info"
                      />
                    ) : line.method === "mobile" ||
                      line.method === "easypaisa" ||
                      line.method === "jazzcash" ? (
                      <DeviceMobileCamera
                        size={18}
                        weight="fill"
                        className="text-primary"
                      />
                    ) : (
                      <BookOpen
                        size={18}
                        weight="fill"
                        className="text-warning"
                      />
                    )}
                    <span className="text-[17px] font-medium text-foreground">
                      {paymentMethodLabel(line.method)}
                    </span>
                    {line.method === "khata" && customer && (
                      <span className="text-[13px] text-warning">
                        {customer.name}
                      </span>
                    )}
                    <span className="ml-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <PencilSimple
                        size={14}
                        className="text-muted-foreground"
                      />
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[18px] font-semibold text-foreground">
                      {formatAmount(Math.abs(line.amount))}
                      <span className="ml-1 text-[13px] font-normal text-muted-foreground">
                        Rs.
                      </span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePaymentLine(line.id);
                      }}
                      aria-label="Remove payment line"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <X size={16} weight="bold" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {state.paymentBuffer && state.activePaymentMethod && !isFullyPaid && (
          <div className="px-4 sm:px-8 md:px-20 pb-3">
            <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/10 px-5 py-3 shadow-soft">
              <span className="text-[16px] font-medium text-muted-foreground">
                {paymentMethodLabel(state.activePaymentMethod)}
              </span>
              <span className="text-[20px] font-semibold text-foreground">
                {state.paymentBuffer}
                <span className="ml-1 text-[13px] font-normal text-muted-foreground">
                  Rs.
                </span>
              </span>
            </div>
          </div>
        )}

        <div className="md:mt-auto px-4 sm:px-8 md:px-20 pb-4 md:pb-8">
          <div className="border-t-2 border-border pt-4">
            {totalPaid !== 0 && (
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm sm:text-[16px] text-muted-foreground">
                  {isRefund ? "Total Refunded" : "Total Paid"}
                </span>
                <span className="text-base sm:text-[18px] font-semibold text-foreground">
                  {formatAmount(Math.abs(totalPaid))}
                  <span className="ml-1 text-[13px] text-muted-foreground">
                    Rs.
                  </span>
                </span>
              </div>
            )}

            {!isFullyPaid && Math.abs(remainingPayment) > 0.01 && (
              <div className="flex items-center justify-between">
                <span className="text-lg sm:text-[22px] font-medium text-destructive">
                  {isRefund ? "Remaining Refund" : "Remaining"}
                </span>
                <span className="text-xl sm:text-[26px] font-bold text-destructive">
                  {formatAmount(Math.abs(remainingPayment))}
                  <span className="ml-1 text-sm sm:text-[15px] font-normal">
                    Rs.
                  </span>
                </span>
              </div>
            )}

            {changeDue > 0.01 && !isRefund && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-lg sm:text-[22px] font-medium text-success">
                    Change
                  </span>
                  <span className="text-xl sm:text-[26px] font-bold text-success">
                    {formatAmount(changeDue)}
                    <span className="ml-1 text-sm sm:text-[15px] font-normal">
                      Rs.
                    </span>
                  </span>
                </div>
                <p className="text-right text-xs sm:text-[13px] text-muted-foreground">
                  {getChangeBreakdown(changeDue)}
                </p>
              </div>
            )}

            {hasKhataPayment && customer && (
              <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3">
                <p className="text-[13px] text-warning">
                  {isRefund
                    ? "Customer balance will decrease from"
                    : "Customer balance will increase from"}{" "}
                  <strong>{formatAmount(customer.balance)} Rs.</strong> to{" "}
                  <strong>
                    {formatAmount(
                      isRefund
                        ? customer.balance - Math.abs(khataPaid)
                        : customer.balance + khataPaid,
                    )}{" "}
                    Rs.
                  </strong>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
