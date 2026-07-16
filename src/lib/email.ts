import { Resend } from "resend";

// AUDIT-FIX C-17: Email service for password-reset notifications, low-stock
// alerts, and payroll notifications. Uses Resend (https://resend.com) —
// free tier allows 100 emails/day, 3000/month.
//
// Required env vars (set in Vercel dashboard + .env):
//   RESEND_API_KEY     — from https://resend.com/api-keys
//   RESEND_FROM_EMAIL  — e.g. "ZKR Store <noreply@yourdomain.com>"
//                       (must be a verified domain in Resend)
//
// If env vars are missing, emails are silently skipped (no throw) — the
// app runs without email, just like before this fix. Once you add the env
// vars, emails will start flowing.

let client: Resend | null = null;
let initialized = false;

function getClient(): Resend | null {
  if (initialized) return client;
  initialized = true;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[email] RESEND_API_KEY not set — email sending disabled. " +
        "Set this in production for password-reset + low-stock notifications.",
    );
    return null;
  }
  client = new Resend(apiKey);
  return client;
}

export interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  const resend = getClient();
  if (!resend) return false;

  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? "ZKR Store <noreply@zkr.app>";

  try {
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    if (error) {
      console.error("[email] Failed to send:", {
        to: params.to,
        subject: params.subject,
        error: error.message,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Exception:", {
      to: params.to,
      subject: params.subject,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ─── Templated emails ───────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  email: string,
  method: "recovery_code" | "admin_reset",
): Promise<void> {
  const subject =
    method === "recovery_code"
      ? "Your ZKR password was reset via recovery code"
      : "Your ZKR password was reset by an administrator";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0f172a;">ZKR Store — Password Reset Notification</h2>
      <p>Your password was just reset${method === "recovery_code" ? " using your recovery code" : " by an administrator"}.</p>
      <p>If you initiated this reset, no action is needed — you can log in with your new password.</p>
      <p><strong>If you did NOT initiate this reset, your account may be compromised.</strong> Please contact your store manager or owner immediately.</p>
      <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;">
      <p style="color: #64748b; font-size: 12px;">
        This is an automated message from ZKR Store Management System.
        Time: ${new Date().toISOString()}
      </p>
    </div>
  `;

  await sendEmail({ to: email, subject, html });
}

export async function sendLowStockAlert(
  toEmails: string[],
  storeName: string,
  lowStockProducts: Array<{ name: string; sku: string; stock: number; minStock: number }>,
): Promise<boolean> {
  if (toEmails.length === 0) return false;

  const subject = `[ZKR] Low Stock Alert — ${storeName} (${lowStockProducts.length} items)`;

  const productRows = lowStockProducts
    .map(
      (p) =>
        `<tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${p.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${p.sku}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626; font-weight: bold;">${p.stock}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${p.minStock}</td>
        </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc2626;">⚠️ Low Stock Alert — ${storeName}</h2>
      <p>The following ${lowStockProducts.length} product(s) are at or below their minimum stock level. Please reorder soon to avoid stockouts.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1;">Product</th>
            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1;">SKU</th>
            <th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Current Stock</th>
            <th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Min Stock</th>
          </tr>
        </thead>
        <tbody>${productRows}</tbody>
      </table>
      <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;">
      <p style="color: #64748b; font-size: 12px;">
        This is an automated daily alert from ZKR Store Management System.
        Generated: ${new Date().toISOString()}
      </p>
    </div>
  `;

  // Send to each recipient (Resend doesn't support multiple TOs in a single
  // call reliably across all email providers — BCC is more reliable but
  // we'll send individual emails for now).
  let anySuccess = false;
  for (const email of toEmails) {
    const ok = await sendEmail({ to: email, subject, html });
    if (ok) anySuccess = true;
  }
  return anySuccess;
}
