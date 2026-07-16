"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PosProvider, usePos } from "@/lib/pos-store";
import PosHeader from "@/components/pos/PosHeader";
import CartPanel from "@/components/pos/CartPanel";
import Keypad from "@/components/pos/Keypad";
import ActionBar from "@/components/pos/ActionBar";
import ProductGrid from "@/components/pos/ProductGrid";
import PaymentScreen from "@/components/pos/PaymentScreen";
import LockScreen from "@/components/pos/LockScreen";
import CloseRegisterModal from "@/components/pos/CloseRegisterModal";
import CashInOutModal from "@/components/pos/CashInOutModal";
import ReturnWizard from "@/components/pos/ReturnWizard";
import { preloadVoices } from "@/lib/voice";
import { apiGet } from "@/lib/fetcher";
import { toast } from "sonner";

interface DbRegisterSession {
  id: string;
  openingCash: number;
  openingNote: string;
}

function RegisterContent() {
  const {
    state,
    dispatch,
    products,
    cartTotal,
    cartTax,
    cartTotalWithTax,
    displayTaxBreakdown,
  } = usePos();
  const router = useRouter();
  const [userName, setUserName] = useState("User");

  const stateRef = useRef(state);
  const dispatchRef = useRef(dispatch);
  const productsRef = useRef(products);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    preloadVoices();
  }, []);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const hasSyncedSession = useRef(false);
  useEffect(() => {
    if (hasSyncedSession.current) return;
    const checkSession = async () => {
      try {
        const authData = await apiGet<{ user: { name: string } }>("/api/auth");
        if (authData?.user?.name) setUserName(authData.user.name);

        const data = await apiGet<{ sessions: DbRegisterSession[] }>(
          "/api/register-sessions?status=open",
        );

        const openSessions = data?.sessions;
        if (!Array.isArray(openSessions) || openSessions.length === 0) {
          dispatchRef.current({
            type: "CLOSE_REGISTER",
            payload: { closingCash: 0, closingNote: "Force closed remotely" },
          });
          router.push("/pos");
          return;
        }

        const dbSession = openSessions[0];
        if (
          !stateRef.current.registerSession ||
          stateRef.current.registerSession.id !== dbSession.id
        ) {
          dispatchRef.current({
            type: "OPEN_REGISTER",
            payload: {
              id: dbSession.id,
              openingCash: Number(dbSession.openingCash),
              openingNote: dbSession.openingNote || "",
            },
          });
        }
        hasSyncedSession.current = true;
      } catch {
        toast.error("Failed to load register session. Redirecting...");
        router.push("/pos");
      }
    };
    checkSession();
  }, [router]);

  const barcodeBuffer = useRef("");
  const lastKeyTime = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (target.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) {
        return;
      }

      const s = stateRef.current;
      if (s.activeModal !== "none") return;
      if (s.isPaymentScreen) return;

      const prods = productsRef.current;

      if (s.showKeypad && s.selectedItemId) {
        if (e.key >= "0" && e.key <= "9") {
          e.preventDefault();
          dispatchRef.current({ type: "APPLY_KEYPAD_DIGIT", payload: e.key });
          return;
        }
        if (e.key === ".") {
          e.preventDefault();
          dispatchRef.current({ type: "APPLY_KEYPAD_DIGIT", payload: "." });
          return;
        }
        if (e.key === "Backspace") {
          e.preventDefault();
          dispatchRef.current({
            type: "REMOVE_CART_ITEM",
            payload: s.selectedItemId,
          });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          dispatchRef.current({ type: "KEYPAD_ENTER" });
          return;
        }
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          const item = s.cart.find((i) => i.id === s.selectedItemId);
          if (item)
            dispatchRef.current({
              type: "UPDATE_CART_ITEM_QTY",
              payload: { id: item.id, quantity: item.quantity + 1 },
            });
          return;
        }
        if (e.key === "-") {
          e.preventDefault();
          const item = s.cart.find((i) => i.id === s.selectedItemId);
          if (item && item.quantity > 1)
            dispatchRef.current({
              type: "UPDATE_CART_ITEM_QTY",
              payload: { id: item.id, quantity: item.quantity - 1 },
            });
          return;
        }
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTime.current;
      lastKeyTime.current = now;

      const isScanner = timeDiff < 50;

      if (e.key === "Enter" && barcodeBuffer.current.length > 3) {
        const barcode = barcodeBuffer.current;
        barcodeBuffer.current = "";
        const product = prods.find((p) => p.barcode === barcode);
        if (product) {
          if (product.stock <= 0) {
            toast.error(`Out of stock: ${product.name}`);
          } else {
            dispatchRef.current({ type: "ADD_TO_CART", payload: { product } });
          }
        } else {
          toast.error(`Product not found for barcode: ${barcode}`);
        }
        return;
      }

      if (isScanner && e.key !== "Enter" && e.key.length === 1) {
        barcodeBuffer.current += e.key;
        return;
      }

      if (e.key.length > 1) {
        barcodeBuffer.current = "";
      } else {
        barcodeBuffer.current = e.key;
      }

      if (
        e.key.length === 1 &&
        /[a-zA-Z]/.test(e.key) &&
        barcodeBuffer.current.length <= 1
      ) {
        const key = e.key.toLowerCase();

        if (key === "n") {
          e.preventDefault();
          dispatchRef.current({
            type: "OPEN_MODAL",
            payload: { modal: "note" },
          });
          return;
        }
        if (key === "q") {
          e.preventDefault();
          dispatchRef.current({ type: "HOLD_ORDER" });
          toast.success("Order parked as quotation.");
          return;
        }
        if (key === "r") {
          e.preventDefault();
          dispatchRef.current({
            type: "OPEN_MODAL",
            payload: { modal: "return" },
          });
          return;
        }
        if (key === "c") {
          if (!s.selectedItemId) {
            toast.error("Please select a product in the cart first");
            return;
          }
          e.preventDefault();
          dispatchRef.current({
            type: "OPEN_MODAL",
            payload: { modal: "customerNote" },
          });
          return;
        }
      }

      if (e.key === "Escape") {
        if (s.showKeypad)
          dispatchRef.current({ type: "TOGGLE_KEYPAD", payload: false });
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        dispatchRef.current({
          type: "OPEN_MODAL",
          payload: { modal: "return" },
        });
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        dispatchRef.current({
          type: "OPEN_MODAL",
          payload: { modal: "customer" },
        });
        return;
      }

      if (e.key === "F3") {
        e.preventDefault();
        dispatchRef.current({ type: "OPEN_MODAL", payload: { modal: "note" } });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const idx = s.cart.findIndex((i) => i.id === s.selectedItemId);
        if (idx > 0)
          dispatchRef.current({
            type: "SELECT_CART_ITEM",
            payload: s.cart[idx - 1].id,
          });
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const idx = s.cart.findIndex((i) => i.id === s.selectedItemId);
        if (idx < s.cart.length - 1) {
          dispatchRef.current({
            type: "SELECT_CART_ITEM",
            payload: s.cart[idx + 1].id,
          });
        } else if (s.cart.length > 0 && idx === -1) {
          dispatchRef.current({
            type: "SELECT_CART_ITEM",
            payload: s.cart[0].id,
          });
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hasItems = state.cart.some((i) => !i.isZeroed && i.quantity > 0);

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden select-none"
      style={{
        WebkitUserSelect: "none",
        msUserSelect: "none",
        userSelect: "none",
      }}
    >
      <PosHeader userName={userName} />

      {/* RESPONSIVE: Stack on mobile, side-by-side on md+ */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Cart Panel — full width on mobile, fixed width on md+ */}
        <div
          className="flex flex-col border-b md:border-b-0 md:border-r border-border bg-card dark:border-border dark:bg-card
          h-[45vh] md:h-auto md:w-[320px] lg:w-95 xl:w-105 shrink-0"
        >
          <div className="flex-1 overflow-hidden">
            <CartPanel />
          </div>
          <div className="shrink-0">
            {hasItems && (
              <div className="border-t border-border bg-card px-3 sm:px-4 py-2 sm:py-3 dark:border-border dark:bg-card">
                {displayTaxBreakdown && cartTax > 0 && (
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                      Subtotal
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-muted-foreground dark:text-muted-foreground">
                      {cartTotal.toLocaleString("en-PK")} Rs
                    </span>
                  </div>
                )}
                {displayTaxBreakdown && cartTax > 0 && (
                  <div className="mb-1 sm:mb-2 flex items-baseline justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                      Tax
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-muted-foreground dark:text-muted-foreground">
                      {cartTax.toLocaleString("en-PK")} Rs
                    </span>
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                    Total
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-foreground dark:text-white">
                    {cartTotalWithTax.toLocaleString("en-PK")}
                    <span className="ml-1 text-xs sm:text-sm font-bold text-muted-foreground">
                      Rs
                    </span>
                  </span>
                </div>
              </div>
            )}
            <ActionBar />
            {state.showKeypad && <Keypad />}
            {hasItems && (
              <button
                onClick={() => dispatch({ type: "OPEN_PAYMENT" })}
                className="flex h-12 sm:h-14 w-full items-center justify-center gap-2 bg-success text-sm sm:text-base font-bold text-success-foreground transition hover:bg-success/90 dark:bg-success/90 dark:hover:bg-success"
              >
                Payment — {cartTotalWithTax.toLocaleString("en-PK")} Rs
              </button>
            )}
          </div>
        </div>

        {/* Product Grid — takes remaining space */}
        <div className="flex-1 overflow-hidden bg-card dark:bg-background">
          <ProductGrid />
        </div>
      </div>

      {state.isPaymentScreen && <PaymentScreen />}
      {state.isLocked && <LockScreen />}
      {state.activeModal === "cashInOut" && <CashInOutModal />}
      {state.activeModal === "closeRegister" && <CloseRegisterModal />}
      {state.activeModal === "return" && (
        <ReturnWizard onClose={() => dispatch({ type: "CLOSE_MODAL" })} />
      )}
    </div>
  );
}

export default function PosRegisterPage() {
  return (
    <PosProvider>
      <RegisterContent />
    </PosProvider>
  );
}
