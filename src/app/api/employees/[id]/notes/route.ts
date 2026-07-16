import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createNoteSchema } from "@/lib/validations/employee";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { paginatedMeta, parsePagination } from "@/lib/pagination";

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireManager();
    const { id } = await params;
    const { page, limit, skip } = parsePagination(req);

    const where = { employeeId: id };

    const [notes, total] = await Promise.all([
      prisma.employeeNote.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.employeeNote.count({ where }),
    ]);

    return apiSuccess({ notes, ...paginatedMeta(page, limit, total) });
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
    const { type, content } = createNoteSchema.parse(body);

    const note = await prisma.employeeNote.create({
      data: {
        employeeId: id,
        storeId,
        type,
        content,
        createdById: session.userId,
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "NOTE_ADDED",
      entityType: "EmployeeNote",
      entityId: note.id,
      details: { employeeId: id, type } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ note }, "Note added successfully", 201);
  },
);
