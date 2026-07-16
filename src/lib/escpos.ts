import { ReceiptData } from "@/hooks/useReceipt";

const encoder = new TextEncoder();

// ESC/POS Command Helpers
const init = () => [0x1b, 0x40];
// AUDIT-FIX: Select UTF-8 code page so Urdu text renders correctly on
// thermal printers. Most thermal printers (Xprinter, Epson TM series)
// default to Code Page 437 — Urdu would print as garbage characters
// without this command. ESC t n where n=0 selects PC437, n=19 selects
// UTF-8 on most printers that support it. We try n=19; if the printer
// doesn't support UTF-8, it will ignore the command and the Urdu will
// still print as garbage (but the rest of the receipt will be fine).
const selectUtf8CodePage = () => [0x1b, 0x74, 19];
const center = () => [0x1b, 0x61, 0x01];
const left = () => [0x1b, 0x61, 0x00];
const boldOn = () => [0x1b, 0x45, 0x01];
const boldOff = () => [0x1b, 0x45, 0x00];
const doubleSize = () => [0x1d, 0x21, 0x11];
const normalSize = () => [0x1d, 0x21, 0x00];
const feed = (n: number) => [0x1b, 0x64, n];
// AUDIT-FIX: Use partial cut (0x01) instead of full cut (0x00) — partial
// cut is more universally supported across thermal printer models.
const cut = () => [0x1d, 0x56, 0x01];

// NEW: Print a CODE128 barcode using the ESC/POS `GS k` command.
// Format: `GS k m n d1...dn` where:
//   - 0x1d 0x6b = "GS k"
//   - 0x02      = barcode type (CODE128 per task spec)
//   - n         = length of data (single byte, max 255)
//   - d1...dn   = barcode data bytes
// Note: the length byte must be ≤ 255; longer inputs are truncated.
const printBarcode = (text: string) => {
  const bytes = [0x1d, 0x6b, 0x02]; // GS k, CODE128
  const textBytes = encoder.encode(text);
  // Cap at 255 bytes — the length is a single byte in ESC/POS Function A.
  const len = Math.min(textBytes.length, 255);
  bytes.push(len); // length byte
  for (let i = 0; i < len; i++) bytes.push(textBytes[i]);
  return bytes;
};

// AUDIT-FIX: Make printer width configurable. 58mm printers are 32 chars/line,
// 80mm printers are 48 chars/line. Default to 32 (most common for ZKR).
// Exported so tests and callers can override.
export const PRINTER_WIDTH = 32;

function pad(str: string, width: number, align: "left" | "right" = "left") {
  str = str.substring(0, width);
  const spaces = " ".repeat(Math.max(0, width - str.length));
  return align === "right" ? spaces + str : str + spaces;
}

// Exported for unit testing.
export { pad };

export function generateEscPosBytes(data: ReceiptData): Uint8Array {
  const commands: number[] = [];

  commands.push(...init());
  // AUDIT-FIX: Select UTF-8 code page AFTER init so Urdu renders correctly.
  commands.push(...selectUtf8CodePage());

  // Header
  commands.push(...center());
  commands.push(...doubleSize(), ...boldOn());
  commands.push(...encoder.encode(data.storeName + "\n"));
  commands.push(...normalSize(), ...boldOff());

  if (data.storeAddress)
    commands.push(...encoder.encode(data.storeAddress + "\n"));
  if (data.storePhone)
    commands.push(...encoder.encode("Ph: " + data.storePhone + "\n"));
  if (data.storeNTN)
    commands.push(...encoder.encode("NTN: " + data.storeNTN + "\n"));
  commands.push(...encoder.encode("\n"));

  // Info
  commands.push(...left());
  commands.push(...encoder.encode(`Bill No: ${data.invoiceNumber}\n`));
  commands.push(...encoder.encode(`Date: ${data.date} ${data.time}\n`));
  if (data.customerName)
    commands.push(...encoder.encode(`Customer: ${data.customerName}\n`));
  commands.push(...encoder.encode("--------------------------------\n")); // 32 chars wide

  // Items
  data.items.forEach((item) => {
    const name = item.variantName
      ? `${item.name} (${item.variantName})`
      : item.name;
    const qtyStr = `${item.quantity} x ${item.unitPrice.toFixed(2)}`;

    commands.push(...encoder.encode(name + "\n"));
    commands.push(
      ...encoder.encode(
        pad(qtyStr, 16, "left") +
          pad(item.total.toFixed(2), 16, "right") +
          "\n",
      ),
    );
  });

  commands.push(...encoder.encode("--------------------------------\n"));

  // Totals
  commands.push(
    ...encoder.encode(
      pad("Subtotal:", 16) + pad(data.subtotal.toFixed(2), 16, "right") + "\n",
    ),
  );
  if (data.discount > 0)
    commands.push(
      ...encoder.encode(
        pad("Discount:", 16) +
          pad(data.discount.toFixed(2), 16, "right") +
          "\n",
      ),
    );
  if (data.tax > 0)
    commands.push(
      ...encoder.encode(
        pad("Tax:", 16) + pad(data.tax.toFixed(2), 16, "right") + "\n",
      ),
    );

  commands.push(...boldOn(), ...doubleSize());
  commands.push(
    ...encoder.encode(
      pad("TOTAL:", 16) + pad(data.total.toFixed(2), 16, "right") + "\n",
    ),
  );
  commands.push(...normalSize(), ...boldOff());

  // Payments
  data.payments.forEach((p) => {
    commands.push(
      ...encoder.encode(
        pad(p.label + ":", 16) + pad(p.amount.toFixed(2), 16, "right") + "\n",
      ),
    );
  });
  if (data.changeDue > 0)
    commands.push(
      ...encoder.encode(
        pad("Change:", 16) + pad(data.changeDue.toFixed(2), 16, "right") + "\n",
      ),
    );

  // Footer
  commands.push(...center());
  commands.push(...encoder.encode("\n"));
  commands.push(...encoder.encode("Thank you for shopping!\n"));
  commands.push(...encoder.encode("تشریف لانے کا شکریہ\n"));

  // NEW: Barcode — encode the invoice number as CODE128 via the GS k command.
  // Placed after the footer text and before the paper feed + cut so the
  // barcode prints at the very bottom of the receipt.
  commands.push(...printBarcode(data.invoiceNumber));

  commands.push(...feed(2));
  commands.push(...cut());

  return new Uint8Array(commands);
}
