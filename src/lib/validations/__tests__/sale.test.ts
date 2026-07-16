import { describe, it, expect } from "vitest";
import { createSaleSchema, processReturnSchema } from "@/lib/validations/sale";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("createSaleSchema", () => {
  function buildValidSale(overrides: Record<string, unknown> = {}) {
    return {
      items: [{ productId: validUuid, quantity: 1, price: 100 }],
      paymentLines: [{ method: "cash", amount: 100 }],
      registerSessionId: validUuid,
      idempotencyKey: "0123456789ab",
      ...overrides,
    };
  }

  it("accepts a valid minimal sale", () => {
    const r = createSaleSchema.safeParse(buildValidSale());
    expect(r.success).toBe(true);
  });

  it("accepts decimal quantities with up to 3 decimal places", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({
        items: [{ productId: validUuid, quantity: 1.234, price: 100 }],
      }),
    );
    expect(r.success).toBe(true);
  });

  it("rejects a quantity with more than 3 decimal places", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({
        items: [{ productId: validUuid, quantity: 1.2345, price: 100 }],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive quantity (zero)", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({
        items: [{ productId: validUuid, quantity: 0, price: 100 }],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a negative price", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({
        items: [{ productId: validUuid, quantity: 1, price: -100 }],
      }),
    );
    expect(r.success).toBe(false);
  });

  // AUDIT-FIX (5-a #12): price=0 is now REJECTED (was allowed). A zero price
  // let inventory leave the store with no revenue recorded — a free-goods
  // fraud vector. The schema changed from .nonnegative() to .positive().
  it("rejects a zero price (free-goods fraud prevention)", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({
        items: [{ productId: validUuid, quantity: 1, price: 0 }],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects an empty items array", () => {
    const r = createSaleSchema.safeParse(buildValidSale({ items: [] }));
    expect(r.success).toBe(false);
  });

  it("rejects an empty paymentLines array", () => {
    const r = createSaleSchema.safeParse(buildValidSale({ paymentLines: [] }));
    expect(r.success).toBe(false);
  });

  it("rejects an invalid payment method", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({
        paymentLines: [{ method: "bitcoin", amount: 100 }],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a negative payment amount", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({
        paymentLines: [{ method: "cash", amount: -50 }],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("accepts all five valid payment methods", () => {
    for (const method of ["cash", "card", "mobile", "credit", "khata"]) {
      const r = createSaleSchema.safeParse(
        buildValidSale({
          paymentLines: [{ method, amount: 100 }],
        }),
      );
      expect(r.success).toBe(true);
    }
  });

  it("rejects a non-UUID productId", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({
        items: [{ productId: "nope", quantity: 1, price: 100 }],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a non-UUID registerSessionId", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({ registerSessionId: "nope" }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a missing registerSessionId", () => {
    const { registerSessionId: _omit, ...rest } = buildValidSale();
    const r = createSaleSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects an idempotencyKey shorter than 10 chars", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({ idempotencyKey: "short" }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a missing idempotencyKey", () => {
    const { idempotencyKey: _omit, ...rest } = buildValidSale();
    const r = createSaleSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("defaults discount + tax to 0 when not provided", () => {
    const r = createSaleSchema.parse(buildValidSale());
    expect(r.discount).toBe(0);
    expect(r.tax).toBe(0);
  });

  it("rejects a negative discount", () => {
    const r = createSaleSchema.safeParse(buildValidSale({ discount: -10 }));
    expect(r.success).toBe(false);
  });

  it("rejects a negative tax", () => {
    const r = createSaleSchema.safeParse(buildValidSale({ tax: -5 }));
    expect(r.success).toBe(false);
  });

  it("accepts an optional customerId", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({ customerId: validUuid }),
    );
    expect(r.success).toBe(true);
  });

  it("accepts an optional variantId on items", () => {
    const r = createSaleSchema.safeParse(
      buildValidSale({
        items: [
          {
            productId: validUuid,
            quantity: 1,
            price: 100,
            variantId: validUuid,
          },
        ],
      }),
    );
    expect(r.success).toBe(true);
  });
});

describe("processReturnSchema", () => {
  function buildValidReturn(overrides: Record<string, unknown> = {}) {
    return {
      items: [
        {
          saleItemId: validUuid,
          productId: validUuid,
          quantity: 1,
          unitPrice: 100,
        },
      ],
      refundLines: [{ method: "cash", amount: 100 }],
      ...overrides,
    };
  }

  it("accepts a valid minimal return", () => {
    const r = processReturnSchema.safeParse(buildValidReturn());
    expect(r.success).toBe(true);
  });

  // AUDIT-FIX (5-a #3): Fractional return quantities are now ACCEPTED (was
  // rejected by .int()). Weighed goods (rice, vegetables, meat, fabric) sold
  // by the kilo couldn't be returned — retail-blocking. The schema changed
  // from .int() to .multipleOf(0.001) to match createSaleSchema.
  it("accepts a fractional return quantity (weighed goods)", () => {
    const r = processReturnSchema.safeParse(
      buildValidReturn({
        items: [
          {
            saleItemId: validUuid,
            productId: validUuid,
            quantity: 1.5,
            unitPrice: 100,
          },
        ],
      }),
    );
    expect(r.success).toBe(true);
  });

  it("rejects a zero return quantity", () => {
    const r = processReturnSchema.safeParse(
      buildValidReturn({
        items: [
          {
            saleItemId: validUuid,
            productId: validUuid,
            quantity: 0,
            unitPrice: 100,
          },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a negative unitPrice", () => {
    const r = processReturnSchema.safeParse(
      buildValidReturn({
        items: [
          {
            saleItemId: validUuid,
            productId: validUuid,
            quantity: 1,
            unitPrice: -100,
          },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects an empty items array", () => {
    const r = processReturnSchema.safeParse(buildValidReturn({ items: [] }));
    expect(r.success).toBe(false);
  });

  it("rejects an empty refundLines array", () => {
    const r = processReturnSchema.safeParse(
      buildValidReturn({ refundLines: [] }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a negative refund amount", () => {
    const r = processReturnSchema.safeParse(
      buildValidReturn({
        refundLines: [{ method: "cash", amount: -50 }],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("accepts zero as a valid refund amount", () => {
    const r = processReturnSchema.safeParse(
      buildValidReturn({
        refundLines: [{ method: "cash", amount: 0 }],
      }),
    );
    expect(r.success).toBe(true);
  });

  it("accepts an optional reason", () => {
    const r = processReturnSchema.safeParse(
      buildValidReturn({ reason: "Defective" }),
    );
    expect(r.success).toBe(true);
  });

  it("accepts an optional registerSessionId", () => {
    const r = processReturnSchema.safeParse(
      buildValidReturn({ registerSessionId: validUuid }),
    );
    expect(r.success).toBe(true);
  });

  it("rejects an invalid refund method", () => {
    const r = processReturnSchema.safeParse(
      buildValidReturn({
        refundLines: [{ method: "bitcoin", amount: 100 }],
      }),
    );
    expect(r.success).toBe(false);
  });
});
