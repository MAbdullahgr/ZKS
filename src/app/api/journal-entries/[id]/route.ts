import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, getStoreFilter } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";

// GET /api/journal-entries/[id] — entry detail with all lines
export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const session = await requireManager();
    const { storeId } = getStoreFilter(session);
    const { id } = await params;

    const entry = await prisma.journalEntry.findFirst({
      where: { id, storeId },
      include: {
        postedBy: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true } },
          },
        },
        lines: {
          include: {
            account: { select: { code: true, name: true, type: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        reversalOf: {
          select: { id: true, entryNumber: true, description: true },
        },
        reversedBy: {
          select: { id: true, entryNumber: true, description: true },
        },
      },
    });

    if (!entry)
      throw new HttpError("Journal entry not found", 404, "NOT_FOUND");

    return apiSuccess({
      entry: {
        ...entry,
        postedByName:
          entry.postedBy?.employee?.name || entry.postedBy?.email || "System",
        lines: entry.lines.map((l) => ({
          ...l,
          debit: Number(l.debit),
          credit: Number(l.credit),
          accountCode: l.account.code,
          accountName: l.account.name,
          accountType: l.account.type,
        })),
      },
    });
  },
);
