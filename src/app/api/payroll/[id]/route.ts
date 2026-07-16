import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updatePayrollSchema } from "@/lib/validations/payroll";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import {
  reverseJournalEntry,
  postPayrollJournalEntry,
} from "@/services/accountingService";

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify payroll belongs to this store
    const payroll = await prisma.payroll.findFirst({
      where: { id, storeId },
    });
    if (!payroll) throw new HttpError("Payroll not found", 404, "NOT_FOUND");

    const body = await req.json();
    const { bonus, advanceDeduction, status } = updatePayrollSchema.parse(body);

    const updateData: Prisma.PayrollUpdateInput = {};
    if (bonus !== undefined) updateData.bonus = bonus;
    if (advanceDeduction !== undefined)
      updateData.advanceDeduction = advanceDeduction;

    if (status === "paid") {
      updateData.status = "paid";
      updateData.paidAt = new Date();

      // Clear the employee's advances that were deducted
      if (Number(payroll.advanceDeduction) > 0) {
        await prisma.employeeAdvance.updateMany({
          where: { employeeId: payroll.employeeId, storeId, isActive: true },
          data: {
            isActive: false,
            remaining: 0,
            deducted: { increment: Number(payroll.advanceDeduction) },
          },
        });
      }
    }

    // Recalculate net payable if bonus or advance changed
    const newBonus = bonus !== undefined ? bonus : Number(payroll.bonus);
    const newAdvDeduction =
      advanceDeduction !== undefined
        ? advanceDeduction
        : Number(payroll.advanceDeduction);
    // FIX: Clamp netPayable to 0 — same as P1-4 fix in generatePayroll.
    // A negative netPayable would break the aggregate JE (no cash credit).
    let netPayable =
      Number(payroll.baseSalary) -
      Number(payroll.salaryDeduction) -
      newAdvDeduction +
      newBonus;
    let effectiveAdvDeduction = newAdvDeduction;
    if (netPayable < 0) {
      console.warn(
        `[payroll] PATCH resulted in negative net payable for ${id}: ${netPayable}. Clamping to 0.`,
      );
      const excess = Math.abs(netPayable);
      effectiveAdvDeduction = Math.max(0, newAdvDeduction - excess);
      netPayable = 0;
    }
    updateData.netPayable = netPayable;
    // FIX: Always persist effectiveAdvDeduction when clamping occurred, even
    // if the PATCH body didn't include advanceDeduction. Without this, the
    // DB keeps the OLD advanceDeduction but the NEW (clamped) netPayable,
    // making the record internally inconsistent:
    //   baseSalary - salaryDeduction - advanceDeduction + bonus ≠ netPayable
    // This also causes the aggregate JE to overstate totalDeductions and
    // the employeeAdvance.updateMany to mark wrong amounts as deducted.
    if (advanceDeduction !== undefined || netPayable === 0) {
      updateData.advanceDeduction = effectiveAdvDeduction;
    }

    const updatedPayroll = await prisma.payroll.update({
      where: { id },
      data: updateData,
    });

    // FIX P1-10: If bonus or advanceDeduction changed, the payroll JE (posted
    // at generate time) is now stale. Reverse the old JE and post a new one
    // with the updated amounts. Without this, the books show wrong salary
    // expense after edits.
    if (bonus !== undefined || advanceDeduction !== undefined) {
      try {
        // Find + reverse the existing payroll JE
        const existingJE = await prisma.journalEntry.findFirst({
          where: {
            storeId,
            referenceType: "payroll",
            referenceId: `payroll-${payroll.month}-${payroll.year}`,
            status: "posted",
            // FIX: Only reverse ORIGINAL entries, not reversals. A reversal
            // entry inherits the original's referenceType + referenceId, so
            // without this filter, a 2nd edit would reverse the reversal
            // entry → salary expense double-counting.
            reversalOfId: null,
          },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        });
        if (existingJE) {
          await reverseJournalEntry(
            existingJE.id,
            `Payroll edited (bonus/advance changed) for ${payroll.month}/${payroll.year}`,
            session.userId,
          );
        }

        // Re-post with updated totals. Fetch ALL payrolls for this period
        // (not just this one) because the JE is aggregate.
        const allPayrolls = await prisma.payroll.findMany({
          where: { storeId, month: payroll.month, year: payroll.year },
          select: {
            netPayable: true,
            salaryDeduction: true,
            advanceDeduction: true,
          },
        });
        const totalNetPayable = allPayrolls.reduce(
          (s, p) => s + Number(p.netPayable),
          0,
        );
        const totalDeductions = allPayrolls.reduce(
          (s, p) => s + Number(p.salaryDeduction) + Number(p.advanceDeduction),
          0,
        );
        await postPayrollJournalEntry(storeId, {
          month: payroll.month,
          year: payroll.year,
          totalNetPayable,
          totalDeductions,
          count: allPayrolls.length,
        });
      } catch (err) {
        console.error(
          `[accounting] Failed to re-post payroll JE after edit:`,
          err,
        );
        // Non-blocking — payroll already updated
      }
    }

    await logAudit({
      userId: session.userId,
      storeId,
      action: "PAYROLL_UPDATED",
      entityType: "Payroll",
      entityId: id,
      details: updateData as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      payroll: {
        ...updatedPayroll,
        baseSalary: Number(updatedPayroll.baseSalary),
        salaryDeduction: Number(updatedPayroll.salaryDeduction),
        advanceDeduction: Number(updatedPayroll.advanceDeduction),
        bonus: Number(updatedPayroll.bonus),
        netPayable: Number(updatedPayroll.netPayable),
      },
    });
  },
);
