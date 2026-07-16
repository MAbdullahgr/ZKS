import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// INFRA: Reconciliation cron — detects financial records that are missing
// their corresponding double-entry JournalEntry. This is the safety net for
// the postSale/postSaleReturn/postExpense/postPayroll accounting flows: if
// any of them silently drop the JE (bug, race, partial failure between the
// sale commit and the JE commit), this cron surfaces the orphan so it can
// be backfilled before the monthly books are closed.
//
// Vercel Cron schedule: "0 19 * * *" — daily at 19:00 UTC = midnight PKT
// (Asia/Karachi is UTC+5). Configured in vercel.json.
//
// What counts as "orphan":
//   - Sale            with no posted JE where referenceType='sale'        AND referenceId=sale.id
//   - SaleReturn      with no posted JE where referenceType='sale_return' AND referenceId=saleReturn.id
//   - Expense         with no posted JE where referenceType='expense'     AND referenceId=expense.id
//   - Payroll         with no posted JE where referenceType='payroll'     AND referenceId=payroll.id
//
// We only count posted JEs (status='posted') — reversed/draft JEs don't
// satisfy the double-entry guarantee on their own. The check uses
// NOT EXISTS subqueries via $queryRaw so we hit the DB once per source
// table (4 round trips total) instead of loading every record into memory.

const CRON_SECRET = process.env.CRON_SECRET;

interface OrphanCount {
  source: "sale" | "sale_return" | "expense" | "payroll";
  orphaned: number;
}

export async function GET(req: NextRequest) {
  // Fail CLOSED when CRON_SECRET is unset (same pattern as fbr-retry +
  // low-stock-alert crons).
  if (!CRON_SECRET) {
    logger.error("CRON_RECONCILE_SECRET_MISSING", {
      message: "CRON_SECRET is not set — refusing to serve request.",
    });
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
    // Run all 4 orphan-count queries in parallel. Each query is a single
    // SELECT COUNT(*) with a NOT EXISTS subquery — fast even on millions of
    // rows thanks to the @@index([referenceType, referenceId]) on
    // JournalEntry (and the new @@index([storeId, referenceType, referenceId])
    // added in this same infra pass).
    const [saleRaw, saleReturnRaw, expenseRaw, payrollRaw] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "Sale" s
        WHERE NOT EXISTS (
          SELECT 1 FROM "JournalEntry" je
          WHERE je."referenceType" = 'sale'
            AND je."referenceId"   = s.id
            AND je.status          = 'posted'
        )
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "SaleReturn" sr
        WHERE NOT EXISTS (
          SELECT 1 FROM "JournalEntry" je
          WHERE je."referenceType" = 'sale_return'
            AND je."referenceId"   = sr.id
            AND je.status          = 'posted'
        )
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "Expense" e
        WHERE NOT EXISTS (
          SELECT 1 FROM "JournalEntry" je
          WHERE je."referenceType" = 'expense'
            AND je."referenceId"   = e.id
            AND je.status          = 'posted'
        )
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "Payroll" p
        WHERE NOT EXISTS (
          SELECT 1 FROM "JournalEntry" je
          WHERE je."referenceType" = 'payroll'
            AND je."referenceId"   = p.id
            AND je.status          = 'posted'
        )
      `,
    ]);

    // BigInt → Number for JSON serialization. Counts here are bounded by the
    // total row count of each table, which is well within Number.MAX_SAFE_INTEGER.
    const counts: OrphanCount[] = [
      { source: "sale", orphaned: Number(saleRaw[0]?.count ?? 0n) },
      { source: "sale_return", orphaned: Number(saleReturnRaw[0]?.count ?? 0n) },
      { source: "expense", orphaned: Number(expenseRaw[0]?.count ?? 0n) },
      { source: "payroll", orphaned: Number(payrollRaw[0]?.count ?? 0n) },
    ];

    const totalOrphaned = counts.reduce((sum, c) => sum + c.orphaned, 0);

    // Per-source warnings — structured so log aggregators can fire alerts
    // when any source has > 0 orphans. The cron returns 200 even when
    // orphans are found (this is a data-quality signal, not a runtime
    // failure); alerting should key off the warning log lines, not HTTP
    // status.
    for (const c of counts) {
      if (c.orphaned > 0) {
        logger.warn("RECONCILE_JOURNAL_ORPHANS_FOUND", {
          source: c.source,
          orphaned: c.orphaned,
        });
      }
    }

    logger.info("CRON_RECONCILE_COMPLETE", { totalOrphaned, counts });

    return NextResponse.json({
      ok: true,
      totalOrphaned,
      counts,
    });
  } catch (err) {
    logger.error("CRON_RECONCILE_FAILED", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
