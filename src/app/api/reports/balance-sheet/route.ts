import { NextRequest } from "next/server";
import { requireManager, getStoreFilter } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { getBalanceSheet } from "@/services/accountingService";

// GET /api/reports/balance-sheet?asOf=2026-07-04
//
// Returns the Balance Sheet as of a given date (defaults to today).
// Includes:
//   - Assets (debit-normal)
//   - Liabilities (credit-normal)
//   - Equity (credit-normal) + Retained Earnings (YTD net profit, auto-injected)
//   - Total Assets must equal Total Liabilities + Equity (isBalanced: true)
//
// The Retained Earnings figure is automatically calculated as the YTD net profit
// (Jan 1 to asOfDate). This is standard accounting practice — you don't need
// a separate retained earnings account or manual closing entries.
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
  const asOfParam = searchParams.get("asOf");

  let asOfDate: Date | undefined;
  if (asOfParam) {
    const parsed = new Date(asOfParam + "T23:59:59");
    if (isNaN(parsed.getTime())) {
      throw new HttpError(
        "Invalid date format. Use YYYY-MM-DD.",
        400,
        "VALIDATION_ERROR",
      );
    }
    asOfDate = parsed;
  }

  const balanceSheet = await getBalanceSheet(storeId, asOfDate);

  return apiSuccess(balanceSheet);
});
