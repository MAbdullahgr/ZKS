import { describe, it, expect } from "vitest";
import {
  generateSaleNumber,
  generateReturnNumber,
  generateTaxInvoiceNumber,
} from "@/services/helpers";

describe("saleService — generateSaleNumber", () => {
  it("returns a string in the format SALE-YYYYMMDD-######", () => {
    const num = generateSaleNumber();
    // FIX: Updated to expect 6 digits (was 4) after P2-3 fix.
    expect(num).toMatch(/^SALE-\d{8}-\d{6}$/);
  });

  it("generates different numbers on consecutive calls (high probability)", () => {
    const nums = new Set<string>();
    for (let i = 0; i < 100; i++) {
      nums.add(generateSaleNumber());
    }
    // With 6 random digits (100000-999999), 100 calls should produce 100 unique
    expect(nums.size).toBe(100);
  });

  it("always starts with the SALE- prefix", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateSaleNumber().startsWith("SALE-")).toBe(true);
    }
  });

  it("uses today's date in the YYYYMMDD format", () => {
    const num = generateSaleNumber();
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    expect(num).toContain(today);
  });
});

describe("saleService — generateTaxInvoiceNumber", () => {
  // AUDIT-FIX C-16: Tests updated for the new FBR-compliant sequential
  // format: INV-FY<YY><YY>-<NNNNNN>. When a tx + storeId are passed,
  // the number is sequential (COUNT + 1). Without tx, falls back to
  // INV-FY<YY><YY>-<HHMMSS>-<###> (non-sequential, for backwards compat).

  it("returns a string", async () => {
    const result = await generateTaxInvoiceNumber();
    expect(typeof result).toBe("string");
  });

  it("starts with INV- prefix", async () => {
    const result = await generateTaxInvoiceNumber();
    expect(result.startsWith("INV-")).toBe(true);
  });

  it("includes the Pakistani fiscal year (FY<YY><YY>) in the format", async () => {
    const result = await generateTaxInvoiceNumber();
    // Format: INV-FY2526-... or INV-FY2627-... depending on current date
    // Fiscal year July 1 – June 30: Jan-Jun uses previous year's FY.
    expect(result).toMatch(/^INV-FY\d{4}-/);
  });

  it("produces sequential numbers when tx + storeId are provided", async () => {
    // Mock tx that counts sales — simulates 5 existing invoices.
    const mockTx = {
      sale: {
        count: async () => 5,
      },
    };
    const result = await generateTaxInvoiceNumber(mockTx as never, "store-123");
    // 5 existing + 1 = 6th invoice, zero-padded to 6 digits.
    expect(result).toMatch(/^INV-FY\d{4}-000006$/);
  });

  it("produces zero-padded sequence (000001 for first invoice)", async () => {
    const mockTx = {
      sale: {
        count: async () => 0,
      },
    };
    const result = await generateTaxInvoiceNumber(mockTx as never, "store-123");
    expect(result).toMatch(/^INV-FY\d{4}-000001$/);
  });

  it("matches the full INV-FY<YY><YY>-<NNNNNN> format when tx is provided", async () => {
    const mockTx = {
      sale: {
        count: async () => 42,
      },
    };
    const result = await generateTaxInvoiceNumber(mockTx as never, "store-123");
    expect(result).toMatch(/^INV-FY\d{4}-\d{6}$/);
  });

  it("generates unique numbers across rapid consecutive calls", async () => {
    const nums = new Set<string>();
    for (let i = 0; i < 50; i++) {
      nums.add(await generateTaxInvoiceNumber());
    }
    // With 3 random digits (100-999), 50 calls should produce ~50 unique
    expect(nums.size).toBeGreaterThan(40);
  });
});

describe("saleService — generateReturnNumber", () => {
  it("returns a string in the format RET-YYYYMMDD-######", () => {
    const num = generateReturnNumber();
    // FIX: Updated to expect 6 digits (was 4) after P2-3 fix.
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
});
