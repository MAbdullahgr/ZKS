import { describe, it, expect } from "vitest";
import { createTransferSchema } from "@/lib/validations/stockTransfer";

describe("createTransferSchema", () => {
  it("accepts a valid transfer", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "store-2",
      items: [{ productId: "p1", quantity: 5 }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts non-UUID destStoreId + productId (legacy 'main-store' support)", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "main-store",
      items: [{ productId: "p1", quantity: 5 }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts optional notes", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "p1", quantity: 5 }],
      notes: "Restock",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a null notes", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "p1", quantity: 5 }],
      notes: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts decimal quantities (loose goods)", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "p1", quantity: 2.5 }],
    });
    expect(r.success).toBe(true);
  });

  it("coerces string quantity to number", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "p1", quantity: "5" }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.items[0].quantity).toBe(5);
  });

  it("rejects an empty destStoreId", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "",
      items: [{ productId: "p1", quantity: 5 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing destStoreId", () => {
    const r = createTransferSchema.safeParse({
      items: [{ productId: "p1", quantity: 5 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty items array", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive quantity (zero)", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "p1", quantity: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative quantity", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "p1", quantity: -1 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a quantity above 100000 (unreasonably high)", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "p1", quantity: 100001 }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a quantity of exactly 100000 (boundary)", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "p1", quantity: 100000 }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty productId", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "", quantity: 5 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects notes longer than 500 chars", () => {
    const r = createTransferSchema.safeParse({
      destStoreId: "s2",
      items: [{ productId: "p1", quantity: 5 }],
      notes: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});
