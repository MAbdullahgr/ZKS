// import { z } from "zod";

// export const createTransferSchema = z.object({
//   destStoreId: z.string().uuid("Destination store is required"),
//   notes: z.string().max(500).optional().nullable(),
//   items: z
//     .array(
//       z.object({
//         productId: z.string().uuid(),
//         quantity: z.coerce
//           .number()
//           .positive("Quantity must be greater than 0")
//           .max(100000, "Quantity unreasonably high"),
//       }),
//     )
//     .min(1, "At least one item is required"),
// });

import { z } from "zod";

export const createTransferSchema = z.object({
  // FIX: Was .uuid() but the seeded "main-store" has a non-UUID id.
  // Use .min(1) instead to accept any non-empty string ID.
  destStoreId: z.string().min(1, "Destination store is required"),
  notes: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Product is required"),
        quantity: z.coerce
          .number()
          .positive("Quantity must be greater than 0")
          .max(100000, "Quantity unreasonably high"),
      }),
    )
    .min(1, "At least one item is required"),
});
