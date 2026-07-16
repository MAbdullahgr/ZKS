/*
  Warnings:

  - You are about to alter the column `quantity` on the `InventoryAdjustment` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `previousStock` on the `InventoryAdjustment` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `newStock` on the `InventoryAdjustment` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `stockQuantity` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `minStockLevel` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `quantity` on the `ProductBatch` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `quantity` on the `PurchaseOrderItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `receivedQty` on the `PurchaseOrderItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `quantity` on the `SaleItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `quantity` on the `SaleReturnItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.

*/
-- AlterTable
ALTER TABLE "InventoryAdjustment" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "previousStock" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "newStock" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "stockQuantity" SET DEFAULT 0,
ALTER COLUMN "stockQuantity" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "minStockLevel" SET DEFAULT 10,
ALTER COLUMN "minStockLevel" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "ProductBatch" ALTER COLUMN "quantity" DROP DEFAULT,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "receivedQty" SET DEFAULT 0,
ALTER COLUMN "receivedQty" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "SaleItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "SaleReturnItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3);
