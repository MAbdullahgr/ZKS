import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

// Generate employee code per-store (EMP-0001, EMP-0002, etc.)
async function generateEmployeeCode(storeId: string): Promise<string> {
  const lastEmployee = await prisma.employee.findFirst({
    where: { storeId, employeeCode: { startsWith: "EMP-" } },
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });

  if (!lastEmployee) return "EMP-0001";

  const lastNum = parseInt(lastEmployee.employeeCode.split("-")[1] || "0", 10);
  const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
  return `EMP-${String(nextNum).padStart(4, "0")}`;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireManager();
  const { storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);

  const search = searchParams.get("search") || "";
  const jobTitle = searchParams.get("jobTitle") || "";
  const isActive = searchParams.get("isActive");
  // AUDIT-FIX B3/B4/B6: use shared parsePagination (default 20, clamped to
  // 1..100) and return the flat paginatedMeta envelope { page, limit, total,
  // pages, hasNext, hasPrev } — matching every other list endpoint. The old
  // hand-rolled version returned a nested { pagination: {...} } shape that
  // broke the shared PaginationBar component and the usePaginatedList hook.
  const { page, limit, skip } = parsePagination(req);

  const where: Prisma.EmployeeWhereInput = { storeId };

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { cnic: { contains: search } },
      { phone: { contains: search } },
      { employeeCode: { contains: search } },
    ];
  }

  if (jobTitle) where.jobTitle = jobTitle;
  if (isActive !== null && isActive !== "")
    where.isActive = isActive === "true";

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeCode: true,
        name: true,
        fatherName: true,
        cnic: true,
        phone: true,
        phone2: true,
        salary: true,
        joiningDate: true,
        jobTitle: true,
        shift: true,
        isActive: true,
        createdAt: true,
        store: { select: { name: true } },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            lastLogin: true,
          },
        },
        assignments: {
          where: { isActive: true },
          select: {
            id: true,
            role: true,
            store: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: {
            attendances: true,
            advances: true,
            leaves: true,
            notes: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);

  return apiSuccess({
    employees: employees.map((e) => ({ ...e, salary: Number(e.salary) })),
    ...paginatedMeta(page, limit, total),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);
  const body = await req.json();
  const data = createEmployeeSchema.parse(body);

  const employeeCode = await generateEmployeeCode(storeId);

  const employee = await prisma.employee.create({
    data: {
      ...data,
      storeId,
      employeeCode,
      dob: data.dob ? new Date(data.dob) : null,
      salary: data.salary ?? 0,
    },
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "EMPLOYEE_CREATED",
    entityType: "Employee",
    entityId: employee.id,
    details: {
      name: employee.name,
      jobTitle: employee.jobTitle,
      employeeCode,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    {
      employee: { ...employee, salary: Number(employee.salary) },
    },
    "Employee created successfully",
    201,
  );
});
