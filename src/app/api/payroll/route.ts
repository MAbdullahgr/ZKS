import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { generatePayrollSchema } from "@/lib/validations/payroll";
import { Prisma } from "@generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { generatePayroll, serializePayroll } from "@/services/payrollService";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireManager();
  const { storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);
  const month = parseInt(searchParams.get("month") || "0");
  const year = parseInt(searchParams.get("year") || "0");
  const search = searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where: Prisma.PayrollWhereInput = { storeId };
  if (month) where.month = month;
  if (year) where.year = year;
  // Search on the linked employee's name.
  if (search) {
    where.employee = { name: { contains: search } };
  }

  const [payrolls, total] = await Promise.all([
    prisma.payroll.findMany({
      where,
      include: {
        employee: {
          select: { id: true, name: true, employeeCode: true, jobTitle: true },
        },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.payroll.count({ where }),
  ]);

  return apiSuccess({
    payrolls: payrolls.map(serializePayroll),
    ...paginatedMeta(page, limit, total),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);

  // AUDIT-FIX (5-b MEDIUM-1): Rate-limit payroll generation. Generating
  // payroll posts salary JEs for every employee — a compromised manager JWT
  // could spam this to flood the GL. 20/min is generous (payroll is a
  // monthly operation).
  const rl = await rateLimit(
    "financialMutation",
    `${session.userId}:${ip}`,
  );
  if (!rl.success) {
    throw new HttpError(
      "Too many payroll requests. Please slow down.",
      429,
      "RATE_LIMITED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const { month, year } = generatePayrollSchema.parse(body);

  const result = await generatePayroll({ month, year, storeId });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "PAYROLL_GENERATED",
    entityType: "Payroll",
    details: {
      month,
      year,
      count: result.count,
      skipped: result.skipped,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { generated: result.count, skipped: result.skipped },
    `Generated payroll for ${result.count} employees (${result.skipped} already had payroll for this period)`,
    201,
    rateLimitHeaders(rl),
  );
});
