// src/services/index.ts
//
// Barrel export for the service layer. Import from "@/services" to access
// all business logic. Services are framework-agnostic — they don't import
// Next.js, and they throw HttpError/AuthError for the route handler to catch.

export * from "./types";
export * from "./helpers";
export * from "./saleService";
export * from "./returnService";
export * from "./payrollService";
export * from "./khataService";
export * from "./inventoryService";
export * from "./purchaseService";
