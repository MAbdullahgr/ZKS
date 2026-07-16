// src/lib/pos/__tests__/persistence.test.ts
//
// Unit tests for the POS persistence layer (localStorage load/save/clear).

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadPosState,
  savePosState,
  clearPosState,
  setCurrentPosUserId,
  clearAllPosSessions,
  hasSavedSession,
} from "@/lib/pos/persistence";
import { initialState } from "@/lib/pos/types";
import type { PosState, CartItem, RegisterSession } from "@/lib/pos/types";

// ─── Mock localStorage ───────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] ?? null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
})();

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", { localStorage: localStorageMock });

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeCart(): CartItem[] {
  return [
    {
      id: "c1",
      productId: "p1",
      name: "Apple",
      unitPrice: 50,
      quantity: 2,
      isReturn: false,
      isZeroed: false,
    },
  ];
}

function makeOpenSession(): RegisterSession {
  return {
    id: "reg-1",
    openingCash: 5000,
    openingNote: "Morning",
    cashInTotal: 0,
    cashOutTotal: 0,
    status: "open",
    openedAt: Date.now(),
    transactions: [],
  };
}

function makeState(overrides: Partial<PosState> = {}): PosState {
  return { ...initialState, ...overrides };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("persistence", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe("loadPosState", () => {
    it("returns initialState when nothing is saved", () => {
      const state = loadPosState();
      expect(state).toEqual(initialState);
    });

    it("returns initialState when saved data is corrupted JSON", () => {
      localStorageMock.setItem("pos_session", "{invalid json}");
      const state = loadPosState();
      expect(state).toEqual(initialState);
    });

    it("loads saved cart", () => {
      const cart = makeCart();
      savePosState(makeState({ cart }));
      const state = loadPosState();
      expect(state.cart).toEqual(cart);
    });

    it("loads saved customer", () => {
      const customer = {
        id: "cust-1",
        name: "Test",
        phone: "0300",
        balance: 500,
        creditLimit: 5000,
      };
      savePosState(makeState({ customer }));
      const state = loadPosState();
      expect(state.customer).toEqual(customer);
    });

    it("loads saved register session when open", () => {
      const session = makeOpenSession();
      savePosState(makeState({ registerSession: session }));
      const state = loadPosState();
      expect(state.registerSession).toEqual(session);
    });

    it("does NOT load register session when closed", () => {
      const session: RegisterSession = {
        ...makeOpenSession(),
        status: "closed",
        closedAt: Date.now(),
        closingCash: 5100,
      };
      savePosState(makeState({ registerSession: session }));
      const state = loadPosState();
      expect(state.registerSession).toBe(null);
    });

    it("does NOT load completed orders when register is closed", () => {
      savePosState(
        makeState({
          registerSession: { ...makeOpenSession(), status: "closed" },
          completedOrders: [
            {
              id: "o1",
              saleNumber: 1,
              items: [],
              customer: null,
              note: "",
              total: 100,
              createdAt: Date.now(),
              paymentLines: [],
              changeDue: 0,
            },
          ],
        }),
      );
      const state = loadPosState();
      expect(state.completedOrders).toEqual([]);
    });

    it("loads completed orders when register is open", () => {
      const order = {
        id: "o1",
        saleNumber: 1,
        items: [],
        customer: null,
        note: "",
        total: 100,
        createdAt: Date.now(),
        paymentLines: [],
        changeDue: 0,
      };
      savePosState(
        makeState({
          registerSession: makeOpenSession(),
          completedOrders: [order],
        }),
      );
      const state = loadPosState();
      expect(state.completedOrders).toHaveLength(1);
    });

    it("deduplicates completed orders by ID (legacy bug fix)", () => {
      const order = {
        id: "o1",
        saleNumber: 1,
        items: [],
        customer: null,
        note: "",
        total: 100,
        createdAt: Date.now(),
        paymentLines: [],
        changeDue: 0,
      };
      const toSave = {
        version: 2,
        cart: [],
        currentSaleNumber: 2,
        nextSaleNumber: 3,
        parkedOrders: [],
        completedOrders: [order, order, order],
        registerSession: makeOpenSession(),
        customer: null,
        internalNote: "",
        isPaymentScreen: false,
        paymentLines: [],
        paymentBuffer: "",
        activePaymentMethod: null,
        returnMode: false,
        originalSale: null,
      };
      localStorageMock.setItem("pos_session", JSON.stringify(toSave));
      const state = loadPosState();
      expect(state.completedOrders).toHaveLength(1);
    });

    it("fixes negative unit prices in completed orders (legacy bug fix)", () => {
      const order = {
        id: "o1",
        saleNumber: 1,
        items: [
          {
            id: "i1",
            productId: "p1",
            name: "Test",
            unitPrice: -100,
            quantity: 2,
            isReturn: false,
            isZeroed: false,
          },
        ],
        customer: null,
        note: "",
        total: 100,
        createdAt: Date.now(),
        paymentLines: [],
        changeDue: 0,
      };
      savePosState(
        makeState({
          registerSession: makeOpenSession(),
          completedOrders: [order],
        }),
      );
      const state = loadPosState();
      expect(state.completedOrders[0].items[0].unitPrice).toBe(100);
    });

    it("handles completed orders with missing items array (defensive fix)", () => {
      const toSave = {
        version: 2,
        cart: [],
        currentSaleNumber: 1,
        nextSaleNumber: 2,
        parkedOrders: [],
        completedOrders: [{ id: "o1", saleNumber: 1 }], // no items field
        registerSession: makeOpenSession(),
        customer: null,
        internalNote: "",
        isPaymentScreen: false,
        paymentLines: [],
        paymentBuffer: "",
        activePaymentMethod: null,
        returnMode: false,
        originalSale: null,
      };
      localStorageMock.setItem("pos_session", JSON.stringify(toSave));
      const state = loadPosState();
      expect(state.completedOrders).toHaveLength(1);
      expect(state.completedOrders[0].items).toEqual([]);
    });

    it("computes nextSaleNumber from max of all sale numbers (v1 fallback)", () => {
      const v1Data = {
        version: 1,
        cart: [],
        currentSaleNumber: 3,
        parkedOrders: [{ saleNumber: 5 }],
        completedOrders: [{ saleNumber: 7, items: [] }],
        registerSession: makeOpenSession(),
      };
      localStorageMock.setItem("pos_session", JSON.stringify(v1Data));
      const state = loadPosState();
      expect(state.nextSaleNumber).toBe(8);
    });

    it("uses saved nextSaleNumber for v2 format", () => {
      const v2Data = {
        version: 2,
        cart: [],
        currentSaleNumber: 5,
        nextSaleNumber: 6,
        parkedOrders: [],
        completedOrders: [],
        registerSession: makeOpenSession(),
      };
      localStorageMock.setItem("pos_session", JSON.stringify(v2Data));
      const state = loadPosState();
      expect(state.currentSaleNumber).toBe(5);
      expect(state.nextSaleNumber).toBe(6);
    });

    it("loads saved payment state", () => {
      const paymentLines = [{ id: "p1", method: "cash" as const, amount: 100 }];
      savePosState(
        makeState({
          paymentLines,
          paymentBuffer: "50",
          activePaymentMethod: "cash",
          isPaymentScreen: true,
        }),
      );
      const state = loadPosState();
      expect(state.paymentLines).toEqual(paymentLines);
      expect(state.paymentBuffer).toBe("50");
      expect(state.activePaymentMethod).toBe("cash");
      expect(state.isPaymentScreen).toBe(true);
    });

    it("loads saved return mode state", () => {
      const originalSale = { id: "s1", saleNumber: "SALE-001" };
      savePosState(
        makeState({
          returnMode: true,
          originalSale,
        }),
      );
      const state = loadPosState();
      expect(state.returnMode).toBe(true);
      expect(state.originalSale).toEqual(originalSale);
    });
  });

  describe("savePosState", () => {
    it("saves state as JSON with version 2", () => {
      savePosState(makeState({ cart: makeCart() }));
      const raw = localStorageMock.getItem("pos_session");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.version).toBe(2);
    });

    it("saves cart", () => {
      const cart = makeCart();
      savePosState(makeState({ cart }));
      const raw = localStorageMock.getItem("pos_session");
      const parsed = JSON.parse(raw!);
      expect(parsed.cart).toEqual(cart);
    });

    it("does NOT save completed orders when register is closed", () => {
      savePosState(
        makeState({
          registerSession: { ...makeOpenSession(), status: "closed" },
          completedOrders: [
            {
              id: "o1",
              saleNumber: 1,
              items: [],
              customer: null,
              note: "",
              total: 100,
              createdAt: Date.now(),
              paymentLines: [],
              changeDue: 0,
            },
          ],
        }),
      );
      const raw = localStorageMock.getItem("pos_session");
      const parsed = JSON.parse(raw!);
      expect(parsed.completedOrders).toEqual([]);
    });

    it("saves completed orders when register is open", () => {
      const order = {
        id: "o1",
        saleNumber: 1,
        items: [],
        customer: null,
        note: "",
        total: 100,
        createdAt: Date.now(),
        paymentLines: [],
        changeDue: 0,
      };
      savePosState(
        makeState({
          registerSession: makeOpenSession(),
          completedOrders: [order],
        }),
      );
      const raw = localStorageMock.getItem("pos_session");
      const parsed = JSON.parse(raw!);
      expect(parsed.completedOrders).toHaveLength(1);
    });
  });

  describe("clearPosState", () => {
    it("removes the pos_session key from localStorage", () => {
      savePosState(makeState({ cart: makeCart() }));
      expect(localStorageMock.getItem("pos_session")).not.toBeNull();

      clearPosState();
      expect(localStorageMock.getItem("pos_session")).toBeNull();
    });

    it("does not throw when nothing is saved", () => {
      expect(() => clearPosState()).not.toThrow();
    });
  });
});

// ─── Additional persistence coverage ─────────────────────────────────────

describe("persistence — userId-scoped storage (C-13/H-4 fix)", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("setCurrentPosUserId writes pos_current_user_id to localStorage", () => {
    setCurrentPosUserId("user-42");
    expect(localStorageMock.getItem("pos_current_user_id")).toBe("user-42");
  });

  it("setCurrentPosUserId(null) removes pos_current_user_id", () => {
    localStorageMock.setItem("pos_current_user_id", "user-42");
    setCurrentPosUserId(null);
    expect(localStorageMock.getItem("pos_current_user_id")).toBeNull();
  });

  it("saves to a userId-scoped key when userId is set", () => {
    setCurrentPosUserId("user-42");
    savePosState(makeState({ cart: makeCart() }));

    // The default key should NOT have data
    expect(localStorageMock.getItem("pos_session")).toBeNull();
    // The scoped key should have data
    expect(localStorageMock.getItem("pos_session_user-42")).not.toBeNull();
  });

  it("loads from the userId-scoped key when userId is set", () => {
    setCurrentPosUserId("user-42");
    const cart = makeCart();
    savePosState(makeState({ cart }));

    // Clear userId and try to load — should fall back to initialState
    setCurrentPosUserId(null);
    expect(loadPosState().cart).toEqual([]);

    // Set userId again and load — should find the cart
    setCurrentPosUserId("user-42");
    expect(loadPosState().cart).toEqual(cart);
  });

  it("clearPosState clears the scoped key", () => {
    setCurrentPosUserId("user-42");
    savePosState(makeState({ cart: makeCart() }));
    expect(localStorageMock.getItem("pos_session_user-42")).not.toBeNull();

    clearPosState();
    expect(localStorageMock.getItem("pos_session_user-42")).toBeNull();
  });

  it("clearAllPosSessions removes all pos_session_* keys + userId marker", () => {
    // Set up multiple user sessions
    localStorageMock.setItem("pos_session_user-1", '{"version":2}');
    localStorageMock.setItem("pos_session_user-2", '{"version":2}');
    localStorageMock.setItem("pos_session", '{"version":2}'); // legacy key
    localStorageMock.setItem("pos_current_user_id", "user-1");
    localStorageMock.setItem("other_key", "leave me alone");

    clearAllPosSessions();

    expect(localStorageMock.getItem("pos_session_user-1")).toBeNull();
    expect(localStorageMock.getItem("pos_session_user-2")).toBeNull();
    expect(localStorageMock.getItem("pos_session")).toBeNull();
    expect(localStorageMock.getItem("pos_current_user_id")).toBeNull();
    // Other localStorage entries should be untouched.
    expect(localStorageMock.getItem("other_key")).toBe("leave me alone");
  });
});

describe("persistence — save + load round-trip", () => {
  beforeEach(() => {
    localStorageMock.clear();
    setCurrentPosUserId(null);
  });

  it("round-trips a state with cart + customer + paymentLines", () => {
    const cart = makeCart();
    const customer = {
      id: "cust-1",
      name: "Ali",
      phone: "0300",
      balance: 500,
      creditLimit: 5000,
    };
    const paymentLines = [
      { id: "p1", method: "cash" as const, amount: 100 },
    ];

    const original = makeState({
      cart,
      customer,
      paymentLines,
      paymentBuffer: "100",
      activePaymentMethod: "cash",
      isPaymentScreen: true,
      internalNote: "Test note",
    });

    savePosState(original);
    const loaded = loadPosState();

    expect(loaded.cart).toEqual(cart);
    expect(loaded.customer).toEqual(customer);
    expect(loaded.paymentLines).toEqual(paymentLines);
    expect(loaded.paymentBuffer).toBe("100");
    expect(loaded.activePaymentMethod).toBe("cash");
    expect(loaded.isPaymentScreen).toBe(true);
    expect(loaded.internalNote).toBe("Test note");
  });

  it("round-trips currentSaleNumber + nextSaleNumber", () => {
    savePosState(
      makeState({
        currentSaleNumber: 5,
        nextSaleNumber: 6,
        registerSession: makeOpenSession(),
      }),
    );
    const loaded = loadPosState();
    expect(loaded.currentSaleNumber).toBe(5);
    expect(loaded.nextSaleNumber).toBe(6);
  });

  it("round-trips parkedOrders", () => {
    const parked = [
      {
        id: "p1",
        saleNumber: 3,
        items: makeCart(),
        customer: null,
        note: "Parked",
        total: 100,
        createdAt: Date.now(),
      },
    ];
    savePosState(
      makeState({
        parkedOrders: parked,
        registerSession: makeOpenSession(),
      }),
    );
    const loaded = loadPosState();
    expect(loaded.parkedOrders).toEqual(parked);
  });

  it("round-trips return mode state", () => {
    const originalSale = { id: "s1", saleNumber: "SALE-001" };
    savePosState(
      makeState({
        returnMode: true,
        originalSale,
      }),
    );
    const loaded = loadPosState();
    expect(loaded.returnMode).toBe(true);
    expect(loaded.originalSale).toEqual(originalSale);
  });
});

describe("persistence — corrupted / missing data", () => {
  beforeEach(() => {
    localStorageMock.clear();
    setCurrentPosUserId(null);
  });

  it("returns initialState when saved data is null (no entry)", () => {
    expect(loadPosState()).toEqual(initialState);
  });

  it("returns initialState when saved data is corrupted JSON", () => {
    localStorageMock.setItem("pos_session", "{invalid json");
    expect(loadPosState()).toEqual(initialState);
  });

  it("returns initialState when saved data is an array (wrong type)", () => {
    localStorageMock.setItem("pos_session", "[1,2,3]");
    // JSON.parse succeeds, but the parsed object lacks the expected fields.
    // The defensive `|| []` and `|| null` defaults handle this.
    const state = loadPosState();
    expect(state.cart).toEqual([]);
    expect(state.customer).toBeNull();
    expect(state.currentSaleNumber).toBe(1); // fallback
  });

  it("returns initialState when saved data is a string", () => {
    localStorageMock.setItem("pos_session", '"hello"');
    const state = loadPosState();
    expect(state).toEqual(initialState);
  });

  it("returns initialState when saved data is a number", () => {
    localStorageMock.setItem("pos_session", "42");
    const state = loadPosState();
    expect(state).toEqual(initialState);
  });

  it("handles missing fields defensively (uses defaults)", () => {
    // Save a partial v2 object missing several fields.
    localStorageMock.setItem(
      "pos_session",
      JSON.stringify({
        version: 2,
        currentSaleNumber: 3,
        // nextSaleNumber missing — should default to 4 via v2 logic
        registerSession: makeOpenSession(),
      }),
    );
    const state = loadPosState();
    expect(state.cart).toEqual([]);
    expect(state.customer).toBeNull();
    expect(state.currentSaleNumber).toBe(3);
    expect(state.nextSaleNumber).toBe(4);
    expect(state.paymentLines).toEqual([]);
  });
});

describe("persistence — hasSavedSession", () => {
  beforeEach(() => {
    localStorageMock.clear();
    setCurrentPosUserId(null);
  });

  it("returns false when no session is saved", () => {
    expect(hasSavedSession()).toBe(false);
  });

  it("returns true when a session is saved", () => {
    savePosState(makeState({ cart: makeCart() }));
    expect(hasSavedSession()).toBe(true);
  });

  it("returns false after clearPosState", () => {
    savePosState(makeState({ cart: makeCart() }));
    expect(hasSavedSession()).toBe(true);
    clearPosState();
    expect(hasSavedSession()).toBe(false);
  });

  it("respects the userId-scoped key", () => {
    setCurrentPosUserId("user-1");
    savePosState(makeState({ cart: makeCart() }));
    expect(hasSavedSession()).toBe(true);

    setCurrentPosUserId("user-2");
    expect(hasSavedSession()).toBe(false);
  });
});

describe("persistence — defensive handling of edge cases", () => {
  beforeEach(() => {
    localStorageMock.clear();
    setCurrentPosUserId(null);
  });

  it("savePosState does not throw on quota exceeded (fails silently)", () => {
    // Override setItem to throw
    const originalSetItem = localStorageMock.setItem;
    localStorageMock.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => savePosState(makeState({ cart: makeCart() }))).not.toThrow();
    localStorageMock.setItem = originalSetItem;
  });

  it("clearPosState does not throw on storage error", () => {
    const originalRemoveItem = localStorageMock.removeItem;
    localStorageMock.removeItem = () => {
      throw new Error("SecurityError");
    };
    expect(() => clearPosState()).not.toThrow();
    localStorageMock.removeItem = originalRemoveItem;
  });

  it("loadPosState does not throw on parse error", () => {
    localStorageMock.setItem("pos_session", "{bad json");
    expect(() => loadPosState()).not.toThrow();
  });
});
