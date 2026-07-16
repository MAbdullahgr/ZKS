import { describe, it, expect } from "vitest";
import {
  openRegisterSchema,
  closeRegisterSchema,
  cashTransactionSchema,
} from "@/lib/validations/register";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("openRegisterSchema", () => {
  it("accepts an empty object (all fields optional with defaults)", () => {
    const r = openRegisterSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a full valid payload", () => {
    const r = openRegisterSchema.safeParse({
      storeId: validUuid,
      openingCash: 5000,
      openingNote: "Good morning",
    });
    expect(r.success).toBe(true);
  });

  it("defaults openingCash to 0 when not provided", () => {
    const r = openRegisterSchema.parse({});
    expect(r.openingCash).toBe(0);
  });

  it("accepts zero opening cash", () => {
    const r = openRegisterSchema.safeParse({ openingCash: 0 });
    expect(r.success).toBe(true);
  });

  it("rejects a negative openingCash", () => {
    const r = openRegisterSchema.safeParse({ openingCash: -100 });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid storeId", () => {
    const r = openRegisterSchema.safeParse({ storeId: "nope" });
    expect(r.success).toBe(false);
  });

  it("accepts a null openingNote", () => {
    const r = openRegisterSchema.safeParse({ openingNote: null });
    expect(r.success).toBe(true);
  });

  it("rejects an openingNote longer than 500 chars", () => {
    const r = openRegisterSchema.safeParse({
      openingNote: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe("closeRegisterSchema", () => {
  it("accepts a valid close payload", () => {
    const r = closeRegisterSchema.safeParse({
      closingCash: 5200,
      closingNote: "All good",
    });
    expect(r.success).toBe(true);
  });

  it("accepts zero closing cash", () => {
    const r = closeRegisterSchema.safeParse({ closingCash: 0 });
    expect(r.success).toBe(true);
  });

  it("rejects a negative closingCash", () => {
    const r = closeRegisterSchema.safeParse({ closingCash: -100 });
    expect(r.success).toBe(false);
  });

  it("rejects a missing closingCash", () => {
    const r = closeRegisterSchema.safeParse({ closingNote: "x" });
    expect(r.success).toBe(false);
  });

  it("accepts a null closingNote", () => {
    const r = closeRegisterSchema.safeParse({
      closingCash: 100,
      closingNote: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a closingNote longer than 500 chars", () => {
    const r = closeRegisterSchema.safeParse({
      closingCash: 100,
      closingNote: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe("cashTransactionSchema", () => {
  it("accepts a valid cash_in transaction", () => {
    const r = cashTransactionSchema.safeParse({
      type: "cash_in",
      amount: 500,
      reason: "Refill",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid cash_out transaction", () => {
    const r = cashTransactionSchema.safeParse({
      type: "cash_out",
      amount: 200,
      reason: "Petty expense",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid type", () => {
    const r = cashTransactionSchema.safeParse({
      type: "deposit",
      amount: 100,
      reason: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive amount (zero)", () => {
    const r = cashTransactionSchema.safeParse({
      type: "cash_in",
      amount: 0,
      reason: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const r = cashTransactionSchema.safeParse({
      type: "cash_in",
      amount: -1,
      reason: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty reason", () => {
    const r = cashTransactionSchema.safeParse({
      type: "cash_in",
      amount: 100,
      reason: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing reason", () => {
    const r = cashTransactionSchema.safeParse({
      type: "cash_in",
      amount: 100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a reason longer than 200 chars", () => {
    const r = cashTransactionSchema.safeParse({
      type: "cash_in",
      amount: 100,
      reason: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });
});
