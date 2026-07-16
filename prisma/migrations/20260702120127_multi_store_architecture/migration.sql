/*
  Warnings:

  - A unique constraint covering the columns `[storeId,name]` on the table `Brand` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[storeId,name]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[storeId,phone]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[storeId,employeeCode]` on the table `Employee` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[storeId,cnic]` on the table `Employee` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[storeId,sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[storeId,barcode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[storeId,name]` on the table `Tax` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `storeId` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `Brand` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `Employee` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `EmployeeAdvance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `EmployeeDocument` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `EmployeeNote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `LeaveRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `Payroll` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `ProductBatch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `Supplier` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `Tax` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Brand_name_key";

-- DropIndex
DROP INDEX "Category_name_key";

-- DropIndex
DROP INDEX "Customer_phone_key";

-- DropIndex
DROP INDEX "Employee_cnic_key";

-- DropIndex
DROP INDEX "Employee_employeeCode_key";

-- DropIndex
DROP INDEX "Product_barcode_key";

-- DropIndex
DROP INDEX "Product_sku_key";

-- DropIndex
DROP INDEX "Tax_name_key";

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EmployeeAdvance" ADD COLUMN     "storeId" TEXT NOT NULL,
ALTER COLUMN "remaining" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EmployeeNote" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Payroll" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ProductBatch" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "storeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Tax" ADD COLUMN     "storeId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Attendance_storeId_idx" ON "Attendance"("storeId");

-- CreateIndex
CREATE INDEX "Brand_storeId_idx" ON "Brand"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_storeId_name_key" ON "Brand"("storeId", "name");

-- CreateIndex
CREATE INDEX "Category_storeId_idx" ON "Category"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_storeId_name_key" ON "Category"("storeId", "name");

-- CreateIndex
CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_storeId_phone_key" ON "Customer"("storeId", "phone");

-- CreateIndex
CREATE INDEX "Employee_storeId_idx" ON "Employee"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_storeId_employeeCode_key" ON "Employee"("storeId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_storeId_cnic_key" ON "Employee"("storeId", "cnic");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_storeId_idx" ON "EmployeeAdvance"("storeId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_storeId_idx" ON "EmployeeDocument"("storeId");

-- CreateIndex
CREATE INDEX "EmployeeNote_storeId_idx" ON "EmployeeNote"("storeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_storeId_idx" ON "LeaveRequest"("storeId");

-- CreateIndex
CREATE INDEX "Payroll_storeId_idx" ON "Payroll"("storeId");

-- CreateIndex
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_storeId_sku_key" ON "Product"("storeId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_storeId_barcode_key" ON "Product"("storeId", "barcode");

-- CreateIndex
CREATE INDEX "ProductBatch_storeId_idx" ON "ProductBatch"("storeId");

-- CreateIndex
CREATE INDEX "Supplier_storeId_idx" ON "Supplier"("storeId");

-- CreateIndex
CREATE INDEX "Tax_storeId_idx" ON "Tax"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Tax_storeId_name_key" ON "Tax"("storeId", "name");

-- AddForeignKey
ALTER TABLE "Tax" ADD CONSTRAINT "Tax_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeNote" ADD CONSTRAINT "EmployeeNote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
