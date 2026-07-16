import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyUser,
  createSession,
  deleteSession,
  getSession,
  hashPassword,
  generateRecoveryCodePlain,
  hashRecoveryCode,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations/auth";
import { Prisma } from "@/generated/prisma/client";

// Helper to generate employee code with proper Prisma type.
// Always uses "EMP-" prefix. Robust against legacy "P-XXXX" codes by querying
// only EMP-prefixed records and falling back to a sequential scan if needed.
async function generateEmployeeCode(
  tx: Prisma.TransactionClient,
): Promise<string> {
  // Find the highest EMP-#### code currently in use
  const lastEmployee = await tx.employee.findFirst({
    where: { employeeCode: { startsWith: "EMP-" } },
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });

  if (!lastEmployee) return "EMP-0001";

  const lastNum = parseInt(lastEmployee.employeeCode.split("-")[1] || "0", 10);
  const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
  return `EMP-${String(nextNum).padStart(4, "0")}`;
}

export const GET = withErrorHandler(async () => {
  const session = await getSession();
  if (!session) throw new HttpError("Unauthorized", 401, "UNAUTHORIZED");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isActive: true, mustChangePassword: true },
  });

  if (!user || !user.isActive) {
    await deleteSession();
    throw new HttpError(
      "Session invalid. Please log in again.",
      401,
      "UNAUTHORIZED",
    );
  }

  return apiSuccess({
    user: { ...session, mustChangePassword: user.mustChangePassword },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const rl = await rateLimit("login", ip);
  if (!rl.success) {
    throw new HttpError(
      "Too many login attempts. Try again in 15 minutes.",
      429,
      "RATE_LIMIT_EXCEEDED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const { email, password } = loginSchema.parse(body);

  const trimmedEmail = email.trim().toLowerCase();

  // First-time setup
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    // Validate password complexity manually for first setup
    if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d\W_]{6,}$/.test(password)) {
      throw new HttpError(
        "Password must be at least 6 characters and contain a letter and a number.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const recoveryCode = generateRecoveryCodePlain();
    const recoveryCodeHash = await hashRecoveryCode(recoveryCode);

    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.user.count();
      if (count > 0)
        throw new HttpError(
          "Setup already completed. Please log in.",
          409,
          "SETUP_DONE",
        );

      // Create or find the default store FIRST (employee needs storeId)
      let store = await tx.store.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (!store) {
        store = await tx.store.create({
          data: { name: "Main Store", type: "retail", isActive: true },
        });
      }

      const employeeCode = await generateEmployeeCode(tx);
      const employee = await tx.employee.create({
        data: {
          storeId: store.id,
          employeeCode,
          name: "Owner",
          jobTitle: "Owner",
          salary: 0,
        },
      });

      const owner = await tx.user.create({
        data: {
          email: trimmedEmail,
          passwordHash: await hashPassword(password),
          recoveryCodeHash,
          role: "owner",
          storeId: store.id,
          isActive: true,
          mustChangePassword: true,
          employeeId: employee.id,
        },
      });

      return { owner, employee, recoveryCode };
    });

    await createSession(result.owner.id);
    await logAudit({
      userId: result.owner.id,
      storeId: result.owner.storeId ?? undefined,
      action: "FIRST_SETUP",
      details: { email: trimmedEmail },
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      {
        message: "First-time setup complete",
        recoveryCode: result.recoveryCode,
        mustChangePassword: true,
        user: {
          id: result.owner.id,
          name: result.employee.name,
          email: result.owner.email,
          role: result.owner.role,
        },
      },
      "Setup successful",
      201,
      rateLimitHeaders(rl),
    );
  }

  // Normal Login
  try {
    const user = await verifyUser(trimmedEmail, password);
    await createSession(user.id);

    await logAudit({
      userId: user.id,
      storeId: user.storeId ?? undefined,
      action: "LOGIN_SUCCESS",
      ipAddress: ip,
      userAgent,
    });

    const employee = user.employeeId
      ? await prisma.employee.findUnique({
          where: { id: user.employeeId },
          select: { name: true },
        })
      : null;

    return apiSuccess({
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        name: employee?.name || "User",
        email: user.email,
        role: user.role,
        storeId: user.storeId,
      },
    }, undefined, 200, rateLimitHeaders(rl));
  } catch (err) {
    await logAudit({
      action: "LOGIN_FAILED",
      details: { email: trimmedEmail },
      ipAddress: ip,
      userAgent,
    });
    throw err;
  }
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const session = await getSession();

  if (session) {
    await logAudit({
      userId: session.userId,
      action: "LOGOUT",
      ipAddress: ip,
      userAgent,
    });
  }

  await deleteSession();
  return apiSuccess({ message: "Logged out successfully" });
});
