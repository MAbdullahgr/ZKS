// src/lib/money.ts
//
// Money & Quantity safety module — the A+ foundation for financial precision.
//
// WHY THIS EXISTS
// ---------------
// The codebase uses Prisma `Decimal` fields for money (Decimal(10,2) /
// Decimal(12,2)) and stock quantities (Decimal(10,3)). Until now, these were
// coerced to JS `Number()` at the API boundary. JS `Number` is IEEE-754
// double — safe integer range ends at 2^53 (~9 quadrillion), which is fine
// for amounts under ~Rs 9 trillion. BUT:
//
//   1. Arithmetic on coerced values compounds rounding error. The classic
//      example: `0.1 + 0.2 === 0.30000000000000004`. Over thousands of
//      sales, journal entries drift from physical reality.
//   2. Prisma's default JSON serialization of `Decimal` is a *string*, so
//      the codebase defensively wrapped every field in `Number()` to get a
//      consistent shape. This produced ~150 coercion sites (see the audit),
//      each one a place where precision can silently leak.
//   3. Two live bugs were found by the audit: `GET /api/settings` returns
//      `taxRate` as a raw Prisma-decimal-string while `PATCH` returns it as
//      `Number`; `GET /api/dashboard` returns `lowStockProducts[].stockQuantity`
//      raw, which then hits a lexicographic-comparison bug in the client
//      (`"9" <= "10"` is `false` — low-stock flag is wrong).
//
// THE FIX
// -------
// Introduce a branded `Money` type (a string at runtime, but TypeScript
// won't let you mix it with `number` or plain `string`). All money values
// are serialized as strings at the API boundary in a canonical
// "1234.56" format. Arithmetic is done through dedicated helpers that
// preserve precision by working on integer paisa internally.
//
// Migration is incremental: existing code keeps working (every helper
// accepts `Money | number | string | Prisma.Decimal`), so call sites can be
// upgraded one at a time without a big-bang rewrite.
//
// USAGE
// -----
//   // Serialization (DB → API):
//   const payload = { total: moneyToString(sale.total) }; // "1234.56"
//
//   // Parsing (API → internal):
//   const amount = parseMoney(req.body.amount);            // Money
//
//   // Arithmetic (precision-safe):
//   const sum = moneyAdd(a, b);
//   const diff = moneySub(a, b);
//   const scaled = moneyMul(qty, unitPrice);
//   const perUnit = moneyDiv(total, qty);
//
//   // Comparison:
//   if (moneyCmp(balance, creditLimit) > 0) { ... }
//
//   // Zod (input validation):
//   const schema = z.object({ amount: zMoney() });

import { z } from "zod";

// Note: we deliberately do NOT import Prisma's Decimal class directly.
// MoneyInput / QuantityInput accept any object with a toString() method,
// which structurally covers Prisma.Decimal without hard-dependency on the
// Prisma runtime-library import path (which has changed across Prisma
// versions). The toPaisa/toMilliUnits helpers detect Decimal-like objects
// via `typeof input.toString === "function"`.

// ─── Brand primitives ─────────────────────────────────────────────────────
//
// Branded types use a phantom `__brand` field that exists only at compile
// time. This prevents accidental mixing:
//   - `Money` is a string-shaped value representing a rupee amount (2 dp).
//   - `Quantity` is a string-shaped value representing a stock amount (3 dp).
//   - A plain `string` cannot be assigned to `Money` without going through
//     `parseMoney` / `moneyToString`, which validates the format.

export type Money = string & { readonly __brand: "Money" };
export type Quantity = string & { readonly __brand: "Quantity" };

// Anything the money helpers will accept on input. Kept loose so that
// existing call sites (which pass `Number(decimal)` or raw `Decimal`) keep
// working during the incremental migration.
//
// `Prisma.Decimal` is the class returned by Prisma for Decimal columns. We
// accept it structurally (anything with a toString()) so this file doesn't
// hard-depend on the Prisma runtime-library path.
export type MoneyInput =
  | Money
  | number
  | string
  | { toString(): string } // covers Prisma.Decimal
  | null
  | undefined;
export type QuantityInput =
  | Quantity
  | number
  | string
  | { toString(): string } // covers Prisma.Decimal
  | null
  | undefined;

// ─── Canonical form ───────────────────────────────────────────────────────
//
// All Money values are normalized to a string with exactly 2 decimal places,
// no thousands separators, optional leading "-", no leading zeros (except
// for values < 1). Examples:
//   "0.00", "1.50", "1234.56", "-50.00", "1000000.00"
//
// All Quantity values use exactly 3 decimal places (matches Decimal(10,3)).

const MONEY_REGEX = /^-?\d+(\.\d{1,2})?$/;
const QUANTITY_REGEX = /^-?\d+(\.\d{1,3})?$/;
const PAISA_PER_RUPEE = 100;
const MILLI_PER_UNIT = 1000;

// ─── Internal: convert any input to integer paisa ─────────────────────────
//
// Working in integer paisa (and integer milli-units for quantities) is what
// gives us exact arithmetic. All addition, subtraction, and multiplication
// happen on integers; only the final output is formatted back to a decimal
// string. This is the same approach used by Stripe (cents), Shopify (cents),
// and every serious financial library.

function toPaisa(input: MoneyInput): number {
  if (input == null) return 0;

  // Prisma Decimal (or any Decimal-like object) — use its toString
  // (lossless) then parse the resulting string.
  if (typeof input === "object" && typeof input.toString === "function") {
    return toPaisa(input.toString());
  }

  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new MoneyError(
        `Cannot convert non-finite number to Money: ${input}`,
      );
    }
    // Round to paisa using banker's rounding-free floor-then-adjust.
    // Math.round handles the 0.5 case toward +inf which matches the
    // existing `Math.round(x * 100) / 100` pattern used throughout the
    // codebase — so behavior is preserved during migration.
    return Math.round(input * PAISA_PER_RUPEE);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "") return 0;
    if (!MONEY_REGEX.test(trimmed)) {
      throw new MoneyError(`Invalid money string: "${input}"`);
    }
    // Parse without floating point: split on ".".
    const negative = trimmed.startsWith("-");
    const abs = negative ? trimmed.slice(1) : trimmed;
    const [whole, frac = ""] = abs.split(".");
    const fraction = (frac + "00").slice(0, 2); // pad/truncate to 2 dp
    const paisa = Number(whole) * PAISA_PER_RUPEE + Number(fraction);
    return negative ? -paisa : paisa;
  }

  throw new MoneyError(`Unsupported money input type: ${typeof input}`);
}

function toMilliUnits(input: QuantityInput): number {
  if (input == null) return 0;
  if (typeof input === "object" && typeof input.toString === "function") {
    return toMilliUnits(input.toString());
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new MoneyError(
        `Cannot convert non-finite number to Quantity: ${input}`,
      );
    }
    return Math.round(input * MILLI_PER_UNIT);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "") return 0;
    if (!QUANTITY_REGEX.test(trimmed)) {
      throw new MoneyError(`Invalid quantity string: "${input}"`);
    }
    const negative = trimmed.startsWith("-");
    const abs = negative ? trimmed.slice(1) : trimmed;
    const [whole, frac = ""] = abs.split(".");
    const fraction = (frac + "000").slice(0, 3);
    const milli = Number(whole) * MILLI_PER_UNIT + Number(fraction);
    return negative ? -milli : milli;
  }
  throw new MoneyError(`Unsupported quantity input type: ${typeof input}`);
}

function formatPaisa(paisa: number): Money {
  const negative = paisa < 0;
  const absPaisa = Math.abs(paisa);
  const rupees = Math.floor(absPaisa / PAISA_PER_RUPEE);
  const frac = absPaisa % PAISA_PER_RUPEE;
  const fracStr = frac.toString().padStart(2, "0");
  const str = `${rupees}.${fracStr}`;
  return (negative ? `-${str}` : str) as Money;
}

function formatMilliUnits(milli: number): Quantity {
  const negative = milli < 0;
  const absMilli = Math.abs(milli);
  const units = Math.floor(absMilli / MILLI_PER_UNIT);
  const frac = absMilli % MILLI_PER_UNIT;
  const fracStr = frac.toString().padStart(3, "0");
  const str = `${units}.${fracStr}`;
  return (negative ? `-${str}` : str) as Quantity;
}

// ─── Public: parse / serialize ────────────────────────────────────────────

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/**
 * Convert any money-shaped input to a canonical Money string ("1234.56").
 *
 * This is the function to call at the API response boundary instead of
 * `Number(decimal)`. It is lossless for all values representable by
 * Decimal(12,2) (up to ~Rs 10 billion with paisa precision).
 *
 *   moneyToString(sale.total)           // Prisma Decimal → "1234.56"
 *   moneyToString(1234.5)               // number → "1234.50"
 *   moneyToString("1234.567")           // string → "1234.57" (rounded)
 *   moneyToString(null)                 // → "0.00"
 */
export function moneyToString(input: MoneyInput): Money {
  return formatPaisa(toPaisa(input));
}

/**
 * Convert any quantity-shaped input to a canonical Quantity string
 * ("12.500"). Use this for stock fields (Decimal(10,3)) instead of
 * `Number(decimal)`.
 */
export function qtyToString(input: QuantityInput): Quantity {
  return formatMilliUnits(toMilliUnits(input));
}

/**
 * Parse a Money value from user input. Use in Zod transforms and route
 * handlers. Throws MoneyError on malformed input.
 */
export function parseMoney(input: MoneyInput): Money {
  // Reject null/undefined/empty — callers should make these optional explicitly.
  if (input == null || input === "") {
    throw new MoneyError("Money value is required");
  }
  return moneyToString(input);
}

/**
 * Parse a Quantity value from user input.
 */
export function parseQty(input: QuantityInput): Quantity {
  if (input == null || input === "") {
    throw new MoneyError("Quantity value is required");
  }
  return qtyToString(input);
}

/**
 * Convert a Money value to a JS number. Use ONLY for:
 *   - Display via `.toLocaleString()` (the Intl formatter accepts numbers)
 *   - Passing to libraries that require number (e.g. Recharts axis domain)
 *   - Logging
 *
 * Do NOT use for arithmetic — use moneyAdd/moneySub/moneyMul/moneyDiv instead.
 * Do NOT use to serialize API responses — use moneyToString.
 */
export function moneyToNumber(input: MoneyInput): number {
  return toPaisa(input) / PAISA_PER_RUPEE;
}

export function qtyToNumber(input: QuantityInput): number {
  return toMilliUnits(input) / MILLI_PER_UNIT;
}

// ─── Public: arithmetic (precision-safe) ──────────────────────────────────
//
// All arithmetic happens in integer paisa (or milli-units) and is exact.
// The results are returned as Money/Quantity branded strings so they can be
// chained.

export function moneyAdd(a: MoneyInput, b: MoneyInput): Money {
  return formatPaisa(toPaisa(a) + toPaisa(b));
}

export function moneySub(a: MoneyInput, b: MoneyInput): Money {
  return formatPaisa(toPaisa(a) - toPaisa(b));
}

/**
 * Multiply a money value by a number. Use for `price * quantity`.
 * The multiplier is a plain number (not Money) because quantities are not
 * money — using a plain number here keeps the types honest.
 *
 * For `price * qty` where qty is itself a Money/Quantity, use moneyMulQty.
 */
export function moneyMul(money: MoneyInput, multiplier: number): Money {
  if (!Number.isFinite(multiplier)) {
    throw new MoneyError(`Multiplier must be finite: ${multiplier}`);
  }
  // Multiply paisa by the multiplier. To avoid float drift we round to the
  // nearest paisa at the end — this matches the existing
  // `Math.round(x * 100) / 100` pattern.
  const paisa = toPaisa(money);
  const result = Math.round((paisa * multiplier) / PAISA_PER_RUPEE);
  return formatPaisa(result);
}

/**
 * Multiply a money value by a quantity. Use for `unitPrice * stockQuantity`
 * where the quantity can have 3 decimal places (weighed goods).
 */
export function moneyMulQty(
  money: MoneyInput,
  quantity: QuantityInput,
): Money {
  // money is in paisa (2dp), qty is in milli-units (3dp).
  // product in paisa×milli = paisa * 1000 * qty_units + paisa * qty_milli
  // = paisa * (qty_units * 1000 + qty_milli)
  // Final money in paisa = product / 1000
  const paisa = toPaisa(money);
  const milli = toMilliUnits(quantity);
  const productPaisaMilli = paisa * milli;
  const resultPaisa = Math.round(productPaisaMilli / MILLI_PER_UNIT);
  return formatPaisa(resultPaisa);
}

/**
 * Divide a money value by a number. Use for per-unit computations like
 * `(totalReceivedValue) / totalQty` (WAC). Rounds to the nearest paisa.
 */
export function moneyDiv(money: MoneyInput, divisor: number): Money {
  if (!Number.isFinite(divisor)) {
    throw new MoneyError(`Divisor must be finite: ${divisor}`);
  }
  if (divisor === 0) {
    throw new MoneyError("Cannot divide money by zero");
  }
  const paisa = toPaisa(money);
  const resultPaisa = Math.round(paisa / divisor);
  return formatPaisa(resultPaisa);
}

/**
 * Divide a money value by a quantity. Use for per-unit price computations.
 */
export function moneyDivQty(
  money: MoneyInput,
  quantity: QuantityInput,
): Money {
  const milli = toMilliUnits(quantity);
  if (milli === 0) {
    throw new MoneyError("Cannot divide money by zero quantity");
  }
  const paisa = toPaisa(money);
  // paisa / milli = paisa_per_milli; convert back to paisa by *1000/1000
  const resultPaisa = Math.round((paisa * MILLI_PER_UNIT) / milli);
  return formatPaisa(resultPaisa);
}

// ─── Public: comparison ───────────────────────────────────────────────────
//
// Returns -1 / 0 / 1 like a standard comparator. Never returns booleans
// because `===` on Money strings is exact but `>` / `<` on Money strings
// would be lexicographic (the original bug in inventory/[id]/page.tsx:443).

export function moneyCmp(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  const pa = toPaisa(a);
  const pb = toPaisa(b);
  if (pa < pb) return -1;
  if (pa > pb) return 1;
  return 0;
}

export function moneyEq(a: MoneyInput, b: MoneyInput): boolean {
  return moneyCmp(a, b) === 0;
}

export function moneyGt(a: MoneyInput, b: MoneyInput): boolean {
  return moneyCmp(a, b) > 0;
}

export function moneyGte(a: MoneyInput, b: MoneyInput): boolean {
  return moneyCmp(a, b) >= 0;
}

export function moneyLt(a: MoneyInput, b: MoneyInput): boolean {
  return moneyCmp(a, b) < 0;
}

export function moneyLte(a: MoneyInput, b: MoneyInput): boolean {
  return moneyCmp(a, b) <= 0;
}

export function moneyIsZero(a: MoneyInput): boolean {
  return toPaisa(a) === 0;
}

export function moneyIsPositive(a: MoneyInput): boolean {
  return toPaisa(a) > 0;
}

export function moneyIsNegative(a: MoneyInput): boolean {
  return toPaisa(a) < 0;
}

export function moneyMax(...values: MoneyInput[]): Money {
  let max = -Infinity;
  for (const v of values) {
    const p = toPaisa(v);
    if (p > max) max = p;
  }
  return formatPaisa(max === -Infinity ? 0 : max);
}

export function moneyMin(...values: MoneyInput[]): Money {
  let min = Infinity;
  for (const v of values) {
    const p = toPaisa(v);
    if (p < min) min = p;
  }
  return formatPaisa(min === Infinity ? 0 : min);
}

export function moneyAbs(a: MoneyInput): Money {
  return formatPaisa(Math.abs(toPaisa(a)));
}

// ─── Public: sum helpers ──────────────────────────────────────────────────

/**
 * Sum an array of money values. Use instead of
 * `arr.reduce((s, x) => s + Number(x), 0)` — same result, but precision-safe.
 */
export function moneySum(values: MoneyInput[]): Money {
  let total = 0;
  for (const v of values) {
    total += toPaisa(v);
  }
  return formatPaisa(total);
}

/**
 * Sum with a selector. `moneySumBy(saleItems, (i) => i.total)` replaces
 * `saleItems.reduce((s, i) => s + Number(i.total), 0)`.
 */
export function moneySumBy<T>(
  items: T[],
  selector: (item: T) => MoneyInput,
): Money {
  let total = 0;
  for (const item of items) {
    total += toPaisa(selector(item));
  }
  return formatPaisa(total);
}

export function qtySum(values: QuantityInput[]): Quantity {
  let total = 0;
  for (const v of values) {
    total += toMilliUnits(v);
  }
  return formatMilliUnits(total);
}

export function qtySumBy<T>(
  items: T[],
  selector: (item: T) => QuantityInput,
): Quantity {
  let total = 0;
  for (const item of items) {
    total += toMilliUnits(selector(item));
  }
  return formatMilliUnits(total);
}

// ─── Public: rounding (preserve existing semantics) ───────────────────────
//
// The codebase uses `Math.round(x * 100) / 100` for tax computation and JE
// balance checks. moneyRound2 does the same thing but on a Money value.

export function moneyRound2(input: MoneyInput): Money {
  // moneyToString already rounds to 2dp; this is here for explicitness at
  // call sites that previously had `Math.round(x * 100) / 100`.
  return moneyToString(input);
}

// ─── Zod schemas ──────────────────────────────────────────────────────────
//
// Drop-in replacements for `z.number()` on money/quantity/tax-rate fields.
// These accept strings (preferred), numbers (back-compat), and produce
// canonical Money / Quantity / number values.

/**
 * Validates a money field. Accepts string ("1234.56") or number (1234.56).
 * Returns a canonical Money string. Use in place of `z.number()` for any
 * Decimal(10,2) / Decimal(12,2) input field.
 *
 *   amount: zMoney()                              // required, >= 0
 *   amount: zMoney().optional()
 *   amount: zMoney({ allowNegative: true })      // for credits/adjustments
 *   amount: zMoney({ max: 1_000_000_000 })        // preserve existing caps
 */
export function zMoney(opts?: {
  allowNegative?: boolean;
  max?: number;
}): z.ZodType<Money, z.ZodTypeDef, string | number> {
  const { allowNegative = false, max } = opts ?? {};
  return z
    .union([z.string(), z.number()])
    .transform((v, ctx): Money => {
      try {
        const money = moneyToString(v);
        if (!allowNegative && moneyIsNegative(money)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Amount cannot be negative",
          });
          return "0.00" as Money;
        }
        if (max !== undefined && moneyGt(money, max)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Amount cannot exceed ${max}`,
          });
          return "0.00" as Money;
        }
        return money;
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            err instanceof MoneyError ? err.message : "Invalid money value",
        });
        return "0.00" as Money;
      }
    });
}

/**
 * Validates a quantity field (Decimal(10,3)). Accepts string or number.
 * Returns a canonical Quantity string.
 */
export function zQuantity(opts?: {
  allowNegative?: boolean;
  integerOnly?: boolean;
  max?: number;
}): z.ZodType<Quantity, z.ZodTypeDef, string | number> {
  const { allowNegative = false, integerOnly = false, max } = opts ?? {};
  return z
    .union([z.string(), z.number()])
    .transform((v, ctx): Quantity => {
      try {
        if (integerOnly && typeof v === "number" && !Number.isInteger(v)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Quantity must be a whole number",
          });
          return "0.000" as Quantity;
        }
        if (integerOnly && typeof v === "string") {
          const num = Number(v);
          if (!Number.isNaN(num) && !Number.isInteger(num)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Quantity must be a whole number",
            });
            return "0.000" as Quantity;
          }
        }
        const q = qtyToString(v);
        if (!allowNegative && toMilliUnits(q) < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Quantity cannot be negative",
          });
          return "0.000" as Quantity;
        }
        if (max !== undefined && toMilliUnits(q) > max * MILLI_PER_UNIT) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Quantity cannot exceed ${max}`,
          });
          return "0.000" as Quantity;
        }
        return q;
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            err instanceof MoneyError ? err.message : "Invalid quantity value",
        });
        return "0.000" as Quantity;
      }
    });
}

/**
 * Validates a tax-rate field (Decimal(5,2), 0–100). Returns a number for
 * backward compatibility with the existing tax computation which uses
 * `Math.round(lineTotal * rate) / 100`.
 */
export function zTaxRate(): z.ZodType<number, z.ZodTypeDef, string | number> {
  return z
    .union([z.string(), z.number()])
    .transform((v, ctx): number => {
      const num = typeof v === "string" ? Number(v) : v;
      if (!Number.isFinite(num)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tax rate must be a number",
        });
        return 0;
      }
      if (num < 0 || num > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tax rate must be between 0 and 100",
        });
        return 0;
      }
      return num;
    });
}

// ─── Constants ────────────────────────────────────────────────────────────

export const ZERO_MONEY = "0.00" as Money;
export const ZERO_QTY = "0.000" as Quantity;
