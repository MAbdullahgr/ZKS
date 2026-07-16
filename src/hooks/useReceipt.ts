"use client";

import { useMemo } from "react";

export interface ReceiptItem {
  name: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  note?: string;
}

export interface ReceiptPayment {
  method: "cash" | "khata" | "card" | "mobile" | "credit";
  label: string;
  amount: number;
}

export interface StoreInfo {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeNTN?: string;
}

export interface ReceiptData extends StoreInfo {
  invoiceNumber: string;
  date: string;
  time: string;
  cashier?: string;
  customerName?: string;
  customerPhone?: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: ReceiptPayment[];
  changeDue: number;
  itemCount: number;
}

export interface OrderItem {
  name?: string;
  variantName?: string;
  price?: number;
  unitPrice?: number;
  quantity?: number;
  note?: string;
}

export interface PaymentLine {
  method?: string;
  amount?: number;
}

export interface Customer {
  name?: string;
  phone?: string;
}

export interface OrderData {
  items?: OrderItem[];
  discount?: number;
  tax?: number;
  total?: number;
  paymentLines?: PaymentLine[];
  createdAt?: string;
  saleNumber?: number;
  customer?: Customer;
  changeDue?: number;
}

export function useReceipt(
  order: OrderData | null,
  storeInfo: StoreInfo,
): ReceiptData | null {
  return useMemo(() => {
    if (!order) return null;

    const rawItems = Array.isArray(order.items) ? order.items : [];

    const items: ReceiptItem[] = rawItems.map((item) => {
      const price = Number(item?.price ?? item?.unitPrice ?? 0);
      const qty = Number(item?.quantity ?? 1);
      return {
        name: item?.name ?? "Unknown Item",
        variantName: item?.variantName,
        quantity: qty,
        unitPrice: price,
        total: price * qty,
        note: item?.note,
      };
    });

    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const discount = Number(order.discount ?? 0);
    const tax = Number(order.tax ?? 0);
    const total = Number(order.total ?? subtotal - discount + tax);

    const rawPayments = Array.isArray(order.paymentLines)
      ? order.paymentLines
      : [];
    const payments: ReceiptPayment[] = rawPayments.map((p) => {
      const method = (p?.method ?? "cash") as ReceiptPayment["method"];
      const getLabelForMethod = (m: string): string => {
        switch (m) {
          case "cash":
            return "Cash";
          case "khata":
            return "Khata (Credit)";
          case "card":
            return "Card";
          case "mobile":
            return "Mobile Banking";
          case "credit":
            return "Credit";
          default:
            return "Payment";
        }
      };
      return {
        method,
        label: getLabelForMethod(method),
        amount: Number(p?.amount ?? 0),
      };
    });

    const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();

    return {
      ...storeInfo,
      invoiceNumber: String(order.saleNumber ?? 0).padStart(6, "0"),
      date: dateObj.toLocaleDateString("en-PK", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      time: dateObj.toLocaleTimeString("en-PK", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      customerName: order.customer?.name,
      customerPhone: order.customer?.phone,
      items,
      subtotal,
      discount,
      tax,
      total,
      payments,
      changeDue: Number(order.changeDue ?? 0),
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
    };
  }, [order, storeInfo]);
}
