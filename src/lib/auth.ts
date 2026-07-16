import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { prisma } from "./prisma";
import { UserRole, Prisma } from "@/generated/prisma/client";
import { logger } from "./logger";

const COOKIE_NAME = "storeos_token";

// FIX: Don't throw at import time — this breaks `next build` which loads all
// modules to collect page data. Instead, use a lazy getter that validates at
// runtime when the secret is actually needed (on the first auth request).
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }
  return secret;
}

export const ROLE_WEIGHT: Record<UserRole, number> = {
  cashier: 1,
  warehouse: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

export interface JWTPayload {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  storeId: string | null;
  mustChangePassword: boolean;
  // AUDIT-FIX H-1: tokenVersion enables session invalidation. Bumped on
  // password reset / PIN change / admin password reset. requireAuth
  // rejects tokens whose tokenVersion doesn't match the DB — closing the
  // "stolen JWT stays valid for 7 days" hole.
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code:
      | "UNAUTHORIZED"
      | "INVALID_CREDENTIALS"
      | "INACTIVE_USER"
      | "FORBIDDEN"
      | "PASSWORD_CHANGE_REQUIRED"
      | "STORE_NOT_SELECTED",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ========================= UTILS =========================

export function canManageRole(myRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_WEIGHT[myRole] > ROLE_WEIGHT[targetRole];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

// ========================= PASSWORD UTILS =========================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ========================= RECOVERY CODE =========================

const RECOVERY_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// NOTE: randomInt is imported at the top of this file (node:crypto).
// FIX P0-10: Recovery codes use crypto.randomInt() instead of Math.random().

export function generateRecoveryCodePlain(): string {
  const part1 = Array.from({ length: 4 }, () =>
    RECOVERY_CODE_CHARS[randomInt(0, RECOVERY_CODE_CHARS.length)],
  ).join("");
  const part2 = Array.from({ length: 4 }, () =>
    RECOVERY_CODE_CHARS[randomInt(0, RECOVERY_CODE_CHARS.length)],
  ).join("");
  return `${part1}-${part2}`;
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code, 12);
}

export async function verifyRecoveryCode(
  code: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

// ========================= USER VERIFICATION =========================

export async function verifyUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { employee: true },
  });

  // AUDIT-FIX H-30: Collapse "user not found" and "wrong password" into the
  // same error. Previously both returned INVALID_CREDENTIALS (good), but the
  // INACTIVE_USER branch returned a distinct "Account is disabled" message —
  // allowing email enumeration of disabled accounts. Now disabled accounts
  // also return INVALID_CREDENTIALS to the client. We audit-log the disabled
  // attempt separately so admins can detect probing.
  if (!user) {
    throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (!user.isActive) {
    // Audit the disabled-account login attempt so probing is detectable,
    // but return the same error as "user not found" to the client.
    await logAudit({
      userId: user.id,
      action: "LOGIN_FAILED_DISABLED_ACCOUNT",
      details: { email: email.toLowerCase().trim() } as unknown as never,
    }).catch(() => {
      // Don't let audit-log failure mask the auth response
    });
    throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  return user;
}

// ========================= SESSION MANAGEMENT =========================

export async function createSession(
  userId: string,
  overrideStoreId?: string | null,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { employee: true },
  });

  if (!user || !user.isActive) {
    throw new AuthError("User inactive", "INACTIVE_USER");
  }

  const displayName = user.employee?.name || user.email.split("@")[0];

  // Resolve active store from override, then StoreAssignment, then null
  let activeStoreId: string | null = null;

  if (overrideStoreId !== undefined) {
    activeStoreId = overrideStoreId;
  } else if (user.employeeId) {
    const assignment = await prisma.storeAssignment.findFirst({
      where: { employeeId: user.employeeId, isActive: true },
      select: { storeId: true },
      orderBy: { createdAt: "desc" },
    });
    activeStoreId = assignment?.storeId ?? null;
  }

  // AUDIT-FIX H-1: Include tokenVersion in the JWT so requireAuth can
  // reject tokens issued before a password/PIN reset.
  const token = jwt.sign(
    {
      userId: user.id,
      name: displayName,
      email: user.email,
      role: user.role,
      storeId: activeStoreId,
      mustChangePassword: user.mustChangePassword,
      tokenVersion: user.tokenVersion,
    },
    getJwtSecret(),
    { expiresIn: "7d" },
  );

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return token;
}

export async function getSession(): Promise<JWTPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = jwt.verify(token, getJwtSecret()) as JWTPayload;
    return payload;
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ========================= AUTHORIZATION =========================

export async function requireAuth(minRole?: UserRole): Promise<JWTPayload> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Authentication required", "UNAUTHORIZED");
  }

  // AUDIT-FIX H-1: Fetch tokenVersion alongside isActive/role so we can
  // reject tokens issued before a password/PIN reset. Without this check,
  // a stolen JWT stays valid for the full 7-day expiry even after the
  // user changes their password.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isActive: true, role: true, tokenVersion: true },
  });

  if (!user || !user.isActive) {
    await deleteSession();
    throw new AuthError(
      "Account is disabled or does not exist",
      "UNAUTHORIZED",
    );
  }

  // AUDIT-FIX H-1: Reject tokens with a stale tokenVersion. The user's
  // password/PIN was changed after this token was issued — force re-login.
  if (session.tokenVersion !== user.tokenVersion) {
    await deleteSession();
    throw new AuthError(
      "Your session is no longer valid. Please log in again.",
      "UNAUTHORIZED",
    );
  }

  if (user.role !== session.role) {
    await createSession(user.id);
  }

  if (minRole && ROLE_WEIGHT[session.role] < ROLE_WEIGHT[minRole]) {
    throw new AuthError(
      "You do not have permission to perform this action",
      "FORBIDDEN",
    );
  }

  return session;
}

// AUDIT-FIX H-1: Helper to bump tokenVersion — invalidates all existing
// JWTs for the user. Call this whenever a credential changes:
//   - password change (self)
//   - password reset via recovery code
//   - admin password reset
//   - PIN change
//   - account reactivation (optional — only if you want to invalidate
//     tokens issued while the account was disabled)
export async function invalidateUserSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

// ========================= STORE ACCESS =========================
//
// CRITICAL: Multi-store isolation is a security boundary, not a convenience.
//
// - Owners/admins CAN see cross-store data, but only via the explicit
//   `getStoreFilterOrNull()` helper on endpoints that legitimately aggregate
//   (e.g. owner dashboard). Most endpoints should still scope to a single
//   store — the owner must pick one via /api/auth/store PATCH first.
//
// - Every other role MUST have a storeId. If they don't, it's a configuration
//   error and we fail closed (403) rather than silently leaking all stores'
//   data.
//
// Use `getStoreFilter(session)` for any endpoint that mutates or lists
// store-scoped data (sales, expenses, register sessions, etc.).
//
// Use `getStoreFilterOrNull(session)` ONLY for endpoints that explicitly
// aggregate across stores (owner reports, audit log overview). Document why.

/**
 * Returns `{ storeId: string | undefined }` — used for READ routes where
 * owner/admin in "All Stores" mode should see data from all stores.
 *
 * When storeId is undefined, Prisma ignores it in the where clause —
 * so the query returns data from ALL stores.
 *
 * Non-owners MUST have a store assigned (throws if not).
 */
export function getStoreFilter(session: JWTPayload): {
  storeId: string | undefined;
} {
  if (session.role === "owner" || session.role === "admin") {
    return { storeId: session.storeId ?? undefined };
  }

  if (!session.storeId) {
    throw new AuthError(
      "Your account is not assigned to a store. Please contact an administrator.",
      "FORBIDDEN",
    );
  }

  return { storeId: session.storeId };
}

/**
 * For routes that CREATE or MUTATE records — storeId is REQUIRED.
 * Throws if owner/admin is in "All Stores" mode (storeId is undefined).
 * Use this on ALL POST/PATCH/DELETE routes that write store-scoped data.
 */
export function requireStoreId(session: JWTPayload): string {
  if (session.storeId) return session.storeId;

  if (session.role !== "owner" && session.role !== "admin") {
    throw new AuthError(
      "Your account is not assigned to a store. Please contact an administrator.",
      "FORBIDDEN",
    );
  }

  throw new AuthError(
    "Please select a specific store before performing this action. 'All Stores' mode is view-only.",
    "STORE_NOT_SELECTED",
  );
}

/**
 * Returns `{ storeId: string } | undefined` — used ONLY on endpoints that
 * legitimately aggregate across all stores (owner dashboard, audit log
 * overview, cross-store reports). Owners with no store selected get
 * `undefined` (no filter applied → all stores).
 *
 * Non-owners still get their store filter; they can never see cross-store.
 */
export function getStoreFilterOrNull(
  session: JWTPayload,
): { storeId: string } | undefined {
  if (session.role === "owner" || session.role === "admin") {
    return session.storeId ? { storeId: session.storeId } : undefined;
  }
  if (!session.storeId) {
    throw new AuthError(
      "Your account is not assigned to a store. Please contact an administrator.",
      "FORBIDDEN",
    );
  }
  return { storeId: session.storeId };
}

/**
 * Resolves a target storeId for endpoints where the owner/admin hasn't picked
 * a store but we need one (e.g. creating a sale). Falls back to the first
 * active store. Use sparingly — prefer forcing the user to pick a store.
 *
 * Returns the storeId, or throws if no active store exists.
 */
export async function resolveStoreId(session: JWTPayload): Promise<string> {
  if (session.storeId) return session.storeId;

  if (session.role !== "owner" && session.role !== "admin") {
    throw new AuthError(
      "Your account is not assigned to a store. Please contact an administrator.",
      "FORBIDDEN",
    );
  }

  // Owner/admin without a store picked — fall back to first active store
  const firstStore = await prisma.store.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!firstStore) {
    throw new AuthError(
      "No active store found in the system. Please create a store first.",
      "FORBIDDEN",
    );
  }

  return firstStore.id;
}

// ========================= USER MANAGEMENT =========================

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  createdById: string;
  employeeId?: string;
}) {
  if (!validateEmail(data.email)) {
    throw new Error("Invalid email format");
  }

  const existing = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase().trim() },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Email already in use");
  }

  const passwordHash = await hashPassword(data.password);

  return prisma.user.create({
    data: {
      email: data.email.toLowerCase().trim(),
      passwordHash,
      role: data.role,
      createdById: data.createdById,
      employeeId: data.employeeId,
      mustChangePassword: true,
      isActive: true,
    },
  });
}

export async function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });
}

// ========================= AUDIT LOGGING =========================

export async function logAudit(data: {
  userId?: string;
  storeId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        storeId: data.storeId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        details: data.details ?? {},
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  } catch (err) {
    // FIX P2-4: Audit failures must not break user-facing operations, but
    // they SHOULD be logged so silent audit gaps are detectable. The old
    // code swallowed errors completely — no log, no alert, no way to know
    // audit logging was broken.
    //
    // INFRA: Routed through the structured logger so audit-failure entries
    // show up as parseable JSON in log aggregators (with action + storeId
    // context attached, not just the raw error).
    logger.error("AUDIT_LOG_WRITE_FAILED", {
      action: data.action,
      storeId: data.storeId ?? null,
      userId: data.userId ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const requireOwner = () => requireAuth("owner");
export const requireAdmin = () => requireAuth("admin");
export const requireManager = () => requireAuth("manager");
export const requireWarehouse = () => requireAuth("warehouse");
export const requireCashier = () => requireAuth("cashier");
