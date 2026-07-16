import { describe, it, expect } from "vitest";
import {
  createSupplierSchema,
  updateSupplierSchema,
  paySupplierSchema,
} from "@/lib/validations/supplier";

describe("createSupplierSchema", () => {
  it("accepts a minimal valid supplier (just name)", () => {
    const r = createSupplierSchema.safeParse({ name: "Acme Corp" });
    expect(r.success).toBe(true);
  });

  it("accepts a full valid supplier", () => {
    const r = createSupplierSchema.safeParse({
      name: "Acme Corp",
      contactPerson: "John",
      email: "sales@acme.com",
      phone: "+1-555-1234",
      address: "123 Industrial Way",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null optional fields", () => {
    const r = createSupplierSchema.safeParse({
      name: "Acme",
      contactPerson: null,
      email: null,
      phone: null,
      address: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts undefined optional fields", () => {
    const r = createSupplierSchema.safeParse({ name: "Acme" });
    expect(r.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const r = createSupplierSchema.safeParse({ email: "x@y.com" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const r = createSupplierSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a name longer than 100 chars", () => {
    const r = createSupplierSchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = createSupplierSchema.safeParse({
      name: "Acme",
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a contactPerson longer than 100 chars", () => {
    const r = createSupplierSchema.safeParse({
      name: "Acme",
      contactPerson: "a".repeat(101),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a phone longer than 30 chars", () => {
    const r = createSupplierSchema.safeParse({
      name: "Acme",
      phone: "1".repeat(31),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an address longer than 500 chars", () => {
    const r = createSupplierSchema.safeParse({
      name: "Acme",
      address: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe("updateSupplierSchema", () => {
  it("accepts an empty object", () => {
    const r = updateSupplierSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts isActive boolean", () => {
    const r = updateSupplierSchema.safeParse({ isActive: true });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid email in a partial update", () => {
    const r = updateSupplierSchema.safeParse({ email: "nope" });
    expect(r.success).toBe(false);
  });
});

describe("paySupplierSchema", () => {
  it("accepts a valid payment", () => {
    const r = paySupplierSchema.safeParse({ amount: 1000 });
    expect(r.success).toBe(true);
  });

  it("defaults type to 'payment'", () => {
    const r = paySupplierSchema.parse({ amount: 1000 });
    expect(r.type).toBe("payment");
  });

  it("accepts type='debit'", () => {
    const r = paySupplierSchema.safeParse({ amount: 500, type: "debit" });
    expect(r.success).toBe(true);
  });

  it("accepts an optional note", () => {
    const r = paySupplierSchema.safeParse({
      amount: 500,
      note: "Cash payment",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-positive amount (zero)", () => {
    const r = paySupplierSchema.safeParse({ amount: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const r = paySupplierSchema.safeParse({ amount: -100 });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid type", () => {
    const r = paySupplierSchema.safeParse({ amount: 100, type: "credit" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing amount", () => {
    const r = paySupplierSchema.safeParse({ type: "payment" });
    expect(r.success).toBe(false);
  });

  it("rejects a note longer than 500 chars", () => {
    const r = paySupplierSchema.safeParse({
      amount: 100,
      note: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});
