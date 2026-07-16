// src/lib/pos/reducer.ts
//
// Pure POS reducer. No side effects, no I/O. Safe to unit-test.
// `crypto.randomUUID()` is the only non-deterministic call, used to generate
// IDs for cart items / parked orders / payment lines.

import type { CartItem, ParkedOrder, PosAction, PosState } from "./types";

export function posReducer(state: PosState, action: PosAction): PosState {
  switch (action.type) {
    case "ADD_TO_CART": {
      const { product, variant } = action.payload;
      const existing = state.cart.find(
        (i) =>
          i.productId === product.id &&
          i.variantId === (variant?.id || undefined) &&
          !i.isReturn &&
          !i.isZeroed,
      );
      if (existing) {
        return {
          ...state,
          cart: state.cart.map((i) =>
            i.id === existing.id
              ? { ...i, quantity: i.quantity + 1, isZeroed: false }
              : i,
          ),
          selectedItemId: existing.id,
          showKeypad: true,
          keypadValue: "",
          keypadMode: "qty",
          keypadHasEdited: false,
        };
      }
      const newItem: CartItem = {
        id: crypto.randomUUID(),
        productId: product.id,
        variantId: variant?.id,
        name: product.name,
        variantName: variant?.name,
        image: product.image,
        unitPrice: variant?.price ?? product.price,
        quantity: 1,
        isReturn: false,
        isZeroed: false,
        taxRate: product.taxRate ?? 0,
      };
      return {
        ...state,
        cart: [...state.cart, newItem],
        selectedItemId: newItem.id,
        showKeypad: true,
        keypadValue: "",
        keypadMode: "qty",
        keypadHasEdited: false,
      };
    }

    case "SELECT_CART_ITEM": {
      if (action.payload && state.selectedItemId === action.payload) {
        return {
          ...state,
          selectedItemId: null,
          showKeypad: false,
          keypadValue: "",
          keypadMode: "qty",
          keypadHasEdited: false,
        };
      }
      if (action.payload) {
        return {
          ...state,
          selectedItemId: action.payload,
          showKeypad: true,
          keypadValue: "",
          keypadMode: "qty",
          keypadHasEdited: false,
        };
      }
      return {
        ...state,
        selectedItemId: null,
        showKeypad: false,
        keypadValue: "",
        keypadMode: "qty",
        keypadHasEdited: false,
      };
    }

    case "REMOVE_CART_ITEM": {
      const item = state.cart.find((i) => i.id === action.payload);
      if (!item) return state;
      if (!item.isZeroed && item.quantity > 0) {
        return {
          ...state,
          cart: state.cart.map((i) =>
            i.id === action.payload ? { ...i, quantity: 0, isZeroed: true } : i,
          ),
          keypadValue: "0",
          keypadHasEdited: true,
        };
      }
      const newCart = state.cart.filter((i) => i.id !== action.payload);
      return {
        ...state,
        cart: newCart,
        selectedItemId:
          state.selectedItemId === action.payload
            ? newCart[0]?.id || null
            : state.selectedItemId,
        keypadValue: "",
        showKeypad: newCart.length > 0,
        keypadMode: null,
        keypadHasEdited: false,
      };
    }

    case "UPDATE_CART_ITEM_QTY":
      return {
        ...state,
        cart: state.cart.map((i) =>
          i.id === action.payload.id
            ? { ...i, quantity: action.payload.quantity, isZeroed: false }
            : i,
        ),
      };

    case "UPDATE_CART_ITEM_PRICE":
      return {
        ...state,
        cart: state.cart.map((i) =>
          i.id === action.payload.id
            ? { ...i, unitPrice: action.payload.price }
            : i,
        ),
      };

    case "UPDATE_CART_ITEM_NOTE":
      return {
        ...state,
        cart: state.cart.map((i) =>
          i.id === action.payload.id ? { ...i, note: action.payload.note } : i,
        ),
      };

    case "LOAD_REFUND_CART":
      return {
        ...state,
        cart: action.payload,
        customer: action.payload[0]?.originalCustomer || state.customer,
        internalNote: "",
      };

    case "TOGGLE_RETURN":
      return {
        ...state,
        cart: state.cart.map((i) =>
          i.id === action.payload
            ? { ...i, isReturn: !i.isReturn, isZeroed: false }
            : i,
        ),
      };

    case "SET_CUSTOMER":
      return { ...state, customer: action.payload };

    case "SET_NOTE":
      return { ...state, internalNote: action.payload };

    case "SET_SEARCH":
      return { ...state, searchQuery: action.payload, selectedCategory: "all" };

    case "SET_CATEGORY":
      return { ...state, selectedCategory: action.payload, searchQuery: "" };

    case "OPEN_PAYMENT":
      // AUDIT-FIX C-13/H-4: Generate the idempotency key ONCE when entering
      // the payment screen. Reused across retries (so the backend dedup
      // works), cleared on COMPLETE_SALE / CANCEL_ORDER. Previously
      // PaymentScreen.processSale generated a fresh UUID per invocation —
      // a retry after network drop created a duplicate sale.
      return {
        ...state,
        isPaymentScreen: true,
        paymentLines: state.returnMode ? state.paymentLines : [],
        paymentBuffer: "",
        activePaymentMethod: null,
        currentSaleId: state.currentSaleId ?? crypto.randomUUID(),
      };

    case "CLOSE_PAYMENT":
      return {
        ...state,
        isPaymentScreen: false,
        paymentLines: state.returnMode ? state.paymentLines : [],
        paymentBuffer: "",
        activePaymentMethod: null,
        // AUDIT-FIX C-13/H-4: Keep currentSaleId on CLOSE_PAYMENT so a
        // re-open of the same payment screen reuses the same key. Cleared
        // on COMPLETE_SALE / CANCEL_ORDER / NEW_SALE.
      };

    case "OPEN_MODAL":
      return {
        ...state,
        activeModal: action.payload.modal,
        modalProductId: action.payload.productId || null,
      };

    case "CLOSE_MODAL":
      return { ...state, activeModal: "none", modalProductId: null };

    case "LOCK":
      return { ...state, isLocked: true };

    case "UNLOCK":
      return { ...state, isLocked: false };

    case "HOLD_ORDER": {
      if (state.cart.length === 0) return state;
      const order: ParkedOrder = {
        id: crypto.randomUUID(),
        saleNumber: state.currentSaleNumber,
        items: state.cart,
        customer: state.customer,
        note: state.internalNote,
        total: state.cart.reduce(
          (sum, i) => sum + i.unitPrice * i.quantity * (i.isReturn ? -1 : 1),
          0,
        ),
        createdAt: Date.now(),
      };
      return {
        ...state,
        parkedOrders: [...state.parkedOrders, order],
        cart: [],
        selectedItemId: null,
        customer: null,
        internalNote: "",
        showKeypad: false,
        keypadValue: "",
        keypadMode: null,
        keypadHasEdited: false,
        currentSaleNumber: state.nextSaleNumber,
        nextSaleNumber: state.nextSaleNumber + 1,
      };
    }

    case "RESUME_ORDER": {
      const order = state.parkedOrders.find((o) => o.id === action.payload);
      if (!order) return state;

      let newParkedOrders = state.parkedOrders;
      if (state.cart.length > 0) {
        const currentOrder: ParkedOrder = {
          id: crypto.randomUUID(),
          saleNumber: state.currentSaleNumber,
          items: state.cart,
          customer: state.customer,
          note: state.internalNote,
          total: state.cart.reduce(
            (sum, i) => sum + i.unitPrice * i.quantity * (i.isReturn ? -1 : 1),
            0,
          ),
          createdAt: Date.now(),
        };
        newParkedOrders = [...state.parkedOrders, currentOrder];
      }

      return {
        ...state,
        cart: order.items,
        customer: order.customer,
        internalNote: order.note,
        currentSaleNumber: order.saleNumber,
        parkedOrders: newParkedOrders.filter((o) => o.id !== action.payload),
        activeTab: "register",
        showKeypad: false,
        keypadValue: "",
        keypadMode: null,
        keypadHasEdited: false,
      };
    }

    case "COMPLETE_SALE": {
      const isReturnOrder = action.payload.items.every((i) => i.isReturn);
      return {
        ...state,
        completedOrders: isReturnOrder
          ? state.completedOrders
          : [...state.completedOrders, action.payload],
        cart: [],
        selectedItemId: null,
        customer: null,
        internalNote: "",
        isPaymentScreen: false,
        paymentLines: [],
        paymentBuffer: "",
        activePaymentMethod: null,
        showKeypad: false,
        keypadValue: "",
        keypadMode: null,
        keypadHasEdited: false,
        currentSaleNumber: state.nextSaleNumber,
        nextSaleNumber: state.nextSaleNumber + 1,
        // AUDIT-FIX C-13/H-4: Clear idempotency key — next sale gets a new one.
        currentSaleId: null,
      };
    }

    case "CANCEL_ORDER": {
      if (state.parkedOrders.length > 0) {
        const sorted = [...state.parkedOrders].sort(
          (a, b) => b.saleNumber - a.saleNumber,
        );
        const orderToResume = sorted[0];
        return {
          ...state,
          cart: orderToResume.items,
          customer: orderToResume.customer,
          internalNote: orderToResume.note,
          currentSaleNumber: orderToResume.saleNumber,
          parkedOrders: state.parkedOrders.filter(
            (o) => o.id !== orderToResume.id,
          ),
          selectedItemId: null,
          showKeypad: false,
          keypadValue: "",
          keypadMode: null,
          keypadHasEdited: false,
          paymentLines: [],
          paymentBuffer: "",
          activePaymentMethod: null,
          isPaymentScreen: false,
          returnMode: false,
          originalSale: null,
          // AUDIT-FIX C-13/H-4: Clear idempotency key on cancel.
          currentSaleId: null,
        };
      }
      if (state.cart.length === 0) return state;
      return {
        ...state,
        cart: [],
        selectedItemId: null,
        customer: null,
        internalNote: "",
        paymentLines: [],
        paymentBuffer: "",
        activePaymentMethod: null,
        showKeypad: false,
        keypadValue: "",
        keypadMode: null,
        keypadHasEdited: false,
        isPaymentScreen: false,
        returnMode: false,
        originalSale: null,
        currentSaleNumber: state.nextSaleNumber,
        // AUDIT-FIX C-13/H-4: Clear idempotency key on cancel.
        currentSaleId: null,
      };
    }

    case "SET_TAB":
      return { ...state, activeTab: action.payload };

    case "NEW_SALE": {
      const currentOrder: ParkedOrder = {
        id: crypto.randomUUID(),
        saleNumber: state.currentSaleNumber,
        items: state.cart,
        customer: state.customer,
        note: state.internalNote,
        total: state.cart.reduce(
          (sum, i) => sum + i.unitPrice * i.quantity * (i.isReturn ? -1 : 1),
          0,
        ),
        createdAt: Date.now(),
      };
      return {
        ...state,
        parkedOrders: [...state.parkedOrders, currentOrder],
        cart: [],
        selectedItemId: null,
        customer: null,
        internalNote: "",
        showKeypad: false,
        keypadValue: "",
        keypadMode: null,
        keypadHasEdited: false,
        currentSaleNumber: state.nextSaleNumber,
        nextSaleNumber: state.nextSaleNumber + 1,
        activeTab: "register",
      };
    }

    case "OPEN_REGISTER": {
      const session = {
        id: action.payload.id || crypto.randomUUID(),
        openingCash: action.payload.openingCash,
        openingNote: action.payload.openingNote,
        cashInTotal: 0,
        cashOutTotal: 0,
        status: "open" as const,
        openedAt: Date.now(),
        transactions: [],
      };
      // Issue 8: Clear ALL stale data from previous register sessions so a
      // freshly opened register starts clean — no leftover parked orders,
      // completed orders, cart, customer, etc.
      return {
        ...state,
        registerSession: session,
        currentSaleNumber: 1,
        nextSaleNumber: 2,
        activeModal: "none" as const,
        // CLEAR stale data from previous sessions
        parkedOrders: [],
        completedOrders: [],
        cart: [],
        selectedItemId: null,
        customer: null,
        internalNote: "",
        returnMode: false,
        originalSale: null,
        paymentLines: [],
        isPaymentScreen: false,
        showKeypad: false,
        keypadValue: "",
        keypadMode: null,
        keypadHasEdited: false,
        paymentBuffer: "",
        activePaymentMethod: null,
      };
    }

    case "CLOSE_REGISTER": {
      if (!state.registerSession) return state;
      return {
        ...state,
        registerSession: {
          ...state.registerSession,
          status: "closed",
          closedAt: Date.now(),
          closingCash: action.payload.closingCash,
          closingNote: action.payload.closingNote,
        },
        completedOrders: [],
        parkedOrders: [],
        cart: [],
        selectedItemId: null,
        customer: null,
        internalNote: "",
        paymentLines: [],
        paymentBuffer: "",
        activePaymentMethod: null,
        currentSaleNumber: 1,
        nextSaleNumber: 2,
        activeModal: "none" as const,
      };
    }

    case "CASH_IN_OUT": {
      if (!state.registerSession) return state;
      const tx = action.payload;
      const newTransactions = [...state.registerSession.transactions, tx];
      const cashInTotal = newTransactions
        .filter((t) => t.type === "in")
        .reduce((s, t) => s + t.amount, 0);
      const cashOutTotal = newTransactions
        .filter((t) => t.type === "out")
        .reduce((s, t) => s + t.amount, 0);
      return {
        ...state,
        registerSession: {
          ...state.registerSession,
          transactions: newTransactions,
          cashInTotal,
          cashOutTotal,
        },
      };
    }

    case "TOGGLE_KEYPAD":
      return { ...state, showKeypad: action.payload };

    case "SET_KEYPAD_MODE": {
      const item = state.cart.find((i) => i.id === state.selectedItemId);
      if (!item) return state;
      return {
        ...state,
        keypadMode: action.payload,
        keypadValue: action.payload
          ? String(action.payload === "qty" ? item.quantity : item.unitPrice)
          : "0",
        keypadHasEdited: false,
      };
    }

    case "SET_KEYPAD_VALUE":
      return { ...state, keypadValue: action.payload };

    case "APPLY_KEYPAD_DIGIT": {
      if (!state.selectedItemId || !state.keypadMode) return state;
      const item = state.cart.find((i) => i.id === state.selectedItemId);
      if (!item) return state;

      const newValue = state.keypadHasEdited
        ? state.keypadValue + action.payload
        : action.payload;
      const val = parseFloat(newValue);
      if (isNaN(val)) return state;

      if (state.keypadMode === "qty") {
        return {
          ...state,
          keypadValue: newValue,
          keypadHasEdited: true,
          cart: state.cart.map((i) =>
            i.id === state.selectedItemId
              ? { ...i, quantity: val, isZeroed: false }
              : i,
          ),
        };
      }
      return {
        ...state,
        keypadValue: newValue,
        keypadHasEdited: true,
        cart: state.cart.map((i) =>
          i.id === state.selectedItemId ? { ...i, unitPrice: val } : i,
        ),
      };
    }

    case "EDIT_PAYMENT_LINE":
      return {
        ...state,
        paymentLines: state.paymentLines.map((p) =>
          p.id === action.payload.id
            ? { ...p, amount: action.payload.amount }
            : p,
        ),
      };

    case "KEYPAD_BACKSPACE": {
      if (!state.selectedItemId) return state;
      const item = state.cart.find((i) => i.id === state.selectedItemId);
      if (!item) return state;

      if (!item.isZeroed && item.quantity > 0) {
        return {
          ...state,
          cart: state.cart.map((i) =>
            i.id === state.selectedItemId
              ? { ...i, quantity: 0, isZeroed: true }
              : i,
          ),
          keypadValue: "0",
          keypadHasEdited: true,
        };
      }

      const newCart = state.cart.filter((i) => i.id !== state.selectedItemId);
      const nextItem = newCart[0];
      return {
        ...state,
        cart: newCart,
        selectedItemId: nextItem?.id || null,
        showKeypad: !!nextItem,
        keypadValue: "",
        keypadMode: nextItem ? null : state.keypadMode,
        keypadHasEdited: false,
      };
    }

    case "KEYPAD_ENTER": {
      if (!state.selectedItemId) return state;
      const idx = state.cart.findIndex((i) => i.id === state.selectedItemId);
      const nextItem = state.cart[idx + 1];
      return {
        ...state,
        keypadValue: "",
        selectedItemId: nextItem?.id || null,
        showKeypad: !!nextItem,
        keypadMode: nextItem ? null : state.keypadMode,
        keypadHasEdited: false,
      };
    }

    case "ADD_PAYMENT_LINE": {
      const existing = state.paymentLines.find(
        (p) => p.method === action.payload.method,
      );
      if (existing && action.payload.replace) {
        return {
          ...state,
          paymentLines: state.paymentLines.map((p) =>
            p.id === existing.id ? { ...p, amount: action.payload.amount } : p,
          ),
          paymentBuffer: "",
          activePaymentMethod: null,
        };
      }
      if (existing) {
        return {
          ...state,
          paymentLines: state.paymentLines.map((p) =>
            p.id === existing.id
              ? { ...p, amount: p.amount + action.payload.amount }
              : p,
          ),
          paymentBuffer: "",
          activePaymentMethod: null,
        };
      }
      return {
        ...state,
        paymentLines: [
          ...state.paymentLines,
          {
            id: crypto.randomUUID(),
            method: action.payload.method,
            amount: action.payload.amount,
          },
        ],
        paymentBuffer: "",
        activePaymentMethod: null,
      };
    }

    case "REMOVE_PAYMENT_LINE":
      return {
        ...state,
        paymentLines: state.paymentLines.filter((p) => p.id !== action.payload),
      };

    case "SET_PAYMENT_BUFFER":
      return { ...state, paymentBuffer: action.payload };

    case "SET_ACTIVE_PAYMENT_METHOD":
      return { ...state, activePaymentMethod: action.payload };

    case "CLEAR_PAYMENT_BUFFER":
      return { ...state, paymentBuffer: "" };

    case "ENTER_RETURN_MODE": {
      // FIX (issue 10): Do NOT pre-fill payment lines from the original sale —
      // the cashier found them confusing. The cashier will add refund lines
      // explicitly via the payment screen. We still accept the
      // originalPaymentLines payload for backward compatibility but ignore it.
      return {
        ...state,
        returnMode: true,
        originalSale: {
          id: action.payload.saleId,
          saleNumber: action.payload.saleNumber,
          customerId: action.payload.customerId,
        },
        cart: [],
        selectedItemId: null,
        customer: null,
        internalNote: "",
        showKeypad: false,
        keypadValue: "",
        keypadMode: null,
        keypadHasEdited: false,
        paymentLines: [],
        paymentBuffer: "",
        activePaymentMethod: null,
        isPaymentScreen: false,
      };
    }

    case "EXIT_RETURN_MODE":
      return {
        ...state,
        returnMode: false,
        originalSale: null,
        cart: [],
        selectedItemId: null,
        customer: null,
        internalNote: "",
        showKeypad: false,
        keypadValue: "",
        keypadMode: null,
        keypadHasEdited: false,
        paymentLines: [],
        paymentBuffer: "",
        activePaymentMethod: null,
        isPaymentScreen: false,
      };

    default:
      return state;
  }
}
