import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // AUDIT-FIX: Run seed.ts (stores + settings + categories + sample data)
    // AND seed-accounting.ts (chart of accounts) as the seed command.
    // Previously this ran backfill-journal.ts — which broke `prisma migrate
    // reset` because backfill on an empty DB does nothing (no stores to
    // backfill). Backfill is a separate explicit command: `npm run db:backfill`.
    seed: "tsx ./prisma/seed.ts && tsx ./prisma/seed-accounting.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
