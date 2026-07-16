import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  logAudit,
  canManageRole,
  requireStoreId,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { promoteEmployeeSchema } from "@/lib/validations/employee";
import { UserRole, Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify employee belongs to this store
    const employee = await prisma.employee.findFirst({
      where: { id, storeId },
      include: { user: true, assignments: { where: { isActive: true } } },
    });
    if (!employee) throw new HttpError("Employee not found", 404, "NOT_FOUND");

    const body = await req.json();
    const { newJobTitle, newRole, newSalary, reason } =
      promoteEmployeeSchema.parse(body);

    const oldJobTitle = employee.jobTitle;
    const oldRole = employee.user?.role;

    // FIX: If the employee has a user account, verify the caller outranks the
    // user's CURRENT role — not just the NEW role being assigned. Without this
    // check, a manager (weight 3) could take an admin's (weight 4) or owner's
    // (weight 5) employee record and pass `newRole: "cashier"` — which passes
    // canManageRole(manager, cashier) — silently stripping their access.
    if (employee.user && !canManageRole(session.role, employee.user.role)) {
      throw new HttpError(
        "You cannot modify users with equal or higher role",
        403,
        "FORBIDDEN",
      );
    }

    const updateData: Prisma.EmployeeUpdateInput = {
      jobTitle: newJobTitle,
      updatedAt: new Date(),
    };

    if (newSalary !== undefined) {
      updateData.salary = newSalary;
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id },
      data: updateData,
    });

    if (newRole && employee.user) {
      if (!canManageRole(session.role, newRole as UserRole)) {
        throw new HttpError(
          "You cannot assign roles higher than your own",
          403,
          "FORBIDDEN",
        );
      }

      await prisma.user.update({
        where: { id: employee.user.id },
        data: { role: newRole as UserRole },
      });

      if (employee.assignments.length > 0) {
        await prisma.storeAssignment.updateMany({
          where: { employeeId: id, isActive: true },
          data: { role: newRole as UserRole },
        });
      }
    }

    const noteContent = reason
      ? `Promoted from ${oldJobTitle} to ${newJobTitle}. Reason: ${reason}`
      : `Promoted from ${oldJobTitle} to ${newJobTitle}.`;

    await prisma.employeeNote.create({
      data: {
        employeeId: id,
        storeId,
        type: "promotion",
        content: noteContent,
        createdById: session.userId,
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "EMPLOYEE_PROMOTED",
      entityType: "Employee",
      entityId: id,
      details: {
        oldJobTitle,
        newJobTitle,
        oldRole,
        newRole,
        salaryChanged: newSalary !== undefined,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      {
        employee: {
          ...updatedEmployee,
          salary: Number(updatedEmployee.salary),
        },
      },
      `Employee promoted to ${newJobTitle}`,
    );
  },
);
