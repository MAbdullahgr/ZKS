import { describe, it, expect } from "vitest";
import { generatePayrollSchema, updatePayrollSchema } from "@/lib/validations/payroll";

describe("generatePayrollSchema", () => {
  it("accepts a valid month + year", () => {
    const r = generatePayrollSchema.safeParse({ month: 6, year: 2027 });
    expect(r.success).toBe(true);
  });

  it("accepts January (month=1)", () => {
    const r = generatePayrollSchema.safeParse({ month: 1, year: 2027 });
    expect(r.success).toBe(true);
  });

  it("accepts December (month=12)", () => {
    const r = generatePayrollSchema.safeParse({ month: 12, year: 2027 });
    expect(r.success).toBe(true);
  });

  it("rejects month = 0", () => {
    const r = generatePayrollSchema.safeParse({ month: 0, year: 2027 });
    expect(r.success).toBe(false);
  });

  it("rejects month = 13", () => {
    const r = generatePayrollSchema.safeParse({ month: 13, year: 2027 });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer month", () => {
    const r = generatePayrollSchema.safeParse({ month: 6.5, year: 2027 });
    expect(r.success).toBe(false);
  });

  it("rejects a year below 2000", () => {
    const r = generatePayrollSchema.safeParse({ month: 6, year: 1999 });
    expect(r.success).toBe(false);
  });

  it("rejects a year above 2100", () => {
    const r = generatePayrollSchema.safeParse({ month: 6, year: 2101 });
    expect(r.success).toBe(false);
  });

  it("accepts boundary years 2000 and 2100", () => {
    expect(
      generatePayrollSchema.safeParse({ month: 1, year: 2000 }).success,
    ).toBe(true);
    expect(
      generatePayrollSchema.safeParse({ month: 12, year: 2100 }).success,
    ).toBe(true);
  });

  it("rejects a missing month", () => {
    const r = generatePayrollSchema.safeParse({ year: 2027 });
    expect(r.success).toBe(false);
  });

  it("rejects a missing year", () => {
    const r = generatePayrollSchema.safeParse({ month: 6 });
    expect(r.success).toBe(false);
  });
});

describe("updatePayrollSchema", () => {
  it("accepts an empty object", () => {
    const r = updatePayrollSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts bonus + advanceDeduction + status", () => {
    const r = updatePayrollSchema.safeParse({
      bonus: 1000,
      advanceDeduction: 500,
      status: "paid",
    });
    expect(r.success).toBe(true);
  });

  it("accepts all valid status values", () => {
    for (const status of ["draft", "pending", "paid"]) {
      const r = updatePayrollSchema.safeParse({ status });
      expect(r.success).toBe(true);
    }
  });

  it("rejects an invalid status", () => {
    const r = updatePayrollSchema.safeParse({ status: "cancelled" });
    expect(r.success).toBe(false);
  });

  it("rejects a negative bonus", () => {
    const r = updatePayrollSchema.safeParse({ bonus: -100 });
    expect(r.success).toBe(false);
  });

  it("rejects a negative advanceDeduction", () => {
    const r = updatePayrollSchema.safeParse({ advanceDeduction: -100 });
    expect(r.success).toBe(false);
  });

  it("accepts zero bonus + zero advanceDeduction (boundary)", () => {
    const r = updatePayrollSchema.safeParse({
      bonus: 0,
      advanceDeduction: 0,
    });
    expect(r.success).toBe(true);
  });
});
