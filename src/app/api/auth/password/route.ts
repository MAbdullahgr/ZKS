import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma"; // Fixed top-level import
import {
  requireAuth,
  hashPassword,
  verifyPassword,
  createSession,
  invalidateUserSessions,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { changePasswordSchema } from "@/lib/validations/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

// AUDIT-FIX C-9: Rate-limit password change to prevent brute-force of the
// oldPassword field (relevant if an attacker has a stolen JWT but not the
// password). 10 attempts per 15 min per user+IP — generous enough for
// legitimate typos, tight enough to block brute-force.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireAuth();

  // AUDIT-FIX C-9: Rate-limit per user+IP. Identifier combines userId and
  // IP so a single user can still change password from a new device, but
  // a distributed brute-force against one account is throttled per IP.
  const rl = await rateLimit(
    "passwordChange",
    `${session.userId}:${ip}`,
  );
  if (!rl.success) {
    throw new HttpError(
      "Too many password change attempts. Please try again later.",
      429,
      "RATE_LIMITED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const { password, oldPassword } = changePasswordSchema.parse(body);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { passwordHash: true, mustChangePassword: true },
  });

  if (!user) throw new HttpError("User not found", 404, "NOT_FOUND");

  // Only require old password if NOT in forced-change mode
  if (!user.mustChangePassword) {
    if (!oldPassword)
      throw new HttpError(
        "Current password is required",
        400,
        "VALIDATION_ERROR",
      );

    const oldValid = await verifyPassword(oldPassword, user.passwordHash);
    if (!oldValid)
      throw new HttpError(
        "Current password is incorrect",
        401,
        "INVALID_CREDENTIALS",
      );

    const samePassword = await verifyPassword(password, user.passwordHash);
    if (samePassword)
      throw new HttpError(
        "New password must be different from current password",
        400,
        "VALIDATION_ERROR",
      );
  }

  // AUDIT-FIX H-1: Bump tokenVersion BEFORE updating password — this
  // invalidates all other sessions (stolen JWTs, other devices) immediately.
  // The current session is re-issued below with the new tokenVersion.
  await invalidateUserSessions(session.userId);

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
    },
  });

  // Re-issue session cookie with updated mustChangePassword: false AND
  // the new tokenVersion (incremented by invalidateUserSessions above).
  await createSession(session.userId);

  await logAudit({
    userId: session.userId,
    storeId: session.storeId ?? undefined,
    action: "PASSWORD_CHANGED",
    details: { sessionsInvalidated: true } as unknown as never,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess({ message: "Password updated successfully" }, undefined, 200, rateLimitHeaders(rl));
});
