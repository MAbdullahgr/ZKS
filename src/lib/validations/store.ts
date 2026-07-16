import { z } from "zod";

export const createStoreSchema = z.object({
  name: z.string().trim().min(1, "Store name is required").max(100),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  type: z.enum(["retail", "warehouse"]).default("retail"),
});

export const updateStoreSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  type: z.enum(["retail", "warehouse"]).optional(),
  // FIX: `isActive` removed — store activation/deactivation must go through
  // the owner-only DELETE endpoint to prevent admins from bypassing the
  // owner-only restriction by sending PATCH { isActive: false }.
});
