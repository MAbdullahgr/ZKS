import { describe, it, expect } from "vitest";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  recordAttendanceSchema,
  applyLeaveSchema,
  updateLeaveSchema,
  giveAdvanceSchema,
  deductAdvanceSchema,
  createNoteSchema,
  promoteEmployeeSchema,
  assignStaffSchema,
} from "@/lib/validations/employee";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("createEmployeeSchema", () => {
  it("accepts a minimal valid employee (just name)", () => {
    const r = createEmployeeSchema.safeParse({ name: "Ali" });
    expect(r.success).toBe(true);
  });

  it("accepts a full valid employee", () => {
    const r = createEmployeeSchema.safeParse({
      name: "Ali Khan",
      fatherName: "Khan Sr",
      cnic: "12345-1234567-1",
      phone: "03001234567",
      phone2: "+923001234567",
      address: "Lahore",
      emergencyName: "Emergency",
      emergencyContact: "03007654321",
      dob: "1990-01-01T00:00:00.000Z",
      salary: 30000,
      jobTitle: "Cashier",
      shift: "morning",
    });
    expect(r.success).toBe(true);
  });

  it("defaults salary to 0 when not provided", () => {
    const r = createEmployeeSchema.parse({ name: "Ali" });
    expect(r.salary).toBe(0);
  });

  it("defaults jobTitle to 'Helper' when not provided", () => {
    const r = createEmployeeSchema.parse({ name: "Ali" });
    expect(r.jobTitle).toBe("Helper");
  });

  it("defaults shift to 'morning' when not provided", () => {
    const r = createEmployeeSchema.parse({ name: "Ali" });
    expect(r.shift).toBe("morning");
  });

  it("coerces string salary to number", () => {
    const r = createEmployeeSchema.safeParse({
      name: "Ali",
      salary: "30000",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.salary).toBe(30000);
  });

  it("rejects a missing name", () => {
    const r = createEmployeeSchema.safeParse({ salary: 30000 });
    expect(r.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const r = createEmployeeSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a name longer than 100 chars", () => {
    const r = createEmployeeSchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid CNIC format", () => {
    const r = createEmployeeSchema.safeParse({
      name: "Ali",
      cnic: "12345678",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a null CNIC (optional)", () => {
    const r = createEmployeeSchema.safeParse({ name: "Ali", cnic: null });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid phone format", () => {
    const r = createEmployeeSchema.safeParse({
      name: "Ali",
      phone: "abc",
    });
    expect(r.success).toBe(false);
  });

  it("accepts an empty phone (or(z.literal('')))", () => {
    const r = createEmployeeSchema.safeParse({ name: "Ali", phone: "" });
    expect(r.success).toBe(true);
  });

  it("rejects a negative salary", () => {
    const r = createEmployeeSchema.safeParse({
      name: "Ali",
      salary: -1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a salary above 10 million", () => {
    const r = createEmployeeSchema.safeParse({
      name: "Ali",
      salary: 10_000_001,
    });
    expect(r.success).toBe(false);
  });

  it("accepts zero salary", () => {
    const r = createEmployeeSchema.safeParse({ name: "Ali", salary: 0 });
    expect(r.success).toBe(true);
  });

  it("rejects a non-datetime dob", () => {
    const r = createEmployeeSchema.safeParse({
      name: "Ali",
      dob: "1990-01-01",
    });
    expect(r.success).toBe(false);
  });
});

describe("updateEmployeeSchema", () => {
  it("accepts an empty object", () => {
    const r = updateEmployeeSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts isActive boolean", () => {
    const r = updateEmployeeSchema.safeParse({ isActive: false });
    expect(r.success).toBe(true);
  });
});

describe("recordAttendanceSchema", () => {
  it("accepts a valid attendance record", () => {
    const r = recordAttendanceSchema.safeParse({
      date: "2027-01-01T00:00:00.000Z",
      status: "present",
    });
    expect(r.success).toBe(true);
  });

  it("accepts all valid statuses", () => {
    for (const status of ["present", "absent", "late", "half_day", "leave"]) {
      const r = recordAttendanceSchema.safeParse({
        date: "2027-01-01T00:00:00.000Z",
        status,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejects an invalid status", () => {
    const r = recordAttendanceSchema.safeParse({
      date: "2027-01-01T00:00:00.000Z",
      status: "remote",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-datetime date", () => {
    const r = recordAttendanceSchema.safeParse({
      date: "2027-01-01",
      status: "present",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing date", () => {
    const r = recordAttendanceSchema.safeParse({ status: "present" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing status", () => {
    const r = recordAttendanceSchema.safeParse({
      date: "2027-01-01T00:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });
});

describe("applyLeaveSchema", () => {
  it("accepts a valid leave request", () => {
    const r = applyLeaveSchema.safeParse({
      type: "casual",
      startDate: "2027-01-01T00:00:00.000Z",
      endDate: "2027-01-03T00:00:00.000Z",
      days: 3,
    });
    expect(r.success).toBe(true);
  });

  it("accepts all valid leave types", () => {
    for (const type of [
      "casual",
      "sick",
      "annual",
      "unpaid",
      "maternity",
      "other",
    ]) {
      const r = applyLeaveSchema.safeParse({
        type,
        startDate: "2027-01-01T00:00:00.000Z",
        endDate: "2027-01-02T00:00:00.000Z",
        days: 2,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejects an invalid leave type", () => {
    const r = applyLeaveSchema.safeParse({
      type: "paternity",
      startDate: "2027-01-01T00:00:00.000Z",
      endDate: "2027-01-02T00:00:00.000Z",
      days: 2,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer days value", () => {
    const r = applyLeaveSchema.safeParse({
      type: "casual",
      startDate: "2027-01-01T00:00:00.000Z",
      endDate: "2027-01-02T00:00:00.000Z",
      days: 1.5,
    });
    expect(r.success).toBe(false);
  });

  it("rejects zero days", () => {
    const r = applyLeaveSchema.safeParse({
      type: "casual",
      startDate: "2027-01-01T00:00:00.000Z",
      endDate: "2027-01-01T00:00:00.000Z",
      days: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects days above 365", () => {
    const r = applyLeaveSchema.safeParse({
      type: "annual",
      startDate: "2027-01-01T00:00:00.000Z",
      endDate: "2028-01-01T00:00:00.000Z",
      days: 366,
    });
    expect(r.success).toBe(false);
  });
});

describe("updateLeaveSchema", () => {
  it("accepts approved status", () => {
    const r = updateLeaveSchema.safeParse({
      leaveId: validUuid,
      status: "approved",
    });
    expect(r.success).toBe(true);
  });

  it("accepts rejected status", () => {
    const r = updateLeaveSchema.safeParse({
      leaveId: validUuid,
      status: "rejected",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const r = updateLeaveSchema.safeParse({
      leaveId: validUuid,
      status: "pending",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-UUID leaveId", () => {
    const r = updateLeaveSchema.safeParse({
      leaveId: "nope",
      status: "approved",
    });
    expect(r.success).toBe(false);
  });
});

describe("giveAdvanceSchema", () => {
  it("accepts a positive amount", () => {
    const r = giveAdvanceSchema.safeParse({ amount: 5000 });
    expect(r.success).toBe(true);
  });

  it("coerces string amount to number", () => {
    const r = giveAdvanceSchema.safeParse({ amount: "5000" });
    expect(r.success).toBe(true);
  });

  it("rejects a non-positive amount (zero)", () => {
    const r = giveAdvanceSchema.safeParse({ amount: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const r = giveAdvanceSchema.safeParse({ amount: -1 });
    expect(r.success).toBe(false);
  });
});

describe("deductAdvanceSchema", () => {
  it("accepts a positive deducted amount", () => {
    const r = deductAdvanceSchema.safeParse({ deducted: 1000 });
    expect(r.success).toBe(true);
  });

  it("rejects a non-positive deducted amount", () => {
    const r = deductAdvanceSchema.safeParse({ deducted: 0 });
    expect(r.success).toBe(false);
  });
});

describe("createNoteSchema", () => {
  it("accepts a valid note", () => {
    const r = createNoteSchema.safeParse({ content: "Good work" });
    expect(r.success).toBe(true);
  });

  it("defaults type to 'general'", () => {
    const r = createNoteSchema.parse({ content: "x" });
    expect(r.type).toBe("general");
  });

  it("accepts all valid note types", () => {
    for (const type of [
      "general",
      "warning",
      "appreciation",
      "promotion",
      "incident",
    ]) {
      const r = createNoteSchema.safeParse({ content: "x", type });
      expect(r.success).toBe(true);
    }
  });

  it("rejects an invalid note type", () => {
    const r = createNoteSchema.safeParse({ content: "x", type: "bonus" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty content", () => {
    const r = createNoteSchema.safeParse({ content: "" });
    expect(r.success).toBe(false);
  });

  it("rejects content longer than 1000 chars", () => {
    const r = createNoteSchema.safeParse({ content: "x".repeat(1001) });
    expect(r.success).toBe(false);
  });
});

describe("promoteEmployeeSchema", () => {
  it("accepts a valid promotion", () => {
    const r = promoteEmployeeSchema.safeParse({
      newJobTitle: "Senior Cashier",
      newRole: "manager",
      newSalary: 50000,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a promotion without role/salary (just title)", () => {
    const r = promoteEmployeeSchema.safeParse({
      newJobTitle: "Senior Cashier",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty newJobTitle", () => {
    const r = promoteEmployeeSchema.safeParse({ newJobTitle: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a newJobTitle longer than 100 chars", () => {
    const r = promoteEmployeeSchema.safeParse({
      newJobTitle: "a".repeat(101),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid newRole", () => {
    const r = promoteEmployeeSchema.safeParse({
      newJobTitle: "X",
      newRole: "ceo",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative newSalary", () => {
    const r = promoteEmployeeSchema.safeParse({
      newJobTitle: "X",
      newSalary: -1,
    });
    expect(r.success).toBe(false);
  });
});

describe("assignStaffSchema", () => {
  it("accepts a valid staff assignment", () => {
    const r = assignStaffSchema.safeParse({
      employeeId: validUuid,
      role: "cashier",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an optional storeId + email", () => {
    const r = assignStaffSchema.safeParse({
      employeeId: validUuid,
      role: "manager",
      storeId: validUuid,
      email: "user@example.com",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-UUID employeeId", () => {
    const r = assignStaffSchema.safeParse({
      employeeId: "nope",
      role: "cashier",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid role", () => {
    const r = assignStaffSchema.safeParse({
      employeeId: validUuid,
      role: "ceo",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email when provided", () => {
    const r = assignStaffSchema.safeParse({
      employeeId: validUuid,
      role: "cashier",
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
  });
});
