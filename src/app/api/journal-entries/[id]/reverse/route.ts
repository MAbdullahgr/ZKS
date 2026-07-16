import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { reverseJournalEntrySchema } from "@/lib/validations/accounting";
import { reverseJournalEntry } from "@/services/accountingService";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

// POST /api/journal-entries/[id]/reverse — reverse a posted entry
export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    // FIX P1-12: Use requireStoreId on writes — reversing a JE creates a new
    // JE, which is a write operation. Owner in All Stores mode must pick a
    // specific store first.
    const storeId = requireStoreId(session);
    const { id } = await params;
    const body = await req.json();
    const { reason } = reverseJournalEntrySchema.parse(body);

    // Verify the entry exists + belongs to this store
    const existing = await prisma.journalEntry.findFirst({
      where: { id, storeId },
      select: { id: true, entryNumber: true, status: true },
    });
    if (!existing)
      throw new HttpError("Journal entry not found", 404, "NOT_FOUND");

    if (existing.status === "reversed") {
      throw new HttpError(
        "This entry has already been reversed",
        400,
        "VALIDATION_ERROR",
      );
    }

    const reversal = await reverseJournalEntry(id, reason, session.userId);

    await logAudit({
      userId: session.userId,
      storeId,
      action: "JOURNAL_ENTRY_REVERSED",
      entityType: "JournalEntry",
      entityId: id,
      details: {
        originalEntryNumber: existing.entryNumber,
        reversalEntryNumber: reversal.entryNumber,
        reason,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess(
      { entry: reversal },
      `Entry ${existing.entryNumber} reversed by ${reversal.entryNumber}`,
    );
  },
);
