// src/lib/validations/settings.ts

import { z } from "zod";

export const updateSettingsSchema = z.object({
  storeName: z.string().trim().max(100).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  currency: z.string().trim().max(10).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  displayTaxBreakdown: z.boolean().optional(),
});

// FIX P1-18: Increase minimum PIN length to 6 digits. A 4-digit PIN has only
// 10,000 combinations — with 10 attempts per 15 minutes, it's crackable in
// ~6 days. 6 digits = 1,000,000 combinations = ~1,000 days to crack.
// 4-digit PINs are still accepted for backward compatibility (existing stores
// with 4-digit PINs can still verify), but new PINs must be 6+ digits.
export const verifyPinSchema = z.object({
  pin: z.string().min(4).max(8).regex(/^\d+$/, "PIN must contain only numbers"),
});

// FIX: Removed `confirmPin` and the `.refine` check.
// The frontend handles the confirm check. The backend only needs currentPin and newPin.
export const changePinSchema = z.object({
  currentPin: z.string().min(4).max(8),
  newPin: z
    .string()
    // FIX P1-18: New PINs must be 6-8 digits (existing 4-digit PINs still work
    // for verification, but can't be set as new).
    .min(6, "New PIN must be at least 6 digits")
    .max(8)
    .regex(/^\d+$/, "PIN must contain only numbers"),
});
