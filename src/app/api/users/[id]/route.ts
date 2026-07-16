import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  setUserActive,
  logAudit,
  canManageRole,
} from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateUserSchema } from "@/lib/validations/auth";
import { getClientIp } from "@/lib/rate-limit";

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const session = await requireAuth("manager");
    const { id } = await params;

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLogin: true,
        createdAt: true,
        employeeId: true,
        storeId: true,
        employee: {
          select: {
            id: true,
            name: true,
            phone: true,
            jobTitle: true,
            cnic: true,
            isActive: true,
          },
        },
      },
    });

    if (!targetUser) throw new HttpError("User not found", 404, "NOT_FOUND");

    if (
      !canManageRole(session.role, targetUser.role) &&
      session.userId !== targetUser.id
    ) {
      throw new HttpError(
        "Cannot view users with equal or higher role",
        403,
        "FORBIDDEN",
      );
    }

    if (session.role === "manager" && targetUser.storeId !== session.storeId) {
      throw new HttpError(
        "Can only view users in your store",
        403,
        "FORBIDDEN",
      );
    }

    return apiSuccess({ user: targetUser });
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireAuth("admin");
    const { id } = await params;

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, storeId: true, isActive: true },
    });

    if (!targetUser) throw new HttpError("User not found", 404, "NOT_FOUND");

    if (
      !canManageRole(session.role, targetUser.role) &&
      session.userId !== targetUser.id
    ) {
      throw new HttpError(
        "Cannot modify users with equal or higher role",
        403,
        "FORBIDDEN",
      );
    }

    if (session.role === "manager" && targetUser.storeId !== session.storeId) {
      throw new HttpError(
        "Can only manage users in your store",
        403,
        "FORBIDDEN",
      );
    }

    const body = await req.json();
    const { isActive, role } = updateUserSchema.parse(body);

    const updateData: Prisma.UserUpdateInput = {};

    if (typeof isActive === "boolean") updateData.isActive = isActive;

    if (role) {
      if (!canManageRole(session.role, role)) {
        throw new HttpError(
          "Cannot assign equal or higher role",
          403,
          "FORBIDDEN",
        );
      }
      updateData.role = role;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({ where: { id }, data: updateData });
    }

    let auditAction = "USER_UPDATED";
    if (typeof isActive === "boolean")
      auditAction = isActive ? "USER_ENABLED" : "USER_DISABLED";

    await logAudit({
      userId: session.userId,
      storeId: targetUser.storeId ?? undefined,
      action: auditAction,
      entityType: "User",
      entityId: id,
      details: { updates: updateData } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "User updated successfully" });
  },
);

export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireAuth("admin");
    const { id } = await params;

    if (session.userId === id) {
      throw new HttpError("Cannot delete your own account", 403, "FORBIDDEN");
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, storeId: true },
    });

    if (!targetUser) throw new HttpError("User not found", 404, "NOT_FOUND");

    if (!canManageRole(session.role, targetUser.role)) {
      throw new HttpError(
        "Cannot delete users with equal or higher role",
        403,
        "FORBIDDEN",
      );
    }

    await setUserActive(id, false);

    await logAudit({
      userId: session.userId,
      storeId: targetUser.storeId ?? undefined,
      action: "USER_DELETED",
      entityType: "User",
      entityId: id,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "User account disabled" });
  },
);
