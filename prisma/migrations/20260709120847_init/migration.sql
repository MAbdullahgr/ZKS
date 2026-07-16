/*
  Warnings:

  - You are about to alter the column `returnedQty` on the `SaleItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - A unique constraint covering the columns `[storeId,idempotencyKey]` on the table `SaleReturn` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "SaleItem" ALTER COLUMN "returnedQty" SET DEFAULT 0,
ALTER COLUMN "returnedQty" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "SaleReturn" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "destSettledAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_storeId_idempotencyKey_key" ON "SaleReturn"("storeId", "idempotencyKey");
