// src/lib/pos/persistence.ts
//
// localStorage load / save / clear for the POS session.
//
// IMPORTANT: All reads are defensive — `parsed.items || []`, etc. — so that
// a corrupted or partially-saved localStorage blob never throws at load
// time. The whole point of localStorage persistence is to be resilient to
// crashes; if a single field is malformed, we still recover the rest.

import type { CartItem, CompletedOrder, ParkedOrder, PosState } from "./types";
import { initialState } from "./types";

const STORAGE_KEY_PREFIX = "pos_session";
const SCHEMA_VERSION = 2;

// AUDIT-FIX C-13/H-4: Scope the storage key by userId so cashiers on a
// shared terminal don't see each other's carts. Previously the key was
// a single "pos_session" — if cashier A logged out without clearing,
// cashier B's loadPosState() returned A's cart, customer, and register
// session. Now each user gets their own key.
//
// The userId is read from the JWT cookie at runtime (client-side). If the
// cookie is missing (not logged in), fall back to the legacy key so
// existing sessions aren't lost during the upgrade.
function getStorageKey(): string {
  if (typeof window === "undefined") return STORAGE_KEY_PREFIX;
  // Read userId from the JWT cookie. The cookie is httpOnly so we can't
  // read it directly — instead we use a non-httpOnly companion cookie
  // "pos_user_id" set at login (see auth route). If that's missing too,
  // fall back to the legacy unscoped key.
  const userId = window.localStorage.getItem("pos_current_user_id");
  return userId ? `${STORAGE_KEY_PREFIX}_${userId}` : STORAGE_KEY_PREFIX;
}

// AUDIT-FIX C-13/H-4: Set the current user id so persistence keys are
// scoped. Called by PosProvider on mount when the session is known.
export function setCurrentPosUserId(userId: string | null): void {
  if (typeof window === "undefined") return;
  if (userId) {
    window.localStorage.setItem("pos_current_user_id", userId);
  } else {
    window.localStorage.removeItem("pos_current_user_id");
  }
}

// AUDIT-FIX C-13/H-4: Clear ALL pos_session_* keys on logout. Called by
// the logout flow. Without this, the next user on a shared terminal would
// see stale cart data from the previous user (if the previous user forgot
// to clear).
export function clearAllPosSessions(): void {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  window.localStorage.removeItem("pos_current_user_id");
}

interface SavedSession {
  version?: number;
  cart?: CartItem[];
  currentSaleNumber?: number;
  nextSaleNumber?: number;
  parkedOrders?: ParkedOrder[];
  completedOrders?: CompletedOrder[];
  registerSession?: PosState["registerSession"];
  customer?: PosState["customer"];
  internalNote?: string;
  isPaymentScreen?: boolean;
  paymentLines?: PosState["paymentLines"];
  paymentBuffer?: string;
  activePaymentMethod?: PosState["activePaymentMethod"];
  returnMode?: boolean;
  originalSale?: PosState["originalSale"];
}

/**
 * Reads & sanitizes the saved session from localStorage.
 * Returns `initialState` if there is no saved session or it can't be parsed.
 *
 * Defensive `|| []` patterns protect against partial / corrupted blobs.
 */
export function loadPosState(): PosState {
  if (typeof window === "undefined") return initialState;

  const saved = window.localStorage.getItem(getStorageKey());
  if (!saved) return initialState;

  try {
    const parsed: SavedSession = JSON.parse(saved);
    const version = parsed.version || 1;

    // Sanitize completed orders — defensive against missing/undefined items
    const sanitizedOrders = (parsed.completedOrders || []).map(
      (o: CompletedOrder) => ({
        ...o,
        // FIX: defensive — never trust that items[] survived serialization
        items: (o.items || []).map((item: CartItem) => ({
          ...item,
          unitPrice:
            item.unitPrice < 0 ? Math.abs(item.unitPrice) : item.unitPrice,
        })),
      }),
    );
    const uniqueOrders = Array.from(
      new Map(sanitizedOrders.map((o: CompletedOrder) => [o.id, o])).values(),
    ) as CompletedOrder[];

    let nextSaleNumber: number;
    let currentSaleNumber: number;

    if (version >= 2 && typeof parsed.nextSaleNumber === "number") {
      nextSaleNumber = parsed.nextSaleNumber;
      currentSaleNumber = parsed.currentSaleNumber || 1;
    } else {
      // v1 fallback: derive next sale number from existing orders
      const allNumbers = [
        ...(parsed.parkedOrders || []).map((o: ParkedOrder) => o.saleNumber),
        ...uniqueOrders.map((o: CompletedOrder) => o.saleNumber),
        parsed.currentSaleNumber || 1,
      ];
      const maxNum = allNumbers.length > 0 ? Math.max(...allNumbers) : 0;
      nextSaleNumber = maxNum + 1;
      currentSaleNumber = parsed.currentSaleNumber || 1;
    }

    const registerOpen =
      parsed.registerSession?.status === "open"
        ? !!parsed.registerSession
        : false;

    return {
      ...initialState,
      // Defensive arrays — never trust persisted shape
      cart: parsed.cart || [],
      currentSaleNumber,
      nextSaleNumber,
      parkedOrders: parsed.parkedOrders || [],
      completedOrders: registerOpen ? uniqueOrders : [],
      registerSession: registerOpen ? parsed.registerSession! : null,
      customer: parsed.customer || null,
      internalNote: parsed.internalNote || "",
      isPaymentScreen: parsed.isPaymentScreen || false,
      paymentLines: parsed.paymentLines || [],
      paymentBuffer: parsed.paymentBuffer || "",
      activePaymentMethod: parsed.activePaymentMethod || null,
      returnMode: parsed.returnMode || false,
      originalSale: parsed.originalSale || null,
    };
  } catch {
    return initialState;
  }
}

/**
 * The subset of state that gets persisted to localStorage.
 * Excluded: selectedItemId, searchQuery, selectedCategory, activeModal,
 * showKeypad, keypad*, isLocked — these are transient UI concerns that
 * shouldn't survive a page reload.
 */
export function savePosState(state: PosState): void {
  if (typeof window === "undefined") return;

  const toSave: SavedSession = {
    version: SCHEMA_VERSION,
    cart: state.cart,
    currentSaleNumber: state.currentSaleNumber,
    nextSaleNumber: state.nextSaleNumber,
    parkedOrders: state.parkedOrders,
    completedOrders:
      state.registerSession?.status === "open" ? state.completedOrders : [],
    registerSession: state.registerSession,
    customer: state.customer,
    internalNote: state.internalNote,
    isPaymentScreen: state.isPaymentScreen,
    paymentLines: state.paymentLines,
    paymentBuffer: state.paymentBuffer,
    activePaymentMethod: state.activePaymentMethod,
    returnMode: state.returnMode,
    originalSale: state.originalSale,
  };

  try {
    window.localStorage.setItem(getStorageKey(), JSON.stringify(toSave));
  } catch {
    // Quota exceeded or storage disabled — fail silently.
    // The POS still works in-memory; we just can't persist.
  }
}

/**
 * Clears the saved session (used on logout / register close).
 */
export function clearPosState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getStorageKey());
  } catch {
    // Ignore
  }
}

/**
 * Returns true if a saved session exists in localStorage.
 */
export function hasSavedSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(getStorageKey()) !== null;
  } catch {
    return false;
  }
}
