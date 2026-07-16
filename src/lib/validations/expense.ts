import { z } from "zod";

// Default expense categories — the hardcoded enum. Custom per-store
// categories live in the ExpenseCategory table and are referenced via
// `categoryId` (see createExpenseSchema below).
export const DEFAULT_EXPENSE_CATEGORIES = [
  "utilities",
  "rent",
  "salaries",
  "supplies",
  "transport",
  "maintenance",
  "marketing",
  "misc",
] as const;

export const createExpenseSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  // `category` is the hardcoded enum (kept for backward compat). Either
  // `category` OR `categoryId` must be provided — `categoryId` takes
  // precedence when both are sent (custom categories win).
  category: z
    .enum([
      "utilities",
      "rent",
      "salaries",
      "supplies",
      "transport",
      "maintenance",
      "marketing",
      "misc",
    ])
    .default("misc"),
  categoryId: z.string().uuid("Invalid category ID").optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  date: z.string().datetime().optional(),
});

// Schema for creating a custom ExpenseCategory row (POST /api/expense-categories).
export const createExpenseCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(100, "Category name must be 100 characters or fewer"),
  isActive: z.boolean().optional().default(true),
});

