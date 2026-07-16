import { describe, it, expect } from "vitest";
import { createStoreSchema, updateStoreSchema } from "@/lib/validations/store";

describe("createStoreSchema", () => {
  it("accepts a minimal valid store (just name)", () => {
    const r = createStoreSchema.safeParse({ name: "Main Store" });
    expect(r.success).toBe(true);
  });

  it("accepts a full valid store", () => {
    const r = createStoreSchema.safeParse({
      name: "Main Store",
      address: "123 Street",
      phone: "03001234567",
      type: "retail",
    });
    expect(r.success).toBe(true);
  });

  it("defaults type to 'retail' when not provided", () => {
    const r = createStoreSchema.parse({ name: "X" });
    expect(r.type).toBe("retail");
  });

  it("accepts type='warehouse'", () => {
    const r = createStoreSchema.safeParse({ name: "WH", type: "warehouse" });
    expect(r.success).toBe(true);
  });

  it("accepts optional fields as null", () => {
    const r = createStoreSchema.safeParse({
      name: "X",
      address: null,
      phone: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const r = createStoreSchema.safeParse({ type: "retail" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const r = createStoreSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a name longer than 100 chars", () => {
    const r = createStoreSchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid type", () => {
    const r = createStoreSchema.safeParse({ name: "X", type: "online" });
    expect(r.success).toBe(false);
  });

  it("rejects an address longer than 500 chars", () => {
    const r = createStoreSchema.safeParse({
      name: "X",
      address: "y".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a phone longer than 30 chars", () => {
    const r = createStoreSchema.safeParse({
      name: "X",
      phone: "1".repeat(31),
    });
    expect(r.success).toBe(false);
  });
});

describe("updateStoreSchema", () => {
  it("accepts an empty object", () => {
    const r = updateStoreSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a valid name update", () => {
    const r = updateStoreSchema.safeParse({ name: "New Name" });
    expect(r.success).toBe(true);
  });

  it("accepts a valid type update", () => {
    const r = updateStoreSchema.safeParse({ type: "warehouse" });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid type", () => {
    const r = updateStoreSchema.safeParse({ type: "online" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty name in a partial update", () => {
    const r = updateStoreSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("does NOT accept isActive (must go through DELETE endpoint)", () => {
    // The schema omits `isActive` deliberately — owner-only restriction.
    const parsed = updateStoreSchema.safeParse({ isActive: false });
    expect(parsed.success).toBe(true); // unknown keys are silently stripped
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("isActive");
    }
  });
});
