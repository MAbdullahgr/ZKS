import { NextRequest } from "next/server";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  hashPassword,
  invalidateUserSessions,
  logAudit,
  canManageRole,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

// POST /api/users/[id]/reset-password
// Generates a new temporary password for a staff user. Requires admin+ auth.
// The caller must outrank the target user (canManageRole). The temp password
// is hashed with bcrypt and `mustChangePassword: true` is set so the user is
// forced to pick their own password on next login. The plaintext is returned
// exactly once for the manager to share out-of-band.
export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireAuth("admin");
    const { id } = await params;

    // AUDIT-FIX: Rate-limit per admin userId to prevent a compromised admin
    // session from mass-resetting passwords.
    const rl = await rateLimit("mutation", `${session.userId}:${ip}`);
    if (!rl.success) {
      throw new HttpError(
        "Too many password resets. Please try again later.",
        429,
        "RATE_LIMITED",
        rateLimitHeaders(rl),
      );
    }

    if (session.userId === id) {
      throw new HttpError(
        "Use the change-password option for your own account.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        storeId: true,
        isActive: true,
      },
    });

    if (!targetUser) {
      throw new HttpError("User not found", 404, "NOT_FOUND");
    }

    // Callers can only reset passwords for users they outrank
    if (!canManageRole(session.role, targetUser.role)) {
      throw new HttpError(
        "Cannot reset password for users with equal or higher role",
        403,
        "FORBIDDEN",
      );
    }

    // Managers are restricted to their own store
    if (session.role === "manager" && targetUser.storeId !== session.storeId) {
      throw new HttpError(
        "Can only reset passwords for users in your store",
        403,
        "FORBIDDEN",
      );
    }

    // FIX P1-16: Use cryptographically secure randomInt instead of Math.random().
    // 10 chars from a safe alphabet (no ambiguous chars like O/0, I/l/1).
    const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let tempPassword = "";
    for (let i = 0; i < 10; i++) {
      tempPassword += ALPHABET[randomInt(0, ALPHABET.length)];
    }

    const passwordHash = await hashPassword(tempPassword);

    // AUDIT-FIX H-1: Invalidate all existing sessions for the target user
    // BEFORE updating the password. An admin password reset is a security
    // event — the user's prior sessions (including any stolen JWTs) must be
    // torn down immediately. The user will log in with the temp password
    // and get a fresh session with the new tokenVersion.
    await invalidateUserSessions(id);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    await logAudit({
      userId: session.userId,
      storeId: targetUser.storeId ?? undefined,
      action: "USER_PASSWORD_RESET",
      entityType: "User",
      entityId: id,
      details: {
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        sessionsInvalidated: true,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      tempPassword,
      message:
        "Share this temporary password with the user. They will be prompted to change it on next login.",
    }, undefined, 200, rateLimitHeaders(rl));
  },
);
