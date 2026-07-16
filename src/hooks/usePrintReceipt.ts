"use client";

import { useCallback, useRef } from "react";
import { ReceiptData, ReceiptItem } from "./useReceipt";
import { generateEscPosBytes } from "@/lib/escpos";
import bwipjs from "bwip-js/browser";

// Strict types for WebUSB to avoid installing extra @types packages
interface USBDevice {
  open(): Promise<void>;
  configuration: { configurationValue: number } | null;
  selectConfiguration(configValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(
    endpointNumber: number,
    data: BufferSource,
  ): Promise<{ status: string; bytesWritten: number }>;
  close(): Promise<void>;
}

interface USB {
  requestDevice(options?: { filters?: unknown[] }): Promise<USBDevice>;
}

interface Navigator {
  usb?: USB;
}

// AUDIT-FIX H-38: Escape all user-provided strings before interpolating
// into the receipt HTML. Product names, customer names, notes, store info
// are all user-controlled — a product named "<script>alert(1)</script>"
// would execute in the print iframe context (same origin) and could steal
// cookies. This helper escapes the 5 HTML-significant characters.
function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}

// Generate a CODE128 barcode as a PNG data URL using bwip-js.
// Returns an empty string if generation fails (so the receipt can
// still print without the barcode image).
function generateBarcodeDataURL(text: string): string {
  // SSR guard — bwip-js requires a canvas, which only exists in the browser.
  if (typeof document === "undefined") return "";
  if (!text) return "";
  try {
    const canvas = document.createElement("canvas");
    bwipjs.toCanvas(canvas, {
      bcid: "code128",
      text,
      scale: 2,
      height: 8,
      includetext: true,
      textxalign: "center",
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[receipt] barcode generation failed:", err);
    return "";
  }
}

function buildReceiptHTML(data: ReceiptData): string {
  const itemsHtml = data.items
    .map((item: ReceiptItem) => {
      // FIX: Calculate total safely if it's missing from the cart object
      const itemTotal =
        item.total !== undefined ? item.total : item.unitPrice * item.quantity;
      // AUDIT-FIX H-38: Escape all user-provided strings.
      return `
        <tr>
          <td colspan="3">
            <div class="item-row-main">
              <span>${escapeHtml(item.name)}${item.variantName ? ` (${escapeHtml(item.variantName)})` : ""}</span>
              <span>Rs ${itemTotal.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="item-details">${item.quantity} x ${item.unitPrice.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</div>
            ${item.note ? `<div class="item-note"> ${escapeHtml(item.note)}</div>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");

  const paymentsHtml = (data.payments || [])
    .map(
      (p) => `
    <div>${escapeHtml(p.label)}:</div>
    <div class="text-right">Rs ${p.amount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</div>
  `,
    )
    .join("");

  // AUDIT-FIX H-38: Escape store info too — it comes from settings which
  // an admin could set to anything.
  const storeName = escapeHtml(data.storeName);
  const storeAddress = escapeHtml(data.storeAddress);
  const storePhone = escapeHtml(data.storePhone);
  const storeNTN = escapeHtml(data.storeNTN);
  const invoiceNumber = escapeHtml(data.invoiceNumber);
  const customerName = escapeHtml(data.customerName);

  // Generate a CODE128 barcode encoding the invoice number. If generation
  // fails, we just skip the barcode image (no try/catch needed here —
  // generateBarcodeDataURL already handles errors internally).
  const barcodeDataURL = generateBarcodeDataURL(data.invoiceNumber);
  const barcodeHtml = barcodeDataURL
    ? `<div class="text-center" style="margin: 10px 0;">
         <img src="${barcodeDataURL}" alt="Barcode: ${invoiceNumber}" style="max-width: 80%; height: auto;" />
       </div>`
    : "";

  return `
    <div class="receipt-container">
      <div class="text-center">
        <h1 class="brand-main bold">${storeName}</h1>
        ${data.storeAddress ? `<p class="shop-meta">${storeAddress}</p>` : ""}
        ${data.storePhone ? `<p class="shop-meta bold">Ph: ${storePhone}</p>` : ""}
        ${data.storeNTN ? `<p class="shop-meta">NTN: ${storeNTN}</p>` : ""}
      </div>
      <div class="divider-dashed"></div>
      <div class="info-block">
        <div><span class="bold">Bill No:</span> #${invoiceNumber}</div>
        <div class="text-right"><span class="bold">Date:</span> ${escapeHtml(data.date)}</div>
        <div style="grid-column: span 2; text-align: center"><span class="bold">Time:</span> ${escapeHtml(data.time)}</div>
        ${customerName ? `<div style="grid-column: span 2"><span class="bold">Customer:</span> ${customerName}</div>` : ""}
      </div>
      <div class="divider-double"></div>
      <table class="items-table">
        <thead><tr><th align="left" style="width: 60%">Item Description</th><th align="right" style="width: 40%">Amount</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="divider-dashed"></div>
      <div class="totals-section">
        <div>Sub Total:</div>
        <div class="text-right">Rs ${data.subtotal.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</div>
        ${data.discount > 0 ? `<div>Discount:</div><div class="text-right">Rs ${data.discount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</div>` : ""}
        ${data.tax > 0 ? `<div>Tax:</div><div class="text-right">Rs ${data.tax.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</div>` : ""}
        <div class="grand-total-label">NET TOTAL:</div>
        <div class="text-right grand-total-value">Rs ${data.total.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</div>
        <div class="divider-dashed" style="grid-column: span 2; margin: 4px 0"></div>
        ${paymentsHtml}
        ${data.changeDue > 0 ? `<div>Change Due:</div><div class="text-right bold">Rs ${data.changeDue.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</div>` : ""}
      </div>
      <div class="divider-double"></div>
      ${barcodeHtml}
      <div class="text-center footer">
        <p class="bold">Thank you for shopping at ${storeName}!</p>
        <p class="urdu-bless">تشریف لانے کا شکریہ</p>
      </div>
    </div>
  `;
}

export function usePrintReceipt() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastOrderRef = useRef<ReceiptData | null>(null);

  const printReceipt = useCallback((data: ReceiptData | null) => {
    if (!data) return;
    lastOrderRef.current = data;

    const html = buildReceiptHTML(data);
    let iframe = iframeRef.current;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.top = "-10000px";
      iframe.style.left = "-10000px";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.border = "none";
      iframe.title = "receipt-printer";
      document.body.appendChild(iframe);
      iframeRef.current = iframe;
    }

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
      <style>
        /* AUDIT-FIX: 80mm thermal paper size + zero margin. Most browsers
           default to A4/Letter which wastes paper on a thermal printer. */
        @page { size: 80mm auto; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Courier New", Courier, monospace; color: #000000; }
        html { display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; background-color: #f0f0f0; }
        body { padding: 20px; }
        .receipt-container { width: 300px; background-color: #ffffff; padding: 20px 15px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
        /* AUDIT-FIX: Prevent item rows from splitting across pages. */
        .receipt-container tr, .item-row-main { page-break-inside: avoid; }
        .text-center { text-align: center; } .text-right { text-align: right; } .bold { font-weight: bold; }
        .divider-dashed { border-top: 1px dashed #000000; margin: 10px 0; } .divider-double { border-top: 3px double #000000; margin: 12px 0; }
        .brand-main { font-size: 32px; letter-spacing: 4px; line-height: 1; margin-bottom: 2px; } .shop-meta { font-size: 11px; line-height: 1.4; }
        .info-block { font-size: 11px; display: grid; grid-template-columns: 1fr 1fr; row-gap: 4px; margin: 12px 0; }
        .items-table { width: 100%; border-collapse: collapse; font-size: 12px; } .items-table th { font-weight: bold; padding-bottom: 6px; text-transform: uppercase; font-size: 11px; }
        .items-table td { padding: 6px 0; vertical-align: top; } .item-row-main { display: flex; justify-content: space-between; }
        .item-details { font-size: 10px; color: #444; } .item-note { font-size: 10px; color: #666; font-style: italic; margin-top: 2px; padding-left: 4px; border-left: 2px solid #ccc; }
        .totals-section { font-size: 12px; display: grid; grid-template-columns: 1fr 120px; row-gap: 6px; align-items: center; }
        .grand-total-label, .grand-total-value { font-size: 16px; font-weight: bold; }
        .footer { font-size: 11px; line-height: 1.5; margin-top: 15px; } .urdu-bless { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; margin-top: 6px; font-weight: bold; }
      </style></head><body>${html}</body></html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 150);
  }, []);

  const reprintLast = useCallback(() => {
    if (lastOrderRef.current) {
      printReceipt(lastOrderRef.current);
    }
  }, [printReceipt]);

  // NEW FEATURE: Direct ESC/POS Printing via WebUSB
  const printDirectly = useCallback(async (data: ReceiptData | null) => {
    if (!data) return;

    const nav = navigator as Navigator;
    if (!nav.usb) {
      throw new Error(
        "WebUSB is not supported in this browser. Please use Chrome or Edge.",
      );
    }

    try {
      // Request printer connection (usually vendorId: 0x04b8 for Epson, 0x0416 for Xprinter)
      const device = await nav.usb.requestDevice({ filters: [] });
      await device.open();

      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }
      await device.claimInterface(0);

      const bytes = generateEscPosBytes(data);

      // Endpoint 1 is standard for OUT bulk transfers on thermal printers
      await device.transferOut(1, bytes.buffer as ArrayBuffer);

      await device.close();
      return true;
    } catch (err) {
      console.error("[Direct Print Error]", err);
      throw err;
    }
  }, []);

  return {
    printReceipt,
    reprintLast,
    printDirectly,
  };
}
