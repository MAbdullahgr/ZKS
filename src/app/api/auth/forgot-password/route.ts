import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  hashRecoveryCode,
  verifyRecoveryCode,
  invalidateUserSessions,
  logAudit,
} from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validations/auth";

// AUDIT-FIX (5-b MEDIUM-4): Pre-computed dummy bcrypt hash so the timing of
// the recovery-code verification step is identical whether or not the user
// exists. Previously a non-existent user returned "Invalid recovery code" in
// ~1ms (no bcrypt.compare), while an existing user with a wrong code took
// ~50-100ms (bcrypt cost 12) — a measurable timing side-channel that enabled
// user enumeration despite identical response bodies. This hash never matches
// any real code (it's a hash of a random 32-byte string), but bcrypt still
// runs the full comparison, equalizing timing.
const DUMMY_RECOVERY_HASH = hashRecoveryCode(
  "zks-dummy-recovery-code-never-matches-9f3a7c2e1b8d4a6f",
);

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const rl = await rateLimit("recovery", ip);
  if (!rl.success) {
    throw new HttpError(
      "Too many recovery attempts. Try again in 15 minutes.",
      429,
      "RATE_LIMIT_EXCEEDED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const { email, recoveryCode, newPassword } = forgotPasswordSchema.parse(body);

  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // FIX P1-17: Prevent user enumeration. The old code threw 404 "User not
  // found" if the email didn't exist, which let attackers enumerate valid
  // emails. Now we return the same response shape regardless of whether the
  // user exists. Invalid users get a "hasRecoveryCode: true" response so the
  // attacker can't distinguish valid from invalid emails. The recovery code
  // verification step always returns "Invalid recovery code" for non-existent
  // users, same as for existing users with a wrong code.
  const userExists = !!user && user.isActive;

  // AUDIT-FIX H-29: Reject recovery codes older than 90 days. Long-lived
  // recovery codes are effectively secondary passwords that never rotate.
  const RECOVERY_CODE_MAX_AGE_DAYS = 90;
  const RECOVERY_CODE_MAX_AGE_MS = RECOVERY_CODE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const isRecoveryCodeExpired = (generatedAt: Date | null): boolean => {
    if (!generatedAt) return false; // NULL = legacy code, no expiry enforced
    return Date.now() - generatedAt.getTime() > RECOVERY_CODE_MAX_AGE_MS;
  };

  // Step 1: Check if user has recovery code set
  if (!recoveryCode) {
    // AUDIT-FIX (5-b MEDIUM-2): Normalize ALL step-1 responses to the SAME
    // shape — {hasRecoveryCode:true, message:null} — regardless of whether
    // the user exists, has a code, or has an expired code. Previously the
    // distinct messages ("Please contact your manager..." / "Your recovery
    // code has expired...") let an attacker enumerate (a) users without a
    // recovery code and (b) users with an expired code. The "contact manager"
    // / "expired" messaging now only appears in step 2 (after the recovery
    // code is submitted), where the user is effectively authenticated.
    return apiSuccess(
      {
        hasRecoveryCode: true,
        message: null,
      },
      undefined,
      200,
      rateLimitHeaders(rl),
    );
  }

  // Step 2: Verify recovery code and reset password
  // AUDIT-FIX (5-b MEDIUM-4): Always run a bcrypt compare (against a dummy
  // hash when the user doesn't exist or has no code) so the response timing
  // is indistinguishable. Previously the non-existent-user path returned
  // "Invalid recovery code" in ~1ms while the existing-user-wrong-code path
  // took ~50-100ms — a timing side-channel for enumeration.
  const hashToVerify =
    userExists && user!.recoveryCodeHash
      ? user!.recoveryCodeHash
      : await DUMMY_RECOVERY_HASH;
  const valid = await verifyRecoveryCode(recoveryCode, hashToVerify);

  if (!userExists || !user!.recoveryCodeHash || !valid) {
    // All three failure cases return the identical error + (roughly) identical
    // timing thanks to the dummy bcrypt compare above.
    if (userExists) {
      await logAudit({
        userId: user!.id,
        action: "RECOVERY_CODE_FAILED",
        details: { email: normalizedEmail },
        ipAddress: ip,
        userAgent,
      }).catch(() => {});
    }
    throw new HttpError("Invalid recovery code", 400, "INVALID_CODE");
  }

  // AUDIT-FIX H-29: Reject expired recovery codes.
  if (isRecoveryCodeExpired(user!.recoveryCodeGeneratedAt)) {
    throw new HttpError(
      "Recovery code has expired. Please contact your manager or owner to reset your password.",
      400,
      "RECOVERY_CODE_EXPIRED",
    );
  }

  if (!newPassword) {
    throw new HttpError("New password is required", 400, "VALIDATION_ERROR");
  }

  // AUDIT-FIX H-1: Invalidate all existing sessions (stolen JWTs, other
  // devices) BEFORE updating the password. A recovery-code reset is a
  // security event — every prior session must be torn down.
  await invalidateUserSessions(user!.id);

  // CRITICAL: Invalidate recovery code so it cannot be reused.
  // AUDIT-FIX H-29: Clear recoveryCodeGeneratedAt too so the next code
  // (when generated) starts fresh.
  await prisma.user.update({
    where: { id: user!.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      recoveryCodeHash: null,
      recoveryCodeGeneratedAt: null,
      mustChangePassword: false,
    },
  });

  await logAudit({
    userId: user!.id,
    action: "PASSWORD_RESET",
    details: {
      method: "recovery_code",
      sessionsInvalidated: true,
    } as unknown as never,
    ipAddress: ip,
    userAgent,
  });

  // AUDIT-FIX C-17: Send email notification so the user knows their password
  // was reset. If their email was compromised, this gives them a chance to
  // notice and contact the manager. Silently skipped if email isn't configured.
  await sendPasswordResetEmail(user!.email, "recovery_code").catch(() => {
    // Don't fail the reset if email fails — the password is already changed.
  });

  return apiSuccess({
    message: "Password reset successfully. You can now log in.",
  }, undefined, 200, rateLimitHeaders(rl));
});
