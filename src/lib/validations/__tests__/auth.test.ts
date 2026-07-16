import { describe, it, expect } from "vitest";
import {
  loginSchema,
  forgotPasswordSchema,
  changePasswordSchema,
  createUserSchema,
  updateUserSchema,
  recoveryCodeSchema,
  passwordComplexityRule,
} from "@/lib/validations/auth";

describe("loginSchema", () => {
  it("accepts a valid email + password", () => {
    const r = loginSchema.safeParse({
      email: "user@example.com",
      password: "secret",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const r = loginSchema.safeParse({
      email: "not-an-email",
      password: "secret",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const r = loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing email", () => {
    const r = loginSchema.safeParse({ password: "secret" });
    expect(r.success).toBe(false);
  });

  it("does NOT enforce the complex password policy on login (only min(1))", () => {
    // Login accepts weak passwords — the policy is enforced on change/create.
    const r = loginSchema.safeParse({
      email: "u@e.com",
      password: "weak",
    });
    expect(r.success).toBe(true);
  });
});

describe("passwordComplexityRule", () => {
  it("accepts a strong password (letter + digit + special, 8+)", () => {
    expect(passwordComplexityRule.safeParse("Abcdef1!").success).toBe(true);
  });

  it("rejects a password shorter than 8 chars", () => {
    expect(passwordComplexityRule.safeParse("Ab1!").success).toBe(false);
  });

  it("rejects a password without a digit", () => {
    expect(passwordComplexityRule.safeParse("Abcdefg!").success).toBe(false);
  });

  it("rejects a password without a letter", () => {
    expect(passwordComplexityRule.safeParse("1234567!").success).toBe(false);
  });

  it("rejects a password without a special character", () => {
    expect(passwordComplexityRule.safeParse("Abcdef12").success).toBe(false);
  });

  it("rejects a password longer than 128 chars", () => {
    const long = "Aa1!" + "a".repeat(200);
    expect(passwordComplexityRule.safeParse(long).success).toBe(false);
  });

  it("accepts a password with exactly 8 chars satisfying all rules", () => {
    expect(passwordComplexityRule.safeParse("Abcde1!2").success).toBe(true);
  });

  it("accepts a 128-char password satisfying all rules", () => {
    const pwd = "A1!" + "a".repeat(125);
    expect(pwd.length).toBe(128);
    expect(passwordComplexityRule.safeParse(pwd).success).toBe(true);
  });
});

describe("recoveryCodeSchema", () => {
  it("accepts a well-formatted XXXX-XXXX code", () => {
    expect(recoveryCodeSchema.safeParse("ABCD-2345").success).toBe(true);
  });

  it("accepts undefined (optional)", () => {
    expect(recoveryCodeSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects a code without the dash", () => {
    expect(recoveryCodeSchema.safeParse("ABCD2345").success).toBe(false);
  });

  it("rejects lowercase letters (uses safe alphabet)", () => {
    expect(recoveryCodeSchema.safeParse("abcd-2345").success).toBe(false);
  });

  it("rejects 0 and 1 (not in safe alphabet)", () => {
    expect(recoveryCodeSchema.safeParse("AB01-2345").success).toBe(false);
  });

  it("rejects a code that's too short", () => {
    expect(recoveryCodeSchema.safeParse("AB-2345").success).toBe(false);
  });

  it("rejects a code that's too long", () => {
    expect(recoveryCodeSchema.safeParse("ABCDE-23456").success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts just an email (recoveryCode + newPassword optional)", () => {
    const r = forgotPasswordSchema.safeParse({ email: "u@e.com" });
    expect(r.success).toBe(true);
  });

  it("accepts email + recovery code + new strong password", () => {
    const r = forgotPasswordSchema.safeParse({
      email: "u@e.com",
      recoveryCode: "ABCD-2345",
      newPassword: "Strong1!",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const r = forgotPasswordSchema.safeParse({ email: "nope" });
    expect(r.success).toBe(false);
  });

  it("rejects a weak newPassword when provided", () => {
    const r = forgotPasswordSchema.safeParse({
      email: "u@e.com",
      newPassword: "weak",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed recovery code when provided", () => {
    const r = forgotPasswordSchema.safeParse({
      email: "u@e.com",
      recoveryCode: "garbage",
    });
    expect(r.success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("accepts a strong new password", () => {
    const r = changePasswordSchema.safeParse({ password: "Strong1!" });
    expect(r.success).toBe(true);
  });

  it("accepts an optional oldPassword", () => {
    const r = changePasswordSchema.safeParse({
      password: "Strong1!",
      oldPassword: "oldpass",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing password", () => {
    const r = changePasswordSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects a weak password", () => {
    const r = changePasswordSchema.safeParse({ password: "abc" });
    expect(r.success).toBe(false);
  });
});

describe("createUserSchema", () => {
  it("accepts a valid create-user payload", () => {
    const r = createUserSchema.safeParse({
      employeeId: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
      role: "cashier",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an optional storeId", () => {
    const r = createUserSchema.safeParse({
      employeeId: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
      role: "manager",
      storeId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid employeeId (not a UUID)", () => {
    const r = createUserSchema.safeParse({
      employeeId: "not-a-uuid",
      email: "user@example.com",
      role: "cashier",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = createUserSchema.safeParse({
      employeeId: "550e8400-e29b-41d4-a716-446655440000",
      email: "not-an-email",
      role: "cashier",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid role", () => {
    const r = createUserSchema.safeParse({
      employeeId: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
      role: "superuser",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing role", () => {
    const r = createUserSchema.safeParse({
      employeeId: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-UUID storeId when provided", () => {
    const r = createUserSchema.safeParse({
      employeeId: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
      role: "cashier",
      storeId: "nope",
    });
    expect(r.success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const r = updateUserSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts isActive boolean", () => {
    const r = updateUserSchema.safeParse({ isActive: false });
    expect(r.success).toBe(true);
  });

  it("accepts a valid role", () => {
    const r = updateUserSchema.safeParse({ role: "admin" });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid role", () => {
    const r = updateUserSchema.safeParse({ role: "superuser" });
    expect(r.success).toBe(false);
  });

  it("rejects a non-boolean isActive", () => {
    const r = updateUserSchema.safeParse({ isActive: "yes" });
    expect(r.success).toBe(false);
  });
});
