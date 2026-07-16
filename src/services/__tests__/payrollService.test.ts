import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock accountingService — payrollService posts an aggregate JE after creating
// payroll records.
vi.mock("@/services/accountingService", () => ({
  postPayrollJournalEntry: vi.fn().mockResolvedValue({ id: "je-p" }),
}));

vi.mock("@/lib/prisma", () => {
  const innerPrisma = {
    employee: {
      findMany: vi.fn(),
    },
    payroll: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  // $transaction runs the callback with `innerPrisma` as the tx client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const $transaction = vi.fn(async (cb: (tx: any) => Promise<any>) => {
    return cb(innerPrisma);
  });
  return { prisma: { ...innerPrisma, $transaction } };
});

import { prisma } from "@/lib/prisma";
import { generatePayroll, serializePayroll } from "@/services/payrollService";

const mockedPrisma = prisma as unknown as {
  employee: { findMany: ReturnType<typeof vi.fn> };
  payroll: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generatePayroll — basic flow", () => {
  it("creates payroll records for active employees without existing records", async () => {
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 30000,
        isActive: true,
        attendances: [
          { status: "present" },
          { status: "present" },
          { status: "absent" },
          { status: "leave" },
        ],
        advances: [{ remaining: 5000 }],
      },
      {
        id: "emp-2",
        salary: 20000,
        isActive: true,
        attendances: [{ status: "present" }, { status: "late" }],
        advances: [],
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]); // No existing records
    mockedPrisma.payroll.create.mockResolvedValue({ id: "pay-1" });

    const result = await generatePayroll({
      month: 1,
      year: 2027,
      storeId: "test-store",
    });

    expect(result.count).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mockedPrisma.payroll.create).toHaveBeenCalledTimes(2);
  });

  it("skips employees who already have payroll for the period", async () => {
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 30000,
        isActive: true,
        attendances: [],
        advances: [],
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([{ employeeId: "emp-1" }]);
    mockedPrisma.payroll.create.mockResolvedValue({ id: "new-pay" });

    const result = await generatePayroll({
      month: 2,
      year: 2027,
      storeId: "test-store",
    });

    expect(result.count).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockedPrisma.payroll.create).not.toHaveBeenCalled();
  });

  it("counts present + late as present days", async () => {
    const captured: unknown[] = [];
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 30000,
        isActive: true,
        attendances: [
          { status: "present" },
          { status: "late" },
          { status: "absent" },
        ],
        advances: [],
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]);
    mockedPrisma.payroll.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "p1" });
    });

    await generatePayroll({ month: 1, year: 2027, storeId: "test-store" });

    const callArg = captured[0] as {
      data: { presentDays: number; absentDays: number; leaveDays: number };
    };
    expect(callArg.data.presentDays).toBe(2); // present + late
    expect(callArg.data.absentDays).toBe(1);
    expect(callArg.data.leaveDays).toBe(0);
  });

  it("counts leave + half_day as leave days", async () => {
    const captured: unknown[] = [];
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 30000,
        isActive: true,
        attendances: [
          { status: "leave" },
          { status: "half_day" },
          { status: "present" },
        ],
        advances: [],
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]);
    mockedPrisma.payroll.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "p1" });
    });

    await generatePayroll({ month: 1, year: 2027, storeId: "test-store" });

    const callArg = captured[0] as {
      data: { leaveDays: number; presentDays: number };
    };
    expect(callArg.data.leaveDays).toBe(2); // leave + half_day
    expect(callArg.data.presentDays).toBe(1);
  });

  it("computes salary deduction = absentDays × perDaySalary", async () => {
    const captured: unknown[] = [];
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 31000,
        isActive: true,
        // 31-day month (January) — perDaySalary = 1000
        attendances: [
          { status: "absent" },
          { status: "absent" },
          { status: "present" },
        ],
        advances: [],
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]);
    mockedPrisma.payroll.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "p1" });
    });

    await generatePayroll({ month: 1, year: 2027, storeId: "test-store" });

    const callArg = captured[0] as {
      data: { salaryDeduction: number };
    };
    expect(callArg.data.salaryDeduction).toBeCloseTo(2000, 2); // 2 absents × 1000
  });

  it("caps advance deduction at 50% of base salary", async () => {
    const captured: unknown[] = [];
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 20000, // 50% cap = 10000
        isActive: true,
        attendances: [{ status: "present" }],
        advances: [{ remaining: 15000 }], // exceeds cap
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]);
    mockedPrisma.payroll.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "p1" });
    });

    await generatePayroll({ month: 1, year: 2027, storeId: "test-store" });

    const callArg = captured[0] as {
      data: { advanceDeduction: number };
    };
    expect(callArg.data.advanceDeduction).toBe(10000); // Capped at 50%
  });

  it("does not cap advance deduction when it's below 50%", async () => {
    const captured: unknown[] = [];
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 20000,
        isActive: true,
        attendances: [],
        advances: [{ remaining: 3000 }], // below 50% cap of 10000
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]);
    mockedPrisma.payroll.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "p1" });
    });

    await generatePayroll({ month: 1, year: 2027, storeId: "test-store" });

    const callArg = captured[0] as {
      data: { advanceDeduction: number };
    };
    expect(callArg.data.advanceDeduction).toBe(3000);
  });

  it("sets netPayable = baseSalary - salaryDeduction - advanceDeduction", async () => {
    const captured: unknown[] = [];
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 31000, // perDay = 1000
        isActive: true,
        attendances: [{ status: "absent" }], // 1 absent = 1000 deduction
        advances: [{ remaining: 2000 }],
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]);
    mockedPrisma.payroll.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "p1" });
    });

    await generatePayroll({ month: 1, year: 2027, storeId: "test-store" });

    const callArg = captured[0] as {
      data: { netPayable: number; baseSalary: number };
    };
    // 31000 - 1000 (1 absent) - 2000 (advance) = 28000
    expect(callArg.data.netPayable).toBeCloseTo(28000, 2);
  });

  it("clamps netPayable to 0 when deductions exceed salary", async () => {
    const captured: unknown[] = [];
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 10000,
        isActive: true,
        attendances: [], // 0 absent
        advances: [{ remaining: 15000 }], // capped to 5000 (50%)
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]);
    mockedPrisma.payroll.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "p1" });
    });

    await generatePayroll({ month: 1, year: 2027, storeId: "test-store" });

    const callArg = captured[0] as {
      data: { netPayable: number; advanceDeduction: number };
    };
    expect(callArg.data.netPayable).toBeGreaterThanOrEqual(0);
  });

  it("initializes bonus = 0 and status = draft", async () => {
    const captured: unknown[] = [];
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 10000,
        isActive: true,
        attendances: [],
        advances: [],
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]);
    mockedPrisma.payroll.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "p1" });
    });

    await generatePayroll({ month: 1, year: 2027, storeId: "test-store" });

    const callArg = captured[0] as {
      data: { bonus: number; status: string };
    };
    expect(callArg.data.bonus).toBe(0);
    expect(callArg.data.status).toBe("draft");
  });

  it("returns count=0 skipped=0 when there are no active employees", async () => {
    mockedPrisma.employee.findMany.mockResolvedValue([]);

    const result = await generatePayroll({
      month: 6,
      year: 2027,
      storeId: "test-store",
    });

    expect(result.count).toBe(0);
    expect(result.skipped).toBe(0);
    expect(mockedPrisma.payroll.create).not.toHaveBeenCalled();
  });

  it("runs the create calls inside a $transaction", async () => {
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 10000,
        isActive: true,
        attendances: [],
        advances: [],
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([]);
    mockedPrisma.payroll.create.mockResolvedValue({ id: "p1" });

    await generatePayroll({ month: 1, year: 2027, storeId: "test-store" });

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("does NOT call create for already-skipped employees (batch check)", async () => {
    mockedPrisma.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 10000,
        isActive: true,
        attendances: [],
        advances: [],
      },
      {
        id: "emp-2",
        salary: 20000,
        isActive: true,
        attendances: [],
        advances: [],
      },
    ]);
    mockedPrisma.payroll.findMany.mockResolvedValue([{ employeeId: "emp-1" }]);
    mockedPrisma.payroll.create.mockResolvedValue({ id: "p2" });

    const result = await generatePayroll({
      month: 1,
      year: 2027,
      storeId: "test-store",
    });

    expect(result.count).toBe(1);
    expect(result.skipped).toBe(1);
    expect(mockedPrisma.payroll.create).toHaveBeenCalledTimes(1);
    // The create call should be for emp-2 (the non-skipped one).
    const callArg = mockedPrisma.payroll.create.mock.calls[0][0] as {
      data: { employeeId: string };
    };
    expect(callArg.data.employeeId).toBe("emp-2");
  });
});

describe("serializePayroll", () => {
  const samplePayroll = {
    id: "pay-1",
    employeeId: "emp-1",
    month: 1,
    year: 2027,
    baseSalary: 30000,
    presentDays: 25,
    absentDays: 2,
    leaveDays: 3,
    salaryDeduction: 2000,
    advanceDeduction: 1500,
    bonus: 500,
    netPayable: 27000,
    status: "draft" as const,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    employee: {
      id: "emp-1",
      name: "John Doe",
      employeeCode: "EMP-0001",
      jobTitle: "Sales",
    },
  };

  it("converts Decimal fields to numbers", () => {
    const serialized = serializePayroll(
      samplePayroll as unknown as Parameters<typeof serializePayroll>[0],
    );
    expect(serialized.baseSalary).toBe(30000);
    expect(typeof serialized.baseSalary).toBe("number");
    expect(serialized.netPayable).toBe(27000);
    expect(typeof serialized.netPayable).toBe("number");
  });

  it("preserves all numeric fields", () => {
    const serialized = serializePayroll(
      samplePayroll as unknown as Parameters<typeof serializePayroll>[0],
    );
    expect(serialized.presentDays).toBe(25);
    expect(serialized.absentDays).toBe(2);
    expect(serialized.leaveDays).toBe(3);
    expect(serialized.salaryDeduction).toBe(2000);
    expect(serialized.advanceDeduction).toBe(1500);
    expect(serialized.bonus).toBe(500);
  });

  it("preserves the embedded employee object", () => {
    const serialized = serializePayroll(
      samplePayroll as unknown as Parameters<typeof serializePayroll>[0],
    );
    expect(serialized.employee.name).toBe("John Doe");
    expect(serialized.employee.employeeCode).toBe("EMP-0001");
  });

  it("preserves status and metadata fields", () => {
    const serialized = serializePayroll(
      samplePayroll as unknown as Parameters<typeof serializePayroll>[0],
    );
    expect(serialized.status).toBe("draft");
    expect(serialized.month).toBe(1);
    expect(serialized.year).toBe(2027);
  });
});
