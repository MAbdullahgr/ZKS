import { describe, it, expect } from "vitest";
import { generateReturnNumber } from "@/services/returnService";

describe("returnService — generateReturnNumber", () => {
  it("returns a string in the format RET-YYYYMMDD-###### (6-digit suffix)", () => {
    const num = generateReturnNumber();
    // FIX P2-3: Suffix bumped to 6 digits (was 4) — reduces collision risk.
    expect(num).toMatch(/^RET-\d{8}-\d{6}$/);
  });

  it("always starts with the RET- prefix", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateReturnNumber().startsWith("RET-")).toBe(true);
    }
  });

  it("uses today's date in the YYYYMMDD format", () => {
    const num = generateReturnNumber();
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    expect(num).toContain(today);
  });

  it("generates different numbers on consecutive calls (high probability)", () => {
    const nums = new Set<string>();
    for (let i = 0; i < 100; i++) {
      nums.add(generateReturnNumber());
    }
    // With 6 random digits (100000-999999), 100 calls should all be unique.
    expect(nums.size).toBe(100);
  });
});
