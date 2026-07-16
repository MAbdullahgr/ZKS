// src/lib/validations/purchase.ts
import { z } from "zod";

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid("Valid supplier is required"),
  expectedDate: z.string().datetime().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        // FIX: Allow decimals
        quantity: z.number().positive("Quantity must be greater than 0"),
        unitCost: z.number().nonnegative("Unit cost cannot be negative"),
      }),
    )
    .min(1, "At least one item is required"),
});

export const updatePurchaseOrderSchema = z.object({
  status: z
    .enum(["draft", "ordered", "partial", "received", "cancelled"])
    .optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const receivePurchaseOrderSchema = z.object({
  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid(),
        // FIX: Allow decimals
        receivedQty: z
          .number()
          .positive("Received quantity must be at least 1"),
        newCostPrice: z.number().nonnegative().optional(),
      }),
    )
    .min(1, "At least one item must be received"),
});
