import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(100),
  contactPerson: z.string().trim().max(100).optional().nullable(),
  email: z.string().email("Invalid email format").optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const paySupplierSchema = z.object({
  amount: z.number().positive("Payment amount must be greater than 0"),
  note: z.string().max(500).optional().nullable(),
  // FIX: Add type to distinguish between paying them and them refunding us
  type: z.enum(["payment", "debit"]).default("payment"),
});
