import { describe, it, expect } from "vitest";
import {
  createCustomerSchema,
  updateCustomerSchema,
  recordKhataSchema,
} from "@/lib/validations/customer";

describe("createCustomerSchema", () => {
  it("accepts a minimal valid customer", () => {
    const r = createCustomerSchema.safeParse({ name: "Ali" });
    expect(r.success).toBe(true);
  });

  it("accepts a full valid customer with Pakistan phone + email", () => {
    const r = createCustomerSchema.safeParse({
      name: "Ali Khan",
      phone: "03001234567",
      email: "ali@example.com",
      address: "123 Street",
      creditLimit: 5000,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a +92-prefixed phone number", () => {
    const r = createCustomerSchema.safeParse({
      name: "Ali",
      phone: "+923001234567",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a null phone (optional + nullable)", () => {
    const r = createCustomerSchema.safeParse({ name: "Ali", phone: null });
    expect(r.success).toBe(true);
  });

  it("accepts an undefined phone (optional)", () => {
    const r = createCustomerSchema.safeParse({ name: "Ali" });
    expect(r.success).toBe(true);
  });

  it("defaults creditLimit to 0 when not provided", () => {
    const r = createCustomerSchema.parse({ name: "Ali" });
    expect(r.creditLimit).toBe(0);
  });

  it("rejects a missing name", () => {
    const r = createCustomerSchema.safeParse({ phone: "03001234567" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const r = createCustomerSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a name longer than 100 chars", () => {
    const r = createCustomerSchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("rejects an obviously-wrong phone format", () => {
    const r = createCustomerSchema.safeParse({
      name: "Ali",
      phone: "12345",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an international (non-PK) phone number", () => {
    const r = createCustomerSchema.safeParse({
      name: "Ali",
      phone: "+15551234567",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = createCustomerSchema.safeParse({
      name: "Ali",
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative creditLimit", () => {
    const r = createCustomerSchema.safeParse({
      name: "Ali",
      creditLimit: -100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a creditLimit above 1 billion", () => {
    const r = createCustomerSchema.safeParse({
      name: "Ali",
      creditLimit: 1_000_000_001,
    });
    expect(r.success).toBe(false);
  });

  it("accepts a creditLimit of exactly 0", () => {
    const r = createCustomerSchema.safeParse({ name: "Ali", creditLimit: 0 });
    expect(r.success).toBe(true);
  });

  it("accepts a creditLimit of exactly 1 billion", () => {
    const r = createCustomerSchema.safeParse({
      name: "Ali",
      creditLimit: 1_000_000_000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an address longer than 500 chars", () => {
    const r = createCustomerSchema.safeParse({
      name: "Ali",
      address: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe("updateCustomerSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const r = updateCustomerSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a partial update with isActive", () => {
    const r = updateCustomerSchema.safeParse({ isActive: false });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid email in a partial update", () => {
    const r = updateCustomerSchema.safeParse({ email: "nope" });
    expect(r.success).toBe(false);
  });
});

describe("recordKhataSchema", () => {
  it("accepts a valid payment record", () => {
    const r = recordKhataSchema.safeParse({
      amount: 500,
      type: "payment",
    });
    expect(r.success).toBe(true);
  });

  it("accepts all four valid types", () => {
    for (const type of ["payment", "advance", "return_credit", "return_cash"]) {
      const r = recordKhataSchema.safeParse({ amount: 100, type });
      expect(r.success).toBe(true);
    }
  });

  it("accepts an optional note", () => {
    const r = recordKhataSchema.safeParse({
      amount: 100,
      type: "payment",
      note: "Cash",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a null note", () => {
    const r = recordKhataSchema.safeParse({
      amount: 100,
      type: "payment",
      note: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-positive amount (zero)", () => {
    const r = recordKhataSchema.safeParse({ amount: 0, type: "payment" });
    expect(r.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const r = recordKhataSchema.safeParse({ amount: -1, type: "payment" });
    expect(r.success).toBe(false);
  });

  it("rejects an amount above 1 billion", () => {
    const r = recordKhataSchema.safeParse({
      amount: 1_000_000_001,
      type: "payment",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid type", () => {
    const r = recordKhataSchema.safeParse({ amount: 100, type: "credit" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing amount", () => {
    const r = recordKhataSchema.safeParse({ type: "payment" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing type", () => {
    const r = recordKhataSchema.safeParse({ amount: 100 });
    expect(r.success).toBe(false);
  });

  it("rejects a note longer than 500 chars", () => {
    const r = recordKhataSchema.safeParse({
      amount: 100,
      type: "payment",
      note: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});
