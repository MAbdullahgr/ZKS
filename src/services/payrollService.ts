// src/services/payrollService.ts

import { prisma } from "@/lib/prisma";
import { Prisma } from "@generated/prisma/client";
import type { PayrollGenerateInput, PayrollGenerateResult, Tx } from "./types";
import { postPayrollJournalEntry } from "./accountingService";

const ADVANCE_DEDUCTION_CAP = 0.5;

// AUDIT-FIX H-11: Rewritten to fix N+1 queries + lack of transaction.
// Previously:
//   - Per-employee prisma.payroll.findUnique + prisma.payroll.create
//     (2 queries per employee × 50 employees = 100 sequential queries)
//   - No $transaction — failure at employee #30 left 1-29 with payroll
//     but 30+ without, and the aggregate JE might fail to find them
//   - Aggregate JE re-fetched ALL payrolls for the period (including
//     pre-existing ones), overstating totals
// Now:
//   - Batch existence check (1 query for all employees)
//   - Single $transaction (Serializable) for all creates
//   - Track newly-created payroll IDs to compute correct aggregate totals
export async function generatePayroll(
  input: PayrollGenerateInput,
): Promise<PayrollGenerateResult> {
  const { month, year, storeId } = input;

  // 1. Fetch all active employees with their attendance + advances (1 query)
  const employees = await prisma.employee.findMany({
    where: { isActive: true, storeId },
    include: {
      attendances: {
        where: {
          date: {
            gte: new Date(year, month - 1, 1),
            lt: new Date(year, month, 1),
          },
        },
      },
      advances: { where: { isActive: true } },
    },
  });

  if (employees.length === 0) {
    return { count: 0, skipped: 0 };
  }

  // AUDIT-FIX H-11: Batch existence check — 1 query instead of N.
  const employeeIds = employees.map((e) => e.id);
  const existingPayrolls = await prisma.payroll.findMany({
    where: {
      storeId,
      month,
      year,
      employeeId: { in: employeeIds },
    },
    select: { employeeId: true },
  });
  const existingEmployeeIds = new Set(existingPayrolls.map((p) => p.employeeId));

  // 2. Process in a single transaction — all-or-nothing
  const result = await prisma.$transaction(
    async (tx: Tx) => {
      let count = 0;
      let skipped = 0;
      const newPayrollData: Array<{
        netPayable: number;
        salaryDeduction: number;
        advanceDeduction: number;
      }> = [];

      for (const emp of employees) {
        // Skip if payroll already exists for this period
        if (existingEmployeeIds.has(emp.id)) {
          skipped++;
          continue;
        }

        const presentDays = emp.attendances.filter(
          (a) => a.status === "present" || a.status === "late",
        ).length;
        const absentDays = emp.attendances.filter(
          (a) => a.status === "absent",
        ).length;
        const leaveDays = emp.attendances.filter(
          (a) => a.status === "leave" || a.status === "half_day",
        ).length;

        const baseSalary = Number(emp.salary);
        const totalDays = new Date(year, month, 0).getDate();
        const perDaySalary = totalDays > 0 ? baseSalary / totalDays : 0;

        const salaryDeduction = absentDays * perDaySalary;

        const rawAdvanceDeduction = emp.advances.reduce(
          (sum, a) => sum + Number(a.remaining),
          0,
        );
        const advanceDeductionCap = baseSalary * ADVANCE_DEDUCTION_CAP;
        let advanceDeduction = Math.min(
          rawAdvanceDeduction,
          advanceDeductionCap,
        );

        let netPayable = baseSalary - salaryDeduction - advanceDeduction;
        if (netPayable < 0) {
          console.warn(
            `[payroll] Employee ${emp.name} (${emp.id}) has negative net payable: ${netPayable}. Clamping to 0.`,
          );
          // Reduce the advance deduction so net = 0 (don't over-deduct)
          const excessDeduction = Math.abs(netPayable);
          advanceDeduction = Math.max(0, advanceDeduction - excessDeduction);
          netPayable = 0;
        }

        await tx.payroll.create({
          data: {
            employeeId: emp.id,
            storeId,
            month,
            year,
            baseSalary,
            presentDays,
            absentDays,
            leaveDays,
            salaryDeduction,
            advanceDeduction,
            bonus: 0,
            netPayable,
            status: "draft",
          },
        });

        newPayrollData.push({
          netPayable,
          salaryDeduction,
          advanceDeduction,
        });
        count++;
      }

      return { count, skipped, newPayrollData };
    },
    {
      timeout: 30000,
      maxWait: 10000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  // 3. Auto-post aggregate payroll journal entry (non-blocking)
  // AUDIT-FIX H-11: Use the newly-created payroll data we tracked in the
  // transaction, NOT a re-fetch of ALL payrolls for the period. Previously
  // this re-fetched ALL payrolls (including pre-existing ones from other
  // runs), overstating the JE totals every time payroll was re-run.
  if (result.count > 0) {
    const totalNetPayable = result.newPayrollData.reduce(
      (s, p) => s + p.netPayable,
      0,
    );
    const totalDeductions = result.newPayrollData.reduce(
      (s, p) => s + p.salaryDeduction + p.advanceDeduction,
      0,
    );

    await postPayrollJournalEntry(storeId, {
      month,
      year,
      totalNetPayable,
      totalDeductions,
      count: result.count,
    });
  }

  return { count: result.count, skipped: result.skipped };
}

export function serializePayroll(
  payroll: Prisma.PayrollGetPayload<{
    include: {
      employee: {
        select: { id: true; name: true; employeeCode: true; jobTitle: true };
      };
    };
  }>,
) {
  return {
    ...payroll,
    baseSalary: Number(payroll.baseSalary),
    salaryDeduction: Number(payroll.salaryDeduction),
    advanceDeduction: Number(payroll.advanceDeduction),
    bonus: Number(payroll.bonus),
    netPayable: Number(payroll.netPayable),
  };
}
