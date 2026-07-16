import { describe, it, expect } from "vitest";
import {
  createCategorySchema,
  updateCategorySchema,
} from "@/lib/validations/category";

describe("createCategorySchema", () => {
  it("accepts a valid category name", () => {
    const r = createCategorySchema.safeParse({ name: "Beverages" });
    expect(r.success).toBe(true);
  });

  it("accepts an optional description", () => {
    const r = createCategorySchema.safeParse({
      name: "Beverages",
      description: "Cold drinks",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a null description", () => {
    const r = createCategorySchema.safeParse({
      name: "Beverages",
      description: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const r = createCategorySchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing name", () => {
    const r = createCategorySchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects a name longer than 100 chars", () => {
    const r = createCategorySchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("accepts a name of exactly 100 chars (boundary)", () => {
    const r = createCategorySchema.safeParse({ name: "a".repeat(100) });
    expect(r.success).toBe(true);
  });

  it("rejects a description longer than 500 chars", () => {
    const r = createCategorySchema.safeParse({
      name: "X",
      description: "y".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("trims whitespace before validation", () => {
    const r = createCategorySchema.safeParse({ name: "  Beverages  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Beverages");
  });

  it("rejects a whitespace-only name (trims to empty)", () => {
    const r = createCategorySchema.safeParse({ name: "   " });
    expect(r.success).toBe(false);
  });
});

describe("updateCategorySchema", () => {
  it("accepts an empty object", () => {
    const r = updateCategorySchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a name update", () => {
    const r = updateCategorySchema.safeParse({ name: "New Cat" });
    expect(r.success).toBe(true);
  });

  it("accepts an isActive boolean", () => {
    const r = updateCategorySchema.safeParse({ isActive: false });
    expect(r.success).toBe(true);
  });

  it("rejects an empty name in a partial update", () => {
    const r = updateCategorySchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a name longer than 100 chars in a partial update", () => {
    const r = updateCategorySchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("rejects a non-boolean isActive", () => {
    const r = updateCategorySchema.safeParse({ isActive: "yes" });
    expect(r.success).toBe(false);
  });

  it("rejects a description longer than 500 chars in a partial update", () => {
    const r = updateCategorySchema.safeParse({
      description: "y".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});
