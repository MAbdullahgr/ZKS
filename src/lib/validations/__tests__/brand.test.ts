import { describe, it, expect } from "vitest";
import { createBrandSchema, updateBrandSchema } from "@/lib/validations/brand";

describe("createBrandSchema", () => {
  it("accepts a valid brand name", () => {
    const r = createBrandSchema.safeParse({ name: "Sony" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const r = createBrandSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing name", () => {
    const r = createBrandSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects a name longer than 100 chars", () => {
    const r = createBrandSchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("accepts a name of exactly 100 chars (boundary)", () => {
    const r = createBrandSchema.safeParse({ name: "a".repeat(100) });
    expect(r.success).toBe(true);
  });

  it("trims whitespace before validation", () => {
    const r = createBrandSchema.safeParse({ name: "  Sony  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Sony");
  });

  it("rejects a whitespace-only name (trims to empty)", () => {
    const r = createBrandSchema.safeParse({ name: "   " });
    expect(r.success).toBe(false);
  });
});

describe("updateBrandSchema", () => {
  it("accepts an empty object", () => {
    const r = updateBrandSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a name update", () => {
    const r = updateBrandSchema.safeParse({ name: "New Brand" });
    expect(r.success).toBe(true);
  });

  it("accepts an isActive boolean", () => {
    const r = updateBrandSchema.safeParse({ isActive: false });
    expect(r.success).toBe(true);
  });

  it("rejects an empty name in a partial update", () => {
    const r = updateBrandSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a name longer than 100 chars in a partial update", () => {
    const r = updateBrandSchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("rejects a non-boolean isActive", () => {
    const r = updateBrandSchema.safeParse({ isActive: "yes" });
    expect(r.success).toBe(false);
  });
});
