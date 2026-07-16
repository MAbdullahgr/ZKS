import { describe, it, expect } from "vitest";
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  receivePurchaseOrderSchema,
} from "@/lib/validations/purchase";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("createPurchaseOrderSchema", () => {
  it("accepts a minimal valid PO", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 1, unitCost: 10 }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an optional expectedDate (ISO datetime)", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 1, unitCost: 10 }],
      expectedDate: "2027-12-31T00:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a null expectedDate", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 1, unitCost: 10 }],
      expectedDate: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts optional notes", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 1, unitCost: 10 }],
      notes: "Urgent",
    });
    expect(r.success).toBe(true);
  });

  it("accepts decimal quantities", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 1.5, unitCost: 10 }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-UUID supplierId", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: "nope",
      items: [{ productId: validUuid, quantity: 1, unitCost: 10 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty items array", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive quantity (zero)", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 0, unitCost: 10 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative unitCost", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 1, unitCost: -5 }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts zero as a valid unitCost (free samples)", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 1, unitCost: 0 }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-UUID productId", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: "nope", quantity: 1, unitCost: 10 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects notes longer than 1000 chars", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 1, unitCost: 10 }],
      notes: "x".repeat(1001),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-datetime expectedDate", () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: validUuid,
      items: [{ productId: validUuid, quantity: 1, unitCost: 10 }],
      expectedDate: "2027-12-31",
    });
    expect(r.success).toBe(false);
  });
});

describe("updatePurchaseOrderSchema", () => {
  it("accepts an empty object", () => {
    const r = updatePurchaseOrderSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a valid status", () => {
    const r = updatePurchaseOrderSchema.safeParse({ status: "ordered" });
    expect(r.success).toBe(true);
  });

  it("accepts all valid status values", () => {
    for (const status of ["draft", "ordered", "partial", "received", "cancelled"]) {
      const r = updatePurchaseOrderSchema.safeParse({ status });
      expect(r.success).toBe(true);
    }
  });

  it("rejects an invalid status", () => {
    const r = updatePurchaseOrderSchema.safeParse({ status: "shipped" });
    expect(r.success).toBe(false);
  });

  it("rejects notes longer than 1000 chars", () => {
    const r = updatePurchaseOrderSchema.safeParse({
      notes: "x".repeat(1001),
    });
    expect(r.success).toBe(false);
  });
});

describe("receivePurchaseOrderSchema", () => {
  it("accepts a valid receive payload", () => {
    const r = receivePurchaseOrderSchema.safeParse({
      items: [
        {
          purchaseOrderItemId: validUuid,
          receivedQty: 5,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an optional newCostPrice", () => {
    const r = receivePurchaseOrderSchema.safeParse({
      items: [
        {
          purchaseOrderItemId: validUuid,
          receivedQty: 5,
          newCostPrice: 75,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts decimal receivedQty", () => {
    const r = receivePurchaseOrderSchema.safeParse({
      items: [
        {
          purchaseOrderItemId: validUuid,
          receivedQty: 5.5,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty items array", () => {
    const r = receivePurchaseOrderSchema.safeParse({ items: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive receivedQty (zero)", () => {
    const r = receivePurchaseOrderSchema.safeParse({
      items: [
        {
          purchaseOrderItemId: validUuid,
          receivedQty: 0,
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative newCostPrice", () => {
    const r = receivePurchaseOrderSchema.safeParse({
      items: [
        {
          purchaseOrderItemId: validUuid,
          receivedQty: 5,
          newCostPrice: -1,
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-UUID purchaseOrderItemId", () => {
    const r = receivePurchaseOrderSchema.safeParse({
      items: [
        {
          purchaseOrderItemId: "nope",
          receivedQty: 5,
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});
