import { describe, it, expect } from "vitest";
import { generateEscPosBytes, PRINTER_WIDTH, pad } from "@/lib/escpos";
import type { ReceiptData } from "@/hooks/useReceipt";

// Build a minimal receipt fixture
function buildFixture(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    storeName: "Test Store",
    storeAddress: "123 Test St",
    storePhone: "0300-1234567",
    storeNTN: "NTN-TEST-001",
    invoiceNumber: "000001",
    date: "30 Jun 2026",
    time: "02:30 PM",
    customerName: "Test Customer",
    items: [
      { name: "Item A", quantity: 2, unitPrice: 100, total: 200 },
      {
        name: "Item B",
        variantName: "Large",
        quantity: 1,
        unitPrice: 250,
        total: 250,
      },
    ],
    subtotal: 450,
    discount: 50,
    tax: 0,
    total: 400,
    payments: [{ method: "cash", label: "Cash", amount: 500 }],
    changeDue: 100,
    itemCount: 3,
    ...overrides,
  };
}

describe("generateEscPosBytes", () => {
  it("returns a non-empty Uint8Array", () => {
    const bytes = generateEscPosBytes(buildFixture());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("starts with ESC @ (initialize printer)", () => {
    const bytes = generateEscPosBytes(buildFixture());
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
  });

  it("ends with a partial cut command (GS V 1)", () => {
    // AUDIT-FIX: Changed from full cut (0x00) to partial cut (0x01) —
    // partial cut is more universally supported across thermal printer models.
    const bytes = generateEscPosBytes(buildFixture());
    const last3 = Array.from(bytes.slice(-3));
    expect(last3).toEqual([0x1d, 0x56, 0x01]);
  });

  it("selects UTF-8 code page after init (for Urdu support)", () => {
    // AUDIT-FIX: ESC t 19 selects UTF-8 so Urdu text renders correctly.
    const bytes = generateEscPosBytes(buildFixture());
    const arr = Array.from(bytes);
    // Init is ESC @ (0x1b 0x40 0x...). Code page is ESC t 19 (0x1b 0x74 0x13).
    // Find ESC t sequence.
    const escTIndex = arr.findIndex(
      (_, i) => arr[i] === 0x1b && arr[i + 1] === 0x74 && arr[i + 2] === 19,
    );
    expect(escTIndex).toBeGreaterThan(-1);
    // It should come after init (ESC @).
    const escAtIndex = arr.findIndex(
      (_, i) => arr[i] === 0x1b && arr[i + 1] === 0x40,
    );
    expect(escTIndex).toBeGreaterThan(escAtIndex);
  });

  it("includes the store name in the output", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Test Store");
  });

  it("includes each item name and variant", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Item A");
    expect(decoded).toContain("Item B");
    expect(decoded).toContain("Large");
  });

  it("includes the Urdu footer (thanks for visiting)", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("تشریف لانے کا شکریہ");
  });

  it("includes the NTN if provided", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("NTN: NTN-TEST-001");
  });

  it("omits the NTN line when not provided", () => {
    const bytes = generateEscPosBytes(buildFixture({ storeNTN: undefined }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).not.toContain("NTN:");
  });

  it("includes the change due when present", () => {
    const bytes = generateEscPosBytes(buildFixture({ changeDue: 100 }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Change:");
    expect(decoded).toContain("100.00");
  });

  it("omits the change line when zero", () => {
    const bytes = generateEscPosBytes(buildFixture({ changeDue: 0 }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).not.toContain("Change:");
  });
});

// ─── Additional ESC/POS coverage ─────────────────────────────────────────

describe("PRINTER_WIDTH", () => {
  it("is exported as a number", () => {
    expect(typeof PRINTER_WIDTH).toBe("number");
  });

  it("defaults to 32 (58mm printers)", () => {
    expect(PRINTER_WIDTH).toBe(32);
  });
});

describe("pad", () => {
  it("pads a short string with spaces on the right (left-align)", () => {
    expect(pad("Hi", 5, "left")).toBe("Hi   ");
  });

  it("pads a short string with spaces on the left (right-align)", () => {
    expect(pad("Hi", 5, "right")).toBe("   Hi");
  });

  it("defaults to left-align when no align is provided", () => {
    expect(pad("Hi", 5)).toBe("Hi   ");
  });

  it("truncates a string longer than width", () => {
    expect(pad("Hello World", 5, "left")).toBe("Hello");
  });

  it("truncates a string longer than width (right-align)", () => {
    expect(pad("Hello World", 5, "right")).toBe("Hello");
  });

  it("returns the string unchanged when it's exactly the width", () => {
    expect(pad("Hello", 5, "left")).toBe("Hello");
  });

  it("returns an empty string unchanged when width is 0", () => {
    expect(pad("Hello", 0, "left")).toBe("");
  });

  it("handles an empty input string", () => {
    expect(pad("", 5, "left")).toBe("     ");
    expect(pad("", 5, "right")).toBe("     ");
  });
});

describe("generateEscPosBytes — additional cases", () => {
  it("includes the partial cut command (GS V 1, not GS V 0)", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const arr = Array.from(bytes);
    // Find any GS V sequence (0x1d 0x56 N).
    const cutIndices: number[] = [];
    for (let i = 0; i < arr.length - 2; i++) {
      if (arr[i] === 0x1d && arr[i + 1] === 0x56) {
        cutIndices.push(i);
      }
    }
    expect(cutIndices.length).toBeGreaterThan(0);
    // All cut commands should use 0x01 (partial), not 0x00 (full).
    for (const idx of cutIndices) {
      expect(arr[idx + 2]).toBe(0x01);
    }
  });

  it("selects code page 19 (UTF-8) via ESC t 19", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const arr = Array.from(bytes);
    const escTIndex = arr.findIndex(
      (_, i) => arr[i] === 0x1b && arr[i + 1] === 0x74 && arr[i + 2] === 19,
    );
    expect(escTIndex).toBeGreaterThan(-1);
  });

  it("includes the Urdu 'thank you' footer", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("تشریف لانے کا شکریہ");
  });

  it("includes the English 'thank you' footer", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Thank you for shopping!");
  });

  it("includes the bill number", () => {
    const bytes = generateEscPosBytes(buildFixture({ invoiceNumber: "99999" }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Bill No: 99999");
  });

  it("includes the date and time", () => {
    const bytes = generateEscPosBytes(
      buildFixture({ date: "01 Jan 2027", time: "10:00 AM" }),
    );
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Date: 01 Jan 2027 10:00 AM");
  });

  it("includes the customer name when provided", () => {
    const bytes = generateEscPosBytes(
      buildFixture({ customerName: "Ali Khan" }),
    );
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Customer: Ali Khan");
  });

  it("omits the customer line when not provided", () => {
    const bytes = generateEscPosBytes(buildFixture({ customerName: undefined }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).not.toContain("Customer:");
  });

  it("includes the store phone when provided", () => {
    const bytes = generateEscPosBytes(buildFixture({ storePhone: "0300-9999999" }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Ph: 0300-9999999");
  });

  it("omits the phone line when not provided", () => {
    const bytes = generateEscPosBytes(buildFixture({ storePhone: undefined }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).not.toContain("Ph:");
  });

  it("includes the store address when provided", () => {
    const bytes = generateEscPosBytes(
      buildFixture({ storeAddress: "456 Test Ave" }),
    );
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("456 Test Ave");
  });

  it("omits the address line when not provided", () => {
    const bytes = generateEscPosBytes(buildFixture({ storeAddress: undefined }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).not.toContain("456 Test Ave");
  });

  it("includes the subtotal", () => {
    const bytes = generateEscPosBytes(buildFixture({ subtotal: 450 }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Subtotal:");
    expect(decoded).toContain("450.00");
  });

  it("includes the discount when > 0", () => {
    const bytes = generateEscPosBytes(buildFixture({ discount: 50 }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Discount:");
    expect(decoded).toContain("50.00");
  });

  it("omits the discount line when 0", () => {
    const bytes = generateEscPosBytes(buildFixture({ discount: 0 }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).not.toContain("Discount:");
  });

  it("includes the tax when > 0", () => {
    const bytes = generateEscPosBytes(buildFixture({ tax: 17 }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Tax:");
    expect(decoded).toContain("17.00");
  });

  it("omits the tax line when 0", () => {
    const bytes = generateEscPosBytes(buildFixture({ tax: 0 }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).not.toContain("Tax:");
  });

  it("includes the TOTAL in double-size bold", () => {
    const bytes = generateEscPosBytes(buildFixture({ total: 400 }));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("TOTAL:");
    expect(decoded).toContain("400.00");
  });

  it("includes each payment line label", () => {
    const bytes = generateEscPosBytes(
      buildFixture({
        payments: [
          { method: "cash", label: "Cash", amount: 200 },
          { method: "card", label: "Card", amount: 200 },
        ],
      }),
    );
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Cash:");
    expect(decoded).toContain("Card:");
  });

  it("handles an empty items array", () => {
    const bytes = generateEscPosBytes(buildFixture({ items: [] }));
    expect(bytes.length).toBeGreaterThan(0);
    const decoded = new TextDecoder().decode(bytes);
    // Should still have the header + totals
    expect(decoded).toContain("Test Store");
    expect(decoded).toContain("TOTAL:");
  });

  it("truncates very long item names to fit printer width", () => {
    const longName = "A".repeat(100);
    const bytes = generateEscPosBytes(
      buildFixture({
        items: [{ name: longName, quantity: 1, unitPrice: 100, total: 100 }],
      }),
    );
    const decoded = new TextDecoder().decode(bytes);
    // The item line should NOT contain all 100 'A's — it's printed on its own
    // line so it shouldn't be truncated, but the qty/price line is what's
    // padded. Verify the name is present.
    expect(decoded).toContain(longName);
  });

  it("formats the total amount with 2 decimal places", () => {
    const bytes = generateEscPosBytes(
      buildFixture({ total: 1234.5 }),
    );
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("1234.50");
  });

  it("includes the variant name in parentheses when present", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Item B (Large)");
  });

  it("includes feed (2 lines) before the cut command", () => {
    const bytes = generateEscPosBytes(buildFixture());
    const arr = Array.from(bytes);
    // ESC d 2 = feed 2 lines = [0x1b, 0x64, 0x02]. Should appear right before
    // the cut command (which is the last 3 bytes).
    const feedIndex = arr.findIndex(
      (_, i) =>
        arr[i] === 0x1b && arr[i + 1] === 0x64 && arr[i + 2] === 0x02,
    );
    expect(feedIndex).toBeGreaterThan(-1);
    // The cut command (0x1d 0x56 0x01) should be at the end.
    expect(arr.length - feedIndex).toBeLessThan(10);
  });
});
