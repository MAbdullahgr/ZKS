import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import {
  giveAdvanceSchema,
  deductAdvanceSchema,
} from "@/lib/validations/employee";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { paginatedMeta, parsePagination } from "@/lib/pagination";

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireManager();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parsePagination(req);

    const activeOnly = searchParams.get("active") === "true";
    const where: Record<string, unknown> = { employeeId: id };
    if (activeOnly) where.isSettled = false;

    const [advances, total] = await Promise.all([
      prisma.employeeAdvance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.employeeAdvance.count({ where }),
    ]);

    return apiSuccess({
      advances: advances.map((a) => ({ ...a, amount: Number(a.amount) })),
      ...paginatedMeta(page, limit, total),
    });
  },
);

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
      select: { id: true },
    });
    if (!employee) throw new HttpError("Employee not found", 404, "NOT_FOUND");

    const body = await req.json();
    const { amount, reason } = giveAdvanceSchema.parse(body);

    const advance = await prisma.employeeAdvance.create({
      data: {
        employeeId: id,
        storeId,
        amount,
        reason: reason || null,
        remaining: amount,
        deducted: 0,
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "ADVANCE_GIVEN",
      entityType: "EmployeeAdvance",
      entityId: advance.id,
      details: { employeeId: id, amount } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      {
        advance: {
          ...advance,
          amount: Number(advance.amount),
          deducted: Number(advance.deducted),
          remaining: Number(advance.remaining),
        },
      },
      "Advance recorded",
      201,
    );
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify employee belongs to this store
    const employee = await prisma.employee.findFirst({
      where: { id, storeId },
      select: { id: true },
    });
    if (!employee) throw new HttpError("Employee not found", 404, "NOT_FOUND");

    const body = await req.json();
    const { deducted } = deductAdvanceSchema.parse(body);

    const activeAdvance = await prisma.employeeAdvance.findFirst({
      where: { employeeId: id, storeId, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    if (!activeAdvance)
      throw new HttpError(
        "No active advance found for this employee",
        404,
        "NOT_FOUND",
      );

    const newDeducted = Number(activeAdvance.deducted) + deducted;
    const newRemaining = Math.max(
      0,
      Number(activeAdvance.amount) - newDeducted,
    );
    const isPaidOff = newRemaining <= 0;

    const updated = await prisma.employeeAdvance.update({
      where: { id: activeAdvance.id },
      data: {
        deducted: newDeducted,
        remaining: newRemaining,
        isActive: !isPaidOff,
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "ADVANCE_DEDUCTED",
      entityType: "EmployeeAdvance",
      entityId: activeAdvance.id,
      details: {
        employeeId: id,
        deducted,
        remaining: newRemaining,
        paidOff: isPaidOff,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      advance: {
        ...updated,
        amount: Number(updated.amount),
        deducted: Number(updated.deducted),
        remaining: Number(updated.remaining),
      },
    });
  },
);
