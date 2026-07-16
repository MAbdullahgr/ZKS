import { describe, it, expect } from "vitest";
import {
  createProductSchema,
  updateProductSchema,
  receiveStockSchema,
} from "@/lib/validations/product";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("createProductSchema", () => {
  it("accepts a minimal valid product", () => {
    const r = createProductSchema.safeParse({
      name: "Widget",
      sku: "W-1",
      costPrice: 50,
      sellingPrice: 100,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a full valid product", () => {
    const r = createProductSchema.safeParse({
      name: "Widget",
      sku: "W-1",
      barcode: "1234567890",
      description: "A widget",
      costPrice: 50,
      sellingPrice: 100,
      minStockLevel: 5,
      brandId: validUuid,
      taxId: validUuid,
      isLoose: true,
      baseUnit: "kg",
      unit: "pieces",
      parentUnit: "box",
      unitsPerParent: 12,
      productGroup: "widgets",
      variantName: "Large",
      imageUrl: "https://example.com/img.png",
      isReturnable: true,
      isActive: true,
      categoryId: validUuid,
      supplierId: validUuid,
    });
    expect(r.success).toBe(true);
  });

  it("defaults minStockLevel to 10 when not provided", () => {
    const r = createProductSchema.parse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
    });
    expect(r.minStockLevel).toBe(10);
  });

  it("defaults isLoose to false", () => {
    const r = createProductSchema.parse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
    });
    expect(r.isLoose).toBe(false);
  });

  it("defaults isReturnable + isActive to true", () => {
    const r = createProductSchema.parse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
    });
    expect(r.isReturnable).toBe(true);
    expect(r.isActive).toBe(true);
  });

  it("defaults baseUnit to 'piece' and unit to 'pieces'", () => {
    const r = createProductSchema.parse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
    });
    expect(r.baseUnit).toBe("piece");
    expect(r.unit).toBe("pieces");
  });

  it("coerces string costPrice/sellingPrice to numbers", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: "50",
      sellingPrice: "100",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.costPrice).toBe(50);
      expect(r.data.sellingPrice).toBe(100);
    }
  });

  it("rejects a missing name", () => {
    const r = createProductSchema.safeParse({ sku: "S", costPrice: 1, sellingPrice: 2 });
    expect(r.success).toBe(false);
  });

  it("rejects a missing sku", () => {
    const r = createProductSchema.safeParse({ name: "W", costPrice: 1, sellingPrice: 2 });
    expect(r.success).toBe(false);
  });

  it("rejects an empty sku", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "",
      costPrice: 1,
      sellingPrice: 2,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative costPrice", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: -10,
      sellingPrice: 5,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative sellingPrice", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: 5,
      sellingPrice: -1,
    });
    expect(r.success).toBe(false);
  });

  it("accepts zero prices (boundary)", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: 0,
      sellingPrice: 0,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a name longer than 200 chars", () => {
    const r = createProductSchema.safeParse({
      name: "a".repeat(201),
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a sku longer than 50 chars", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "a".repeat(51),
      costPrice: 1,
      sellingPrice: 2,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative minStockLevel", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
      minStockLevel: -1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer minStockLevel", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
      minStockLevel: 1.5,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid brandId", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
      brandId: "not-a-uuid",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid categoryId", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
      categoryId: "nope",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid imageUrl (not a URL)", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
      imageUrl: "not-a-url",
    });
    expect(r.success).toBe(false);
  });

  it("accepts an empty-string imageUrl", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
      imageUrl: "",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unitsPerParent less than 1", () => {
    const r = createProductSchema.safeParse({
      name: "W",
      sku: "S",
      costPrice: 1,
      sellingPrice: 2,
      unitsPerParent: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe("updateProductSchema", () => {
  it("accepts an empty object", () => {
    const r = updateProductSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a partial update with just name", () => {
    const r = updateProductSchema.safeParse({ name: "New Name" });
    expect(r.success).toBe(true);
  });

  it("rejects a negative sellingPrice in a partial update", () => {
    const r = updateProductSchema.safeParse({ sellingPrice: -1 });
    expect(r.success).toBe(false);
  });
});

describe("receiveStockSchema", () => {
  it("accepts a valid receive-stock payload", () => {
    const r = receiveStockSchema.safeParse({
      productId: validUuid,
      quantity: 5,
      costPrice: 100,
    });
    expect(r.success).toBe(true);
  });

  it("accepts an optional batchNumber + expiryDate", () => {
    const r = receiveStockSchema.safeParse({
      productId: validUuid,
      quantity: 5,
      costPrice: 100,
      batchNumber: "B-1",
      expiryDate: "2027-12-31T00:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty-string expiryDate (preprocess converts to null)", () => {
    const r = receiveStockSchema.safeParse({
      productId: validUuid,
      quantity: 5,
      costPrice: 100,
      expiryDate: "",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a null expiryDate", () => {
    const r = receiveStockSchema.safeParse({
      productId: validUuid,
      quantity: 5,
      costPrice: 100,
      expiryDate: null,
    });
    expect(r.success).toBe(true);
  });

  it("defaults reason to 'Stock received'", () => {
    const r = receiveStockSchema.parse({
      productId: validUuid,
      quantity: 5,
      costPrice: 100,
    });
    expect(r.reason).toBe("Stock received");
  });

  it("rejects a non-UUID productId", () => {
    const r = receiveStockSchema.safeParse({
      productId: "nope",
      quantity: 5,
      costPrice: 100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive quantity (zero)", () => {
    const r = receiveStockSchema.safeParse({
      productId: validUuid,
      quantity: 0,
      costPrice: 100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative quantity", () => {
    const r = receiveStockSchema.safeParse({
      productId: validUuid,
      quantity: -1,
      costPrice: 100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative costPrice", () => {
    const r = receiveStockSchema.safeParse({
      productId: validUuid,
      quantity: 5,
      costPrice: -1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a batchNumber longer than 50 chars", () => {
    const r = receiveStockSchema.safeParse({
      productId: validUuid,
      quantity: 5,
      costPrice: 100,
      batchNumber: "b".repeat(51),
    });
    expect(r.success).toBe(false);
  });
});
