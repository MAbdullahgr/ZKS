import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, getStoreFilter, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateAccountSchema } from "@/lib/validations/accounting";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

// GET /api/accounts/[id] — account detail with recent ledger lines
export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const session = await requireManager();
    const { storeId } = getStoreFilter(session);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const lineLimit = Math.min(
      100,
      parseInt(searchParams.get("limit") ?? "50"),
    );

    const account = await prisma.account.findFirst({
      where: { id, storeId },
      include: {
        parent: { select: { code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
      },
    });

    if (!account) throw new HttpError("Account not found", 404, "NOT_FOUND");

    // Get recent journal lines for this account
    const recentLines = await prisma.journalLine.findMany({
      where: { accountId: id, journalEntry: { status: "posted" } },
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNumber: true,
            entryDate: true,
            description: true,
            referenceType: true,
          },
        },
      },
      orderBy: { journalEntry: { entryDate: "desc" } },
      take: lineLimit,
    });

    // Compute balance
    const agg = await prisma.journalLine.aggregate({
      where: { accountId: id, journalEntry: { status: "posted" } },
      _sum: { debit: true, credit: true },
    });
    const debit = Number(agg._sum.debit ?? 0);
    const credit = Number(agg._sum.credit ?? 0);
    const opening = Number(account.openingBalance ?? 0);
    const isDebitNormal =
      account.type === "asset" || account.type === "expense";
    const balance = isDebitNormal
      ? opening + debit - credit
      : -opening + credit - debit;

    return apiSuccess({
      account: {
        ...account,
        openingBalance: opening,
        balance,
        totalDebit: debit,
        totalCredit: credit,
      },
      recentLines: recentLines.map((l) => ({
        ...l,
        debit: Number(l.debit),
        credit: Number(l.credit),
        entryDate: l.journalEntry.entryDate,
        entryNumber: l.journalEntry.entryNumber,
        entryDescription: l.journalEntry.description,
        referenceType: l.journalEntry.referenceType,
      })),
    });
  },
);

// PATCH /api/accounts/[id] — update account
export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    // FIX P1-11: Use requireStoreId on writes — owner in All Stores mode
    // must pick a specific store before mutating accounts.
    const storeId = requireStoreId(session);
    const { id } = await params;
    const body = await req.json();
    const data = updateAccountSchema.parse(body);

    const existing = await prisma.account.findFirst({
      where: { id, storeId },
      select: { id: true, isSystem: true, code: true },
    });
    if (!existing) throw new HttpError("Account not found", 404, "NOT_FOUND");

    // System accounts: only allow updating name/parentId/isActive — NOT code or openingBalance
    const updateData: Prisma.AccountUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.parentId !== undefined) {
      if (data.parentId) {
        const parent = await prisma.account.findFirst({
          where: { id: data.parentId, storeId },
          select: { id: true },
        });
        if (!parent)
          throw new HttpError("Parent account not found", 404, "NOT_FOUND");
        updateData.parent = { connect: { id: data.parentId } };
      } else {
        updateData.parent = { disconnect: true };
      }
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    // Only allow openingBalance changes on non-system accounts
    if (data.openingBalance !== undefined && !existing.isSystem) {
      updateData.openingBalance = data.openingBalance;
    }

    const account = await prisma.account.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "ACCOUNT_UPDATED",
      entityType: "Account",
      entityId: id,
      details: { updates: data } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      account: { ...account, openingBalance: Number(account.openingBalance) },
    });
  },
);

// DELETE /api/accounts/[id] — deactivate (soft delete)
export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    // FIX P1-11: Use requireStoreId on writes — same as PATCH above.
    const storeId = requireStoreId(session);
    const { id } = await params;

    const account = await prisma.account.findFirst({
      where: { id, storeId },
      select: { id: true, isSystem: true, code: true, name: true },
    });
    if (!account) throw new HttpError("Account not found", 404, "NOT_FOUND");

    if (account.isSystem) {
      throw new HttpError(
        "System accounts cannot be deleted. They are required for proper accounting.",
        403,
        "FORBIDDEN",
      );
    }

    // Check for existing journal lines — if any, can't delete, only deactivate
    const lineCount = await prisma.journalLine.count({
      where: { accountId: id },
    });

    if (lineCount > 0) {
      // Has transactions — just deactivate
      await prisma.account.update({
        where: { id },
        data: { isActive: false },
      });
      await logAudit({
        userId: session.userId,
        storeId,
        action: "ACCOUNT_DEACTIVATED",
        entityType: "Account",
        entityId: id,
        details: {
          code: account.code,
          name: account.name,
          hadTransactions: true,
        } as unknown as Prisma.InputJsonValue,
        ipAddress: ip,
        userAgent,
      });
      return apiSuccess({
        message:
          "Account deactivated. It has existing transactions and cannot be permanently deleted.",
      });
    }

    // No transactions — safe to permanently delete
    await prisma.account.delete({ where: { id } });
    await logAudit({
      userId: session.userId,
      storeId,
      action: "ACCOUNT_DELETED",
      entityType: "Account",
      entityId: id,
      details: {
        code: account.code,
        name: account.name,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Account deleted successfully" });
  },
);
