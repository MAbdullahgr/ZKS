import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(200),
  sku: z.string().trim().min(1, "SKU is required").max(50),
  barcode: z.string().trim().max(50).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  costPrice: z.coerce.number().min(0, "Cost price cannot be negative"),
  sellingPrice: z.coerce.number().min(0, "Selling price cannot be negative"),
  minStockLevel: z.number().int().min(0).default(10),

  // NEW: Brand, Tax, and Loose Item tracking
  brandId: z.string().uuid().optional().nullable(),
  taxId: z.string().uuid().optional().nullable(),
  isLoose: z.boolean().default(false),
  baseUnit: z.string().trim().max(20).default("piece"), // e.g., "kg", "gram", "liter"

  // Legacy fields (kept for simplicity for now, can be migrated to Batches later)
  unit: z.string().trim().max(20).default("pieces"),
  parentUnit: z.string().trim().max(20).optional().nullable(),
  unitsPerParent: z.number().int().min(1).optional().nullable(),
  productGroup: z.string().trim().max(100).optional().nullable(),
  variantName: z.string().trim().max(100).optional().nullable(),
  imageUrl: z.string().url().or(z.literal("")).optional().nullable(),
  isReturnable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  categoryId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
});

export const updateProductSchema = createProductSchema.partial();

// src/lib/validations/product.ts
export const receiveStockSchema = z.object({
  productId: z.string().uuid(),
  batchNumber: z.string().trim().max(50).optional().nullable(),
  // FIX: Safely handle the unknown type in preprocess
  expiryDate: z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return null;
    return new Date(v as string);
  }, z.date().optional().nullable()),
  quantity: z.number().positive("Quantity must be greater than 0"),
  costPrice: z.coerce.number().min(0, "Cost price cannot be negative"),
  reason: z.string().trim().max(255).default("Stock received"),
});
