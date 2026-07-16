import { NextRequest } from "next/server";
import { requireManager, getStoreFilter } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { getTrialBalance } from "@/services/accountingService";

// GET /api/reports/trial-balance?asOf=2026-07-04
//
// Returns the trial balance as of a given date (defaults to today).
// Every active account with a non-zero balance is listed, grouped by type,
// with debit and credit columns. The two columns must match (isBalanced: true)
// — if they don't, there's a bug in the journal entry posting logic.
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

  const trialBalance = await getTrialBalance(storeId, asOfDate);

  return apiSuccess(trialBalance);
});
