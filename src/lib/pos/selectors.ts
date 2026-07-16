// src/lib/pos/selectors.ts
//
// Pure computed values derived from the POS state. Each selector is a
// standalone function so it can be unit-tested in isolation.

import type { CartItem, PaymentLine, PosState, Product } from "./types";

/**
 * Sum of all cart line totals (WITHOUT tax). Return items contribute negatively.
 * This is the subtotal the cashier sees before tax is added.
 */
export function cartTotal(state: PosState): number {
  return state.cart.reduce(
    (sum: number, item: CartItem) =>
      sum + item.unitPrice * item.quantity * (item.isReturn ? -1 : 1),
    0,
  );
}

/**
 * Total tax for all cart items. Computed as:
 *   sum of (unitPrice × quantity × taxRate / 100) for each item.
 * Return items contribute negative tax.
 * Rounds to 2 decimal places to match backend computation.
 */
export function cartTax(state: PosState): number {
  return state.cart.reduce((sum: number, item: CartItem) => {
    const lineTotal = item.unitPrice * item.quantity * (item.isReturn ? -1 : 1);
    const rate = item.taxRate ?? 0;
    return sum + Math.round(lineTotal * rate) / 100;
  }, 0);
}

/**
 * Total including tax. This is what the customer actually pays.
 *   cartTotal (subtotal) + cartTax
 */
export function cartTotalWithTax(state: PosState): number {
  return cartTotal(state) + cartTax(state);
}

/**
 * Total of all payment lines (always positive — refund lines are negative).
 */
export function totalPaid(state: PosState): number {
  return state.paymentLines.reduce(
    (sum: number, p: PaymentLine) => sum + p.amount,
    0,
  );
}

/**
 * Amount still owed by the customer (including tax). Zero when fully paid.
 * Uses cartTotalWithTax because the customer pays the tax-inclusive amount.
 */
export function remainingPayment(state: PosState): number {
  const diff = cartTotalWithTax(state) - totalPaid(state);
  return Math.abs(diff) < 0.01 ? 0 : diff;
}

/**
 * Cash to return to the customer. Always >= 0.
 * Based on the tax-inclusive total.
 */
export function changeDue(state: PosState): number {
  return Math.max(0, totalPaid(state) - cartTotalWithTax(state));
}

/**
 * Number of unique cart lines (regardless of quantity).
 */
export function cartItemCount(state: PosState): number {
  return state.cart.length;
}

/**
 * Sum of all item quantities across the cart (returns subtract).
 */
export function cartQuantity(state: PosState): number {
  return state.cart.reduce(
    (sum, i) => sum + i.quantity * (i.isReturn ? -1 : 1),
    0,
  );
}

/**
 * Filter the product list by the active category + search query.
 * Search matches name, sku, or barcode (case-insensitive).
 */
export function filteredProducts(
  state: PosState,
  products: Product[],
): Product[] {
  let prods = products;
  if (state.selectedCategory && state.selectedCategory !== "all") {
    prods = prods.filter((p) => p.categoryId === state.selectedCategory);
  }
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    prods = prods.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode?.includes(q),
    );
  }
  return prods;
}

/**
 * The currently-selected cart item, or null.
 */
export function selectedCartItem(state: PosState): CartItem | null {
  if (!state.selectedItemId) return null;
  return state.cart.find((i) => i.id === state.selectedItemId) ?? null;
}

/**
 * True if the cart contains at least one item with quantity > 0.
 */
export function hasActiveItems(state: PosState): boolean {
  return state.cart.some((i) => i.quantity > 0);
}

/**
 * True if every item in the cart is a return (i.e. a pure return order).
 */
export function isPureReturnOrder(state: PosState): boolean {
  if (state.cart.length === 0) return false;
  return state.cart.every((i) => i.isReturn);
}

/**
 * Returns the total of items in the cart that are NOT returns.
 */
export function positiveCartTotal(state: PosState): number {
  return state.cart.reduce(
    (sum, i) => sum + (i.isReturn ? 0 : i.unitPrice * i.quantity),
    0,
  );
}

/**
 * Returns the absolute total of return items in the cart.
 */
export function returnTotal(state: PosState): number {
  return state.cart.reduce(
    (sum, i) => sum + (i.isReturn ? i.unitPrice * i.quantity : 0),
    0,
  );
}

/**
 * Returns the cash-only payment total (used for register reconciliation).
 */
export function cashPaymentTotal(state: PosState): number {
  return state.paymentLines
    .filter((p) => p.method === "cash")
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Returns the khata (credit) payment total.
 */
export function khataPaymentTotal(state: PosState): number {
  return state.paymentLines
    .filter((p) => p.method === "khata")
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Returns the card payment total.
 */
export function cardPaymentTotal(state: PosState): number {
  return state.paymentLines
    .filter((p) => p.method === "card")
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Returns the mobile banking payment total.
 */
export function mobilePaymentTotal(state: PosState): number {
  return state.paymentLines
    .filter((p) => p.method === "mobile")
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * True if the payment screen is open AND there are payment lines.
 */
export function hasPayments(state: PosState): boolean {
  return state.isPaymentScreen && state.paymentLines.length > 0;
}

/**
 * Number of completed (saved) orders in this register session.
 */
export function completedOrderCount(state: PosState): number {
  return state.completedOrders.length;
}

/**
 * Number of parked (held) orders.
 */
export function parkedOrderCount(state: PosState): number {
  return state.parkedOrders.length;
}

/**
 * Sum of all parked-order totals (helps show "Rs X on hold" UI).
 */
export function parkedOrdersTotal(state: PosState): number {
  return state.parkedOrders.reduce((sum, o) => sum + o.total, 0);
}

/**
 * True if the register session is open.
 */
export function isRegisterOpen(state: PosState): boolean {
  return state.registerSession?.status === "open";
}

/**
 * Net cash in drawer = opening + cash-ins + cash payments - cash-outs.
 * (Does not account for change given, which is captured separately.)
 */
export function expectedDrawerCash(state: PosState): number {
  if (!state.registerSession) return 0;
  const session = state.registerSession;
  return (
    session.openingCash +
    session.cashInTotal +
    cashPaymentTotal(state) -
    session.cashOutTotal
  );
}

/**
 * The currently-active sale number that the cashier is ringing up.
 */
export function currentSaleNumber(state: PosState): number {
  return state.currentSaleNumber;
}

/**
 * The next sale number to assign after the current one completes.
 */
export function nextSaleNumber(state: PosState): number {
  return state.nextSaleNumber;
}

/**
 * True if the POS is in return-processing mode.
 */
export function isReturnMode(state: PosState): boolean {
  return state.returnMode;
}

/**
 * True if the POS is locked (idle timeout).
 */
export function isLocked(state: PosState): boolean {
  return state.isLocked;
}

/**
 * The currently-selected category ID (or "all").
 */
export function selectedCategory(state: PosState): string | null {
  return state.selectedCategory;
}

/**
 * The active search query string.
 */
export function searchQuery(state: PosState): string {
  return state.searchQuery;
}

/**
 * The active modal type ("none" if no modal is open).
 */
export function activeModal(state: PosState): PosState["activeModal"] {
  return state.activeModal;
}

/**
 * The currently-selected customer (or null for walk-in).
 */
export function currentCustomer(state: PosState) {
  return state.customer;
}
