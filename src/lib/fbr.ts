// AUDIT-FIX C-15 + C-16: FBR (Pakistan Federal Board of Revenue) integration
// client. Submits tax invoices to the FBR e-invoicing API for compliance.
//
// Required env vars (set in Vercel dashboard + .env):
//   FBR_API_KEY        — API key from FBR registration
//   FBR_ENVIRONMENT    — "sandbox" or "production" (default: sandbox)
//   FBR_POS_ID         — POS ID assigned by FBR at registration
//   FBR_NTN            — National Tax Number of the registered taxpayer
//   FBR_SRN            — Sales Tax Registration Number
//
// If env vars are missing, FBR submission is silently skipped (no throw)
// — the app runs without FBR integration, just like before this fix.
// Once you add the env vars, invoices will be submitted automatically.
//
// FBR API docs: https://www.fbr.gov.pk/posix/digital-invoicing/

const FBR_SANDBOX_URL = "https://gw.fbr.gov.pk/digital-invoicing/sandbox/v1";
const FBR_PRODUCTION_URL = "https://gw.fbr.gov.pk/digital-invoicing/v1";

interface FBRInvoiceItem {
  itemCode: string;
  itemDescription: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
}

interface FBRInvoice {
  invoiceNumber: string;
  invoiceDate: string; // ISO 8601
  customerName?: string;
  customerNtn?: string;
  customerCnic?: string;
  items: FBRInvoiceItem[];
  totalQuantity: number;
  totalAmount: number;
  totalDiscount: number;
  totalTax: number;
  netAmount: number;
}

interface FBRSubmissionResult {
  success: boolean;
  fbrInvoiceNumber?: string;
  fbrQrCode?: string;
  error?: string;
}

function getFbrBaseUrl(): string {
  return process.env.FBR_ENVIRONMENT === "production"
    ? FBR_PRODUCTION_URL
    : FBR_SANDBOX_URL;
}

function isFbrConfigured(): boolean {
  return !!(
    process.env.FBR_API_KEY &&
    process.env.FBR_POS_ID &&
    process.env.FBR_NTN
  );
}

/**
 * Submit a tax invoice to FBR. Returns the FBR-assigned invoice number
 * and QR code (for printing on the receipt).
 *
 * If FBR is not configured (env vars missing), returns { success: false,
 * error: "NOT_CONFIGURED" } — callers should treat this as a no-op and
 * continue with local-only invoice numbering.
 */
export async function submitInvoiceToFbr(
  invoice: FBRInvoice,
): Promise<FBRSubmissionResult> {
  if (!isFbrConfigured()) {
    return {
      success: false,
      error: "NOT_CONFIGURED",
    };
  }

  const apiKey = process.env.FBR_API_KEY!;
  const posId = process.env.FBR_POS_ID!;
  const ntn = process.env.FBR_NTN!;
  const srn = process.env.FBR_SRN ?? "";

  try {
    const response = await fetch(`${getFbrBaseUrl()}/invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-POS-ID": posId,
        "X-NTN": ntn,
        "X-SRN": srn,
      },
      body: JSON.stringify(invoice),
      // AUDIT-FIX H-15: Don't let FBR API calls hang the request.
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("[fbr] Submission failed:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `FBR API returned ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      fbrInvoiceNumber: data.invoiceNumber ?? data.fbrInvoiceNumber,
      fbrQrCode: data.qrCode ?? data.fbrQrCode,
    };
  } catch (err) {
    console.error("[fbr] Submission exception:", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Retry submission for invoices that failed previously.
 * Called by the FBR retry cron every 15 minutes.
 *
 * Returns the count of successful retries + failures.
 */
export async function retryFailedInvoices(
  maxRetries: number = 50,
): Promise<{ retried: number; succeeded: number; failed: number }> {
  if (!isFbrConfigured()) {
    return { retried: 0, succeeded: 0, failed: 0 };
  }

  const { prisma } = await import("@/lib/prisma");

  // Find sales with a taxInvoiceNumber but no fbrInvoiceNumber (meaning
  // FBR submission failed or hasn't been attempted). Limit to maxRetries
  // per cron run to stay within Vercel's 10s timeout.
  const pendingSales = await prisma.sale.findMany({
    where: {
      taxInvoiceNumber: { not: null },
      // AUDIT-FIX: Only retry sales that haven't been successfully submitted.
      fbrInvoiceNumber: null,
    },
    select: {
      id: true,
      saleNumber: true,
      taxInvoiceNumber: true,
      subtotal: true,
      tax: true,
      total: true,
      discount: true,
      saleDate: true,
      customer: { select: { name: true } },
      items: {
        select: {
          productId: true,
          quantity: true,
          unitPrice: true,
          discount: true,
          taxAmount: true,
          total: true,
          product: { select: { sku: true, name: true, unit: true } },
        },
      },
    },
    take: maxRetries,
  });

  let succeeded = 0;
  let failed = 0;

  for (const sale of pendingSales) {
    const invoice: FBRInvoice = {
      invoiceNumber: sale.taxInvoiceNumber!,
      invoiceDate: sale.saleDate.toISOString(),
      customerName: sale.customer?.name,
      items: sale.items.map((item) => ({
        itemCode: item.product.sku,
        itemDescription: item.product.name,
        quantity: Number(item.quantity),
        unitOfMeasure: item.product.unit ?? "piece",
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        taxRate: 0, // TODO: store taxRate on SaleItem
        taxAmount: Number(item.taxAmount),
        totalAmount: Number(item.total),
      })),
      totalQuantity: sale.items.reduce(
        (s, i) => s + Number(i.quantity),
        0,
      ),
      totalAmount: Number(sale.subtotal),
      totalDiscount: Number(sale.discount),
      totalTax: Number(sale.tax),
      netAmount: Number(sale.total),
    };

    const result = await submitInvoiceToFbr(invoice);
    if (result.success) {
      succeeded++;
      // AUDIT-FIX: Store fbrInvoiceNumber + fbrQrCode on the Sale record
      // so they appear on the receipt and the retry cron doesn't re-submit.
      await prisma.sale
        .update({
          where: { id: sale.id },
          data: {
            fbrInvoiceNumber: result.fbrInvoiceNumber ?? null,
            fbrQrCode: result.fbrQrCode ?? null,
          },
        })
        .catch((err) => {
          console.error("[fbr] Failed to store FBR result on sale:", {
            saleId: sale.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    } else {
      failed++;
    }
  }

  return { retried: pendingSales.length, succeeded, failed };
}
