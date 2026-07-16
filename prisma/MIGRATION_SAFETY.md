# Migration Safety Notes

## The `multi_store_architecture` Migration (20260702120127)

This migration adds `storeId` NOT NULL columns to 14 tables. Prisma's
generated warning says:

> "Added the required column `storeId` to the `X` table without a default
> value. This is not possible if the table is not empty."

### When this migration is safe

- **Fresh database (recommended):** The `init` migration creates empty tables.
  Adding a NOT NULL column to an empty table succeeds. Then the seed script
  creates the first store and assigns `storeId` to all seeded data. ✅
- **Your current dev database:** Already applied — no action needed. ✅

### When this migration would fail

- **Applying to an existing non-empty database** that doesn't already have
  `storeId` columns. This would happen if you:
  1. Had an old deployment from before multi-store was added
  2. Tried to run `prisma migrate deploy` on that database

  In this case, the migration would fail because PostgreSQL can't add a NOT
  NULL column to a table with existing rows without a default.

### How to deploy to Neon (fresh)

1. Create a fresh Neon database (empty)
2. Set `DATABASE_URL` in `.env` to the Neon connection string
3. Run: `npx prisma migrate deploy` — creates all tables from scratch
4. Run: `npm run db:seed` — creates the default store + settings
5. Run: `npm run db:seed:accounting` — creates the chart of accounts
6. Run: `npm run db:backfill` — only needed if you have historical data
   (skip for a fresh deployment)

### If you need to migrate an existing non-empty database

Contact support or manually run this SQL before `prisma migrate deploy`:

```sql
-- Create a default store first
INSERT INTO "Store" (id, name, "type", "isActive", "createdAt")
VALUES ('main-store', 'Main Store', 'retail', true, NOW())
ON CONFLICT DO NOTHING;

-- Backfill storeId on all tables (assign everything to the default store)
UPDATE "Attendance" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "Brand" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "Category" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "Customer" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "Employee" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "EmployeeAdvance" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "EmployeeDocument" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "EmployeeNote" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "LeaveRequest" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "Payroll" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "Product" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "ProductBatch" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "Supplier" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
UPDATE "Tax" SET "storeId" = 'main-store' WHERE "storeId" IS NULL;
```

Then run `prisma migrate deploy` — the NOT NULL columns will succeed because
all rows now have a storeId.

## The `add_register_session_unique_index` Migration (20260704120000)

This adds a partial unique index to prevent duplicate open register sessions.
This is safe on any database — partial indexes only affect rows matching the
WHERE clause, so existing closed sessions are not impacted.
