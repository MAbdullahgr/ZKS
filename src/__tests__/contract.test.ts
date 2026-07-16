// src/__tests__/contract.test.ts
//
// Contract tests verify that the shapes of our API responses + Zod schemas +
// POS reducer/selectors all conform to what the rest of the codebase
// expects. They do NOT call the actual API or hit the database — they
// exercise the response shape definitions + the validators + the pure
// reducer/selectors directly.
//
// Why contract tests?
//   - If apiSuccess ever drops the `data` field, every frontend apiGet
//     caller silently breaks. This test catches that at CI time.
//   - If a Zod schema ever loosens its validation (e.g. accepts negative
//     creditLimit), the DB can end up with garbage data. This test catches
//     that too.
//   - If a POS selector ever returns NaN (e.g. due to a reduce bug), the
//     payment screen shows "Rs. NaN" to the cashier. This test catches
//     that before it ships.

import { describe, it, expect } from "vitest";
import { apiSuccess, apiError } from "@/lib/api-response";
import { NextRequest } from "next/server";
import {
  loginSchema,
  forgotPasswordSchema,
  changePasswordSchema,
  createUserSchema,
} from "@/lib/validations/auth";
import { createCustomerSchema, recordKhataSchema } from "@/lib/validations/customer";
import { createSaleSchema, processReturnSchema } from "@/lib/validations/sale";
import { createProductSchema, receiveStockSchema } from "@/lib/validations/product";
import { createCategorySchema } from "@/lib/validations/category";
import { createBrandSchema } from "@/lib/validations/brand";
import { createStoreSchema } from "@/lib/validations/store";
import { createSupplierSchema, paySupplierSchema } from "@/lib/validations/supplier";
import { createExpenseSchema } from "@/lib/validations/expense";
import {
  openRegisterSchema,
  closeRegisterSchema,
  cashTransactionSchema,
} from "@/lib/validations/register";
import { createTransferSchema } from "@/lib/validations/stockTransfer";
import { createPurchaseOrderSchema } from "@/lib/validations/purchase";
import {
  createAccountSchema,
  journalLineSchema,
  createJournalEntrySchema,
  reverseJournalEntrySchema,
} from "@/lib/validations/accounting";
import { generatePayrollSchema } from "@/lib/validations/payroll";
import { verifyPinSchema, changePinSchema } from "@/lib/validations/settings";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { posReducer } from "@/lib/pos/reducer";
import { initialState } from "@/lib/pos/types";
import {
  cartTotal,
  cartTax,
  cartTotalWithTax,
  totalPaid,
  remainingPayment,
  changeDue,
  cashPaymentTotal,
  khataPaymentTotal,
  cardPaymentTotal,
  mobilePaymentTotal,
  positiveCartTotal,
  returnTotal,
  expectedDrawerCash,
  parkedOrdersTotal,
  cartItemCount,
  cartQuantity,
  completedOrderCount,
  parkedOrderCount,
} from "@/lib/pos/selectors";
import type { Product, CartItem, Customer, CashTransaction } from "@/lib/pos/types";

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/test", {
    method: "GET",
    headers: new Headers({ "content-type": "application/json" }),
  });
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Apple",
    price: 50,
    stock: 100,
    sku: "SKU-001",
    categoryId: "fruits",
    categoryName: "Fruits",
    categoryColor: "border-red-500",
    hasVariants: false,
    minStockLevel: 10,
    ...overrides,
  };
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: "c1",
    productId: "p1",
    name: "Apple",
    unitPrice: 50,
    quantity: 2,
    isReturn: false,
    isZeroed: false,
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    name: "Test Customer",
    phone: "03001234567",
    balance: 0,
    creditLimit: 5000,
    ...overrides,
  };
}

const UUID = "12345678-1234-1234-1234-123456789012";

// ─── apiSuccess contract ─────────────────────────────────────────────────

describe("Contract: apiSuccess shape", () => {
  it("returns an object with success: true, data, message?", async () => {
    const res = apiSuccess({ id: 1, name: "test" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      data: { id: 1, name: "test" },
    });
    // message is optional — should be undefined when not passed.
    expect(body.message).toBeUndefined();
  });

  it("preserves the data shape (object, array, primitive, null)", async () => {
    const cases = [
      { in: { a: 1 }, expected: { a: 1 } },
      { in: [1, 2, 3], expected: [1, 2, 3] },
      { in: "hello", expected: "hello" },
      { in: 42, expected: 42 },
      { in: null, expected: null },
      { in: true, expected: true },
    ];
    for (const c of cases) {
      const res = apiSuccess(c.in);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(c.expected);
    }
  });

  it("accepts a message and uses the provided status code", async () => {
    const res = apiSuccess({ ok: true }, "Sale completed", 201);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      data: { ok: true },
      message: "Sale completed",
    });
  });

  it("never includes error/code/details fields", async () => {
    const res = apiSuccess({ x: 1 });
    const body = await res.json();
    expect(body).not.toHaveProperty("error");
    expect(body).not.toHaveProperty("code");
    expect(body).not.toHaveProperty("details");
    expect(body).not.toHaveProperty("statusCode");
  });
});

// ─── apiError contract ───────────────────────────────────────────────────

describe("Contract: apiError shape", () => {
  it("returns an object with success: false, error, statusCode", async () => {
    const res = apiError("Something went wrong");
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      error: "Something went wrong",
      statusCode: 500,
    });
  });

  it("accepts a code (string) and details (Record<string, string[]>)", async () => {
    const res = apiError("Validation failed", 400, "VALIDATION_ERROR", {
      email: ["Invalid email format"],
      password: ["Password is required"],
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Validation failed");
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toEqual({
      email: ["Invalid email format"],
      password: ["Password is required"],
    });
  });

  it("response status code matches the body statusCode", async () => {
    const cases = [400, 401, 403, 404, 409, 429, 500, 503, 504];
    for (const status of cases) {
      const res = apiError("err", status, "CODE");
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.statusCode).toBe(status);
    }
  });

  it("defaults code + details to undefined when not provided", async () => {
    const res = apiError("err");
    const body = await res.json();
    expect(body.code).toBeUndefined();
    expect(body.details).toBeUndefined();
  });

  it("never includes the `data` field", async () => {
    const res = apiError("err");
    const body = await res.json();
    expect(body).not.toHaveProperty("data");
    expect(body).not.toHaveProperty("message");
  });
});

// ─── Zod schema parsing (valid input) ───────────────────────────────────

describe("Contract: Zod schemas accept valid input", () => {
  it("loginSchema parses a valid email + password", () => {
    const out = loginSchema.parse({
      email: "owner@zkr.local",
      password: "anything",
    });
    expect(out.email).toBe("owner@zkr.local");
    expect(out.password).toBe("anything");
  });

  it("createCustomerSchema parses a valid customer", () => {
    const out = createCustomerSchema.parse({
      name: "Ali",
      phone: "03001234567",
    });
    expect(out.name).toBe("Ali");
    expect(out.phone).toBe("03001234567");
    // creditLimit has a default of 0
    expect(out.creditLimit).toBe(0);
  });

  it("createSaleSchema parses a valid sale payload", () => {
    const out = createSaleSchema.parse({
      items: [
        {
          productId: UUID,
          quantity: 2,
          price: 100,
        },
      ],
      paymentLines: [{ method: "cash", amount: 200 }],
      registerSessionId: UUID,
      idempotencyKey: "abcdefghij",
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].quantity).toBe(2);
    expect(out.discount).toBe(0); // default
    expect(out.tax).toBe(0); // default
  });

  it("createProductSchema parses a valid product (with defaults)", () => {
    const out = createProductSchema.parse({
      name: "Apple",
      sku: "SKU-001",
      costPrice: 50,
      sellingPrice: 100,
    });
    expect(out.name).toBe("Apple");
    expect(out.minStockLevel).toBe(10); // default
    expect(out.isLoose).toBe(false); // default
    expect(out.isReturnable).toBe(true); // default
    expect(out.isActive).toBe(true); // default
    expect(out.baseUnit).toBe("piece"); // default
  });

  it("openRegisterSchema defaults openingCash to 0 when omitted", () => {
    const out = openRegisterSchema.parse({});
    expect(out.openingCash).toBe(0);
  });

  it("cashTransactionSchema parses cash_in with reason", () => {
    const out = cashTransactionSchema.parse({
      type: "cash_in",
      amount: 500,
      reason: "Petty cash top-up",
    });
    expect(out.type).toBe("cash_in");
    expect(out.amount).toBe(500);
  });

  it("createTransferSchema parses a transfer to a non-UUID store id", () => {
    const out = createTransferSchema.parse({
      destStoreId: "main-store", // legacy seed id — not a UUID
      items: [{ productId: "prod-1", quantity: 5 }],
    });
    expect(out.destStoreId).toBe("main-store");
  });

  it("paySupplierSchema defaults type to 'payment'", () => {
    const out = paySupplierSchema.parse({ amount: 1000 });
    expect(out.type).toBe("payment");
  });

  it("createJournalEntrySchema defaults referenceType to 'manual'", () => {
    const out = createJournalEntrySchema.parse({
      description: "Manual adjustment",
      lines: [
        { accountCode: "1000", debit: 100 },
        { accountCode: "4000", credit: 100 },
      ],
    });
    expect(out.referenceType).toBe("manual");
  });

  it("generatePayrollSchema parses month + year", () => {
    const out = generatePayrollSchema.parse({ month: 6, year: 2024 });
    expect(out.month).toBe(6);
    expect(out.year).toBe(2024);
  });

  it("createEmployeeSchema applies defaults (jobTitle, shift, salary)", () => {
    const out = createEmployeeSchema.parse({ name: "Ahmed" });
    expect(out.jobTitle).toBe("Helper");
    expect(out.shift).toBe("morning");
    expect(out.salary).toBe(0);
  });

  it("forgotPasswordSchema parses email-only reset check", () => {
    const out = forgotPasswordSchema.parse({ email: "owner@zkr.local" });
    expect(out.email).toBe("owner@zkr.local");
    expect(out.recoveryCode).toBeUndefined();
    expect(out.newPassword).toBeUndefined();
  });

  it("createUserSchema parses a valid staff-account creation payload", () => {
    const out = createUserSchema.parse({
      employeeId: UUID,
      email: "cashier@zkr.local",
      role: "cashier",
    });
    expect(out.role).toBe("cashier");
    expect(out.storeId).toBeUndefined();
  });

  it("recordKhataSchema parses a valid payment record", () => {
    const out = recordKhataSchema.parse({
      amount: 500,
      type: "payment",
    });
    expect(out.amount).toBe(500);
    expect(out.type).toBe("payment");
  });

  it("processReturnSchema parses a return with refundLines", () => {
    const out = processReturnSchema.parse({
      items: [{ saleItemId: UUID, productId: UUID, quantity: 1, unitPrice: 100 }],
      refundLines: [{ method: "cash", amount: 100 }],
    });
    expect(out.items).toHaveLength(1);
  });

  it("receiveStockSchema parses a valid stock-receive payload", () => {
    const out = receiveStockSchema.parse({
      productId: UUID,
      quantity: 10,
      costPrice: 50,
    });
    expect(out.quantity).toBe(10);
    expect(out.reason).toBe("Stock received"); // default
  });

  it("createCategorySchema parses a valid category", () => {
    const out = createCategorySchema.parse({ name: "Beverages" });
    expect(out.name).toBe("Beverages");
  });

  it("createBrandSchema parses a valid brand", () => {
    const out = createBrandSchema.parse({ name: "Coca-Cola" });
    expect(out.name).toBe("Coca-Cola");
  });

  it("createStoreSchema parses a valid store with default type 'retail'", () => {
    const out = createStoreSchema.parse({ name: "Main Store" });
    expect(out.name).toBe("Main Store");
    expect(out.type).toBe("retail"); // default
  });

  it("createSupplierSchema parses a valid supplier", () => {
    const out = createSupplierSchema.parse({ name: "ACME Distributors" });
    expect(out.name).toBe("ACME Distributors");
  });

  it("createExpenseSchema defaults category to 'misc'", () => {
    const out = createExpenseSchema.parse({ amount: 500 });
    expect(out.category).toBe("misc"); // default
  });

  it("closeRegisterSchema parses a valid close payload", () => {
    const out = closeRegisterSchema.parse({ closingCash: 5000 });
    expect(out.closingCash).toBe(5000);
  });

  it("journalLineSchema parses a valid debit line", () => {
    const out = journalLineSchema.parse({
      accountCode: "1000",
      debit: 100,
    });
    expect(out.accountCode).toBe("1000");
    expect(out.debit).toBe(100);
  });

  it("reverseJournalEntrySchema requires a reason", () => {
    const out = reverseJournalEntrySchema.parse({ reason: "Mistake" });
    expect(out.reason).toBe("Mistake");
  });

  it("changePinSchema parses a valid new-PIN payload", () => {
    const out = changePinSchema.parse({
      currentPin: "1234",
      newPin: "123456",
    });
    expect(out.newPin).toBe("123456");
  });
});

// ─── Zod schema rejection (invalid input) ───────────────────────────────

describe("Contract: Zod schemas reject invalid input", () => {
  it("loginSchema rejects an invalid email", () => {
    expect(() =>
      loginSchema.parse({ email: "not-an-email", password: "x" }),
    ).toThrow();
  });

  it("loginSchema rejects a missing password", () => {
    expect(() =>
      loginSchema.parse({ email: "owner@zkr.local" }),
    ).toThrow();
  });

  it("changePasswordSchema rejects a too-short password", () => {
    expect(() =>
      changePasswordSchema.parse({ password: "short1" }),
    ).toThrow();
  });

  it("changePasswordSchema rejects a password without a special char", () => {
    expect(() =>
      changePasswordSchema.parse({ password: "Abcdefg123" }),
    ).toThrow();
  });

  it("createSaleSchema rejects an empty items array", () => {
    expect(() =>
      createSaleSchema.parse({
        items: [],
        paymentLines: [{ method: "cash", amount: 0 }],
        registerSessionId: UUID,
        idempotencyKey: "abcdefghij",
      }),
    ).toThrow();
  });

  it("createSaleSchema rejects an empty paymentLines array", () => {
    expect(() =>
      createSaleSchema.parse({
        items: [{ productId: UUID, quantity: 1, price: 10 }],
        paymentLines: [],
        registerSessionId: UUID,
        idempotencyKey: "abcdefghij",
      }),
    ).toThrow();
  });

  it("createCustomerSchema rejects a negative creditLimit", () => {
    expect(() =>
      createCustomerSchema.parse({
        name: "X",
        creditLimit: -1,
      }),
    ).toThrow();
  });

  it("createCustomerSchema rejects an obviously-wrong phone number", () => {
    expect(() =>
      createCustomerSchema.parse({
        name: "X",
        phone: "12345",
      }),
    ).toThrow();
  });

  it("openRegisterSchema rejects negative openingCash", () => {
    expect(() =>
      openRegisterSchema.parse({ openingCash: -1 }),
    ).toThrow();
  });

  it("cashTransactionSchema rejects an invalid type", () => {
    expect(() =>
      cashTransactionSchema.parse({
        type: "deposit",
        amount: 100,
        reason: "x",
      }),
    ).toThrow();
  });

  it("createAccountSchema rejects a non-numeric account code", () => {
    expect(() =>
      createAccountSchema.parse({
        code: "ABC",
        name: "Cash",
        type: "asset",
      }),
    ).toThrow();
  });

  it("createEmployeeSchema rejects a malformed CNIC", () => {
    expect(() =>
      createEmployeeSchema.parse({
        name: "Ahmed",
        cnic: "12345",
      }),
    ).toThrow();
  });

  it("verifyPinSchema rejects a non-numeric PIN", () => {
    expect(() => verifyPinSchema.parse({ pin: "12a4" })).toThrow();
  });

  it("createPurchaseOrderSchema rejects an empty items array", () => {
    expect(() =>
      createPurchaseOrderSchema.parse({
        supplierId: UUID,
        items: [],
      }),
    ).toThrow();
  });
});

// ─── POS reducer: state shape after each action ─────────────────────────

describe("Contract: POS reducer produces correct state shapes", () => {
  it("ADD_TO_CART adds an item with all required fields", () => {
    const next = posReducer(initialState, {
      type: "ADD_TO_CART",
      payload: { product: makeProduct() },
    });
    expect(next.cart).toHaveLength(1);
    const item = next.cart[0];
    expect(item).toMatchObject({
      id: expect.any(String),
      productId: "p1",
      name: "Apple",
      unitPrice: 50,
      quantity: 1,
      isReturn: false,
      isZeroed: false,
    });
    expect(item.id).not.toBe("");
  });

  it("SET_CUSTOMER sets customer and preserves the rest of the state", () => {
    const next = posReducer(initialState, {
      type: "SET_CUSTOMER",
      payload: makeCustomer(),
    });
    expect(next.customer).toEqual(makeCustomer());
    // Cart should be unchanged (empty)
    expect(next.cart).toEqual(initialState.cart);
  });

  it("OPEN_PAYMENT sets isPaymentScreen=true and clears paymentLines", () => {
    const next = posReducer(initialState, { type: "OPEN_PAYMENT" });
    expect(next.isPaymentScreen).toBe(true);
    expect(next.paymentLines).toEqual([]);
    expect(next.paymentBuffer).toBe("");
    expect(next.activePaymentMethod).toBeNull();
    // currentSaleId is set when entering the payment screen (idempotency key).
    expect(next.currentSaleId).not.toBeNull();
  });

  it("COMPLETE_SALE clears cart, paymentLines, customer, currentSaleId", () => {
    const withCart = {
      ...initialState,
      cart: [makeCartItem()],
      customer: makeCustomer(),
      isPaymentScreen: true,
      paymentLines: [{ id: "pl1", method: "cash" as const, amount: 100 }],
      currentSaleId: "sale-123",
    };
    const next = posReducer(withCart, {
      type: "COMPLETE_SALE",
      payload: {
        id: "order-1",
        saleNumber: 1,
        items: [makeCartItem()],
        customer: null,
        note: "",
        total: 100,
        createdAt: Date.now(),
        paymentLines: [{ id: "pl1", method: "cash", amount: 100 }],
        changeDue: 0,
      },
    });
    expect(next.cart).toEqual([]);
    expect(next.customer).toBeNull();
    expect(next.paymentLines).toEqual([]);
    expect(next.isPaymentScreen).toBe(false);
    expect(next.currentSaleId).toBeNull();
    // The completed order should be recorded (it wasn't a pure return order).
    expect(next.completedOrders).toHaveLength(1);
  });

  it("LOCK toggles isLocked to true; UNLOCK toggles back", () => {
    const locked = posReducer(initialState, { type: "LOCK" });
    expect(locked.isLocked).toBe(true);
    const unlocked = posReducer(locked, { type: "UNLOCK" });
    expect(unlocked.isLocked).toBe(false);
  });

  it("OPEN_REGISTER clears stale cart + parked + completed orders", () => {
    const stale: typeof initialState = {
      ...initialState,
      cart: [makeCartItem()],
      parkedOrders: [
        {
          id: "p1",
          saleNumber: 1,
          items: [makeCartItem()],
          customer: null,
          note: "",
          total: 100,
          createdAt: 1,
        },
      ],
      completedOrders: [],
    };
    const next = posReducer(stale, {
      type: "OPEN_REGISTER",
      payload: { openingCash: 5000, openingNote: "", id: "reg-1" },
    });
    expect(next.cart).toEqual([]);
    expect(next.parkedOrders).toEqual([]);
    expect(next.registerSession).not.toBeNull();
    expect(next.registerSession?.openingCash).toBe(5000);
    expect(next.currentSaleNumber).toBe(1);
    expect(next.nextSaleNumber).toBe(2);
  });
});

// ─── POS selectors return finite numbers (never NaN) ────────────────────

describe("Contract: POS selectors return finite numbers", () => {
  it("cartTotal / cartTax / cartTotalWithTax are finite numbers", () => {
    const state = {
      ...initialState,
      cart: [
        makeCartItem({ unitPrice: 100, quantity: 2, taxRate: 17 }),
        makeCartItem({
          id: "c2",
          unitPrice: 50,
          quantity: 3,
          taxRate: 0,
        }),
      ],
    };
    expect(Number.isFinite(cartTotal(state))).toBe(true);
    expect(Number.isFinite(cartTax(state))).toBe(true);
    expect(Number.isFinite(cartTotalWithTax(state))).toBe(true);
    expect(cartTotal(state)).toBe(350); // 100*2 + 50*3
    expect(cartTax(state)).toBeCloseTo(34, 2); // (200*17)/100 = 34
    expect(cartTotalWithTax(state)).toBeCloseTo(384, 2);
  });

  it("totalPaid / remainingPayment / changeDue are finite numbers", () => {
    const state = {
      ...initialState,
      paymentLines: [
        { id: "p1", method: "cash" as const, amount: 100 },
        { id: "p2", method: "card" as const, amount: 50 },
      ],
    };
    expect(Number.isFinite(totalPaid(state))).toBe(true);
    expect(Number.isFinite(remainingPayment(state))).toBe(true);
    expect(Number.isFinite(changeDue(state))).toBe(true);
    expect(totalPaid(state)).toBe(150);
  });

  it("payment-method selectors return finite numbers", () => {
    const state = {
      ...initialState,
      paymentLines: [
        { id: "p1", method: "cash" as const, amount: 100 },
        { id: "p2", method: "card" as const, amount: 50 },
        { id: "p3", method: "mobile" as const, amount: 25 },
        { id: "p4", method: "khata" as const, amount: 75 },
      ],
    };
    expect(Number.isFinite(cashPaymentTotal(state))).toBe(true);
    expect(Number.isFinite(khataPaymentTotal(state))).toBe(true);
    expect(Number.isFinite(cardPaymentTotal(state))).toBe(true);
    expect(Number.isFinite(mobilePaymentTotal(state))).toBe(true);
    expect(cashPaymentTotal(state)).toBe(100);
    expect(khataPaymentTotal(state)).toBe(75);
    expect(cardPaymentTotal(state)).toBe(50);
    expect(mobilePaymentTotal(state)).toBe(25);
  });

  it("all selectors return 0 (not NaN) on the initial empty state", () => {
    expect(cartTotal(initialState)).toBe(0);
    expect(cartTax(initialState)).toBe(0);
    expect(cartTotalWithTax(initialState)).toBe(0);
    expect(totalPaid(initialState)).toBe(0);
    expect(remainingPayment(initialState)).toBe(0);
    expect(changeDue(initialState)).toBe(0);
    expect(cashPaymentTotal(initialState)).toBe(0);
    expect(khataPaymentTotal(initialState)).toBe(0);
    expect(cardPaymentTotal(initialState)).toBe(0);
    expect(mobilePaymentTotal(initialState)).toBe(0);
    expect(positiveCartTotal(initialState)).toBe(0);
    expect(returnTotal(initialState)).toBe(0);
    expect(expectedDrawerCash(initialState)).toBe(0);
    expect(parkedOrdersTotal(initialState)).toBe(0);
    expect(cartItemCount(initialState)).toBe(0);
    expect(cartQuantity(initialState)).toBe(0);
    expect(completedOrderCount(initialState)).toBe(0);
    expect(parkedOrderCount(initialState)).toBe(0);
  });

  it("expectedDrawerCash sums opening + cash-ins + cash payments - cash-outs", () => {
    const txIn: CashTransaction = {
      id: "tx1",
      type: "in",
      amount: 1000,
      reason: "top-up",
      createdAt: 1,
    };
    const txOut: CashTransaction = {
      id: "tx2",
      type: "out",
      amount: 200,
      reason: "pay vendor",
      createdAt: 2,
    };
    const state = {
      ...initialState,
      registerSession: {
        id: "reg-1",
        openingCash: 5000,
        openingNote: "",
        cashInTotal: 1000,
        cashOutTotal: 200,
        status: "open" as const,
        openedAt: 1,
        transactions: [txIn, txOut],
      },
      paymentLines: [{ id: "p1", method: "cash" as const, amount: 500 }],
    };
    const expected = 5000 + 1000 + 500 - 200; // 6300
    expect(expectedDrawerCash(state)).toBe(expected);
    expect(Number.isFinite(expectedDrawerCash(state))).toBe(true);
  });
});

// ─── Sanity: makeRequest helper doesn't throw ────────────────────────────
//
// This guards against accidental NextRequest API changes that would break
// every test in the suite that uses makeRequest.

describe("Contract: test harness sanity", () => {
  it("makeRequest returns a NextRequest", () => {
    const req = makeRequest();
    expect(req).toBeInstanceOf(NextRequest);
    expect(req.method).toBe("GET");
  });
});
