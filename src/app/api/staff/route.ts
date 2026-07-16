import { NextRequest } from "next/server";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  getStoreFilter,
  requireStoreId,
  hashPassword,
  logAudit,
  canManageRole,
  requireAdmin,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { assignStaffSchema } from "@/lib/validations/employee";
import { UserRole, Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

// FIX P1-15: GET must be admin+ to match the module/proxy gating.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAdmin();
  // Non-owners only see staff assigned to their store.
  // Owners in "All Stores" mode see staff across all stores.
  const { storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where: Prisma.UserWhereInput = {
    role: { not: "owner" as const },
    ...(storeId && {
      employee: {
        assignments: { some: { storeId, isActive: true } },
      },
    }),
    // Search on the user's email OR the linked employee's name. When storeId
    // is also set, the `employee` filter from above is implicitly AND'd with
    // this OR clause by Prisma (multiple conditions on the same relation).
    ...(search && {
      OR: [
        { email: { contains: search } },
        { employee: { name: { contains: search } } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLogin: true,
        createdAt: true,
        employeeId: true,
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
        createdBy: { select: { id: true, employee: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const employeeIds = users
    .map((u) => u.employeeId)
    .filter(Boolean) as string[];
  const assignments = await prisma.storeAssignment.findMany({
    where: {
      employeeId: { in: employeeIds },
      isActive: true,
      ...(storeId && { storeId }),
    },
    include: { store: { select: { id: true, name: true, type: true } } },
  });

  const usersWithAssignments = users.map((u) => ({
    ...u,
    assignments: u.employeeId
      ? assignments.filter((a) => a.employeeId === u.employeeId)
      : [],
  }));

  return apiSuccess({ staff: usersWithAssignments, ...paginatedMeta(page, limit, total) });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireAdmin();
  // The admin must act on a specific store — "All Stores" mode is view-only.
  const targetStoreId = requireStoreId(session);
  const body = await req.json();
  const { employeeId, role, email } = assignStaffSchema.parse(body);

  if (!canManageRole(session.role, role as UserRole)) {
    throw new HttpError(
      "Cannot assign equal or higher role than yourself",
      403,
      "FORBIDDEN",
    );
  }

  // Verify the employee actually belongs to this store (either primary or
  // via an active assignment) before assigning a user account / role.
  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      OR: [
        { storeId: targetStoreId },
        { assignments: { some: { storeId: targetStoreId, isActive: true } } },
      ],
    },
    select: { id: true, name: true, isActive: true, jobTitle: true },
  });

  if (!employee) throw new HttpError("Employee not found", 404, "NOT_FOUND");
  if (!employee.isActive)
    throw new HttpError(
      "Cannot assign inactive employee",
      400,
      "VALIDATION_ERROR",
    );

  // FIX: Add select to findUnique so the `user` variable has a consistent
  // type with the create/update calls below (which also use select). Without
  // this, TypeScript can't unify the full User type with the partial select
  // shape, causing a compile error.
  let user = await prisma.user.findUnique({
    where: { employeeId: employee.id },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lastLogin: true,
      createdAt: true,
      employeeId: true,
    },
  });
  let tempPassword: string | null = null;

  if (!user) {
    if (!email)
      throw new HttpError(
        "Email required for new user account",
        400,
        "VALIDATION_ERROR",
      );

    const existingEmail = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existingEmail)
      throw new HttpError("Email already in use", 409, "CONFLICT");

    // FIX P1-16: Use cryptographically secure random instead of Math.random().
    // 10 chars from safe alphabet (no ambiguous chars like O/0, I/l/1).
    const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    tempPassword = Array.from(
      { length: 10 },
      () => SAFE_ALPHABET[randomInt(0, SAFE_ALPHABET.length)],
    ).join("");

    // FIX P0-1: Add explicit select to exclude passwordHash + recoveryCodeHash
    // from the response. Without this, the API returns bcrypt hashes to the
    // client, which are offline-crackable.
    user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash: await hashPassword(tempPassword),
        role: role as UserRole,
        isActive: true,
        mustChangePassword: true,
        employeeId: employee.id,
        createdById: session.userId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLogin: true,
        createdAt: true,
        employeeId: true,
      },
    });
  } else {
    // FIX: Verify caller outranks the user's CURRENT role before changing it.
    // Without this, an admin can demote another admin (or owner) via this
    // route — same bug class as the promote endpoint (A1 fix).
    if (!canManageRole(session.role, user.role)) {
      throw new HttpError(
        "Cannot modify users with equal or higher role",
        403,
        "FORBIDDEN",
      );
    }
    // FIX P0-1: Add explicit select here too — same reason as create above.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: role as UserRole },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLogin: true,
        createdAt: true,
        employeeId: true,
      },
    });
  }

  // Assign the user to the manager's active store.
  await prisma.storeAssignment.upsert({
    where: {
      employeeId_storeId: { employeeId: employee.id, storeId: targetStoreId },
    },
    update: { role: role as UserRole, isActive: true },
    create: {
      employeeId: employee.id,
      storeId: targetStoreId,
      role: role as UserRole,
    },
  });

  await logAudit({
    userId: session.userId,
    storeId: targetStoreId,
    action: tempPassword ? "STAFF_CREATED" : "STAFF_ASSIGNED",
    entityType: "User",
    entityId: user.id,
    details: {
      employeeId: employee.id,
      employeeName: employee.name,
      role,
      storeId: targetStoreId,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { user, tempPassword },
    tempPassword ? "User account created and assigned" : "Assignment updated",
    201,
  );
});
