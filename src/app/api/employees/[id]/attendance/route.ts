import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { recordAttendanceSchema } from "@/lib/validations/employee";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { paginatedMeta, parsePagination } from "@/lib/pagination";

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireManager();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parsePagination(req);

    const month = searchParams.get("month"); // "YYYY-MM" optional filter
    const year = searchParams.get("year");

    const where: Record<string, unknown> = { employeeId: id };
    if (month) where.month = month;
    if (year) where.year = parseInt(year, 10);

    const [attendance, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      prisma.attendance.count({ where }),
    ]);

    return apiSuccess({ attendance, ...paginatedMeta(page, limit, total) });
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
    const { date, checkIn, checkOut, status, notes } =
      recordAttendanceSchema.parse(body);

    const attendance = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: id, date: new Date(date) } },
      update: {
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null,
        status,
        notes: notes || null,
      },
      create: {
        employeeId: id,
        storeId,
        date: new Date(date),
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null,
        status,
        notes: notes || null,
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "ATTENDANCE_MARKED",
      entityType: "Attendance",
      entityId: attendance.id,
      details: {
        employeeId: id,
        date,
        status,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ attendance }, "Attendance recorded successfully", 201);
  },
);
