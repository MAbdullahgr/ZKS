import { z } from "zod";

export const generatePayrollSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

export const updatePayrollSchema = z.object({
  bonus: z.number().min(0).optional(),
  advanceDeduction: z.number().min(0).optional(),
  status: z.enum(["draft", "pending", "paid"]).optional(),
});
