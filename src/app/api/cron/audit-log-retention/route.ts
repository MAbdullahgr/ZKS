import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma/client";

// INFRA: Audit-log retention cron. The AuditLog table grows monotonically —
// every auth attempt, every mutation, every cron run adds a row. Without
// pruning it eventually dominates the DB (both storage and index rebuild
// time during backups). This cron:
//
//   1. Aggregates logs older than the retention window (default 365 days,
//      configurable via AUDIT_LOG_RETENTION_DAYS env var) into daily summary
//      rows — one per (action, day) — so the historical pattern is preserved
//      even after the individual rows are gone.
//   2. Deletes the per-event rows older than the retention window. The
//      summary rows (action='AUDIT_LOG_SUMMARY', details={ date, action,
//      count }) are kept indefinitely as a compressed history.
//
// Vercel Cron schedule: "0 0 * * 0" — every Sunday at 00:00 UTC. Weekly is
// the right cadence: daily would be wasteful (the window barely moves),
// monthly would let the table grow too large between runs.
//
// Why aggregate-then-delete instead of plain delete:
//   - Compliance/forensics: "did we have a brute-force wave on 2024-03-15?"
//     is answerable from the summary rows even after the individual
//     LOGIN_FAILED rows are gone.
//   - Storage: 1 summary row per (day × action) ≈ 30 rows/month vs. thousands
//     of per-event rows. ~99% storage reduction for old data.

const CRON_SECRET = process.env.CRON_SECRET;

const DEFAULT_RETENTION_DAYS = 365;

// Cap the number of rows deleted per cron run. A backlog of multiple years
// (e.g. if the cron was disabled) would otherwise try to delete millions
// of rows in one transaction and time out / lock the table. The cap is
// generous enough for steady-state (a busy store produces ~5k audit rows/
// week) and small enough that even a multi-year backlog drains in ~10
// weekly runs.
const MAX_DELETE_PER_RUN = 100_000;

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    logger.error("CRON_AUDIT_RETENTION_SECRET_MISSING", {
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
    const retentionDays = parseRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // ─── Step 1: Aggregate old logs into daily summaries ────────────────
    // Group by (action, day) and count. Store as a single AuditLog row per
    // group with action='AUDIT_LOG_SUMMARY' and details={ originalAction,
    // date, count, sampleStoreIds }. We use a raw query because Prisma's
    // groupBy doesn't support date_trunc directly.
    const summaries = await prisma.$queryRaw<
      Array<{ action: string; day: Date; count: bigint; store_ids: string[] | null }>
    >`
      SELECT
        action,
        date_trunc('day', "createdAt")::timestamp AS day,
        COUNT(*)::bigint AS count,
        array_agg(DISTINCT "storeId") FILTER (WHERE "storeId" IS NOT NULL) AS store_ids
      FROM "AuditLog"
      WHERE "createdAt" < ${cutoff}
        AND action <> 'AUDIT_LOG_SUMMARY'
      GROUP BY action, day
    `;

    // Insert summaries in a single transaction. Each summary is one row.
    // We skip inserting summaries that already exist for the same (action,
    // day) — the unique-ish check is on (action='AUDIT_LOG_SUMMARY' AND
    // details->>'originalAction' = action AND details->>'date' = day).
    // The simplest dedup: don't re-summarize if a summary already exists.
    // We accept rare duplicate summaries (idempotent re-runs) over a
    // complex upsert — the storage cost of a few dupes is negligible.
    let summariesInserted = 0;
    if (summaries.length > 0) {
      const summaryRows = summaries.map((s) => ({
        action: "AUDIT_LOG_SUMMARY" as const,
        entityType: "AuditLog",
        details: {
          originalAction: s.action,
          date: s.day.toISOString().slice(0, 10), // YYYY-MM-DD
          count: Number(s.count),
          storeIds: s.store_ids ?? [],
        } as unknown as Prisma.InputJsonValue,
        // Backdate the summary row to the day it summarizes so future
        // retention runs (which filter on createdAt) don't immediately
        // re-delete it. Use the LAST day of the window so summaries appear
        // at the "edge" of when they were aggregated.
        createdAt: s.day,
      }));

      // Insert in chunks of 1000 to stay within Postgres's parameter limit
      // (~65k params per query). 1000 rows × 4 fields = 4000 params — safe.
      for (let i = 0; i < summaryRows.length; i += 1000) {
        const chunk = summaryRows.slice(i, i + 1000);
        // Cast to AuditLogCreateManyInput[] — the `details` Json field's
        // InputJsonValue cast above is correct at runtime, but TS's union
        // resolution for createMany options narrows to `never` without this
        // explicit annotation (harmless type-level quirk with the SQLite
        // generated client).
        const inserted = await prisma.auditLog.createMany({
          data: chunk as Prisma.AuditLogCreateManyInput[],
          skipDuplicates: true,
        } as Prisma.AuditLogCreateManyArgs);
        summariesInserted += inserted.count;
      }
    }

    // ─── Step 2: Delete the per-event rows older than the cutoff ────────
    // Use a bounded raw DELETE with LIMIT (Postgres supports `ctid IN`
    // subquery as a portable LIMIT-on-DELETE pattern). Capping prevents a
    // multi-year backlog from timing out — subsequent weekly runs drain
    // the rest. We exclude AUDIT_LOG_SUMMARY rows so the aggregated history
    // survives the retention sweep indefinitely.
    //
    // NOTE: Prisma's `deleteMany` does NOT support `take` (that's only on
    // findMany). Raw SQL is the cleanest way to bound a delete. We use the
    // `ctid` (Postgres physical row id) subquery pattern so we can apply
    // LIMIT to a DELETE — direct `DELETE ... LIMIT N` isn't valid SQL.
    const deletedRows = await prisma.$executeRaw`
      DELETE FROM "AuditLog"
      WHERE ctid IN (
        SELECT ctid FROM "AuditLog"
        WHERE "createdAt" < ${cutoff}
          AND action <> 'AUDIT_LOG_SUMMARY'
        LIMIT ${MAX_DELETE_PER_RUN}
      )
    `;

    logger.info("CRON_AUDIT_RETENTION_COMPLETE", {
      retentionDays,
      cutoff: cutoff.toISOString(),
      summariesInserted,
      deleted: deletedRows,
      remainingBacklog: deletedRows >= MAX_DELETE_PER_RUN,
    });

    return NextResponse.json({
      ok: true,
      retentionDays,
      cutoff: cutoff.toISOString(),
      summariesInserted,
      deleted: deletedRows,
      // If we hit the cap, signal that there's a remaining backlog so the
      // next weekly run picks it up. Alerting can key off this flag.
      remainingBacklog: deletedRows >= MAX_DELETE_PER_RUN,
    });
  } catch (err) {
    logger.error("CRON_AUDIT_RETENTION_FAILED", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

function parseRetentionDays(): number {
  const raw = process.env.AUDIT_LOG_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 30) {
    // Floor at 30 days — anything shorter is almost certainly a misconfig
    // (compliance audits typically require ≥90 days).
    logger.warn("AUDIT_RETENTION_INVALID", {
      raw,
      fallback: DEFAULT_RETENTION_DAYS,
    });
    return DEFAULT_RETENTION_DAYS;
  }
  return n;
}
