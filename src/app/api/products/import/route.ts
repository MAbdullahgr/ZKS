import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreId, requireWarehouse, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const parseBool = (val: unknown, fallback: boolean): boolean => {
  if (val === undefined || val === null || val === "") return fallback;
  return String(val).toLowerCase() === "true" || val === "1" || val === "yes";
};

// AUDIT-FIX C-10: Maximum rows per import request. Previously unbounded —
// a 100k-row payload would OOM the server and saturate the DB connection
// pool. 1000 rows is plenty for a single import; larger imports should be
// split into multiple requests or use a background job.
const MAX_IMPORT_ROWS = 1000;

// AUDIT-FIX C-10: Parse + validate a single numeric field. Previously used
// `parseFloat(row.costPrice) || 0` which silently coerced typos to 0 —
// a product with costPrice="abc" got costPrice=0, breaking COGS and profit
// reports. Now throws with the row number + field name.
function parseNumber(
  val: unknown,
  field: string,
  rowIdx: number,
  allowZero: boolean = true,
): number {
  if (val === undefined || val === null || val === "") return 0;
  const n = typeof val === "number" ? val : parseFloat(String(val));
  if (!Number.isFinite(n)) {
    throw new HttpError(
      `Row ${rowIdx + 2}: Invalid ${field} value "${val}". Must be a number.`,
      400,
      "VALIDATION_ERROR",
    );
  }
  if (n < 0 || (!allowZero && n === 0)) {
    throw new HttpError(
      `Row ${rowIdx + 2}: ${field} must be ${allowZero ? ">= 0" : "> 0"}, got ${n}.`,
      400,
      "VALIDATION_ERROR",
    );
  }
  return n;
}

// AUDIT-FIX C-10: Rewritten import — atomic, batched, capped, validated.
// Previously:
//   - No transaction → partial failures left inconsistent state
//   - Per-row queries (4 each) → 5000 rows = 20000 sequential queries = timeout
//   - No row cap → OOM risk
//   - parseFloat || 0 silently corrupted data on typos
//   - Duplicate barcode (P2002) aborted entire import midway
// Now:
//   - Single $transaction (Serializable) — all-or-nothing
//   - Pre-fetch categories/brands/suppliers in 3 batched queries
//   - Pre-fetch existing products by SKU in 1 query, build a Set
//   - Pre-fetch existing barcodes in 1 query, build a Set
//   - Cap at MAX_IMPORT_ROWS (1000)
//   - Strict numeric validation with row-number error messages
//   - Duplicate barcode detection BEFORE insert (skip + report, don't abort)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const session = await requireWarehouse();
  const storeId = requireStoreId(session);

  // AUDIT-FIX H-28 + C-10: Rate-limit bulk imports. 5 per hour per user —
  // prevents a compromised warehouse JWT from DoS'ing the DB with huge imports.
  const rl = await rateLimit("bulkImport", `${session.userId}:${ip}`);
  if (!rl.success) {
    throw new HttpError(
      "Too many imports. Please try again later.",
      429,
      "RATE_LIMITED",
      rateLimitHeaders(rl),
    );
  }

  const { data } = await req.json();

  if (!Array.isArray(data))
    throw new HttpError("Invalid data format", 400, "VALIDATION_ERROR");

  // AUDIT-FIX C-10: Cap row count.
  if (data.length > MAX_IMPORT_ROWS) {
    throw new HttpError(
      `Import exceeds maximum of ${MAX_IMPORT_ROWS} rows. Please split into smaller batches.`,
      413,
      "TOO_MANY_ROWS",
    );
  }

  if (data.length === 0) {
    return apiSuccess(
      { updatedCount: 0, createdCount: 0, skippedCount: 0, errors: [] },
      "Import complete: 0 rows processed",
    );
  }

  // ─── Validate ALL rows first (before any DB writes) ──────────────────
  // AUDIT-FIX: Fail fast on validation errors so we don't waste DB round-
  // trips on invalid data. Collect all errors, don't throw on the first.
  const errors: string[] = [];
  const validRows: Array<{
    name: string;
    sku: string;
    barcode: string | null;
    description: string | null;
    costPrice: number;
    sellingPrice: number;
    stockQuantity: number;
    minStockLevel: number;
    unit: string;
    parentUnit: string | null;
    unitsPerParent: number | null;
    productGroup: string | null;
    variantName: string | null;
    isLoose: boolean;
    isReturnable: boolean;
    isActive: boolean;
    imageUrl: string | null;
    categoryName?: string;
    brandName?: string;
    supplierName?: string;
  }> = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowErrors: string[] = [];

    if (!row.name || typeof row.name !== "string" || !row.name.trim()) {
      rowErrors.push("Name is required");
    }
    if (!row.sku || typeof row.sku !== "string" || !row.sku.trim()) {
      rowErrors.push("SKU is required");
    }

    if (rowErrors.length > 0) {
      errors.push(`Row ${i + 2}: ${rowErrors.join(", ")}`);
      continue;
    }

    try {
      validRows.push({
        name: row.name.trim(),
        sku: row.sku.trim(),
        barcode: row.barcode?.trim() || null,
        description: row.description?.trim() || null,
        costPrice: parseNumber(row.costPrice, "costPrice", i),
        sellingPrice: parseNumber(row.sellingPrice, "sellingPrice", i),
        stockQuantity: parseNumber(row.stockQuantity, "stockQuantity", i),
        minStockLevel: parseNumber(row.minStockLevel, "minStockLevel", i),
        unit: row.unit || "piece",
        parentUnit: row.parentUnit?.trim() || null,
        unitsPerParent: row.parentUnit
          ? parseInt(row.unitsPerParent) || 1
          : null,
        productGroup: row.productGroup?.trim() || null,
        variantName: row.variantName?.trim() || null,
        isLoose: parseBool(row.isLoose, false),
        isReturnable: parseBool(row.isReturnable, true),
        isActive: parseBool(row.isActive, true),
        imageUrl: row.imageUrl?.trim() || null,
        categoryName: row.categoryName?.trim() || undefined,
        brandName: row.brandName?.trim() || undefined,
        supplierName: row.supplierName?.trim() || undefined,
      });
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : `Row ${i + 2}: validation error`,
      );
    }
  }

  // If ALL rows failed validation, return the errors.
  if (validRows.length === 0) {
    throw new HttpError(
      `All ${data.length} rows failed validation:\n${errors.join("\n")}`,
      400,
      "VALIDATION_ERROR",
    );
  }

  // ─── Pre-fetch existing data in batched queries ─────────────────────
  // AUDIT-FIX C-10: 3 batched queries instead of N per-row queries.
  const categoryNames = new Set(
    validRows.map((r) => r.categoryName).filter(Boolean) as string[],
  );
  const brandNames = new Set(
    validRows.map((r) => r.brandName).filter(Boolean) as string[],
  );
  const supplierNames = new Set(
    validRows.map((r) => r.supplierName).filter(Boolean) as string[],
  );
  const skus = validRows.map((r) => r.sku);

  const [existingCategories, existingBrands, existingSuppliers, existingProducts, existingBarcodes] =
    await Promise.all([
      categoryNames.size > 0
        ? prisma.category.findMany({
            where: { storeId, name: { in: [...categoryNames] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      brandNames.size > 0
        ? prisma.brand.findMany({
            where: { storeId, name: { in: [...brandNames] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      supplierNames.size > 0
        ? prisma.supplier.findMany({
            where: { storeId, name: { in: [...supplierNames] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      prisma.product.findMany({
        where: { storeId, sku: { in: skus } },
        select: { id: true, sku: true },
      }),
      prisma.product.findMany({
        where: { storeId, barcode: { not: null, in: validRows.map((r) => r.barcode).filter(Boolean) as string[] } },
        select: { barcode: true },
      }),
    ]);

  const categoryMap = new Map(existingCategories.map((c) => [c.name, c.id]));
  const brandMap = new Map(existingBrands.map((b) => [b.name, b.id]));
  const supplierMap = new Map(existingSuppliers.map((s) => [s.name, s.id]));
  const existingProductMap = new Map(existingProducts.map((p) => [p.sku, p.id]));
  const existingBarcodeSet = new Set(existingBarcodes.map((p) => p.barcode));

  // ─── Process in a single transaction (all-or-nothing) ───────────────
  let updatedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  const result = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // AUDIT-FIX C-10: Create missing categories/brands/suppliers in batch.
      // Use upsert to handle the race where another request creates the same
      // name concurrently.
      for (const name of categoryNames) {
        if (!categoryMap.has(name)) {
          const created = await tx.category.upsert({
            where: { storeId_name: { storeId, name } },
            update: {},
            create: { storeId, name },
          });
          categoryMap.set(name, created.id);
        }
      }
      for (const name of brandNames) {
        if (!brandMap.has(name)) {
          const created = await tx.brand.upsert({
            where: { storeId_name: { storeId, name } },
            update: {},
            create: { storeId, name },
          });
          brandMap.set(name, created.id);
        }
      }
      for (const name of supplierNames) {
        if (!supplierMap.has(name)) {
          const created = await tx.supplier.upsert({
            // Supplier doesn't have a storeId_name unique constraint — use findFirst+create pattern
            where: { id: "__nonexistent__" }, // forces create path
            update: {},
            create: { storeId, name, isActive: true },
          });
          supplierMap.set(name, created.id);
        }
      }

      // Process each valid row
      for (const row of validRows) {
        // AUDIT-FIX: Duplicate barcode check — skip the row and report,
        // don't abort the entire import.
        if (row.barcode && existingBarcodeSet.has(row.barcode)) {
          errors.push(`Row with SKU "${row.sku}": barcode "${row.barcode}" already exists — skipped.`);
          skippedCount++;
          continue;
        }
        // Track this barcode so subsequent rows in the same import don't duplicate it
        if (row.barcode) existingBarcodeSet.add(row.barcode);

        const productData = {
          name: row.name,
          barcode: row.barcode,
          description: row.description,
          costPrice: row.costPrice,
          sellingPrice: row.sellingPrice,
          stockQuantity: row.stockQuantity,
          minStockLevel: row.minStockLevel,
          unit: row.unit,
          parentUnit: row.parentUnit,
          unitsPerParent: row.unitsPerParent,
          productGroup: row.productGroup,
          variantName: row.variantName,
          isLoose: row.isLoose,
          isReturnable: row.isReturnable,
          isActive: row.isActive,
          imageUrl: row.imageUrl,
          ...(row.categoryName && {
            category: { connect: { id: categoryMap.get(row.categoryName) } },
          }),
          ...(row.brandName && {
            brand: { connect: { id: brandMap.get(row.brandName) } },
          }),
          ...(row.supplierName && {
            supplier: { connect: { id: supplierMap.get(row.supplierName) } },
          }),
        };

        const existingId = existingProductMap.get(row.sku);
        if (existingId) {
          await tx.product.update({
            where: { id: existingId },
            data: productData as Prisma.ProductUpdateInput,
          });
          updatedCount++;
        } else {
          await tx.product.create({
            data: {
              ...productData,
              storeId,
              sku: row.sku,
            } as Prisma.ProductUncheckedCreateInput,
          });
          createdCount++;
        }
      }

      return { updatedCount, createdCount, skippedCount };
    },
    {
      timeout: 30000,
      maxWait: 10000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  await logAudit({
    userId: session.userId,
    storeId,
    action: "PRODUCTS_IMPORTED",
    entityType: "Product",
    details: {
      updatedCount: result.updatedCount,
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      totalRows: data.length,
      errorCount: errors.length,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    {
      updatedCount: result.updatedCount,
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    },
    `Import complete: ${result.updatedCount} updated, ${result.createdCount} created, ${result.skippedCount} skipped`,
    200,
    rateLimitHeaders(rl),
  );
});
