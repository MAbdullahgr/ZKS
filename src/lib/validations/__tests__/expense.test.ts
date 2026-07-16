import { describe, it, expect } from "vitest";
import { createExpenseSchema } from "@/lib/validations/expense";

describe("createExpenseSchema", () => {
  it("accepts a minimal valid expense (just amount)", () => {
    const r = createExpenseSchema.safeParse({ amount: 100 });
    expect(r.success).toBe(true);
  });

  it("accepts a full valid expense", () => {
    const r = createExpenseSchema.safeParse({
      amount: 500,
      category: "rent",
      description: "December rent",
      date: "2027-01-01T00:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("defaults category to 'misc' when not provided", () => {
    const r = createExpenseSchema.parse({ amount: 100 });
    expect(r.category).toBe("misc");
  });

  it("accepts all valid categories", () => {
    for (const category of [
      "utilities",
      "rent",
      "salaries",
      "supplies",
      "transport",
      "maintenance",
      "marketing",
      "misc",
    ]) {
      const r = createExpenseSchema.safeParse({ amount: 100, category });
      expect(r.success).toBe(true);
    }
  });

  it("coerces string amount to number", () => {
    const r = createExpenseSchema.safeParse({ amount: "100" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(100);
  });

  it("rejects a non-positive amount (zero)", () => {
    const r = createExpenseSchema.safeParse({ amount: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const r = createExpenseSchema.safeParse({ amount: -50 });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid category", () => {
    const r = createExpenseSchema.safeParse({
      amount: 100,
      category: "loans",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a description longer than 500 chars", () => {
    const r = createExpenseSchema.safeParse({
      amount: 100,
      description: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("accepts a null description", () => {
    const r = createExpenseSchema.safeParse({
      amount: 100,
      description: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts an optional date (ISO datetime)", () => {
    const r = createExpenseSchema.safeParse({
      amount: 100,
      date: "2027-06-15T12:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });
});
