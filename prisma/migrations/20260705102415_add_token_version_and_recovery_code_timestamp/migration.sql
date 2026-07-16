-- AUDIT-FIX H-1 + H-29: Add tokenVersion and recoveryCodeGeneratedAt to "User"
--
-- tokenVersion (Int, default 0): Enables session invalidation. When a user
--   changes their password / resets via recovery code / has password reset
--   by admin / changes PIN, this counter is bumped. requireAuth rejects
--   JWTs whose tokenVersion doesn't match — closing the "stolen JWT stays
--   valid for 7 days" hole. Safe migration: column is nullable-default so
--   existing rows get 0.
--
-- recoveryCodeGeneratedAt (DateTime?, nullable): Enables recovery-code
--   expiry. Codes older than 90 days are rejected. Existing rows get NULL
--   which means "no expiry enforced until next code generation" — backwards
--   compatible.

ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "recoveryCodeGeneratedAt" TIMESTAMP(3);
