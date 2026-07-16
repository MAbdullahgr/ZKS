// src/lib/sms.ts
//
// SMS service for Pakistani phone numbers.
// Currently supports Twilio (international) and Jazz/Telenor (local PK gateways).
// If SMS env vars are not set, SMS sending is silently skipped — the caller
// never sees an exception, just a `false` return. This matches the email
// service's "skip if not configured" pattern so that cron jobs and
// notification paths don't need to gate on env vars at every call site.
//
// Required env vars (set in Vercel dashboard + .env):
//   SMS_PROVIDER=twilio|jazz|telenor
//   SMS_API_KEY=...         (jazz / telenor)
//   SMS_SENDER_ID=...       (jazz / telenor — 3-11 chars, alphanumeric)
//
// For Twilio:
//   TWILIO_ACCOUNT_SID=...
//   TWILIO_AUTH_TOKEN=...
//   TWILIO_PHONE_NUMBER=... (E.164 format, e.g. +1234567890)

interface SMSParams {
  to: string; // Pakistan phone: 03XXXXXXXXX or +923XXXXXXXXX
  message: string;
}

/**
 * Normalize a Pakistani phone number to E.164 (+92XXXXXXXXXX).
 *
 * Accepts:
 *   - 03XXXXXXXXX       → +923XXXXXXXXX
 *   - 3XXXXXXXXX        → +923XXXXXXXXX (rare, but tolerate)
 *   - +923XXXXXXXXX     → unchanged
 *   - 92 3XX XXXXXXX    → +923XXXXXXXXX (whitespace stripped)
 *   - 03XX-XXXXXXX      → +923XXXXXXXXX (dashes stripped)
 *
 * If the input doesn't look like a Pakistani number, we still try to coerce
 * it to +92… — the provider will reject it if invalid. The point is to be
 * forgiving at the entry point and let the upstream SMS gateway do final
 * validation.
 */
export function normalizePakistanPhone(raw: string): string {
  const phone = raw.replace(/[\s-]/g, "");
  if (phone.startsWith("+92")) return phone;
  if (phone.startsWith("0092")) return "+" + phone.slice(2);
  if (phone.startsWith("92")) return "+" + phone;
  if (phone.startsWith("0")) return "+92" + phone.slice(1);
  return "+92" + phone;
}

export async function sendSMS(params: SMSParams): Promise<boolean> {
  const phone = normalizePakistanPhone(params.to);

  const provider = process.env.SMS_PROVIDER;
  if (!provider) {
    // SMS not configured — silently skip
    return false;
  }

  try {
    switch (provider) {
      case "twilio":
        return await sendViaTwilio(phone, params.message);
      case "jazz":
        return await sendViaJazz(phone, params.message);
      case "telenor":
        return await sendViaTelenor(phone, params.message);
      default:
        console.warn("[sms] Unknown SMS provider:", provider);
        return false;
    }
  } catch (err) {
    console.error("[sms] Failed to send:", {
      to: phone,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function sendViaTwilio(
  phone: string,
  message: string,
): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return false;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: phone, Body: message }),
      signal: AbortSignal.timeout(10000),
    },
  );
  return res.ok;
}

async function sendViaJazz(phone: string, message: string): Promise<boolean> {
  const apiKey = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID;
  if (!apiKey || !senderId) return false;

  // Jazz SMS API (https://api.jazzcma.com/v3/sendsms)
  const res = await fetch("https://api.jazzcma.com/v3/sendsms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, senderId, msisdn: phone, message }),
    signal: AbortSignal.timeout(10000),
  });
  return res.ok;
}

async function sendViaTelenor(
  phone: string,
  message: string,
): Promise<boolean> {
  const apiKey = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID;
  if (!apiKey || !senderId) return false;

  // Telenor CVAS API
  const res = await fetch("https://cvas.telenor.com.pk/api/v1/sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, senderId, msisdn: phone, message }),
    signal: AbortSignal.timeout(10000),
  });
  return res.ok;
}

// ─── Templated SMS ──────────────────────────────────────────────────────

/**
 * Low-stock alert SMS. Sent by the daily low-stock cron alongside the email
 * alert. Short enough to fit in a single SMS segment (160 chars).
 */
export async function sendLowStockSMS(
  phone: string,
  storeName: string,
  count: number,
): Promise<void> {
  await sendSMS({
    to: phone,
    message: `[ZKR] ${storeName}: ${count} product(s) are low on stock. Please check the inventory.`,
  });
}

/**
 * Password-reset notification SMS. Sent in addition to the email when a
 * user's password is reset (via recovery code or admin reset). The `phone`
 * is the user's employee phone — pass `null` if the user has no phone on
 * file (the SMS is silently skipped).
 */
export async function sendPasswordResetSMS(
  phone: string | null,
): Promise<void> {
  if (!phone) return;
  await sendSMS({
    to: phone,
    message:
      "[ZKR] Your password was just reset. If you did not request this, contact your manager immediately.",
  });
}
