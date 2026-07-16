import { z } from "zod";

// AUDIT-FIX: Pakistan phone regex — 03XXXXXXXXX or +923XXXXXXXXX (11 digits
// after the 0, or 13 with +92 prefix). Rejects strings of all dashes,
// international formats, and obviously-wrong lengths.
const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .optional()
  .nullable()
  .refine(
    (v) => !v || /^(\+92|0)?3\d{9}$/.test(v),
    "Invalid Pakistan phone number (use 03XXXXXXXXX or +923XXXXXXXXX)",
  );

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(100),
  phone: phoneSchema,
  email: z.string().email("Invalid email format").optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  // AUDIT-FIX: Max cap to prevent absurd values.
  creditLimit: z
    .number()
    .min(0, "Credit limit cannot be negative")
    .max(1000000000, "Credit limit cannot exceed Rs. 1 billion")
    .default(0),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const recordKhataSchema = z.object({
  // AUDIT-FIX: Max cap on khata payment amount.
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(1000000000, "Amount cannot exceed Rs. 1 billion"),
  // 'credit' is handled automatically by sales. This route is for manual payments/adjustments.
  type: z.enum(["payment", "advance", "return_credit", "return_cash"]),
  note: z.string().max(500).optional().nullable(),
});
