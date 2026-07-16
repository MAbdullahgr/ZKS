import { NextRequest, NextResponse } from "next/server";

// Vercel Hobby plan only allows 1 cron job per day.
// This route combines all daily maintenance tasks into a single call.
//
// Schedule: 0 4 * * * (4 AM UTC = 9 AM PKT daily)
//
// Tasks run sequentially:
//   1. Low-stock alerts (email + SMS to managers)
//   2. Reconcile journal entries (detect orphans)
//   3. Audit log retention (delete logs older than 365 days)
//   4. FBR retry (submit pending invoices — limited to 10 per run on Hobby)

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    console.error("[cron:daily] CRON_SECRET is not set — refusing to serve request.");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const startTime = Date.now();

  // Helper to run a sub-task with error handling
  async function runTask(name: string, fn: () => Promise<unknown>) {
    try {
      const taskStart = Date.now();
      const result = await fn();
      results[name] = { ok: true, durationMs: Date.now() - taskStart, result };
    } catch (err) {
      console.error(`[cron:daily] ${name} failed:`, err);
      results[name] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // 1. Low-stock alerts
  await runTask("lowStockAlert", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { sendLowStockAlert } = await import("@/lib/email");

    const lowStockProducts = await prisma.product.findMany({
      where: {
        isActive: true,
        stockQuantity: { lte: prisma.product.fields.minStockLevel },
      },
      select: { id: true, name: true, sku: true, stockQuantity: true, minStockLevel: true, storeId: true },
      take: 5000,
    });

    const byStore = new Map<string, Array<{ name: string; sku: string; stock: number; minStock: number }>>();
    for (const p of lowStockProducts) {
      const arr = byStore.get(p.storeId) ?? [];
      arr.push({ name: p.name, sku: p.sku, stock: Number(p.stockQuantity), minStock: Number(p.minStockLevel) });
      byStore.set(p.storeId, arr);
    }

    const stores = await prisma.store.findMany({
      where: { id: { in: Array.from(byStore.keys()) } },
      select: { id: true, name: true },
    });

    let emailsSent = 0;
    for (const store of stores) {
      const products = byStore.get(store.id) ?? [];
      if (products.length === 0) continue;

      const recipients = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: ["manager", "admin", "owner"] },
          OR: [
            { storeId: store.id },
            { employee: { assignments: { some: { storeId: store.id, isActive: true } } } },
          ],
        },
        select: { email: true },
      });

      if (recipients.length > 0) {
        const success = await sendLowStockAlert(recipients.map(r => r.email), store.name, products);
        if (success) emailsSent += recipients.length;
      }
    }

    return { totalLowStock: lowStockProducts.length, emailsSent };
  });

  // 2. Reconcile journal entries — detect orphaned records without posted JEs
  await runTask("reconcileJournals", async () => {
    const { prisma } = await import("@/lib/prisma");

    // Count sales that have no posted JE (referenceType=sale, referenceId=sale.id)
    const allSales = await prisma.sale.findMany({
      where: { taxInvoiceNumber: { not: null } },
      select: { id: true },
      take: 5000,
    });

    let orphanedSales = 0;
    for (const sale of allSales) {
      const je = await prisma.journalEntry.findFirst({
        where: { referenceType: "sale", referenceId: sale.id, status: "posted" },
        select: { id: true },
      });
      if (!je) orphanedSales++;
    }

    // Count expenses without posted JEs
    const allExpenses = await prisma.expense.findMany({
      select: { id: true },
      take: 5000,
    });

    let orphanedExpenses = 0;
    for (const expense of allExpenses) {
      const je = await prisma.journalEntry.findFirst({
        where: { referenceType: "expense", referenceId: expense.id, status: "posted" },
        select: { id: true },
      });
      if (!je) orphanedExpenses++;
    }

    return { orphanedSales, orphanedExpenses };
  });

  // 3. Audit log retention (delete logs older than 365 days)
  await runTask("auditLogRetention", async () => {
    const { prisma } = await import("@/lib/prisma");

    const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS ?? "365", 10);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return { deleted: result.count, retentionDays };
  });

  // 4. FBR retry (limited to 10 per run on Hobby plan to avoid timeout)
  await runTask("fbrRetry", async () => {
    const { retryFailedInvoices } = await import("@/lib/fbr");
    return await retryFailedInvoices(10);
  });

  const totalDurationMs = Date.now() - startTime;
  console.log(`[cron:daily] Complete in ${totalDurationMs}ms`, results);

  return NextResponse.json({
    ok: true,
    durationMs: totalDurationMs,
    tasks: results,
  });
}
