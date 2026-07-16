import { z } from "zod";

export const openRegisterSchema = z.object({
  storeId: z.string().uuid().optional(),
  openingCash: z.number().min(0, "Opening cash cannot be negative").default(0),
  openingNote: z.string().max(500).optional().nullable(),
});

export const closeRegisterSchema = z.object({
  closingCash: z.number().min(0, "Closing cash cannot be negative"),
  closingNote: z.string().max(500).optional().nullable(),
});

export const cashTransactionSchema = z.object({
  type: z.enum(["cash_in", "cash_out"]),
  amount: z.number().positive("Amount must be greater than 0"),
  reason: z
    .string()
    .trim()
    .min(1, "Reason is required")
    .max(200, "Reason must be under 200 characters"),
});
