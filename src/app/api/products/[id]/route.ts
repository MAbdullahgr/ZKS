import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreId, getStoreFilter, logAudit, requireWarehouse } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateProductSchema } from "@/lib/validations/product";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { deleteFromCloudinary } from "@/lib/cloudinary";

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const session = await requireWarehouse();
    // FIX P2-7: Use getStoreFilter on reads — owner in All Stores mode can
    // view any product. requireStoreId blocks this with STORE_NOT_SELECTED.
    const { storeId } = getStoreFilter(session);
    const { id } = await params;

    const product = await prisma.product.findFirst({
      where: { id, storeId },
      include: {
        category: true,
        supplier: true,
        brand: true,
        batches: {
          orderBy: { expiryDate: "asc" },
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            quantity: true,
            costPrice: true,
          },
        },
      },
    });

    if (!product) throw new HttpError("Product not found", 404, "NOT_FOUND");

    // Fetch Variants (same store, same productGroup, excluding current)
    const variants = product.productGroup
      ? await prisma.product.findMany({
          where: {
            storeId,
            productGroup: product.productGroup,
            id: { not: id },
          },
          select: {
            id: true,
            name: true,
            variantName: true,
            sku: true,
            barcode: true,
            sellingPrice: true,
            stockQuantity: true,
            unit: true,
            parentUnit: true,
            unitsPerParent: true,
            imageUrl: true,
            isActive: true,
          },
          orderBy: { variantName: "asc" },
        })
      : [];

    // Fetch Stock History (this store only)
    const stockHistory = await prisma.inventoryAdjustment.findMany({
      where: { productId: id, storeId },
      include: {
        user: { select: { email: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Fetch Sales History (this store only)
    const salesHistory = await prisma.saleItem.findMany({
      where: { productId: id, sale: { storeId } },
      include: {
        sale: {
          select: {
            id: true,
            saleNumber: true,
            saleDate: true,
            customerName: true,
            customerId: true,
            status: true,
            storeId: true,
          },
        },
      },
      orderBy: { sale: { saleDate: "desc" } },
      take: 50,
    });

    // Fetch Purchase History (this store only)
    const purchaseHistory = await prisma.purchaseOrderItem.findMany({
      where: { productId: id, purchaseOrder: { storeId } },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
            orderDate: true,
            status: true,
            storeId: true,
            supplier: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const baseStock = Number(product.stockQuantity || 0);
    const totalStock = baseStock;

    const serializedProduct = {
      ...product,
      costPrice: Number(product.costPrice),
      sellingPrice: Number(product.sellingPrice),
      stockQuantity: baseStock,
      totalStock: totalStock,
      minStockLevel: Number(product.minStockLevel),
      batches: product.batches.map((b) => ({
        ...b,
        quantity: Number(b.quantity),
        costPrice: Number(b.costPrice),
        expiryDate: b.expiryDate ? b.expiryDate.toISOString() : null,
      })),
    };

    const serializedVariants = variants.map((v) => ({
      ...v,
      sellingPrice: Number(v.sellingPrice),
      totalStock: Number(v.stockQuantity),
    }));

    const serializedStockHistory = stockHistory.map((h) => ({
      ...h,
      quantity: Number(h.quantity),
      previousStock: Number(h.previousStock),
      newStock: Number(h.newStock),
    }));

    const serializedSalesHistory = salesHistory.map((s) => ({
      ...s,
      quantity: Number(s.quantity),
      unitPrice: Number(s.unitPrice),
      costPrice: Number(s.costPrice),
      total: Number(s.total),
      profit: Number(s.profit),
    }));

    const serializedPurchaseHistory = purchaseHistory.map((p) => ({
      ...p,
      quantity: Number(p.quantity),
      unitCost: Number(p.unitCost),
      total: Number(p.total),
    }));

    return apiSuccess({
      product: serializedProduct,
      variants: serializedVariants,
      stockHistory: serializedStockHistory,
      salesHistory: serializedSalesHistory,
      purchaseHistory: serializedPurchaseHistory,
    });
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireWarehouse();
    const storeId = requireStoreId(session);
    const { id } = await params;
    const body = await req.json();

    // Verify product belongs to this store
    const existing = await prisma.product.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new HttpError("Product not found", 404, "NOT_FOUND");

    const { categoryId, supplierId, brandId, taxId, ...updateData } =
      updateProductSchema.parse(body);

    // FIX: Verify all related entities belong to THIS store before connecting.
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

    if ("barcode" in updateData) {
      updateData.barcode = updateData.barcode?.trim() || null;
    }

    // FIX: Use unchecked update input with scalar FKs to avoid the same
    // TS2322 type conflict as the POST handler.
    const prismaUpdateData: Prisma.ProductUncheckedUpdateInput = {
      ...updateData,
    };

    if (categoryId !== undefined) {
      prismaUpdateData.categoryId = categoryId || null;
    }
    if (supplierId !== undefined) {
      prismaUpdateData.supplierId = supplierId || null;
    }
    if (brandId !== undefined) {
      prismaUpdateData.brandId = brandId || null;
    }
    if (taxId !== undefined) {
      prismaUpdateData.taxId = taxId || null;
    }

    // AUDIT-FIX H-13: If imageUrl is being changed, delete the old image
    // from Cloudinary to prevent orphaned files. The old imageUrl is on
    // `existing.imageUrl`. We extract the publicId from the URL (the last
    // path segment after the last /, without the file extension).
    // Non-blocking: if Cloudinary deletion fails, the product update still
    // succeeds — the orphaned file can be cleaned up by a future cron.
    if (
      "imageUrl" in updateData &&
      existing.imageUrl &&
      updateData.imageUrl !== existing.imageUrl
    ) {
      // Extract publicId from Cloudinary URL:
      // https://res.cloudinary.com/<cloud>/image/upload/v<version>/<folder>/<public_id>.<ext>
      const urlParts = existing.imageUrl.split("/");
      const filename = urlParts[urlParts.length - 1];
      const publicId = filename
        ? `product-images/${filename.replace(/\.[^/.]+$/, "")}`
        : null;
      if (publicId) {
        deleteFromCloudinary(publicId).catch((err) => {
          console.error("[cloudinary] Failed to delete old product image:", {
            publicId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: prismaUpdateData,
      include: { category: true, supplier: true, brand: true, tax: true },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "PRODUCT_UPDATED",
      entityType: "Product",
      entityId: id,
      details: { updates: updateData } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      product: {
        ...product,
        costPrice: Number(product.costPrice),
        sellingPrice: Number(product.sellingPrice),
      },
    });
  },
);

export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const ip = getClientIp(_req);
    const userAgent = _req.headers.get("user-agent") ?? "unknown";

    const session = await requireWarehouse();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify product belongs to this store
    const existing = await prisma.product.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new HttpError("Product not found", 404, "NOT_FOUND");

    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "PRODUCT_DELETED",
      entityType: "Product",
      entityId: id,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Product deactivated successfully" });
  },
);
