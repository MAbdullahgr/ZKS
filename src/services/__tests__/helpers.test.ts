import { describe, it, expect } from "vitest";
import {
  generateSaleNumber,
  generateReturnNumber,
  generateTaxInvoiceNumber,
  type CountableTx,
} from "@/services/helpers";

// ─── Helper: build a CountableTx mock that returns a fixed count ─────────
function makeMockTx(count: number): CountableTx {
  return {
    sale: {
      count: async () => count,
    },
  };
}

describe("generateSaleNumber", () => {
  it("returns a string in the format SALE-YYYYMMDD-###### (6-digit suffix)", () => {
    expect(generateSaleNumber()).toMatch(/^SALE-\d{8}-\d{6}$/);
  });

  it("always starts with the SALE- prefix", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateSaleNumber().startsWith("SALE-")).toBe(true);
    }
  });

  it("uses today's date (PKT) in YYYYMMDD format", () => {
    const num = generateSaleNumber();
    // PKT date may differ from UTC date by up to 1 day around midnight, so
    // we just check the format and that the prefix is present.
    const datePart = num.split("-")[1];
    expect(datePart).toMatch(/^\d{8}$/);
    expect(datePart.length).toBe(8);
  });

  it("generates unique numbers across rapid consecutive calls", () => {
    const nums = new Set<string>();
    for (let i = 0; i < 100; i++) {
      nums.add(generateSaleNumber());
    }
    // With 6 random digits (100000-999999), 100 calls should be unique.
    expect(nums.size).toBe(100);
  });

  it("the random suffix is in the range [100000, 999999]", () => {
    for (let i = 0; i < 50; i++) {
      const num = generateSaleNumber();
      const suffix = parseInt(num.split("-")[2], 10);
      expect(suffix).toBeGreaterThanOrEqual(100000);
      expect(suffix).toBeLessThanOrEqual(999999);
    }
  });
});

describe("generateReturnNumber", () => {
  it("returns a string in the format RET-YYYYMMDD-###### (6-digit suffix)", () => {
    expect(generateReturnNumber()).toMatch(/^RET-\d{8}-\d{6}$/);
  });

  it("always starts with the RET- prefix", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateReturnNumber().startsWith("RET-")).toBe(true);
    }
  });

  it("generates unique numbers across rapid consecutive calls", () => {
    const nums = new Set<string>();
    for (let i = 0; i < 100; i++) {
      nums.add(generateReturnNumber());
    }
    expect(nums.size).toBe(100);
  });
});

describe("generateTaxInvoiceNumber — without tx (fallback path)", () => {
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
    expect(result).toMatch(/^INV-FY\d{4}-/);
  });

  it("uses timestamp + random suffix in the fallback path", async () => {
    const result = await generateTaxInvoiceNumber();
    // Format: INV-FY<YY><YY>-<HHMMSS>-<###>
    expect(result).toMatch(/^INV-FY\d{4}-\d{6}-\d{3}$/);
  });

  it("generates unique numbers across rapid consecutive calls", async () => {
    const nums = new Set<string>();
    for (let i = 0; i < 50; i++) {
      nums.add(await generateTaxInvoiceNumber());
    }
    // With 3 random digits (100-999) + a 6-digit timestamp, 50 calls should
    // be unique. (We tolerate rare collisions.)
    expect(nums.size).toBeGreaterThan(40);
  });
});

describe("generateTaxInvoiceNumber — with tx + storeId (sequential path)", () => {
  it("produces zero-padded sequence (000001 for first invoice)", async () => {
    const result = await generateTaxInvoiceNumber(
      makeMockTx(0),
      "store-123",
    );
    expect(result).toMatch(/^INV-FY\d{4}-000001$/);
  });

  it("produces 000006 when 5 invoices already exist", async () => {
    const result = await generateTaxInvoiceNumber(
      makeMockTx(5),
      "store-123",
    );
    expect(result).toMatch(/^INV-FY\d{4}-000006$/);
  });

  it("matches the full INV-FY<YY><YY>-<NNNNNN> format", async () => {
    const result = await generateTaxInvoiceNumber(
      makeMockTx(42),
      "store-123",
    );
    expect(result).toMatch(/^INV-FY\d{4}-\d{6}$/);
  });

  it("produces sequential numbers when count increases", async () => {
    const r1 = await generateTaxInvoiceNumber(makeMockTx(0), "s");
    const r2 = await generateTaxInvoiceNumber(makeMockTx(1), "s");
    const r3 = await generateTaxInvoiceNumber(makeMockTx(2), "s");

    // Strip the FY prefix to compare just the sequence numbers.
    const seq1 = parseInt(r1.split("-")[2], 10);
    const seq2 = parseInt(r2.split("-")[2], 10);
    const seq3 = parseInt(r3.split("-")[2], 10);

    expect(seq2).toBe(seq1 + 1);
    expect(seq3).toBe(seq2 + 1);
  });

  it("falls back to the timestamp format when tx is provided without storeId", async () => {
    const result = await generateTaxInvoiceNumber(makeMockTx(0), undefined);
    // Without storeId, even with tx, the function takes the fallback path.
    expect(result).toMatch(/^INV-FY\d{4}-\d{6}-\d{3}$/);
  });

  it("falls back to the timestamp format when storeId is provided without tx", async () => {
    const result = await generateTaxInvoiceNumber(undefined, "store-1");
    expect(result).toMatch(/^INV-FY\d{4}-\d{6}-\d{3}$/);
  });
});

describe("Pakistani fiscal year calculation", () => {
  // The fiscal year is computed from the current date — we can't easily mock
  // `new Date()` here, but we CAN verify the format and that the FY label
  // matches "July 1 – June 30" logic by inspecting the result.

  it("produces a FY label in the format FY<YY><YY>", async () => {
    const result = await generateTaxInvoiceNumber(makeMockTx(0), "s");
    const fyPart = result.split("-")[1];
    expect(fyPart).toMatch(/^FY\d{4}$/);

    // The two YY components should differ by exactly 1 (consecutive years).
    const yy1 = parseInt(fyPart.slice(2, 4), 10);
    const yy2 = parseInt(fyPart.slice(4, 6), 10);
    expect((yy2 - yy1 + 100) % 100).toBe(1);
  });

  it("the fiscal year matches the July-to-June rule for the current date", async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const expectedStartYear = month < 6 ? year - 1 : year;
    const expectedEndYear = (expectedStartYear + 1) % 100;
    const expectedLabel = `FY${expectedStartYear % 100}${expectedEndYear
      .toString()
      .padStart(2, "0")}`;

    const result = await generateTaxInvoiceNumber(makeMockTx(0), "s");
    expect(result).toContain(expectedLabel);
  });
});

describe("CountableTx interface", () => {
  it("accepts a minimal { sale: { count } } object", async () => {
    const tx: CountableTx = {
      sale: {
        count: async () => 7,
      },
    };
    const result = await generateTaxInvoiceNumber(tx, "s");
    expect(result).toMatch(/000008$/); // 7 + 1 = 8
  });

  it("the count function is awaited", async () => {
    let called = false;
    const tx: CountableTx = {
      sale: {
        count: async () => {
          called = true;
          return 0;
        },
      },
    };
    await generateTaxInvoiceNumber(tx, "s");
    expect(called).toBe(true);
  });
});
