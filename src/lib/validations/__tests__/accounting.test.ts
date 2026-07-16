import { describe, it, expect } from "vitest";
import {
  createAccountSchema,
  updateAccountSchema,
  journalLineSchema,
  createJournalEntrySchema,
  reverseJournalEntrySchema,
} from "@/lib/validations/accounting";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("createAccountSchema", () => {
  it("accepts a valid account", () => {
    const r = createAccountSchema.safeParse({
      code: "1000",
      name: "Cash",
      type: "asset",
    });
    expect(r.success).toBe(true);
  });

  it("accepts all 5 account types", () => {
    for (const type of ["asset", "liability", "equity", "revenue", "expense"]) {
      const r = createAccountSchema.safeParse({
        code: "1000",
        name: "X",
        type,
      });
      expect(r.success).toBe(true);
    }
  });

  it("accepts an optional parentId", () => {
    const r = createAccountSchema.safeParse({
      code: "1000",
      name: "Cash",
      type: "asset",
      parentId: validUuid,
    });
    expect(r.success).toBe(true);
  });

  it("defaults openingBalance to 0 when not provided", () => {
    const r = createAccountSchema.parse({
      code: "1000",
      name: "Cash",
      type: "asset",
    });
    expect(r.openingBalance).toBe(0);
  });

  it("rejects a non-numeric code", () => {
    const r = createAccountSchema.safeParse({
      code: "ABC",
      name: "X",
      type: "asset",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty code", () => {
    const r = createAccountSchema.safeParse({
      code: "",
      name: "X",
      type: "asset",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a code longer than 20 chars", () => {
    const r = createAccountSchema.safeParse({
      code: "1".repeat(21),
      name: "X",
      type: "asset",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const r = createAccountSchema.safeParse({
      code: "1000",
      name: "",
      type: "asset",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a name longer than 100 chars", () => {
    const r = createAccountSchema.safeParse({
      code: "1000",
      name: "a".repeat(101),
      type: "asset",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid type", () => {
    const r = createAccountSchema.safeParse({
      code: "1000",
      name: "X",
      type: "income",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative openingBalance", () => {
    const r = createAccountSchema.safeParse({
      code: "1000",
      name: "X",
      type: "asset",
      openingBalance: -100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an openingBalance above 1 billion", () => {
    const r = createAccountSchema.safeParse({
      code: "1000",
      name: "X",
      type: "asset",
      openingBalance: 1_000_000_001,
    });
    expect(r.success).toBe(false);
  });

  it("accepts a non-UUID parentId", () => {
    const r = createAccountSchema.safeParse({
      code: "1000",
      name: "X",
      type: "asset",
      parentId: "nope",
    });
    expect(r.success).toBe(false);
  });
});

describe("updateAccountSchema", () => {
  it("accepts an empty object", () => {
    const r = updateAccountSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts isActive boolean", () => {
    const r = updateAccountSchema.safeParse({ isActive: false });
    expect(r.success).toBe(true);
  });

  it("rejects a negative openingBalance in a partial update", () => {
    const r = updateAccountSchema.safeParse({ openingBalance: -10 });
    expect(r.success).toBe(false);
  });

  it("rejects an openingBalance above 1 billion in a partial update", () => {
    const r = updateAccountSchema.safeParse({
      openingBalance: 1_000_000_001,
    });
    expect(r.success).toBe(false);
  });
});

describe("journalLineSchema", () => {
  it("accepts a debit line", () => {
    const r = journalLineSchema.safeParse({
      accountCode: "1000",
      debit: 100,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a credit line", () => {
    const r = journalLineSchema.safeParse({
      accountCode: "1000",
      credit: 100,
    });
    expect(r.success).toBe(true);
  });

  it("accepts an optional description", () => {
    const r = journalLineSchema.safeParse({
      accountCode: "1000",
      debit: 100,
      description: "Cash sale",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty accountCode", () => {
    const r = journalLineSchema.safeParse({ accountCode: "", debit: 100 });
    expect(r.success).toBe(false);
  });

  it("rejects a negative debit", () => {
    const r = journalLineSchema.safeParse({
      accountCode: "1000",
      debit: -100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative credit", () => {
    const r = journalLineSchema.safeParse({
      accountCode: "1000",
      credit: -100,
    });
    expect(r.success).toBe(false);
  });
});

describe("createJournalEntrySchema", () => {
  function buildValidEntry(overrides: Record<string, unknown> = {}) {
    return {
      description: "Test entry",
      lines: [
        { accountCode: "1000", debit: 100 },
        { accountCode: "4000", credit: 100 },
      ],
      ...overrides,
    };
  }

  it("accepts a valid journal entry", () => {
    const r = createJournalEntrySchema.safeParse(buildValidEntry());
    expect(r.success).toBe(true);
  });

  it("defaults referenceType to 'manual' when not provided", () => {
    const r = createJournalEntrySchema.parse(buildValidEntry());
    expect(r.referenceType).toBe("manual");
  });

  it("accepts all valid reference types", () => {
    for (const referenceType of [
      "sale",
      "sale_return",
      "purchase",
      "expense",
      "payroll",
      "supplier_payment",
      "khata_payment",
      "cash_in",
      "cash_out",
      "manual",
    ]) {
      const r = createJournalEntrySchema.safeParse(
        buildValidEntry({ referenceType }),
      );
      expect(r.success).toBe(true);
    }
  });

  it("rejects an invalid referenceType", () => {
    const r = createJournalEntrySchema.safeParse(
      buildValidEntry({ referenceType: "invalid" }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects an empty description", () => {
    const r = createJournalEntrySchema.safeParse(
      buildValidEntry({ description: "" }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a description longer than 500 chars", () => {
    const r = createJournalEntrySchema.safeParse({
      description: "x".repeat(501),
      lines: [
        { accountCode: "1000", debit: 100 },
        { accountCode: "4000", credit: 100 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects fewer than 2 lines", () => {
    const r = createJournalEntrySchema.safeParse({
      description: "X",
      lines: [{ accountCode: "1000", debit: 100 }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts an optional entryDate (ISO string)", () => {
    const r = createJournalEntrySchema.safeParse(
      buildValidEntry({ entryDate: "2027-01-01T00:00:00.000Z" }),
    );
    expect(r.success).toBe(true);
  });

  it("accepts an optional referenceId", () => {
    const r = createJournalEntrySchema.safeParse(
      buildValidEntry({ referenceId: "sale-123" }),
    );
    expect(r.success).toBe(true);
  });
});

describe("reverseJournalEntrySchema", () => {
  it("accepts a valid reason", () => {
    const r = reverseJournalEntrySchema.safeParse({ reason: "Mistake" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty reason", () => {
    const r = reverseJournalEntrySchema.safeParse({ reason: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a reason longer than 500 chars", () => {
    const r = reverseJournalEntrySchema.safeParse({
      reason: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing reason", () => {
    const r = reverseJournalEntrySchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
