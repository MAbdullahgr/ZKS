// src/lib/pos/types.ts
//
// All POS type definitions and the initial state for the POS reducer.
// Pure type/data module — no React, no SWR, no Prisma. Safe to import
// from unit tests.

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  stock: number;
  sku: string;
}

export interface Product {
  id: string;
  name: string;
  image?: string;
  price: number;
  stock: number;
  sku: string;
  barcode?: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  hasVariants: boolean;
  variants?: ProductVariant[];
  unit?: string;
  cost?: number;
  minStockLevel: number;
  taxRate?: number; // 0 if no tax, 17 if GST 17%, etc.
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  image?: string;
  unitPrice: number;
  quantity: number;
  isReturn: boolean;
  isZeroed: boolean;
  note?: string;
  taxRate?: number; // captured at add-to-cart time (0 if no tax)
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: number;
  creditLimit: number;
}

export interface CashTransaction {
  id: string;
  type: "in" | "out";
  amount: number;
  reason: string;
  createdAt: number;
}

export interface RegisterSession {
  id: string;
  openingCash: number;
  openingNote: string;
  cashInTotal: number;
  cashOutTotal: number;
  status: "open" | "closed";
  openedAt: number;
  transactions: CashTransaction[];
  closedAt?: number;
  closingCash?: number;
  closingNote?: string;
}

export interface PaymentLine {
  id: string;
  method: PaymentMethod;
  amount: number;
}

export interface RefundCartItem extends CartItem {
  originalCustomer?: Customer | null;
}

export interface ParkedOrder {
  id: string;
  saleNumber: number;
  items: CartItem[];
  customer: Customer | null;
  note: string;
  total: number;
  createdAt: number;
}

export interface CompletedOrder extends ParkedOrder {
  paymentLines: PaymentLine[];
  changeDue: number;
}

export type ModalType =
  | "none"
  | "productDetail"
  | "variant"
  | "customer"
  | "note"
  | "cashInOut"
  | "closeRegister"
  | "return"
  | "customerNote"
  | "actions";

export type PaymentMethod = "cash" | "card" | "mobile" | "khata" | "easypaisa" | "jazzcash";

export interface PosState {
  cart: CartItem[];
  selectedItemId: string | null;
  currentSaleNumber: number;
  nextSaleNumber: number;
  customer: Customer | null;
  internalNote: string;
  isPaymentScreen: boolean;
  isLocked: boolean;
  activeTab: "register" | "orders";
  searchQuery: string;
  selectedCategory: string | null;
  activeModal: ModalType;
  modalProductId: string | null;
  parkedOrders: ParkedOrder[];
  completedOrders: CompletedOrder[];
  registerSession: RegisterSession | null;
  showKeypad: boolean;
  keypadMode: "qty" | "price" | null;
  keypadValue: string;
  keypadHasEdited: boolean;
  paymentLines: PaymentLine[];
  paymentBuffer: string;
  activePaymentMethod: PaymentMethod | null;
  returnMode: boolean;
  originalSale: { id: string; saleNumber: string; customerId?: string } | null;
  // AUDIT-FIX C-13/H-4: Persistent idempotency key per sale attempt.
  // Generated when entering the payment screen (OPEN_PAYMENT), reused
  // across retries, cleared on COMPLETE_SALE / CANCEL_ORDER. This closes
  // the "duplicate sale on network retry" hole — previously
  // PaymentScreen.processSale generated a fresh UUID on every invocation,
  // so a retry after a network drop created a duplicate sale (the backend
  // dedup only works if the SAME key is sent twice).
  currentSaleId: string | null;
}

export type PosAction =
  | {
      type: "ADD_TO_CART";
      payload: { product: Product; variant?: ProductVariant };
    }
  | { type: "SELECT_CART_ITEM"; payload: string | null }
  | { type: "REMOVE_CART_ITEM"; payload: string }
  | { type: "UPDATE_CART_ITEM_QTY"; payload: { id: string; quantity: number } }
  | { type: "UPDATE_CART_ITEM_PRICE"; payload: { id: string; price: number } }
  | { type: "TOGGLE_RETURN"; payload: string }
  | { type: "SET_CUSTOMER"; payload: Customer | null }
  | { type: "SET_NOTE"; payload: string }
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_CATEGORY"; payload: string | null }
  | { type: "OPEN_PAYMENT" }
  | { type: "CLOSE_PAYMENT" }
  | { type: "OPEN_MODAL"; payload: { modal: ModalType; productId?: string } }
  | { type: "CLOSE_MODAL" }
  | { type: "LOCK" }
  | { type: "UNLOCK" }
  | { type: "HOLD_ORDER" }
  | { type: "RESUME_ORDER"; payload: string }
  | { type: "COMPLETE_SALE"; payload: CompletedOrder }
  | { type: "CANCEL_ORDER" }
  | { type: "SET_TAB"; payload: "register" | "orders" }
  | { type: "NEW_SALE" }
  | {
      type: "OPEN_REGISTER";
      payload: { openingCash: number; openingNote: string; id?: string };
    }
  | {
      type: "CLOSE_REGISTER";
      payload: { closingCash: number; closingNote: string };
    }
  | { type: "CASH_IN_OUT"; payload: CashTransaction }
  | { type: "TOGGLE_KEYPAD"; payload: boolean }
  | { type: "SET_KEYPAD_MODE"; payload: "qty" | "price" | null }
  | { type: "SET_KEYPAD_VALUE"; payload: string }
  | { type: "APPLY_KEYPAD_DIGIT"; payload: string }
  | { type: "KEYPAD_BACKSPACE" }
  | { type: "KEYPAD_ENTER" }
  | {
      type: "ADD_PAYMENT_LINE";
      payload: { method: PaymentMethod; amount: number; replace?: boolean };
    }
  | { type: "REMOVE_PAYMENT_LINE"; payload: string }
  | { type: "SET_PAYMENT_BUFFER"; payload: string }
  | { type: "SET_ACTIVE_PAYMENT_METHOD"; payload: PaymentMethod | null }
  | { type: "CLEAR_PAYMENT_BUFFER" }
  | { type: "EDIT_PAYMENT_LINE"; payload: { id: string; amount: number } }
  | { type: "LOAD_REFUND_CART"; payload: RefundCartItem[] }
  | {
      type: "ENTER_RETURN_MODE";
      payload: {
        saleId: string;
        saleNumber: string;
        customerId?: string;
        originalPaymentLines?: Array<{ method: string; amount: number }>;
      };
    }
  | { type: "EXIT_RETURN_MODE" }
  | { type: "UPDATE_CART_ITEM_NOTE"; payload: { id: string; note: string } };

// ─── Initial state ────────────────────────────────────────────────────

export const initialState: PosState = {
  cart: [],
  selectedItemId: null,
  currentSaleNumber: 1,
  nextSaleNumber: 2,
  customer: null,
  internalNote: "",
  isPaymentScreen: false,
  isLocked: false,
  activeTab: "register",
  searchQuery: "",
  selectedCategory: "all",
  activeModal: "none",
  modalProductId: null,
  parkedOrders: [],
  completedOrders: [],
  registerSession: null,
  showKeypad: false,
  keypadMode: null,
  keypadValue: "",
  keypadHasEdited: false,
  paymentLines: [],
  paymentBuffer: "",
  activePaymentMethod: null,
  returnMode: false,
  originalSale: null,
  // AUDIT-FIX C-13/H-4: Persistent idempotency key per sale attempt.
  currentSaleId: null,
};
