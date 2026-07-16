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
import { createJournalEntrySchema } from "@/lib/validations/accounting";
import { postJournalEntry } from "@/services/accountingService";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

// GET /api/journal-entries — list entries with filters
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireManager();
  const { storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);

  const { page, limit, skip } = parsePagination(req);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const referenceType = searchParams.get("referenceType");
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const where: Prisma.JournalEntryWhereInput = {
    ...(storeId && { storeId }),
    ...(from &&
      to && {
        entryDate: { gte: new Date(from + "T00:00:00"), lte: new Date(`${to}T23:59:59`) },
      }),
    ...(referenceType && {
      referenceType: referenceType as Prisma.EnumJournalReferenceTypeFilter,
    }),
    ...(status && { status: status as Prisma.EnumJournalEntryStatusFilter }),
    ...(search && {
      OR: [
        { entryNumber: { contains: search } },
        { description: { contains: search } },
      ],
    }),
  };

  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: { entryDate: "desc" },
      skip,
      take: limit,
      include: {
        postedBy: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true } },
          },
        },
        _count: { select: { lines: true } },
      },
    }),
    prisma.journalEntry.count({ where }),
  ]);

  // FIX P1-23: Use a single groupBy query instead of N per-entry aggregate
  // queries. One DB round-trip instead of N.
  const entryIds = entries.map((e) => e.id);
  const aggregatedLines = await prisma.journalLine.groupBy({
    by: ["journalEntryId"],
    where: { journalEntryId: { in: entryIds } },
    _sum: { debit: true, credit: true },
  });
  const totalsMap = new Map(
    aggregatedLines.map((a) => [
      a.journalEntryId,
      {
        debit: Number(a._sum.debit ?? 0),
        credit: Number(a._sum.credit ?? 0),
      },
    ]),
  );

  const entriesWithTotals = entries.map((e) => {
    const agg = totalsMap.get(e.id) ?? { debit: 0, credit: 0 };
    return {
      ...e,
      totalDebit: agg.debit,
      totalCredit: agg.credit,
      postedByName:
        e.postedBy?.employee?.name || e.postedBy?.email || "System",
    };
  });

  return apiSuccess({
    entries: entriesWithTotals,
    ...paginatedMeta(page, limit, total),
  });
});

// POST /api/journal-entries — create a manual journal entry
export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);

  // AUDIT-FIX H-28: Rate-limit manual journal entries per manager+IP.
  // Manual JEs hit the GL directly — a compromised manager JWT could
  // script thousands of fraudulent entries. 20/min is generous for normal use.
  const rl = await rateLimit("financialMutation", `${session.userId}:${ip}`);
  if (!rl.success) {
    throw new HttpError(
      "Too many journal entries posted. Please slow down.",
      429,
      "RATE_LIMITED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const data = createJournalEntrySchema.parse(body);

  const entry = await postJournalEntry({
    storeId,
    entryDate: data.entryDate ? new Date(data.entryDate) : new Date(),
    description: data.description,
    referenceType: data.referenceType,
    referenceId: data.referenceId ?? undefined,
    lines: data.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.debit,
      credit: l.credit,
      description: l.description ?? undefined,
    })),
    userId: session.userId,
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "JOURNAL_ENTRY_CREATED",
    entityType: "JournalEntry",
    entityId: entry.id,
    details: {
      entryNumber: entry.entryNumber,
      description: data.description,
      totalDebit: entry.totalDebit,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { entry },
    `Journal entry ${entry.entryNumber} posted successfully`,
    201,
    rateLimitHeaders(rl),
  );
});
