import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  requireStoreId,
  logAudit,
  getStoreFilter,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const session = await requireManager();
    const { storeId } = getStoreFilter(session);
    const { id } = await params;

    const employee = await prisma.employee.findFirst({
      where: { id, storeId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            lastLogin: true,
            mustChangePassword: true,
          },
        },
        assignments: {
          where: { isActive: true },
          include: { store: { select: { id: true, name: true, type: true } } },
          orderBy: { createdAt: "desc" },
        },
        documents: { orderBy: { createdAt: "desc" } },
        attendances: { orderBy: { date: "desc" }, take: 30 },
        advances: { where: { isActive: true }, orderBy: { createdAt: "desc" } },
        leaves: { orderBy: { createdAt: "desc" }, take: 10 },
        notes: { orderBy: { createdAt: "desc" }, take: 20 },
        _count: {
          select: {
            attendances: true,
            advances: true,
            leaves: true,
            notes: true,
            documents: true,
          },
        },
      },
    });

    if (!employee) throw new HttpError("Employee not found", 404, "NOT_FOUND");

    return apiSuccess({
      employee: {
        ...employee,
        salary: Number(employee.salary),
        advances: employee.advances.map((a) => ({
          ...a,
          amount: Number(a.amount),
          deducted: Number(a.deducted),
          remaining: Number(a.remaining),
        })),
      },
    });
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;
    const body = await req.json();

    // Verify employee belongs to this store
    const existing = await prisma.employee.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new HttpError("Employee not found", 404, "NOT_FOUND");

    const { dob, ...rest } = updateEmployeeSchema.parse(body);
    const data: Prisma.EmployeeUpdateInput = { ...rest };
    if (dob) {
      data.dob = new Date(dob);
    }

    const employee = await prisma.employee.update({
      where: { id },
      data,
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "EMPLOYEE_UPDATED",
      entityType: "Employee",
      entityId: id,
      details: { updates: data } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      employee: { ...employee, salary: Number(employee.salary) },
    });
  },
);
