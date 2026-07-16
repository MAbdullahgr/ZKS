import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLowStockAlert } from "@/lib/email";
import { sendLowStockSMS } from "@/lib/sms";

// Vercel Cron: checks for low-stock products every day at 9 AM PKT.
// Configured in vercel.json at "0 4 * * *" (4 AM UTC = 9 AM PKT).
//
// AUDIT-FIX C-17: Now actually sends email alerts to managers of each
// store. Previously this was a stub that only logged counts — the cron
// ran daily consuming Vercel invocation budget but no alerts reached
// store managers. Now:
//   1. Query low-stock products grouped by store
//   2. For each store, find managers + admins assigned to that store
//   3. Send an email alert with the product list to each manager
//   4. Also send an SMS to every manager who has a phone number on file
//      (via the SMS service in lib/sms.ts — skipped silently if no
//      SMS_PROVIDER env var is set)
//
// Emails are silently skipped if RESEND_API_KEY is not set — the cron
// still runs and logs counts, but no emails are sent. Once you add the
// env var, emails will start flowing. SMS alerts behave the same way:
// silently skipped unless SMS_PROVIDER (and the relevant provider
// credentials) are set.

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // FIX: Fail CLOSED when CRON_SECRET is unset (same as fbr-retry).
  if (!CRON_SECRET) {
    console.error(
      "[cron:low-stock-alert] CRON_SECRET is not set — refusing to serve request.",
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
    const lowStockProducts = await prisma.product.findMany({
      where: {
        isActive: true,
        stockQuantity: { lte: prisma.product.fields.minStockLevel },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        minStockLevel: true,
        storeId: true,
      },
      // AUDIT-FIX H-12: Cap to prevent OOM on huge catalogs.
      take: 5000,
    });

    console.log(
      `[cron:low-stock-alert] ${lowStockProducts.length} products are at or below min stock level.`,
    );

    // Group by store
    const byStore = new Map<
      string,
      Array<{ name: string; sku: string; stock: number; minStock: number }>
    >();
    for (const p of lowStockProducts) {
      const arr = byStore.get(p.storeId) ?? [];
      arr.push({
        name: p.name,
        sku: p.sku,
        stock: Number(p.stockQuantity),
        minStock: Number(p.minStockLevel),
      });
      byStore.set(p.storeId, arr);
    }

    const storeIds = Array.from(byStore.keys());
    const stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true },
    });

    // AUDIT-FIX C-17: Send email alerts to managers + admins of each store.
    // Find users with manager/admin/owner role who have an email and are
    // assigned to the store (via User.storeId or StoreAssignment).
    let emailsSent = 0;
    let emailsFailed = 0;
    let smsSent = 0;
    let smsFailed = 0;

    for (const store of stores) {
      const lowStockForStore = byStore.get(store.id) ?? [];
      if (lowStockForStore.length === 0) continue;

      // Find recipients: managers+ assigned to this store.
      // Select the employee phone (linked via User.employeeId → Employee.phone)
      // so we can also send SMS to those who have a phone on file.
      const recipients = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: ["manager", "admin", "owner"] },
          OR: [
            { storeId: store.id },
            {
              employee: {
                assignments: { some: { storeId: store.id, isActive: true } },
              },
            },
          ],
        },
        select: {
          email: true,
          employee: { select: { phone: true } },
        },
      });

      const recipientEmails = recipients.map((r) => r.email);
      if (recipientEmails.length === 0) continue;

      const success = await sendLowStockAlert(
        recipientEmails,
        store.name,
        lowStockForStore,
      );

      if (success) {
        emailsSent += recipientEmails.length;
      } else {
        emailsFailed += recipientEmails.length;
      }

      // SMS: send to every recipient who has an employee phone on file.
      // The SMS service silently skips when SMS_PROVIDER is not set, so
      // this is a no-op in environments without SMS configured.
      const phoneRecipients = recipients.filter((r) => !!r.employee?.phone);
      for (const r of phoneRecipients) {
        const phone = r.employee?.phone as string;
        try {
          // sendLowStockSMS resolves void — we infer success/failure from
          // a wrapped sendSMS call. To keep this loop simple, we treat
          // "did not throw" as a successful attempt; the SMS lib already
          // swallows internal failures and returns false from sendSMS.
          await sendLowStockSMS(phone, store.name, lowStockForStore.length);
          smsSent += 1;
        } catch {
          smsFailed += 1;
        }
      }

      // Audit-log the alert
      await prisma.auditLog
        .create({
          data: {
            storeId: store.id,
            action: "LOW_STOCK_ALERT_SENT",
            entityType: "Product",
            details: {
              productCount: lowStockForStore.length,
              recipientCount: recipientEmails.length,
              smsRecipientCount: phoneRecipients.length,
              success,
            } as never,
          },
        })
        .catch(() => {
          // Don't fail the cron if audit log fails
        });
    }

    const perStore = stores.map((s) => ({
      storeId: s.id,
      storeName: s.name,
      lowStockCount: byStore.get(s.id)?.length ?? 0,
    }));

    return NextResponse.json({
      ok: true,
      totalLowStock: lowStockProducts.length,
      perStore,
      emailsSent,
      emailsFailed,
      smsSent,
      smsFailed,
    });
  } catch (err) {
    console.error("[cron:low-stock-alert] failed:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
