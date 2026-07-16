"use client";

// src/lib/pos-store.tsx
//
// Thin React provider that wires the pure POS domain module (`@/lib/pos`)
// into the React app. Responsibilities:
//   1. Hold the reducer state via `useReducer`
//   2. Rehydrate from localStorage on init via `loadPosState`
//   3. Debounced save to localStorage on every state change via `savePosState`
//   4. Fetch products / categories / customers from the API via SWR
//   5. Expose computed values (cartTotal, changeDue, etc.) via selectors
//   6. Idle-lock timer (10 min)
//   7. Re-export all POS types so existing imports keep working

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import { apiGet } from "@/lib/fetcher";
import {
  posReducer,
  loadPosState,
  savePosState,
  initialState,
  cartTotal as selectCartTotal,
  cartTax as selectCartTax,
  cartTotalWithTax as selectCartTotalWithTax,
  totalPaid as selectTotalPaid,
  remainingPayment as selectRemainingPayment,
  changeDue as selectChangeDue,
  filteredProducts as selectFilteredProducts,
} from "@/lib/pos";
import type {
  CartItem,
  Category,
  CompletedOrder,
  Customer,
  ParkedOrder,
  PaymentLine,
  PaymentMethod,
  PosAction,
  PosState,
  Product,
  RegisterSession,
  RefundCartItem,
  CashTransaction,
  ModalType,
  ProductVariant,
} from "@/lib/pos";

// Re-export all types so existing `import { ... } from "@/lib/pos-store"`
// call sites continue to work without modification.
export type {
  CartItem,
  Category,
  CashTransaction,
  CompletedOrder,
  Customer,
  ModalType,
  ParkedOrder,
  PaymentLine,
  PaymentMethod,
  PosAction,
  PosState,
  Product,
  ProductVariant,
  RefundCartItem,
  RegisterSession,
};

// ─── Context ─────────────────────────────────────────────────────────

interface PosContextValue {
  state: PosState;
  dispatch: React.Dispatch<PosAction>;
  filteredProducts: Product[];
  cartTotal: number; // subtotal (without tax)
  cartTax: number; // total tax amount
  cartTotalWithTax: number; // total the customer pays
  remainingPayment: number;
  totalPaid: number;
  changeDue: number;
  products: Product[];
  categories: Category[];
  customers: Customer[];
  productsLoading: boolean;
  categoriesLoading: boolean;
  customersLoading: boolean;
  displayTaxBreakdown: boolean;
  // AUDIT-FIX H-5: Expose store info so PaymentScreen can build a correct
  // receipt payload (was hardcoded "ZKS Store" — every printed receipt
  // showed wrong store info regardless of what the owner configured).
  storeInfo: {
    storeName: string;
    storeAddress: string;
    storePhone: string;
    currency: string;
  };
  // SWR-style mutate: revalidate the cache, optionally applying an optimistic
  // updater function (current data → new data) before the refetch.
  mutate: <Key extends string>(
    key: Key,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updater?: any,
    options?: { revalidate?: boolean },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any> | void;
}

const PosContext = createContext<PosContextValue | null>(null);

export function PosProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(posReducer, initialState, () => {
    // Lazy init: rehydrate from localStorage on the client only.
    return loadPosState();
  });

  // ─── Fetch real data from APIs ─────────────────────────────
  const { data: productsData, isLoading: productsLoading } = useSWR<{
    products: Product[];
  }>(
    "/api/products?forPos=true",
    (url: string) =>
      apiGet<{ products: Product[] }>(url).then((d) => d ?? { products: [] }),
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  const { data: categoriesData, isLoading: categoriesLoading } = useSWR<
    Category[]
  >(
    "/api/categories?forPos=true",
    (url: string) => apiGet<Category[]>(url).then((d) => d ?? []),
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  // Fetch store settings (for displayTaxBreakdown, storeName, etc.)
  // AUDIT-FIX H-5: Fetch full store info (name, address, phone, currency)
  // so PaymentScreen can build a correct receipt payload instead of
  // hardcoding "ZKS Store".
  const { data: settingsData } = useSWR<{
    settings: {
      displayTaxBreakdown?: boolean;
      storeName?: string;
      address?: string;
      phone?: string;
      currency?: string;
    };
  }>(
    "/api/settings",
    (url: string) =>
      apiGet<{
        settings: {
          displayTaxBreakdown?: boolean;
          storeName?: string;
          address?: string;
          phone?: string;
          currency?: string;
        };
      }>(url).then((d) => d ?? { settings: {} }),
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const displayTaxBreakdown =
    settingsData?.settings?.displayTaxBreakdown ?? true;

  // AUDIT-FIX H-5: Build storeInfo from settings (with sensible fallbacks).
  const storeInfo = {
    storeName: settingsData?.settings?.storeName ?? "ZKR Store",
    storeAddress: settingsData?.settings?.address ?? "",
    storePhone: settingsData?.settings?.phone ?? "",
    currency: settingsData?.settings?.currency ?? "Rs.",
  };

  const { data: customersData, isLoading: customersLoading } = useSWR<{
    customers: Customer[];
  }>(
    "/api/customers?forPos=true",
    (url: string) =>
      apiGet<{ customers: Customer[] }>(url).then(
        (d) => d ?? { customers: [] },
      ),
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  const products = useMemo(() => productsData?.products || [], [productsData]);
  const categories = useMemo(() => categoriesData || [], [categoriesData]);

  const customers = useMemo(() => {
    if (!customersData?.customers) return [];
    return customersData.customers.map((c) => ({
      ...c,
      balance: typeof c.balance === "string" ? Number(c.balance) : c.balance,
      creditLimit:
        typeof c.creditLimit === "string"
          ? Number(c.creditLimit)
          : c.creditLimit,
    }));
  }, [customersData]);

  // Sync return customer with real customer data from API
  useEffect(() => {
    if (state.returnMode && state.customer?.id && customers.length > 0) {
      const realCustomer = customers.find((c) => c.id === state.customer!.id);
      if (realCustomer && realCustomer.balance !== state.customer.balance) {
        dispatch({ type: "SET_CUSTOMER", payload: realCustomer });
      }
    }
  }, [state.returnMode, state.customer, customers]);

  // Debounced localStorage save — 500ms after the last state change.
  // Prevents UI lag during rapid keystrokes / barcode scans.
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      savePosState(state);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [state]);

  // Computed values via pure selectors
  const filteredProducts = useMemo(
    () => selectFilteredProducts(state, products),
    [state, products],
  );
  const cartTotal = useMemo(() => selectCartTotal(state), [state]);
  const cartTax = useMemo(() => selectCartTax(state), [state]);
  const cartTotalWithTax = useMemo(
    () => selectCartTotalWithTax(state),
    [state],
  );
  const totalPaid = useMemo(() => selectTotalPaid(state), [state]);
  const remainingPayment = useMemo(
    () => selectRemainingPayment(state),
    [state],
  );
  const changeDue = useMemo(() => selectChangeDue(state), [state]);

  // Idle Lock Timer (10 minutes)
  const activityRef = useRef<number>(0);
  const resetActivity = useCallback(() => {
    activityRef.current = Date.now();
  }, []);

  useEffect(() => {
    activityRef.current = Date.now();

    const interval = setInterval(() => {
      if (state.isLocked) return;
      if (Date.now() - activityRef.current > 600000) {
        dispatch({ type: "LOCK" });
      }
    }, 5000);

    const handler = () => resetActivity();
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", handler);
    window.addEventListener("touchstart", handler);
    window.addEventListener("mousemove", handler);

    return () => {
      clearInterval(interval);
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("mousemove", handler);
    };
  }, [state.isLocked, resetActivity]);

  // Exposed mutate function for refreshing SWR caches from consumers.
  //
  // Supports three forms:
  //   1. mutate(key)                            — revalidate the cache
  //   2. mutate(key, updater)                   — optimistic update + revalidate
  //   3. mutate(key, updater, { revalidate })   — full SWR signature
  //
  // Form 2/3 lets consumers (e.g. PaymentScreen.processSale) immediately
  // apply the local effect of a mutation (e.g. decrement stock for sold
  // items) BEFORE the server refetch returns — the product grid updates
  // instantly instead of waiting 200-500ms for the round-trip.
  const { mutate: globalMutate } = useSWRConfig();
  const mutate = useCallback(
    <Key extends string>(
      key: Key,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updater?: any,
      options?: { revalidate?: boolean },
    ) => {
      // Pass through to SWR's global mutate — it already handles the
      // updater-function form (current data → new data) and the revalidate
      // flag. Tuples are allowed but we only use the (key, updater?, opts?)
      // form for type safety.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return globalMutate(key as any, updater as any, options as any);
    },
    [globalMutate],
  );

  return (
    <PosContext.Provider
      value={{
        state,
        dispatch,
        filteredProducts,
        cartTotal,
        cartTax,
        cartTotalWithTax,
        remainingPayment,
        totalPaid,
        changeDue,
        products,
        categories,
        customers,
        productsLoading,
        categoriesLoading,
        customersLoading,
        displayTaxBreakdown,
        storeInfo,
        mutate,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used within PosProvider");
  return ctx;
}
