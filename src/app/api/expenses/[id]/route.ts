import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { reverseJournalEntry } from "@/services/accountingService";

// DELETE /api/expenses/[id] — soft-delete is not used for expenses; we hard-delete.
// Only managers+ can delete expenses.
//
// AUDIT-FIX H-32: Reverse the JE BEFORE the hard-delete, inside a transaction.
// Previously the order was: delete expense → try to reverse JE → catch &
// swallow errors. If the reversal failed (transient DB error, account
// missing, JE already reversed), the expense was already gone but the JE
// stayed posted → P&L overstates expenses forever. Now both happen in a
// transaction: if the reversal fails, the delete is rolled back.
export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Fetch the expense — verify it belongs to this store
    const expense = await prisma.expense.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        amount: true,
        category: true,
        storeId: true,
        description: true,
      },
    });

    if (!expense) {
      throw new HttpError("Expense not found", 404, "NOT_FOUND");
    }

    // AUDIT-FIX H-32: Wrap delete + JE reversal in a single transaction so
    // a reversal failure rolls back the delete. The books never drift.
    let reversalPosted = false;
    let reversalError: string | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Find the auto-posted JE (inside tx so it's locked)
        const expenseJE = await tx.journalEntry.findFirst({
          where: {
            storeId: expense.storeId,
            referenceType: "expense",
            referenceId: id,
            status: "posted",
          },
          select: { id: true },
        });

        // 2. If a JE exists, reverse it FIRST (before delete). If this
        //    throws, the transaction rolls back — the expense stays.
        if (expenseJE) {
          await reverseJournalEntry(
            expenseJE.id,
            `Expense deleted: ${expense.description ?? expense.category}`,
            session.userId,
            tx,
          );
          reversalPosted = true;
        }

        // 3. Now safe to hard-delete the expense — JE is already reversed.
        await tx.expense.delete({ where: { id } });
      });
    } catch (err) {
      // Capture the error so we can surface it to the client. The
      // transaction has already rolled back — the expense is intact.
      reversalError = err instanceof Error ? err.message : String(err);
      throw new HttpError(
        `Failed to delete expense: the journal entry could not be reversed. The expense was NOT deleted. Error: ${reversalError}`,
        500,
        "JE_REVERSAL_FAILED",
      );
    }

    await logAudit({
      userId: session.userId,
      storeId: expense.storeId,
      action: "EXPENSE_DELETED",
      entityType: "Expense",
      entityId: id,
      details: {
        amount: Number(expense.amount),
        category: expense.category,
        jeReversed: reversalPosted,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Expense deleted successfully" });
  },
);
