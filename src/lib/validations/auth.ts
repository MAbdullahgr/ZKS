import { z } from "zod";

// AUDIT-FIX H-25: Password policy bumped to OWASP-recommended strength.
// Previously: 6 chars + letter + digit (accepts "abc123" — brute-force friendly).
// Now: 8+ chars + at least one letter + at least one digit + at least one
// special char. Max 128 to bound bcrypt cost (bcrypt silently truncates at
// 72 bytes anyway). The regex is intentionally simple — full complexity
// rules hurt UX without meaningfully improving security. The goal is to
// block the top 10k common passwords plus dictionary words, which min-length
// 8 + mixed char classes achieves reasonably.
const passwordComplexityRule = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/,
    "Password must contain at least one letter, one number, and one special character",
  );

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

// AUDIT-FIX H-29: Validate recovery code format — must match the
// XXXX-XXXX pattern produced by generateRecoveryCodePlain (4 chars +
// dash + 4 chars from the safe alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789).
// This prevents bcrypt DoS via arbitrarily long codes and gives early
// rejection of obviously-malformed input.
const RECOVERY_CODE_REGEX = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
export const recoveryCodeSchema = z
  .string()
  .regex(RECOVERY_CODE_REGEX, "Recovery code must be in XXXX-XXXX format")
  .optional();

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
  recoveryCode: recoveryCodeSchema,
  newPassword: passwordComplexityRule.optional(),
});

export const changePasswordSchema = z.object({
  password: passwordComplexityRule,
  oldPassword: z.string().optional(),
});

export const createUserSchema = z.object({
  employeeId: z.string().uuid(),
  email: z.string().email("Invalid email format"),
  role: z.enum(["cashier", "warehouse", "manager", "admin", "owner"]),
  storeId: z.string().uuid().optional(),
});

export const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z
    .enum(["cashier", "warehouse", "manager", "admin", "owner"])
    .optional(),
});

// Export the password rule so the login page can reuse it client-side
// (avoids duplicating the regex in two places).
export { passwordComplexityRule };
