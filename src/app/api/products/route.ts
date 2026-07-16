import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  getStoreFilter,
  logAudit,
  requireWarehouse,
  requireStoreId,
} from "@/lib/auth";
import { HttpError, withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createProductSchema } from "@/lib/validations/product";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

const CATEGORY_COLORS: Record<string, string> = {
  Misc: "border-rose-500",
  Desks: "border-orange-500",
  Chairs: "border-emerald-500",
  Storage: "border-amber-500",
  Electronics: "border-sky-500",
};

function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] || "border-slate-500";
}

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: true;
    supplier: true;
    brand: true;
    tax: { select: { rate: true; type: true } };
    store: { select: { name: true } };
    batches: { select: { quantity: true } };
  };
}>;

function groupProductsWithVariants(products: ProductWithRelations[]) {
  const groups = new Map<string, ProductWithRelations[]>();

  for (const p of products) {
    const groupKey = p.productGroup || p.name;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(p);
  }

  return Array.from(groups.entries()).map(([, groupProducts]) => {
    const base = groupProducts[0];
    const hasVariants = groupProducts.length > 1;

    const calcStock = (p: ProductWithRelations) =>
      p.batches.length > 0
        ? p.batches.reduce((sum, b) => sum + Number(b.quantity), 0)
        : Number(p.stockQuantity);

    const variants = groupProducts.map((p) => ({
      id: p.id,
      name: p.variantName || p.name,
      price: Number(p.sellingPrice),
      stock: calcStock(p),
      sku: p.sku,
    }));

    return {
      id: base.id,
      name: hasVariants ? base.productGroup || base.name : base.name,
      image: base.imageUrl || undefined,
      price: Number(base.sellingPrice),
      stock: hasVariants
        ? groupProducts.reduce((sum, p) => sum + calcStock(p), 0)
        : calcStock(base),
      sku: base.sku,
      barcode: base.barcode || undefined,
      categoryId: base.categoryId || "misc",
      categoryName: base.category?.name || "Misc",
      categoryColor: getCategoryColor(base.category?.name || "Misc"),
      hasVariants,
      variants,
      unit: base.unit,
      cost: Number(base.costPrice),
      minStockLevel: Number(base.minStockLevel),
      // Tax info for POS display — 0 if no tax linked or tax is exempt/zero_rated
      taxRate:
        base.tax && base.tax.type !== "exempt" && base.tax.type !== "zero_rated"
          ? Number(base.tax.rate)
          : 0,
    };
  });
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  const { storeId } = getStoreFilter(session);
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const categoryId = searchParams.get("categoryId");
  const lowStock = searchParams.get("lowStock") === "true";
  const forPos = searchParams.get("forPos") === "true";
  const includeInactive = searchParams.get("includeInactive") === "true";

  // AUDIT-FIX C-7: Cashiers must not see costPrice — it reveals the store's
  // margin and enables fraud (e.g., discounting to friends knowing the
  // floor price). The single-product GET endpoint already requires
  // requireWarehouse(), so cashiers can't reach it. But this list endpoint
  // uses requireAuth() — cashiers hit it for the POS product grid. We strip
  // costPrice (and the `cost` alias used in the POS payload) from their
  // response.
  const stripCost = session.role === "cashier";

  const where: Prisma.ProductWhereInput = {
    storeId,
    ...(includeInactive ? {} : { isActive: true }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
        { productGroup: { contains: search } },
      ],
    }),
    ...(categoryId && categoryId !== "all" && { categoryId }),
    ...(lowStock && {
      stockQuantity: { lte: prisma.product.fields.minStockLevel },
    }),
  };

  const include = {
    category: true,
    supplier: true,
    brand: true,
    tax: { select: { rate: true, type: true } },
    store: { select: { name: true } },
    batches: { select: { quantity: true } },
  };

  // POS branch: UNPAGINATED — POS uses client-side virtualization and needs
  // the full catalog in one shot. Searching/filtering still applies. Capped
  // at 1000 rows as a safety net (H-12).
  if (forPos) {
    const products = await prisma.product.findMany({
      where,
      include,
      orderBy: { name: "asc" },
      take: 1000,
    });

    const posProducts = groupProductsWithVariants(products);
    // AUDIT-FIX C-7: Strip the `cost` field from the POS payload for cashiers.
    const safePosProducts = stripCost
      ? posProducts.map((p) => {
          const { cost, ...rest } = p;
          return rest;
        })
      : posProducts;
    return apiSuccess({ products: safePosProducts });
  }

  // Non-POS branch: standard paginated list using shared parsePagination
  // (default 20, clamped 1..100) + flat paginatedMeta envelope.
  const { page, limit, skip } = parsePagination(req);

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  const serializedProducts = products.map((p) => {
    const serialized: Record<string, unknown> = {
      ...p,
      sellingPrice: Number(p.sellingPrice),
      stockQuantity: Number(p.stockQuantity),
      minStockLevel: Number(p.minStockLevel),
      totalStock: Number(p.stockQuantity),
    };
    if (stripCost) {
      // AUDIT-FIX C-7: Don't expose costPrice to cashiers.
      delete serialized.costPrice;
    } else {
      serialized.costPrice = Number(p.costPrice);
    }
    return serialized;
  });

  return apiSuccess({
    products: serializedProducts,
    ...paginatedMeta(page, limit, total),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireWarehouse();
  const storeId = requireStoreId(session);
  const body = await req.json();
  const { categoryId, supplierId, brandId, taxId, ...productData } =
    createProductSchema.parse(body);

  // FIX: Verify all related entities belong to THIS store before connecting.
  // Without these checks, a manager in store A can create a product linked to
  // store B's category/brand/supplier/tax — leaking cross-store references.
  if (categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: categoryId, storeId },
      select: { id: true },
    });
    if (!cat)
      throw new HttpError(
        "Category not found in your store",
        400,
        "VALIDATION_ERROR",
      );
  }
  if (supplierId) {
    const sup = await prisma.supplier.findFirst({
      where: { id: supplierId, storeId },
      select: { id: true },
    });
    if (!sup)
      throw new HttpError(
        "Supplier not found in your store",
        400,
        "VALIDATION_ERROR",
      );
  }
  if (brandId) {
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, storeId },
      select: { id: true },
    });
    if (!brand)
      throw new HttpError(
        "Brand not found in your store",
        400,
        "VALIDATION_ERROR",
      );
  }
  if (taxId) {
    const tax = await prisma.tax.findFirst({
      where: { id: taxId, storeId },
      select: { id: true },
    });
    if (!tax)
      throw new HttpError(
        "Tax not found in your store",
        400,
        "VALIDATION_ERROR",
      );
  }

  // FIX: Use Prisma.ProductUncheckedCreateInput so TypeScript uses the
  // "unchecked" code path consistently — scalar foreign keys (categoryId,
  // supplierId, brandId, taxId) instead of { connect: { id } } objects.
  // Mixing the two paths (storeId scalar + category: { connect }) causes
  // TS2322 because Prisma's union type can't resolve which path to use.
  const createData: Prisma.ProductUncheckedCreateInput = {
    ...productData,
    storeId,
    barcode: productData.barcode?.trim() || null,
    unitsPerParent: productData.parentUnit ? productData.unitsPerParent : null,
  };
  if (categoryId) createData.categoryId = categoryId;
  if (supplierId) createData.supplierId = supplierId;
  if (brandId) createData.brandId = brandId;
  if (taxId) createData.taxId = taxId;

  const product = await prisma.product.create({
    data: createData,
    include: { category: true, supplier: true, brand: true, tax: true },
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "PRODUCT_CREATED",
    entityType: "Product",
    entityId: product.id,
    details: {
      name: product.name,
      sku: product.sku,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess({ product }, "Product created successfully", 201);
});
