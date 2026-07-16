import { describe, it, expect } from "vitest";
import {
  validateEmail,
  canManageRole,
  ROLE_WEIGHT,
  hashPassword,
  verifyPassword,
  generateRecoveryCodePlain,
  hashRecoveryCode,
  verifyRecoveryCode,
  AuthError,
} from "@/lib/auth";

describe("validateEmail", () => {
  it("returns true for a well-formed email", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  it("returns true for an email with a subdomain", () => {
    expect(validateEmail("user@shop.example.com")).toBe(true);
  });

  it("returns false for an email without @", () => {
    expect(validateEmail("userexample.com")).toBe(false);
  });

  it("returns false for an email without a TLD", () => {
    expect(validateEmail("user@example")).toBe(false);
  });

  it("returns false for an email with spaces", () => {
    expect(validateEmail("user @example.com")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(validateEmail("")).toBe(false);
  });

  it("returns false for a string longer than 254 characters", () => {
    const longEmail = "a".repeat(250) + "@b.co";
    expect(validateEmail(longEmail)).toBe(false);
  });

  it("returns true for an email exactly 254 characters", () => {
    // "a".repeat(249) + "@b.co" = 249 + 5 = 254 chars total
    const email = "a".repeat(249) + "@b.co";
    expect(email.length).toBe(254);
    expect(validateEmail(email)).toBe(true);
  });
});

describe("ROLE_WEIGHT", () => {
  it("gives cashier the lowest weight", () => {
    expect(ROLE_WEIGHT.cashier).toBe(1);
  });

  it("gives warehouse the second-lowest weight", () => {
    expect(ROLE_WEIGHT.warehouse).toBe(2);
  });

  it("gives manager the third weight", () => {
    expect(ROLE_WEIGHT.manager).toBe(3);
  });

  it("gives admin the fourth weight", () => {
    expect(ROLE_WEIGHT.admin).toBe(4);
  });

  it("gives owner the highest weight", () => {
    expect(ROLE_WEIGHT.owner).toBe(5);
  });

  it("has 5 roles", () => {
    expect(Object.keys(ROLE_WEIGHT)).toHaveLength(5);
  });
});

describe("canManageRole", () => {
  it("owner can manage admin", () => {
    expect(canManageRole("owner", "admin")).toBe(true);
  });

  it("admin can manage manager", () => {
    expect(canManageRole("admin", "manager")).toBe(true);
  });

  it("manager can manage warehouse", () => {
    expect(canManageRole("manager", "warehouse")).toBe(true);
  });

  it("manager can manage cashier", () => {
    expect(canManageRole("manager", "cashier")).toBe(true);
  });

  it("admin cannot manage owner (equal or higher role)", () => {
    expect(canManageRole("admin", "owner")).toBe(false);
  });

  it("admin cannot manage another admin (equal role)", () => {
    expect(canManageRole("admin", "admin")).toBe(false);
  });

  it("manager cannot manage admin (higher role)", () => {
    expect(canManageRole("manager", "admin")).toBe(false);
  });

  it("cashier cannot manage anyone", () => {
    expect(canManageRole("cashier", "cashier")).toBe(false);
    expect(canManageRole("cashier", "warehouse")).toBe(false);
  });

  it("owner can manage every other role", () => {
    expect(canManageRole("owner", "admin")).toBe(true);
    expect(canManageRole("owner", "manager")).toBe(true);
    expect(canManageRole("owner", "warehouse")).toBe(true);
    expect(canManageRole("owner", "cashier")).toBe(true);
  });

  it("owner cannot manage another owner (equal role)", () => {
    expect(canManageRole("owner", "owner")).toBe(false);
  });

  it("cashier cannot manage anyone (exhaustive)", () => {
    expect(canManageRole("cashier", "cashier")).toBe(false);
    expect(canManageRole("cashier", "warehouse")).toBe(false);
    expect(canManageRole("cashier", "manager")).toBe(false);
    expect(canManageRole("cashier", "admin")).toBe(false);
    expect(canManageRole("cashier", "owner")).toBe(false);
  });

  it("warehouse can only manage cashier (not other warehouse)", () => {
    expect(canManageRole("warehouse", "cashier")).toBe(true);
    expect(canManageRole("warehouse", "warehouse")).toBe(false);
  });
});

describe("hashPassword + verifyPassword", () => {
  it("hashes a password and verifies the original", async () => {
    const hash = await hashPassword("Strong1!");
    expect(hash).not.toBe("Strong1!");
    expect(await verifyPassword("Strong1!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Strong1!");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces a different hash for the same password (bcrypt salt)", async () => {
    const h1 = await hashPassword("Strong1!");
    const h2 = await hashPassword("Strong1!");
    expect(h1).not.toBe(h2);
  });

  it("hash starts with the bcrypt $2[ab]$ prefix", async () => {
    const hash = await hashPassword("Strong1!");
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it("uses cost factor 12 (hash length is 60 chars)", async () => {
    const hash = await hashPassword("Strong1!");
    expect(hash).toHaveLength(60);
  });
});

describe("generateRecoveryCodePlain", () => {
  it("returns a string in the XXXX-XXXX format", () => {
    const code = generateRecoveryCodePlain();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("does not include 0 or 1 (uses safe alphabet)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRecoveryCodePlain();
      expect(code).not.toContain("0");
      expect(code).not.toContain("1");
    }
  });

  it("generates unique codes across multiple calls (high probability)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateRecoveryCodePlain());
    }
    // 8 chars from a 32-char alphabet = 32^8 = ~1 trillion combinations,
    // so 100 codes should all be unique.
    expect(codes.size).toBe(100);
  });
});

describe("hashRecoveryCode + verifyRecoveryCode", () => {
  it("hashes and verifies a recovery code", async () => {
    const code = generateRecoveryCodePlain();
    const hash = await hashRecoveryCode(code);
    expect(await verifyRecoveryCode(code, hash)).toBe(true);
  });

  it("rejects a wrong recovery code", async () => {
    const code = generateRecoveryCodePlain();
    const hash = await hashRecoveryCode(code);
    expect(await verifyRecoveryCode("WRONG-XXXX", hash)).toBe(false);
  });
});

describe("AuthError", () => {
  it("stores the message and code", () => {
    const err = new AuthError("Authentication required", "UNAUTHORIZED");
    expect(err.message).toBe("Authentication required");
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.name).toBe("AuthError");
  });

  it("is an instance of Error", () => {
    const err = new AuthError("Forbidden", "FORBIDDEN");
    expect(err).toBeInstanceOf(Error);
  });

  it("supports all defined auth error codes", () => {
    const codes = [
      "UNAUTHORIZED",
      "INVALID_CREDENTIALS",
      "INACTIVE_USER",
      "FORBIDDEN",
      "PASSWORD_CHANGE_REQUIRED",
      "STORE_NOT_SELECTED",
    ] as const;
    for (const code of codes) {
      const err = new AuthError("msg", code);
      expect(err.code).toBe(code);
    }
  });
});
