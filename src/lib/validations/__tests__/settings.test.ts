import { describe, it, expect } from "vitest";
import {
  updateSettingsSchema,
  verifyPinSchema,
  changePinSchema,
} from "@/lib/validations/settings";

describe("updateSettingsSchema", () => {
  it("accepts an empty object", () => {
    const r = updateSettingsSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a full valid settings update", () => {
    const r = updateSettingsSchema.safeParse({
      storeName: "ZKR Mart",
      address: "123 Street",
      phone: "03001234567",
      currency: "PKR",
      taxRate: 17,
      displayTaxBreakdown: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a storeName longer than 100 chars", () => {
    const r = updateSettingsSchema.safeParse({
      storeName: "a".repeat(101),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an address longer than 500 chars", () => {
    const r = updateSettingsSchema.safeParse({
      address: "a".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a phone longer than 30 chars", () => {
    const r = updateSettingsSchema.safeParse({
      phone: "1".repeat(31),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a currency longer than 10 chars", () => {
    const r = updateSettingsSchema.safeParse({
      currency: "USDOLLARSSS", // 11 chars
    });
    expect(r.success).toBe(false);
  });

  it("accepts a currency of exactly 10 chars (boundary)", () => {
    const r = updateSettingsSchema.safeParse({
      currency: "USDOLLARSS", // 10 chars
    });
    expect(r.success).toBe(true);
  });

  it("rejects a negative taxRate", () => {
    const r = updateSettingsSchema.safeParse({ taxRate: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects a taxRate above 100", () => {
    const r = updateSettingsSchema.safeParse({ taxRate: 101 });
    expect(r.success).toBe(false);
  });

  it("accepts taxRate boundary values 0 and 100", () => {
    expect(updateSettingsSchema.safeParse({ taxRate: 0 }).success).toBe(true);
    expect(updateSettingsSchema.safeParse({ taxRate: 100 }).success).toBe(true);
  });

  it("rejects a non-boolean displayTaxBreakdown", () => {
    const r = updateSettingsSchema.safeParse({
      displayTaxBreakdown: "yes",
    });
    expect(r.success).toBe(false);
  });
});

describe("verifyPinSchema", () => {
  it("accepts a 4-digit PIN (backward compat)", () => {
    const r = verifyPinSchema.safeParse({ pin: "1234" });
    expect(r.success).toBe(true);
  });

  it("accepts a 6-digit PIN", () => {
    const r = verifyPinSchema.safeParse({ pin: "123456" });
    expect(r.success).toBe(true);
  });

  it("accepts an 8-digit PIN (max)", () => {
    const r = verifyPinSchema.safeParse({ pin: "12345678" });
    expect(r.success).toBe(true);
  });

  it("rejects a 3-digit PIN (too short)", () => {
    const r = verifyPinSchema.safeParse({ pin: "123" });
    expect(r.success).toBe(false);
  });

  it("rejects a 9-digit PIN (too long)", () => {
    const r = verifyPinSchema.safeParse({ pin: "123456789" });
    expect(r.success).toBe(false);
  });

  it("rejects a PIN with non-digit characters", () => {
    const r = verifyPinSchema.safeParse({ pin: "12a456" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty PIN", () => {
    const r = verifyPinSchema.safeParse({ pin: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing PIN", () => {
    const r = verifyPinSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("changePinSchema", () => {
  it("accepts a valid change PIN payload", () => {
    const r = changePinSchema.safeParse({
      currentPin: "1234",
      newPin: "654321",
    });
    expect(r.success).toBe(true);
  });

  it("accepts currentPin up to 8 digits", () => {
    const r = changePinSchema.safeParse({
      currentPin: "12345678",
      newPin: "87654321",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a currentPin shorter than 4 digits", () => {
    const r = changePinSchema.safeParse({
      currentPin: "123",
      newPin: "654321",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a newPin shorter than 6 digits (P1-18 fix)", () => {
    const r = changePinSchema.safeParse({
      currentPin: "1234",
      newPin: "1234",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a newPin with non-digit characters", () => {
    const r = changePinSchema.safeParse({
      currentPin: "1234",
      newPin: "12a456",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a newPin longer than 8 digits", () => {
    const r = changePinSchema.safeParse({
      currentPin: "1234",
      newPin: "123456789",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing currentPin", () => {
    const r = changePinSchema.safeParse({ newPin: "654321" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing newPin", () => {
    const r = changePinSchema.safeParse({ currentPin: "1234" });
    expect(r.success).toBe(false);
  });
});
