import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { retryFailedInvoices } from "@/lib/fbr";

// Vercel Cron: retries failed FBR invoice submissions every 15 minutes.
// Configured in vercel.json at "*/15 * * * *".
//
// AUDIT-FIX C-15: Now actually retries FBR submissions. Previously this
// was a stub that only counted pending sales — the cron ran every 15
// minutes consuming Vercel invocation budget but never submitted anything.
// Now it calls retryFailedInvoices() which submits up to 50 pending
// invoices per run (capped to stay within Vercel's 10s timeout).
//
// If FBR env vars are not set, the cron runs but skips submission
// (returns { pendingCount, retried: 0 }). Once you add FBR_API_KEY +
// FBR_POS_ID + FBR_NTN, submissions will start.

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // FIX: Fail CLOSED when CRON_SECRET is unset.
  if (!CRON_SECRET) {
    console.error(
      "[cron:fbr-retry] CRON_SECRET is not set — refusing to serve request.",
    );
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pendingCount = await prisma.sale.count({
      where: {
        taxInvoiceNumber: { not: null },
        // AUDIT-FIX: Only count sales that haven't been successfully submitted.
        fbrInvoiceNumber: null,
      },
    });

    // AUDIT-FIX C-15: Actually retry pending invoices.
    const { retried, succeeded, failed } = await retryFailedInvoices(50);

    console.log(
      `[cron:fbr-retry] ${pendingCount} pending, ${retried} retried, ${succeeded} succeeded, ${failed} failed.`,
    );

    return NextResponse.json({
      ok: true,
      pendingCount,
      retried,
      succeeded,
      failed,
    });
  } catch (err) {
    console.error("[cron:fbr-retry] failed:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
