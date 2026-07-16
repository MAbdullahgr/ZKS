-- FIX P1-20: Add a partial unique index to prevent duplicate open register
-- sessions for the same user. PostgreSQL partial indexes only index rows that
-- match the WHERE clause, so this index only applies to sessions with
-- status = 'open'. A user can have many closed sessions but at most one open.
--
-- Combined with the Serializable transaction in the API route, this makes the
-- "two cashiers open two sessions" race condition impossible at the DB level.

CREATE UNIQUE INDEX "RegisterSession_userId_status_open_unique"
  ON "RegisterSession" ("userId")
  WHERE "status" = 'open';
