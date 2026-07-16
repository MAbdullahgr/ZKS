/*
  Warnings:

  - The `category` column on the `Expense` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "DefaultExpenseCategory" AS ENUM ('utilities', 'rent', 'salaries', 'supplies', 'transport', 'maintenance', 'marketing', 'misc');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'easypaisa';
ALTER TYPE "PaymentMethod" ADD VALUE 'jazzcash';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "categoryId" TEXT,
DROP COLUMN "category",
ADD COLUMN     "category" "DefaultExpenseCategory" NOT NULL DEFAULT 'misc';

-- DropEnum
DROP TYPE "ExpenseCategory";

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseCategory_storeId_idx" ON "ExpenseCategory"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_storeId_name_key" ON "ExpenseCategory"("storeId", "name");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_action_createdAt_idx" ON "AuditLog"("storeId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_storeId_productId_createdAt_idx" ON "InventoryAdjustment"("storeId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalEntry_storeId_referenceType_referenceId_idx" ON "JournalEntry"("storeId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "KhataTransaction_storeId_customerId_createdAt_idx" ON "KhataTransaction"("storeId", "customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
