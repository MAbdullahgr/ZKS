import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  requireStoreId,
  hashPassword,
  verifyPassword,
  createSession,
  invalidateUserSessions,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyPinSchema, changePinSchema } from "@/lib/validations/settings";

// AUDIT-FIX H-21: Removed the `OR: [{ storeId: null, code: "default" }]`
// fallback from all settings lookups. Previously a global "default" settings
// row could match for any store's user — allowing cross-store PIN hash
// match/verify/change. Now every lookup is strictly scoped by storeId.

// GET /api/settings/pin → { hasPin: boolean }
export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  const storeId = requireStoreId(session);
  const settings = await prisma.settings.findFirst({
    where: { storeId },
    select: { pin: true },
  });
  return apiSuccess({ hasPin: !!settings?.pin });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  const storeId = requireStoreId(session);
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const rl = await rateLimit("pin", `${session.userId}-${ip}`);
  if (!rl.success) {
    throw new HttpError(
      "Too many attempts. Please try again later.",
      429,
      "RATE_LIMIT_EXCEEDED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const { pin } = verifyPinSchema.parse(body);

  // AUDIT-FIX H-21: Strict store scoping — no global default fallback.
  const settings = await prisma.settings.findFirst({
    where: { storeId },
    select: { id: true, pin: true },
  });

  if (!settings?.pin) {
    throw new HttpError(
      "No PIN configured. Please contact an admin.",
      400,
      "NO_PIN",
    );
  }

  const valid = await verifyPassword(pin, settings.pin);

  // AUDIT-FIX: Log PIN verify attempts (both success and failure) so
  // brute-force attempts are visible in the audit trail.
  await logAudit({
    userId: session.userId,
    storeId,
    action: valid ? "PIN_VERIFY_SUCCESS" : "PIN_VERIFY_FAILED",
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess({ valid }, undefined, 200, rateLimitHeaders(rl));
});

// PUT — first-time PIN setup
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const session = await requireAuth("admin");
  const storeId = requireStoreId(session);

  const body = await req.json();
  const { newPin } = changePinSchema.pick({ newPin: true }).parse(body);

  let settings = await prisma.settings.findFirst({ where: { storeId } });
  if (settings?.pin) {
    throw new HttpError(
      "A PIN is already configured. Use the change PIN option instead.",
      400,
      "PIN_ALREADY_SET",
    );
  }

  if (settings) {
    await prisma.settings.update({
      where: { id: settings.id },
      data: { pin: await hashPassword(newPin) },
    });
  } else {
    settings = await prisma.settings.create({
      data: {
        code: `store-${storeId}`,
        storeId,
        storeName: "ZKS Store",
        pin: await hashPassword(newPin),
      },
    });
  }

  await logAudit({
    userId: session.userId,
    storeId,
    action: "PIN_SET_INITIAL",
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess({ message: "PIN set successfully" });
});

// PATCH — change existing PIN
//
// AUDIT-FIX C-8: Rate-limit the PIN change endpoint. Previously only the
// POST (verify) was rate-limited; the PATCH (change) verified currentPin
// with NO rate limit — an attacker with a stolen JWT could brute-force the
// 6-digit PIN in minutes. Now both endpoints are rate-limited.
//
// AUDIT-FIX H-1: Invalidate all sessions for the admin after a PIN change.
// A PIN change is a security event — prior sessions (including stolen JWTs)
// must be torn down.
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const session = await requireAuth("admin");
  const storeId = requireStoreId(session);

  // AUDIT-FIX C-8: Rate-limit PIN change — same surface as verify (5/15min).
  const rl = await rateLimit("pin", `${session.userId}-${ip}`);
  if (!rl.success) {
    throw new HttpError(
      "Too many PIN change attempts. Please try again later.",
      429,
      "RATE_LIMIT_EXCEEDED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const { currentPin, newPin } = changePinSchema.parse(body);

  // AUDIT-FIX H-21: Strict store scoping — no global default fallback.
  const settings = await prisma.settings.findFirst({
    where: { storeId },
    select: { id: true, pin: true, storeId: true },
  });

  if (!settings?.pin) {
    throw new HttpError("No PIN configured", 400, "NO_PIN");
  }

  const valid = await verifyPassword(currentPin, settings.pin);
  if (!valid) {
    await logAudit({
      userId: session.userId,
      storeId,
      action: "PIN_CHANGE_FAILED",
      details: { reason: "incorrect_current_pin" },
      ipAddress: ip,
      userAgent,
    });
    throw new HttpError("Current PIN is incorrect", 401, "INVALID_CREDENTIALS");
  }

  await prisma.settings.update({
    where: { id: settings.id },
    data: { pin: await hashPassword(newPin) },
  });

  // AUDIT-FIX H-1: Invalidate all sessions for the admin after a PIN change.
  // The current session is re-issued below with the new tokenVersion.
  await invalidateUserSessions(session.userId);
  // Re-issue the current session so the admin isn't logged out immediately.
  await createSession(session.userId, session.storeId);

  await logAudit({
    userId: session.userId,
    storeId,
    action: "PIN_CHANGED",
    details: { sessionsInvalidated: true } as unknown as never,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess({ message: "PIN updated successfully" }, undefined, 200, rateLimitHeaders(rl));
});
