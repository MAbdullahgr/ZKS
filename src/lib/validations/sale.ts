import { z } from "zod";

// Replace the items array inside createSaleSchema with this:

export const createSaleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        // FIX: Allow decimals (up to 3 decimal places) for weighed goods like vegetables and grains
        quantity: z
          .number()
          .positive("Quantity must be greater than 0")
          .multipleOf(0.001, "Max 3 decimal places allowed"),
        // AUDIT-FIX (5-a #12): price must be > 0 — a zero price lets inventory
        // leave the store with no revenue recorded (free-goods fraud vector).
        price: z.number().positive("Price must be greater than 0"),
        note: z.string().max(255).optional().nullable(),
        variantId: z.string().uuid().optional().nullable(),
      }),
    )
    .min(1, "Cart cannot be empty"),

  // ... rest of the schema remains the same
  paymentLines: z
    .array(
      z.object({
        method: z.enum(["cash", "card", "mobile", "credit", "khata", "easypaisa", "jazzcash"]),
        amount: z.number().nonnegative("Payment amount cannot be negative"),
      }),
    )
    .min(1, "At least one payment method is required"),

  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  discount: z.number().min(0, "Discount cannot be negative").default(0),
  tax: z.number().min(0, "Tax cannot be negative").default(0),
  notes: z.string().max(1000).optional().nullable(),
  registerSessionId: z
    .string()
    .uuid({ message: "Active register session is required" }),
  idempotencyKey: z
    .string()
    .min(10, "Idempotency key is required to prevent duplicate sales"),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

// Add to src/lib/validations/sale.ts

export const processReturnSchema = z.object({
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        productId: z.string().uuid(),
        // AUDIT-FIX (5-a #3): Allow decimals (up to 3 dp) to match the sale
        // schema — without this, weighed goods (rice, vegetables, meat, fabric)
        // purchased by the kilo CANNOT be returned. Retail-blocking bug.
        quantity: z
          .number()
          .positive("Return quantity must be greater than 0")
          .multipleOf(0.001, "Max 3 decimal places allowed"),
        unitPrice: z.number().nonnegative("Unit price cannot be negative"),
      }),
    )
    .min(1, "At least one item must be returned"),
  refundLines: z
    .array(
      z.object({
        method: z.enum(["cash", "card", "mobile", "credit", "khata", "easypaisa", "jazzcash"]),
        amount: z.number().nonnegative("Refund amount cannot be negative"),
      }),
    )
    .min(1, "At least one refund method is required"),
  reason: z.string().max(500).optional().nullable(),
  registerSessionId: z.string().uuid().optional().nullable(),
  // AUDIT-FIX (5-a #7): idempotency key so a client retry after a network
  // timeout can't create a duplicate SaleReturn (double refund + double
  // stock restore). Mirrors the createSale idempotency pattern.
  idempotencyKey: z.string().min(10).optional().nullable(),
});
