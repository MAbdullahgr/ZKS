import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWarehouse, getStoreFilter, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { getClientIp } from "@/lib/rate-limit";

// AUDIT-FIX C-7: Bumped from requireAuth() to requireWarehouse(). Previously
// any authenticated user (including cashiers) could bulk-export the entire
// product catalog with costPrice — a full margin leak as a clean CSV. The
// single-product GET already requires requireWarehouse(); this export route
// must match.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireWarehouse();
  const { storeId } = getStoreFilter(session);
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const { searchParams } = new URL(req.url);

  // AUDIT-FIX H-12: Cap row count to prevent OOM on large catalogs.
  // AUDIT-FIX C-7: Whitelist allowed fields to prevent arbitrary column
  // access via the `fields` query param (previously attacker-controlled).
  const ALLOWED_FIELDS = new Set([
    "id", "name", "sku", "barcode", "description",
    "costPrice", "sellingPrice", "stockQuantity", "minStockLevel",
    "unit", "parentUnit", "unitsPerParent", "productGroup", "variantName",
    "isLoose", "isReturnable", "isActive", "imageUrl",
    "categoryName", "brandName", "supplierName",
  ]);
  const requestedFields = searchParams.get("fields")?.split(",") || ["id", "name", "sku"];
  const invalidFields = requestedFields.filter((f) => !ALLOWED_FIELDS.has(f));
  if (invalidFields.length > 0) {
    throw new HttpError(
      `Unknown fields requested: ${invalidFields.join(", ")}`,
      400,
      "VALIDATION_ERROR",
    );
  }
  const fields = requestedFields;

  const search = searchParams.get("search") ?? "";
  const categoryId = searchParams.get("categoryId");
  const brandId = searchParams.get("brandId");
  const supplierId = searchParams.get("supplierId");

  const products = await prisma.product.findMany({
    where: {
      storeId,
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search } },
          { sku: { contains: search } },
          { barcode: { contains: search } },
        ],
      }),
      ...(categoryId && categoryId !== "all" && { categoryId }),
      ...(brandId && brandId !== "all" && { brandId }),
      ...(supplierId && supplierId !== "all" && { supplierId }),
    },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      description: true,
      costPrice: true,
      sellingPrice: true,
      stockQuantity: true,
      minStockLevel: true,
      unit: true,
      parentUnit: true,
      unitsPerParent: true,
      productGroup: true,
      variantName: true,
      isLoose: true,
      isReturnable: true,
      isActive: true,
      imageUrl: true,
      category: { select: { name: true } },
      brand: { select: { name: true } },
      supplier: { select: { name: true } },
    },
    // AUDIT-FIX H-12: Cap at 50000 rows — a hard ceiling to prevent OOM.
    take: 50000,
  });

  const formattedData = products.map((p) => {
    const row: Record<string, unknown> = {};
    fields.forEach((field) => {
      switch (field) {
        case "id":
          row.id = p.id;
          break;
        case "name":
          row.name = p.name;
          break;
        case "sku":
          row.sku = p.sku;
          break;
        case "barcode":
          row.barcode = p.barcode || "";
          break;
        case "description":
          row.description = p.description || "";
          break;
        case "costPrice":
          row.costPrice = Number(p.costPrice);
          break;
        case "sellingPrice":
          row.sellingPrice = Number(p.sellingPrice);
          break;
        case "stockQuantity":
          row.stockQuantity = Number(p.stockQuantity);
          break;
        case "minStockLevel":
          row.minStockLevel = Number(p.minStockLevel);
          break;
        case "unit":
          row.unit = p.unit || "";
          break;
        case "parentUnit":
          row.parentUnit = p.parentUnit || "";
          break;
        case "unitsPerParent":
          row.unitsPerParent = p.unitsPerParent || "";
          break;
        case "productGroup":
          row.productGroup = p.productGroup || "";
          break;
        case "variantName":
          row.variantName = p.variantName || "";
          break;
        case "isLoose":
          row.isLoose = p.isLoose;
          break;
        case "isReturnable":
          row.isReturnable = p.isReturnable;
          break;
        case "isActive":
          row.isActive = p.isActive;
          break;
        case "imageUrl":
          row.imageUrl = p.imageUrl || "";
          break;
        case "categoryName":
          row.categoryName = p.category?.name || "";
          break;
        case "brandName":
          row.brandName = p.brand?.name || "";
          break;
        case "supplierName":
          row.supplierName = p.supplier?.name || "";
          break;
        default:
          // AUDIT-FIX C-7: Should be unreachable thanks to the whitelist
          // check above, but defense in depth — never expose arbitrary
          // columns.
          break;
      }
    });
    return row;
  });

  // AUDIT-FIX: Log bulk exports so cost-price leaks are traceable.
  await logAudit({
    userId: session.userId,
    storeId,
    action: "PRODUCT_EXPORT",
    entityType: "Product",
    entityId: null,
    details: { count: products.length, fields },
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(formattedData);
});
