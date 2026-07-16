// src/lib/pos/__tests__/reducer.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { posReducer } from "@/lib/pos/reducer";
import {
  initialState,
  type CartItem,
  type CompletedOrder,
  type Customer,
  type ParkedOrder,
  type PosAction,
  type PosState,
  type Product,
} from "@/lib/pos/types";

// Mock crypto.randomUUID so we get predictable IDs in tests
const mockUuid = "test-uuid-001";
vi.stubGlobal("crypto", {
  randomUUID: () => mockUuid,
});

// ─── Test fixtures ───────────────────────────────────────────────────────

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    name: "Test Product",
    price: 100,
    stock: 50,
    sku: "SKU-001",
    categoryId: "cat-1",
    categoryName: "Test Category",
    categoryColor: "border-slate-500",
    hasVariants: false,
    minStockLevel: 10,
    ...overrides,
  };
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: "cart-1",
    productId: "prod-1",
    name: "Test Product",
    unitPrice: 100,
    quantity: 1,
    isReturn: false,
    isZeroed: false,
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    name: "Test Customer",
    phone: "0300-1234567",
    balance: 0,
    creditLimit: 5000,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("posReducer", () => {
  let state: PosState;

  beforeEach(() => {
    state = { ...initialState };
  });

  describe("ADD_TO_CART", () => {
    it("adds a new product to the cart", () => {
      const product = makeProduct();
      const newState = posReducer(state, {
        type: "ADD_TO_CART",
        payload: { product },
      });
      expect(newState.cart).toHaveLength(1);
      expect(newState.cart[0].productId).toBe("prod-1");
      expect(newState.cart[0].quantity).toBe(1);
      expect(newState.cart[0].unitPrice).toBe(100);
    });

    it("increments quantity if the same product is added again", () => {
      state.cart = [makeCartItem({ quantity: 2 })];
      const product = makeProduct();
      const newState = posReducer(state, {
        type: "ADD_TO_CART",
        payload: { product },
      });
      expect(newState.cart).toHaveLength(1);
      expect(newState.cart[0].quantity).toBe(3);
    });

    it("activates the keypad in qty mode", () => {
      const product = makeProduct();
      const newState = posReducer(state, {
        type: "ADD_TO_CART",
        payload: { product },
      });
      expect(newState.showKeypad).toBe(true);
      expect(newState.keypadMode).toBe("qty");
    });

    it("uses variant price if variant is provided", () => {
      const product = makeProduct({ hasVariants: true });
      const newState = posReducer(state, {
        type: "ADD_TO_CART",
        payload: {
          product,
          variant: {
            id: "var-1",
            name: "Large",
            price: 150,
            stock: 10,
            sku: "SKU-L",
          },
        },
      });
      expect(newState.cart[0].unitPrice).toBe(150);
      expect(newState.cart[0].variantId).toBe("var-1");
      expect(newState.cart[0].variantName).toBe("Large");
    });

    it("does not merge with return items", () => {
      state.cart = [makeCartItem({ isReturn: true, quantity: 2 })];
      const product = makeProduct();
      const newState = posReducer(state, {
        type: "ADD_TO_CART",
        payload: { product },
      });
      expect(newState.cart).toHaveLength(2);
    });
  });

  describe("SELECT_CART_ITEM", () => {
    it("selects a cart item and activates keypad", () => {
      state.cart = [makeCartItem({ id: "item-1" })];
      const newState = posReducer(state, {
        type: "SELECT_CART_ITEM",
        payload: "item-1",
      });
      expect(newState.selectedItemId).toBe("item-1");
      expect(newState.showKeypad).toBe(true);
    });

    it("deselects when the same item is clicked again", () => {
      state.cart = [makeCartItem({ id: "item-1" })];
      state.selectedItemId = "item-1";
      const newState = posReducer(state, {
        type: "SELECT_CART_ITEM",
        payload: "item-1",
      });
      expect(newState.selectedItemId).toBe(null);
      expect(newState.showKeypad).toBe(false);
    });

    it("deselects when payload is null", () => {
      state.selectedItemId = "item-1";
      const newState = posReducer(state, {
        type: "SELECT_CART_ITEM",
        payload: null,
      });
      expect(newState.selectedItemId).toBe(null);
    });
  });

  describe("REMOVE_CART_ITEM", () => {
    it("zeroes out a positive-quantity item first", () => {
      state.cart = [makeCartItem({ id: "item-1", quantity: 5 })];
      const newState = posReducer(state, {
        type: "REMOVE_CART_ITEM",
        payload: "item-1",
      });
      expect(newState.cart).toHaveLength(1);
      expect(newState.cart[0].quantity).toBe(0);
      expect(newState.cart[0].isZeroed).toBe(true);
    });

    it("removes the item entirely if already zeroed", () => {
      state.cart = [
        makeCartItem({ id: "item-1", quantity: 0, isZeroed: true }),
      ];
      const newState = posReducer(state, {
        type: "REMOVE_CART_ITEM",
        payload: "item-1",
      });
      expect(newState.cart).toHaveLength(0);
    });

    it("returns state unchanged if item doesn't exist", () => {
      const newState = posReducer(state, {
        type: "REMOVE_CART_ITEM",
        payload: "nonexistent",
      });
      expect(newState).toBe(state);
    });
  });

  describe("UPDATE_CART_ITEM_QTY", () => {
    it("updates the quantity and clears isZeroed", () => {
      state.cart = [
        makeCartItem({ id: "item-1", quantity: 0, isZeroed: true }),
      ];
      const newState = posReducer(state, {
        type: "UPDATE_CART_ITEM_QTY",
        payload: { id: "item-1", quantity: 5 },
      });
      expect(newState.cart[0].quantity).toBe(5);
      expect(newState.cart[0].isZeroed).toBe(false);
    });
  });

  describe("UPDATE_CART_ITEM_PRICE", () => {
    it("updates the unit price", () => {
      state.cart = [makeCartItem({ id: "item-1", unitPrice: 100 })];
      const newState = posReducer(state, {
        type: "UPDATE_CART_ITEM_PRICE",
        payload: { id: "item-1", price: 150 },
      });
      expect(newState.cart[0].unitPrice).toBe(150);
    });
  });

  describe("UPDATE_CART_ITEM_NOTE", () => {
    it("updates the item note", () => {
      state.cart = [makeCartItem({ id: "item-1" })];
      const newState = posReducer(state, {
        type: "UPDATE_CART_ITEM_NOTE",
        payload: { id: "item-1", note: "No onions" },
      });
      expect(newState.cart[0].note).toBe("No onions");
    });
  });

  describe("TOGGLE_RETURN", () => {
    it("toggles isReturn flag", () => {
      state.cart = [makeCartItem({ id: "item-1", isReturn: false })];
      const newState = posReducer(state, {
        type: "TOGGLE_RETURN",
        payload: "item-1",
      });
      expect(newState.cart[0].isReturn).toBe(true);
    });
  });

  describe("SET_CUSTOMER", () => {
    it("sets the customer", () => {
      const customer = makeCustomer();
      const newState = posReducer(state, {
        type: "SET_CUSTOMER",
        payload: customer,
      });
      expect(newState.customer).toEqual(customer);
    });

    it("clears the customer when payload is null", () => {
      state.customer = makeCustomer();
      const newState = posReducer(state, {
        type: "SET_CUSTOMER",
        payload: null,
      });
      expect(newState.customer).toBe(null);
    });
  });

  describe("SET_NOTE", () => {
    it("sets the internal note", () => {
      const newState = posReducer(state, {
        type: "SET_NOTE",
        payload: "Customer is in a hurry",
      });
      expect(newState.internalNote).toBe("Customer is in a hurry");
    });
  });

  describe("SET_SEARCH", () => {
    it("sets search query and resets category to all", () => {
      state.selectedCategory = "cat-1";
      const newState = posReducer(state, {
        type: "SET_SEARCH",
        payload: "apple",
      });
      expect(newState.searchQuery).toBe("apple");
      expect(newState.selectedCategory).toBe("all");
    });
  });

  describe("SET_CATEGORY", () => {
    it("sets category and clears search query", () => {
      state.searchQuery = "apple";
      const newState = posReducer(state, {
        type: "SET_CATEGORY",
        payload: "cat-1",
      });
      expect(newState.selectedCategory).toBe("cat-1");
      expect(newState.searchQuery).toBe("");
    });
  });

  describe("OPEN_PAYMENT", () => {
    it("activates payment screen and clears payment state", () => {
      state.paymentLines = [{ id: "p1", method: "cash", amount: 50 }];
      const newState = posReducer(state, { type: "OPEN_PAYMENT" });
      expect(newState.isPaymentScreen).toBe(true);
      expect(newState.paymentLines).toEqual([]);
    });

    it("preserves payment lines in return mode", () => {
      state.returnMode = true;
      state.paymentLines = [{ id: "p1", method: "cash", amount: -50 }];
      const newState = posReducer(state, { type: "OPEN_PAYMENT" });
      expect(newState.paymentLines).toHaveLength(1);
    });
  });

  describe("CLOSE_PAYMENT", () => {
    it("deactivates payment screen", () => {
      state.isPaymentScreen = true;
      const newState = posReducer(state, { type: "CLOSE_PAYMENT" });
      expect(newState.isPaymentScreen).toBe(false);
    });
  });

  describe("OPEN_MODAL", () => {
    it("opens a modal with optional productId", () => {
      const newState = posReducer(state, {
        type: "OPEN_MODAL",
        payload: { modal: "customer", productId: "prod-1" },
      });
      expect(newState.activeModal).toBe("customer");
      expect(newState.modalProductId).toBe("prod-1");
    });
  });

  describe("CLOSE_MODAL", () => {
    it("closes the modal", () => {
      state.activeModal = "customer";
      state.modalProductId = "prod-1";
      const newState = posReducer(state, { type: "CLOSE_MODAL" });
      expect(newState.activeModal).toBe("none");
      expect(newState.modalProductId).toBe(null);
    });
  });

  describe("LOCK / UNLOCK", () => {
    it("locks the POS", () => {
      const newState = posReducer(state, { type: "LOCK" });
      expect(newState.isLocked).toBe(true);
    });

    it("unlocks the POS", () => {
      state.isLocked = true;
      const newState = posReducer(state, { type: "UNLOCK" });
      expect(newState.isLocked).toBe(false);
    });
  });

  describe("HOLD_ORDER", () => {
    it("parks the current cart as a new order", () => {
      state.cart = [makeCartItem({ quantity: 2 })];
      state.customer = makeCustomer();
      state.internalNote = "Test note";
      state.currentSaleNumber = 5;
      state.nextSaleNumber = 6;

      const newState = posReducer(state, { type: "HOLD_ORDER" });

      expect(newState.parkedOrders).toHaveLength(1);
      expect(newState.parkedOrders[0].saleNumber).toBe(5);
      expect(newState.parkedOrders[0].items).toHaveLength(1);
      expect(newState.cart).toEqual([]);
      expect(newState.customer).toBe(null);
      expect(newState.currentSaleNumber).toBe(6);
      expect(newState.nextSaleNumber).toBe(7);
    });

    it("does nothing if cart is empty", () => {
      const newState = posReducer(state, { type: "HOLD_ORDER" });
      expect(newState.parkedOrders).toHaveLength(0);
    });
  });

  describe("RESUME_ORDER", () => {
    it("resumes a parked order", () => {
      const parkedOrder: ParkedOrder = {
        id: "parked-1",
        saleNumber: 3,
        items: [makeCartItem({ id: "parked-item", name: "Parked Item" })],
        customer: makeCustomer(),
        note: "Parked note",
        total: 200,
        createdAt: Date.now(),
      };
      state.parkedOrders = [parkedOrder];
      state.cart = [makeCartItem({ id: "current-item", name: "Current" })];
      state.currentSaleNumber = 5;

      const newState = posReducer(state, {
        type: "RESUME_ORDER",
        payload: "parked-1",
      });

      expect(newState.cart[0].id).toBe("parked-item");
      expect(newState.currentSaleNumber).toBe(3);
      expect(newState.parkedOrders).toHaveLength(1);
    });

    it("returns state unchanged if order not found", () => {
      const newState = posReducer(state, {
        type: "RESUME_ORDER",
        payload: "nonexistent",
      });
      expect(newState).toBe(state);
    });
  });

  describe("COMPLETE_SALE", () => {
    it("adds to completedOrders and resets cart", () => {
      const completedOrder: CompletedOrder = {
        id: "order-1",
        saleNumber: 1,
        items: [makeCartItem()],
        customer: null,
        note: "",
        total: 100,
        createdAt: Date.now(),
        paymentLines: [{ id: "p1", method: "cash", amount: 100 }],
        changeDue: 0,
      };
      state.currentSaleNumber = 1;

      const newState = posReducer(state, {
        type: "COMPLETE_SALE",
        payload: completedOrder,
      });

      expect(newState.completedOrders).toHaveLength(1);
      expect(newState.cart).toEqual([]);
      expect(newState.currentSaleNumber).toBe(2);
    });

    it("does not add return orders to completedOrders", () => {
      const returnOrder: CompletedOrder = {
        id: "return-1",
        saleNumber: 1,
        items: [makeCartItem({ isReturn: true })],
        customer: null,
        note: "",
        total: -100,
        createdAt: Date.now(),
        paymentLines: [],
        changeDue: 0,
      };

      const newState = posReducer(state, {
        type: "COMPLETE_SALE",
        payload: returnOrder,
      });

      expect(newState.completedOrders).toHaveLength(0);
    });
  });

  describe("CANCEL_ORDER", () => {
    it("resumes the highest-numbered parked order if any exist", () => {
      state.parkedOrders = [
        {
          id: "p1",
          saleNumber: 3,
          items: [makeCartItem({ id: "item-3" })],
          customer: null,
          note: "",
          total: 100,
          createdAt: Date.now(),
        },
        {
          id: "p2",
          saleNumber: 5,
          items: [makeCartItem({ id: "item-5" })],
          customer: null,
          note: "",
          total: 200,
          createdAt: Date.now(),
        },
      ];

      const newState = posReducer(state, { type: "CANCEL_ORDER" });

      expect(newState.cart[0].id).toBe("item-5");
      expect(newState.parkedOrders).toHaveLength(1);
    });

    it("clears the cart if no parked orders exist", () => {
      state.cart = [makeCartItem()];
      const newState = posReducer(state, { type: "CANCEL_ORDER" });
      expect(newState.cart).toEqual([]);
    });

    it("returns state unchanged if cart is empty and no parked orders", () => {
      const newState = posReducer(state, { type: "CANCEL_ORDER" });
      expect(newState).toBe(state);
    });
  });

  describe("NEW_SALE", () => {
    it("parks the current cart and starts fresh", () => {
      state.cart = [makeCartItem()];
      state.currentSaleNumber = 3;
      state.nextSaleNumber = 4;

      const newState = posReducer(state, { type: "NEW_SALE" });

      expect(newState.parkedOrders).toHaveLength(1);
      expect(newState.cart).toEqual([]);
      expect(newState.currentSaleNumber).toBe(4);
      expect(newState.nextSaleNumber).toBe(5);
    });
  });

  describe("OPEN_REGISTER", () => {
    it("creates a new register session", () => {
      const newState = posReducer(state, {
        type: "OPEN_REGISTER",
        payload: {
          openingCash: 5000,
          openingNote: "Good morning",
          id: "reg-1",
        },
      });

      expect(newState.registerSession).not.toBe(null);
      expect(newState.registerSession!.id).toBe("reg-1");
      expect(newState.registerSession!.openingCash).toBe(5000);
    });
  });

  describe("CLOSE_REGISTER", () => {
    it("closes the register and clears all session data", () => {
      state.registerSession = {
        id: "reg-1",
        openingCash: 5000,
        openingNote: "",
        cashInTotal: 0,
        cashOutTotal: 0,
        status: "open",
        openedAt: Date.now(),
        transactions: [],
      };
      state.cart = [makeCartItem()];

      const newState = posReducer(state, {
        type: "CLOSE_REGISTER",
        payload: { closingCash: 5100, closingNote: "All good" },
      });

      expect(newState.registerSession!.status).toBe("closed");
      expect(newState.cart).toEqual([]);
    });

    it("does nothing if no register session exists", () => {
      const newState = posReducer(state, {
        type: "CLOSE_REGISTER",
        payload: { closingCash: 0, closingNote: "" },
      });
      expect(newState).toBe(state);
    });
  });

  describe("CASH_IN_OUT", () => {
    it("adds a cash-in transaction", () => {
      state.registerSession = {
        id: "reg-1",
        openingCash: 1000,
        openingNote: "",
        cashInTotal: 0,
        cashOutTotal: 0,
        status: "open",
        openedAt: Date.now(),
        transactions: [],
      };

      const newState = posReducer(state, {
        type: "CASH_IN_OUT",
        payload: {
          id: "tx-1",
          type: "in",
          amount: 500,
          reason: "Cash refill",
          createdAt: Date.now(),
        },
      });

      expect(newState.registerSession!.transactions).toHaveLength(1);
      expect(newState.registerSession!.cashInTotal).toBe(500);
    });

    it("does nothing if no register session exists", () => {
      const newState = posReducer(state, {
        type: "CASH_IN_OUT",
        payload: {
          id: "tx-1",
          type: "in",
          amount: 500,
          reason: "test",
          createdAt: Date.now(),
        },
      });
      expect(newState).toBe(state);
    });
  });

  describe("APPLY_KEYPAD_DIGIT", () => {
    it("updates quantity when keypad mode is qty", () => {
      state.cart = [makeCartItem({ id: "item-1", quantity: 1 })];
      state.selectedItemId = "item-1";
      state.keypadMode = "qty";
      state.keypadValue = "";
      state.keypadHasEdited = false;

      const newState = posReducer(state, {
        type: "APPLY_KEYPAD_DIGIT",
        payload: "5",
      });

      expect(newState.cart[0].quantity).toBe(5);
    });

    it("updates price when keypad mode is price", () => {
      state.cart = [makeCartItem({ id: "item-1", unitPrice: 100 })];
      state.selectedItemId = "item-1";
      state.keypadMode = "price";
      state.keypadValue = "";
      state.keypadHasEdited = false;

      const newState = posReducer(state, {
        type: "APPLY_KEYPAD_DIGIT",
        payload: "2",
      });

      expect(newState.cart[0].unitPrice).toBe(2);
    });

    it("does nothing if no item is selected", () => {
      const newState = posReducer(state, {
        type: "APPLY_KEYPAD_DIGIT",
        payload: "5",
      });
      expect(newState).toBe(state);
    });
  });

  describe("ADD_PAYMENT_LINE", () => {
    it("adds a new payment line", () => {
      const newState = posReducer(state, {
        type: "ADD_PAYMENT_LINE",
        payload: { method: "cash", amount: 100 },
      });

      expect(newState.paymentLines).toHaveLength(1);
      expect(newState.paymentLines[0].amount).toBe(100);
    });

    it("replaces existing line if replace is true", () => {
      state.paymentLines = [{ id: "p1", method: "cash", amount: 50 }];
      const newState = posReducer(state, {
        type: "ADD_PAYMENT_LINE",
        payload: { method: "cash", amount: 100, replace: true },
      });

      expect(newState.paymentLines).toHaveLength(1);
      expect(newState.paymentLines[0].amount).toBe(100);
    });

    it("adds to existing line if replace is false", () => {
      state.paymentLines = [{ id: "p1", method: "cash", amount: 50 }];
      const newState = posReducer(state, {
        type: "ADD_PAYMENT_LINE",
        payload: { method: "cash", amount: 30 },
      });

      expect(newState.paymentLines[0].amount).toBe(80);
    });
  });

  describe("REMOVE_PAYMENT_LINE", () => {
    it("removes a payment line by id", () => {
      state.paymentLines = [
        { id: "p1", method: "cash", amount: 100 },
        { id: "p2", method: "card", amount: 50 },
      ];

      const newState = posReducer(state, {
        type: "REMOVE_PAYMENT_LINE",
        payload: "p1",
      });

      expect(newState.paymentLines).toHaveLength(1);
      expect(newState.paymentLines[0].id).toBe("p2");
    });
  });

  describe("ENTER_RETURN_MODE", () => {
    it("activates return mode and clears payment lines (issue 10 fix)", () => {
      const newState = posReducer(state, {
        type: "ENTER_RETURN_MODE",
        payload: {
          saleId: "sale-1",
          saleNumber: "SALE-001",
          customerId: "cust-1",
          originalPaymentLines: [
            { method: "cash", amount: 100 },
            { method: "khata", amount: 50 },
          ],
        },
      });

      expect(newState.returnMode).toBe(true);
      expect(newState.originalSale).toEqual({
        id: "sale-1",
        saleNumber: "SALE-001",
        customerId: "cust-1",
      });
      // FIX (issue 10): payment lines are NOT pre-filled anymore
      expect(newState.paymentLines).toEqual([]);
      expect(newState.cart).toEqual([]);
      expect(newState.isPaymentScreen).toBe(false);
    });

    it("clears the cart on entering return mode", () => {
      state.cart = [makeCartItem()];
      const newState = posReducer(state, {
        type: "ENTER_RETURN_MODE",
        payload: { saleId: "s1", saleNumber: "S1" },
      });

      expect(newState.cart).toEqual([]);
    });
  });

  describe("EXIT_RETURN_MODE", () => {
    it("exits return mode and clears all state", () => {
      state.returnMode = true;
      state.originalSale = { id: "s1", saleNumber: "S1" };
      state.cart = [makeCartItem({ isReturn: true })];

      const newState = posReducer(state, { type: "EXIT_RETURN_MODE" });

      expect(newState.returnMode).toBe(false);
      expect(newState.cart).toEqual([]);
    });
  });

  describe("default", () => {
    it("returns state unchanged for unknown action types", () => {
      const unknownAction = {
        type: "UNKNOWN_ACTION",
      } as unknown as PosAction;
      const newState = posReducer(state, unknownAction);
      expect(newState).toBe(state);
    });
  });

  // ─── Additional coverage for idempotency-key lifecycle (C-13/H-4) ────────

  describe("currentSaleId lifecycle (C-13/H-4 fix)", () => {
    it("OPEN_PAYMENT sets currentSaleId when none exists", () => {
      expect(state.currentSaleId).toBeNull();
      const newState = posReducer(state, { type: "OPEN_PAYMENT" });
      expect(newState.currentSaleId).not.toBeNull();
      expect(newState.currentSaleId).toBe(mockUuid);
    });

    it("OPEN_PAYMENT preserves an existing currentSaleId", () => {
      state.currentSaleId = "existing-id";
      const newState = posReducer(state, { type: "OPEN_PAYMENT" });
      expect(newState.currentSaleId).toBe("existing-id");
    });

    it("COMPLETE_SALE clears currentSaleId", () => {
      state.currentSaleId = "sale-id-1";
      const completedOrder: CompletedOrder = {
        id: "order-1",
        saleNumber: 1,
        items: [makeCartItem()],
        customer: null,
        note: "",
        total: 100,
        createdAt: Date.now(),
        paymentLines: [],
        changeDue: 0,
      };
      const newState = posReducer(state, {
        type: "COMPLETE_SALE",
        payload: completedOrder,
      });
      expect(newState.currentSaleId).toBeNull();
    });

    it("CANCEL_ORDER clears currentSaleId when cart has items", () => {
      state.currentSaleId = "sale-id-1";
      state.cart = [makeCartItem()];
      const newState = posReducer(state, { type: "CANCEL_ORDER" });
      expect(newState.currentSaleId).toBeNull();
    });

    it("CANCEL_ORDER clears currentSaleId when resuming parked order", () => {
      state.currentSaleId = "sale-id-1";
      state.parkedOrders = [
        {
          id: "p1",
          saleNumber: 3,
          items: [makeCartItem({ id: "item-3" })],
          customer: null,
          note: "",
          total: 100,
          createdAt: Date.now(),
        },
      ];
      const newState = posReducer(state, { type: "CANCEL_ORDER" });
      expect(newState.currentSaleId).toBeNull();
    });

    it("CLOSE_PAYMENT keeps currentSaleId (for retry on re-open)", () => {
      state.currentSaleId = "sale-id-1";
      state.isPaymentScreen = true;
      const newState = posReducer(state, { type: "CLOSE_PAYMENT" });
      expect(newState.currentSaleId).toBe("sale-id-1");
    });
  });

  // ─── UPDATE_CART_ITEM_QTY edge case ────────────────────────────────────

  describe("UPDATE_CART_ITEM_QTY edge cases", () => {
    it("sets quantity to 0 (does not auto-remove the line)", () => {
      state.cart = [makeCartItem({ id: "item-1", quantity: 5 })];
      const newState = posReducer(state, {
        type: "UPDATE_CART_ITEM_QTY",
        payload: { id: "item-1", quantity: 0 },
      });
      expect(newState.cart).toHaveLength(1);
      expect(newState.cart[0].quantity).toBe(0);
      expect(newState.cart[0].isZeroed).toBe(false);
    });

    it("clears isZeroed when setting a positive qty", () => {
      state.cart = [
        makeCartItem({ id: "item-1", quantity: 0, isZeroed: true }),
      ];
      const newState = posReducer(state, {
        type: "UPDATE_CART_ITEM_QTY",
        payload: { id: "item-1", quantity: 5 },
      });
      expect(newState.cart[0].quantity).toBe(5);
      expect(newState.cart[0].isZeroed).toBe(false);
    });

    it("leaves other cart items unchanged", () => {
      state.cart = [
        makeCartItem({ id: "item-1", quantity: 5 }),
        makeCartItem({ id: "item-2", quantity: 3 }),
      ];
      const newState = posReducer(state, {
        type: "UPDATE_CART_ITEM_QTY",
        payload: { id: "item-1", quantity: 10 },
      });
      expect(newState.cart[1].quantity).toBe(3);
    });
  });

  // ─── OPEN_REGISTER resets state ────────────────────────────────────────

  describe("OPEN_REGISTER state reset", () => {
    it("resets currentSaleNumber to 1 and nextSaleNumber to 2", () => {
      state.currentSaleNumber = 99;
      state.nextSaleNumber = 100;
      const newState = posReducer(state, {
        type: "OPEN_REGISTER",
        payload: { openingCash: 1000, openingNote: "", id: "reg-1" },
      });
      expect(newState.currentSaleNumber).toBe(1);
      expect(newState.nextSaleNumber).toBe(2);
    });

    it("clears parkedOrders + completedOrders from previous session", () => {
      state.parkedOrders = [
        {
          id: "p1",
          saleNumber: 1,
          items: [],
          customer: null,
          note: "",
          total: 100,
          createdAt: Date.now(),
        },
      ];
      state.completedOrders = [];
      const newState = posReducer(state, {
        type: "OPEN_REGISTER",
        payload: { openingCash: 1000, openingNote: "", id: "reg-1" },
      });
      expect(newState.parkedOrders).toEqual([]);
      expect(newState.completedOrders).toEqual([]);
    });

    it("clears returnMode + originalSale", () => {
      state.returnMode = true;
      state.originalSale = { id: "s1", saleNumber: "S1" };
      const newState = posReducer(state, {
        type: "OPEN_REGISTER",
        payload: { openingCash: 1000, openingNote: "", id: "reg-1" },
      });
      expect(newState.returnMode).toBe(false);
      expect(newState.originalSale).toBeNull();
    });

    it("closes any active modal", () => {
      state.activeModal = "customer";
      const newState = posReducer(state, {
        type: "OPEN_REGISTER",
        payload: { openingCash: 1000, openingNote: "", id: "reg-1" },
      });
      expect(newState.activeModal).toBe("none");
    });
  });

  // ─── CLOSE_REGISTER resets sale numbers ────────────────────────────────

  describe("CLOSE_REGISTER sale-number reset", () => {
    it("resets currentSaleNumber to 1 and nextSaleNumber to 2", () => {
      state.registerSession = {
        id: "reg-1",
        openingCash: 5000,
        openingNote: "",
        cashInTotal: 0,
        cashOutTotal: 0,
        status: "open",
        openedAt: Date.now(),
        transactions: [],
      };
      state.currentSaleNumber = 42;
      state.nextSaleNumber = 43;

      const newState = posReducer(state, {
        type: "CLOSE_REGISTER",
        payload: { closingCash: 5100, closingNote: "" },
      });

      expect(newState.currentSaleNumber).toBe(1);
      expect(newState.nextSaleNumber).toBe(2);
      expect(newState.registerSession!.status).toBe("closed");
      expect(newState.registerSession!.closingCash).toBe(5100);
    });

    it("clears parkedOrders + completedOrders on close", () => {
      state.registerSession = {
        id: "reg-1",
        openingCash: 5000,
        openingNote: "",
        cashInTotal: 0,
        cashOutTotal: 0,
        status: "open",
        openedAt: Date.now(),
        transactions: [],
      };
      state.parkedOrders = [
        {
          id: "p1",
          saleNumber: 1,
          items: [],
          customer: null,
          note: "",
          total: 100,
          createdAt: Date.now(),
        },
      ];

      const newState = posReducer(state, {
        type: "CLOSE_REGISTER",
        payload: { closingCash: 5000, closingNote: "" },
      });

      expect(newState.parkedOrders).toEqual([]);
    });
  });

  // ─── CASH_IN_OUT totals update ─────────────────────────────────────────

  describe("CASH_IN_OUT totals update", () => {
    function openSession() {
      return {
        id: "reg-1",
        openingCash: 1000,
        openingNote: "",
        cashInTotal: 0,
        cashOutTotal: 0,
        status: "open" as const,
        openedAt: Date.now(),
        transactions: [],
      };
    }

    it("cash_in updates cashInTotal correctly", () => {
      state.registerSession = openSession();
      const newState = posReducer(state, {
        type: "CASH_IN_OUT",
        payload: {
          id: "tx-1",
          type: "in",
          amount: 500,
          reason: "Refill",
          createdAt: Date.now(),
        },
      });
      expect(newState.registerSession!.cashInTotal).toBe(500);
      expect(newState.registerSession!.cashOutTotal).toBe(0);
    });

    it("cash_out updates cashOutTotal correctly", () => {
      state.registerSession = openSession();
      const newState = posReducer(state, {
        type: "CASH_IN_OUT",
        payload: {
          id: "tx-1",
          type: "out",
          amount: 200,
          reason: "Petty",
          createdAt: Date.now(),
        },
      });
      expect(newState.registerSession!.cashOutTotal).toBe(200);
      expect(newState.registerSession!.cashInTotal).toBe(0);
    });

    it("multiple transactions accumulate correctly", () => {
      state.registerSession = openSession();
      let s = posReducer(state, {
        type: "CASH_IN_OUT",
        payload: {
          id: "tx-1",
          type: "in",
          amount: 500,
          reason: "x",
          createdAt: Date.now(),
        },
      });
      s = posReducer(s, {
        type: "CASH_IN_OUT",
        payload: {
          id: "tx-2",
          type: "out",
          amount: 200,
          reason: "y",
          createdAt: Date.now(),
        },
      });
      s = posReducer(s, {
        type: "CASH_IN_OUT",
        payload: {
          id: "tx-3",
          type: "in",
          amount: 300,
          reason: "z",
          createdAt: Date.now(),
        },
      });
      expect(s.registerSession!.cashInTotal).toBe(800);
      expect(s.registerSession!.cashOutTotal).toBe(200);
      expect(s.registerSession!.transactions).toHaveLength(3);
    });
  });

  // ─── HOLD_ORDER + RESUME_ORDER round-trip ──────────────────────────────

  describe("HOLD_ORDER + RESUME_ORDER round-trip", () => {
    it("holds an order then resumes it back into the cart", () => {
      state.cart = [
        makeCartItem({ id: "c1", name: "Held", quantity: 2 }),
      ];
      state.customer = makeCustomer({ id: "cust-1" });
      state.internalNote = "Note for held";
      state.currentSaleNumber = 5;
      state.nextSaleNumber = 6;

      const held = posReducer(state, { type: "HOLD_ORDER" });
      expect(held.parkedOrders).toHaveLength(1);
      expect(held.parkedOrders[0].note).toBe("Note for held");
      const orderId = held.parkedOrders[0].id;

      const resumed = posReducer(held, {
        type: "RESUME_ORDER",
        payload: orderId,
      });
      expect(resumed.cart).toHaveLength(1);
      expect(resumed.cart[0].name).toBe("Held");
      expect(resumed.customer!.id).toBe("cust-1");
      expect(resumed.internalNote).toBe("Note for held");
      expect(resumed.parkedOrders).toHaveLength(0);
    });

    it("RESUME_ORDER parks the current cart if non-empty (swap)", () => {
      state.cart = [makeCartItem({ id: "current" })];
      state.currentSaleNumber = 5;
      state.parkedOrders = [
        {
          id: "parked-1",
          saleNumber: 3,
          items: [makeCartItem({ id: "parked-item" })],
          customer: null,
          note: "",
          total: 100,
          createdAt: Date.now(),
        },
      ];

      const newState = posReducer(state, {
        type: "RESUME_ORDER",
        payload: "parked-1",
      });

      // The current cart should have been parked, and the parked order
      // resumed into the cart.
      expect(newState.cart[0].id).toBe("parked-item");
      // The current cart's items are now in parkedOrders.
      expect(newState.parkedOrders).toHaveLength(1);
      expect(newState.parkedOrders[0].items[0].id).toBe("current");
    });
  });

  // ─── ADD_PAYMENT_LINE replace vs accumulate ────────────────────────────

  describe("ADD_PAYMENT_LINE replace vs accumulate", () => {
    it("replace: true overwrites the existing line amount", () => {
      state.paymentLines = [{ id: "p1", method: "cash", amount: 50 }];
      const newState = posReducer(state, {
        type: "ADD_PAYMENT_LINE",
        payload: { method: "cash", amount: 200, replace: true },
      });
      expect(newState.paymentLines).toHaveLength(1);
      expect(newState.paymentLines[0].amount).toBe(200);
    });

    it("replace: false (default) accumulates the amount", () => {
      state.paymentLines = [{ id: "p1", method: "cash", amount: 50 }];
      const newState = posReducer(state, {
        type: "ADD_PAYMENT_LINE",
        payload: { method: "cash", amount: 30 },
      });
      expect(newState.paymentLines).toHaveLength(1);
      expect(newState.paymentLines[0].amount).toBe(80);
    });

    it("adds a new line for a different method", () => {
      state.paymentLines = [{ id: "p1", method: "cash", amount: 50 }];
      const newState = posReducer(state, {
        type: "ADD_PAYMENT_LINE",
        payload: { method: "card", amount: 100 },
      });
      expect(newState.paymentLines).toHaveLength(2);
    });

    it("clears paymentBuffer + activePaymentMethod after adding", () => {
      state.paymentBuffer = "100";
      state.activePaymentMethod = "cash";
      const newState = posReducer(state, {
        type: "ADD_PAYMENT_LINE",
        payload: { method: "cash", amount: 100 },
      });
      expect(newState.paymentBuffer).toBe("");
      expect(newState.activePaymentMethod).toBeNull();
    });
  });

  // ─── ENTER_RETURN_MODE / EXIT_RETURN_MODE ──────────────────────────────

  describe("ENTER_RETURN_MODE / EXIT_RETURN_MODE", () => {
    it("ENTER_RETURN_MODE stores the original sale details", () => {
      const newState = posReducer(state, {
        type: "ENTER_RETURN_MODE",
        payload: {
          saleId: "sale-1",
          saleNumber: "SALE-001",
          customerId: "cust-1",
        },
      });
      expect(newState.originalSale).toEqual({
        id: "sale-1",
        saleNumber: "SALE-001",
        customerId: "cust-1",
      });
      expect(newState.returnMode).toBe(true);
    });

    it("ENTER_RETURN_MODE ignores originalPaymentLines (issue 10 fix)", () => {
      const newState = posReducer(state, {
        type: "ENTER_RETURN_MODE",
        payload: {
          saleId: "sale-1",
          saleNumber: "SALE-001",
          originalPaymentLines: [
            { method: "cash", amount: 100 },
            { method: "khata", amount: 50 },
          ],
        },
      });
      expect(newState.paymentLines).toEqual([]);
    });

    it("EXIT_RETURN_MODE clears originalSale + cart", () => {
      state.returnMode = true;
      state.originalSale = { id: "s1", saleNumber: "S1" };
      state.cart = [makeCartItem({ isReturn: true })];
      state.paymentLines = [{ id: "p1", method: "cash", amount: -100 }];

      const newState = posReducer(state, { type: "EXIT_RETURN_MODE" });

      expect(newState.returnMode).toBe(false);
      expect(newState.originalSale).toBeNull();
      expect(newState.cart).toEqual([]);
      expect(newState.paymentLines).toEqual([]);
    });
  });

  // ─── SET_TAB / TOGGLE_KEYPAD / SET_KEYPAD_MODE ─────────────────────────

  describe("SET_TAB", () => {
    it("switches the active tab", () => {
      const newState = posReducer(state, {
        type: "SET_TAB",
        payload: "orders",
      });
      expect(newState.activeTab).toBe("orders");
    });
  });

  describe("TOGGLE_KEYPAD", () => {
    it("sets the showKeypad flag", () => {
      const newState = posReducer(state, {
        type: "TOGGLE_KEYPAD",
        payload: true,
      });
      expect(newState.showKeypad).toBe(true);
    });
  });

  // ─── EDIT_PAYMENT_LINE / SET_PAYMENT_BUFFER / CLEAR_PAYMENT_BUFFER ─────

  describe("EDIT_PAYMENT_LINE", () => {
    it("updates the amount of an existing payment line", () => {
      state.paymentLines = [
        { id: "p1", method: "cash", amount: 100 },
        { id: "p2", method: "card", amount: 50 },
      ];
      const newState = posReducer(state, {
        type: "EDIT_PAYMENT_LINE",
        payload: { id: "p1", amount: 250 },
      });
      expect(newState.paymentLines[0].amount).toBe(250);
      expect(newState.paymentLines[1].amount).toBe(50);
    });
  });

  describe("SET_PAYMENT_BUFFER / CLEAR_PAYMENT_BUFFER", () => {
    it("sets the payment buffer", () => {
      const newState = posReducer(state, {
        type: "SET_PAYMENT_BUFFER",
        payload: "500",
      });
      expect(newState.paymentBuffer).toBe("500");
    });

    it("clears the payment buffer", () => {
      state.paymentBuffer = "500";
      const newState = posReducer(state, { type: "CLEAR_PAYMENT_BUFFER" });
      expect(newState.paymentBuffer).toBe("");
    });
  });

  describe("SET_ACTIVE_PAYMENT_METHOD", () => {
    it("sets the active payment method", () => {
      const newState = posReducer(state, {
        type: "SET_ACTIVE_PAYMENT_METHOD",
        payload: "card",
      });
      expect(newState.activePaymentMethod).toBe("card");
    });
  });

  // ─── KEYPAD_BACKSPACE / KEYPAD_ENTER ───────────────────────────────────

  describe("KEYPAD_BACKSPACE", () => {
    it("zeroes out a positive-qty item first (like REMOVE_CART_ITEM)", () => {
      state.cart = [makeCartItem({ id: "i1", quantity: 5 })];
      state.selectedItemId = "i1";
      const newState = posReducer(state, { type: "KEYPAD_BACKSPACE" });
      expect(newState.cart[0].quantity).toBe(0);
      expect(newState.cart[0].isZeroed).toBe(true);
    });

    it("removes an already-zeroed item", () => {
      state.cart = [
        makeCartItem({ id: "i1", quantity: 0, isZeroed: true }),
      ];
      state.selectedItemId = "i1";
      const newState = posReducer(state, { type: "KEYPAD_BACKSPACE" });
      expect(newState.cart).toHaveLength(0);
    });

    it("does nothing if no item is selected", () => {
      const newState = posReducer(state, { type: "KEYPAD_BACKSPACE" });
      expect(newState).toBe(state);
    });
  });

  describe("KEYPAD_ENTER", () => {
    it("advances to the next cart item", () => {
      state.cart = [
        makeCartItem({ id: "i1" }),
        makeCartItem({ id: "i2" }),
      ];
      state.selectedItemId = "i1";
      const newState = posReducer(state, { type: "KEYPAD_ENTER" });
      expect(newState.selectedItemId).toBe("i2");
    });

    it("clears selection when at the last item", () => {
      state.cart = [makeCartItem({ id: "i1" })];
      state.selectedItemId = "i1";
      const newState = posReducer(state, { type: "KEYPAD_ENTER" });
      expect(newState.selectedItemId).toBeNull();
      expect(newState.showKeypad).toBe(false);
    });

    it("does nothing if no item is selected", () => {
      const newState = posReducer(state, { type: "KEYPAD_ENTER" });
      expect(newState).toBe(state);
    });
  });

  // ─── SET_KEYPAD_MODE ──────────────────────────────────────────────────

  describe("SET_KEYPAD_MODE", () => {
    it("sets qty mode and shows the current quantity", () => {
      state.cart = [makeCartItem({ id: "i1", quantity: 5 })];
      state.selectedItemId = "i1";
      const newState = posReducer(state, {
        type: "SET_KEYPAD_MODE",
        payload: "qty",
      });
      expect(newState.keypadMode).toBe("qty");
      expect(newState.keypadValue).toBe("5");
    });

    it("sets price mode and shows the current unitPrice", () => {
      state.cart = [makeCartItem({ id: "i1", unitPrice: 99.5 })];
      state.selectedItemId = "i1";
      const newState = posReducer(state, {
        type: "SET_KEYPAD_MODE",
        payload: "price",
      });
      expect(newState.keypadMode).toBe("price");
      expect(newState.keypadValue).toBe("99.5");
    });

    it("clears keypadValue when mode is null", () => {
      state.cart = [makeCartItem({ id: "i1" })];
      state.selectedItemId = "i1";
      const newState = posReducer(state, {
        type: "SET_KEYPAD_MODE",
        payload: null,
      });
      expect(newState.keypadValue).toBe("0");
    });

    it("does nothing if no item is selected", () => {
      const newState = posReducer(state, {
        type: "SET_KEYPAD_MODE",
        payload: "qty",
      });
      expect(newState).toBe(state);
    });
  });

  // ─── LOAD_REFUND_CART ─────────────────────────────────────────────────

  describe("LOAD_REFUND_CART", () => {
    it("loads refund items into the cart", () => {
      const refundItems = [
        makeCartItem({
          id: "r1",
          name: "Refunded",
          isReturn: true,
          quantity: 1,
        }),
      ];
      const newState = posReducer(state, {
        type: "LOAD_REFUND_CART",
        payload: refundItems,
      });
      expect(newState.cart).toHaveLength(1);
      expect(newState.cart[0].id).toBe("r1");
      expect(newState.cart[0].isReturn).toBe(true);
    });

    it("clears the internal note when loading a refund cart", () => {
      state.internalNote = "Old note";
      const newState = posReducer(state, {
        type: "LOAD_REFUND_CART",
        payload: [makeCartItem({ isReturn: true })],
      });
      expect(newState.internalNote).toBe("");
    });
  });
});
