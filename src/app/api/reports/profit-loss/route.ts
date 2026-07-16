import { NextRequest } from "next/server";
import { requireManager, getStoreFilter } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { getProfitAndLoss } from "@/services/accountingService";

// GET /api/reports/profit-loss?from=2026-01-01&to=2026-07-04
//
// Returns the Profit & Loss statement for a date range.
// Defaults to the current month if no dates provided.
// Includes:
//   - Revenue accounts (credit-normal, shown as positive)
//   - Expense accounts (debit-normal, shown as positive)
//   - Total Revenue, Total Expenses, Net Profit
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireManager();
  const { storeId } = getStoreFilter(session);

  if (!storeId) {
    throw new HttpError(
      "Please select a specific store before viewing reports. 'All Stores' mode is not supported for financial reports.",
      400,
      "STORE_NOT_SELECTED",
    );
  }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Default to current month if not provided
  let fromDate: Date;
  let toDate: Date;

  if (fromParam) {
    // FIX P2-12: Parse as LOCAL time (not UTC). `new Date("2026-07-01")` parses
    // as UTC midnight, which shifts to the previous day in timezones behind UTC.
    // Appending T00:00:00 forces local-time parsing. This must match the
    // toDate handling (which uses setHours — also local) for consistency.
    fromDate = new Date(fromParam + "T00:00:00");
    if (isNaN(fromDate.getTime())) {
      throw new HttpError(
        "Invalid 'from' date. Use YYYY-MM-DD.",
        400,
        "VALIDATION_ERROR",
      );
    }
  } else {
    // Default: first day of current month (local time)
    fromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  }

  if (toParam) {
    // FIX P2-12: Same fix — parse as local time.
    toDate = new Date(toParam + "T00:00:00");
    if (isNaN(toDate.getTime())) {
      throw new HttpError(
        "Invalid 'to' date. Use YYYY-MM-DD.",
        400,
        "VALIDATION_ERROR",
      );
    }
    // Set to end of day (local time)
    toDate.setHours(23, 59, 59, 999);
  } else {
    // Default: today, end of day
    toDate = new Date();
    toDate.setHours(23, 59, 59, 999);
  }

  if (fromDate > toDate) {
    throw new HttpError(
      "'from' date cannot be after 'to' date",
      400,
      "VALIDATION_ERROR",
    );
  }

  const pnl = await getProfitAndLoss(storeId, fromDate, toDate);

  return apiSuccess(pnl);
});
