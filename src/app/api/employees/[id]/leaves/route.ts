import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  requireManager,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import {
  applyLeaveSchema,
  updateLeaveSchema,
} from "@/lib/validations/employee";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { paginatedMeta, parsePagination } from "@/lib/pagination";

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireManager();
    const { id } = await params;
    const { page, limit, skip } = parsePagination(req);

    const where = { employeeId: id };

    const [leaves, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return apiSuccess({ leaves, ...paginatedMeta(page, limit, total) });
  },
);

export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireAuth();
    // FIX P2-6: Use requireStoreId on this write — getStoreFilter returns
    // storeId as string | undefined (undefined for owner All Stores mode),
    // and the `storeId as string` cast below would crash with a NOT NULL
    // violation. requireStoreId throws a clear STORE_NOT_SELECTED error.
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify employee belongs to this store
    const employee = await prisma.employee.findFirst({
      where: { id, storeId },
      include: { user: { select: { id: true } } },
    });
    if (!employee) throw new HttpError("Employee not found", 404, "NOT_FOUND");

    // FIX: Non-managers can only submit leave requests for THEIR OWN employee
    // record. Without this check, a cashier can submit leave on behalf of any
    // colleague in their store.
    const isManagerOrAbove = ["manager", "admin", "owner"].includes(
      session.role,
    );
    if (
      !isManagerOrAbove &&
      (!employee.user || employee.user.id !== session.userId)
    ) {
      throw new HttpError(
        "You can only submit leave requests for your own account",
        403,
        "FORBIDDEN",
      );
    }

    const body = await req.json();
    const { type, startDate, endDate, days, reason } =
      applyLeaveSchema.parse(body);

    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: id,
        storeId,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        days,
        reason: reason || null,
        status: "pending",
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "LEAVE_REQUESTED",
      entityType: "LeaveRequest",
      entityId: leave.id,
      details: {
        employeeId: id,
        type,
        days,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ leave }, "Leave request submitted", 201);
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const body = await req.json();
    const { leaveId, status } = updateLeaveSchema.parse(body);

    const leave = await prisma.leaveRequest.findFirst({
      where: { id: leaveId, storeId },
      include: { employee: { select: { id: true, name: true } } },
    });

    if (!leave) throw new HttpError("Leave not found", 404, "NOT_FOUND");

    const updated = await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { status, approvedBy: session.userId },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: status === "approved" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      entityType: "LeaveRequest",
      entityId: leave.id,
      details: {
        employeeId: leave.employeeId,
        employeeName: leave.employee.name,
        days: leave.days,
        type: leave.type,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ leave: updated });
  },
);
