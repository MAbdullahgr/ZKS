-- Phase 2: Tax model + per-item tax tracking + FBR fields
--
-- Adds:
--   1. TaxType enum + Tax model (for FBR-compliant tax rates)
--   2. Product.taxId FK (optional link to a Tax rate)
--   3. SaleItem.taxRate + SaleItem.taxAmount (per-line tax snapshot)
--   4. Sale.fbrInvoiceNumber (FBR-issued number, null until Phase 6)
--   5. Sale.taxRateSnapshot (store-level tax rate at time of sale)

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('standard', 'fixed', 'exempt', 'zero_rated');

-- CreateTable
CREATE TABLE "Tax" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "type" "TaxType" NOT NULL DEFAULT 'standard',
    "fbrCode" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tax_name_key" ON "Tax"("name");
CREATE INDEX "Tax_isActive_idx" ON "Tax"("isActive");
CREATE INDEX "Tax_type_idx" ON "Tax"("type");

-- AlterTable: Product — add taxId
ALTER TABLE "Product" ADD COLUMN "taxId" TEXT;

-- CreateIndex
CREATE INDEX "Product_taxId_idx" ON "Product"("taxId");

-- AddForeignKey
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_taxId_fkey"
  FOREIGN KEY ("taxId") REFERENCES "Tax"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: SaleItem — add taxRate + taxAmount
ALTER TABLE "SaleItem"
  ADD COLUMN "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable: Sale — add fbrInvoiceNumber + taxRateSnapshot
ALTER TABLE "Sale"
  ADD COLUMN "fbrInvoiceNumber" TEXT,
  ADD COLUMN "taxRateSnapshot" DECIMAL(5,2) NOT NULL DEFAULT 0;
