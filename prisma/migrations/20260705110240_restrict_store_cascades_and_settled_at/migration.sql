-- AUDIT-FIX H-14: Change Store → financial/HR table cascades from
-- Cascade to Restrict. Previously deleting a Store would cascade-delete
-- all financial history (RegisterSession, JournalEntry, Account), HR
-- records (Employee, Payroll, Attendance), and customer/supplier data —
-- irrecoverable data loss + audit trail gone. Now the FK constraint
-- blocks Store deletion if any financial/HR record references it.
-- Stores should be soft-deleted (isActive: false) — never hard-deleted.
--
-- AUDIT-FIX: Also fix schema drift — StockTransfer.settledAt exists in
-- schema.prisma but was never created in a migration. This adds the
-- column so settleTransfers queries don't fail on a fresh DB.

-- Add settledAt to StockTransfer (fixes schema drift)
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3);

-- Change Store FK cascades to Restrict for financial/HR tables.
-- These ALTERs are safe — they only change the FK behavior, no data change.
-- If a Store currently has financial/HR records, deleting it will now throw
-- a FK constraint violation (which is the desired behavior).

ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_storeId_fkey";
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payroll" DROP CONSTRAINT IF EXISTS "Payroll_storeId_fkey";
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeDocument" DROP CONSTRAINT IF EXISTS "EmployeeDocument_storeId_fkey";
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attendance" DROP CONSTRAINT IF EXISTS "Attendance_storeId_fkey";
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" DROP CONSTRAINT IF EXISTS "LeaveRequest_storeId_fkey";
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeAdvance" DROP CONSTRAINT IF EXISTS "EmployeeAdvance_storeId_fkey";
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeNote" DROP CONSTRAINT IF EXISTS "EmployeeNote_storeId_fkey";
ALTER TABLE "EmployeeNote" ADD CONSTRAINT "EmployeeNote_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "Supplier_storeId_fkey";
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_storeId_fkey";
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_storeId_fkey";
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductBatch" DROP CONSTRAINT IF EXISTS "ProductBatch_storeId_fkey";
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RegisterSession" DROP CONSTRAINT IF EXISTS "RegisterSession_storeId_fkey";
ALTER TABLE "RegisterSession" ADD CONSTRAINT "RegisterSession_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_storeId_fkey";
ALTER TABLE "Account" ADD CONSTRAINT "Account_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JournalEntry" DROP CONSTRAINT IF EXISTS "JournalEntry_storeId_fkey";
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AUDIT-FIX: Indexes for settleTransfers query performance.
CREATE INDEX IF NOT EXISTS "StockTransfer_settledAt_idx" ON "StockTransfer"("settledAt");
CREATE INDEX IF NOT EXISTS "StockTransfer_status_settledAt_idx" ON "StockTransfer"("status", "settledAt");

-- AUDIT-FIX: Add fbrQrCode column to Sale for FBR QR code storage.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "fbrQrCode" TEXT;
