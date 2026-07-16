-- Add displayTaxBreakdown setting to allow stores to hide/show tax on POS and receipts
ALTER TABLE "Settings" ADD COLUMN "displayTaxBreakdown" BOOLEAN NOT NULL DEFAULT true;
