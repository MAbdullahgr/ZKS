import { z } from "zod";

// FIX P2-13: Pakistan phone number validation. Accepts formats like
// 03001234567, +923001234567, 0300-1234567. Min 10 digits, max 15 (E.164).
const phoneRegex = /^(\+92|0)?[\d-]{10,15}$/;

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  fatherName: z.string().trim().max(100).optional().nullable(),
  cnic: z
    .string()
    .regex(/^\d{5}-\d{7}-\d$/, "Invalid CNIC format (e.g., 12345-1234567-1)")
    .optional()
    .nullable(),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(phoneRegex, "Invalid phone number format")
    .optional()
    .nullable()
    .or(z.literal("")),
  phone2: z
    .string()
    .trim()
    .max(20)
    .regex(phoneRegex, "Invalid phone number format")
    .optional()
    .nullable()
    .or(z.literal("")),
  address: z.string().trim().max(500).optional().nullable(),
  emergencyName: z.string().trim().max(100).optional().nullable(),
  emergencyContact: z
    .string()
    .trim()
    .max(20)
    .regex(phoneRegex, "Invalid phone number format")
    .optional()
    .nullable()
    .or(z.literal("")),
  dob: z.string().datetime().optional().nullable(),
  salary: z.coerce.number().min(0, "Salary cannot be negative").max(10000000, "Salary unreasonably high").default(0),
  jobTitle: z.string().trim().max(100).default("Helper"),
  shift: z.string().trim().max(50).default("morning"),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const recordAttendanceSchema = z.object({
  date: z.string().datetime(),
  checkIn: z.string().datetime().optional().nullable(),
  checkOut: z.string().datetime().optional().nullable(),
  status: z.enum(["present", "absent", "late", "half_day", "leave"]),
  notes: z.string().max(500).optional().nullable(),
});

export const applyLeaveSchema = z.object({
  // FIX P2-13: Use enum for leave type instead of arbitrary string.
  type: z.enum(["casual", "sick", "annual", "unpaid", "maternity", "other"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  days: z.number().int().positive("Days must be greater than 0").max(365, "Days cannot exceed 365"),
  reason: z.string().max(500).optional().nullable(),
});

export const updateLeaveSchema = z.object({
  leaveId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

export const giveAdvanceSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reason: z.string().max(500).optional().nullable(),
});

export const deductAdvanceSchema = z.object({
  deducted: z.coerce
    .number()
    .positive("Deduction amount must be greater than 0"),
});

export const createNoteSchema = z.object({
  type: z
    .enum(["general", "warning", "appreciation", "promotion", "incident"])
    .default("general"),
  content: z.string().trim().min(1, "Note content is required").max(1000),
});

export const promoteEmployeeSchema = z.object({
  newJobTitle: z.string().trim().min(1, "New job title is required").max(100),
  newRole: z
    .enum(["cashier", "warehouse", "manager", "admin", "owner"])
    .optional(),
  newSalary: z.coerce.number().min(0).optional(),
  reason: z.string().max(500).optional().nullable(),
});

export const assignStaffSchema = z.object({
  employeeId: z.string().uuid(),
  storeId: z.string().uuid().optional(),
  role: z.enum(["cashier", "warehouse", "manager", "admin", "owner"]),
  email: z.string().email("Valid email is required").optional(),
});
