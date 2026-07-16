-- CreateEnum
CREATE TYPE "SupplierLedgerType" AS ENUM ('credit', 'payment', 'debit');

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "balance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SupplierLedger" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "SupplierLedgerType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierLedger_supplierId_idx" ON "SupplierLedger"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierLedger_storeId_idx" ON "SupplierLedger"("storeId");

-- CreateIndex
CREATE INDEX "SupplierLedger_createdAt_idx" ON "SupplierLedger"("createdAt");

-- CreateIndex
CREATE INDEX "SupplierLedger_purchaseOrderId_idx" ON "SupplierLedger"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "SupplierLedger" ADD CONSTRAINT "SupplierLedger_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedger" ADD CONSTRAINT "SupplierLedger_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierLedger" ADD CONSTRAINT "SupplierLedger_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
