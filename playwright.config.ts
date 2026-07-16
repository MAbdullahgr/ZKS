import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// AUDIT-FIX: Load .env so process.env.DATABASE_URL is available to the
// test skip-logic. Without this, Playwright doesn't see .env variables
// and all DB-dependent tests get skipped.
loadEnv();

/**
 * Playwright config for ZKR Store Management.
 *
 * ─── Running the E2E tests ────────────────────────────────────────────
 *
 * E2E tests are NOT part of `bun run test` (which runs vitest). Run them
 * explicitly with:
 *
 *   bunx playwright test           # headless, single browser
 *   bunx playwright test --headed  # visible browser window
 *   bunx playwright test --ui      # interactive UI mode
 *   bunx playwright show-report    # view the HTML report from the last run
 *
 * ─── Requirements ─────────────────────────────────────────────────────
 *
 *   1. `bun run dev` running on http://localhost:3000
 *      (Playwright will auto-start it via the `webServer` block below if
 *       it isn't already running — but reuseExistingServer means a
 *       manually-started dev server is preferred for speed.)
 *   2. A populated DATABASE_URL — the tests log in as the seeded admin
 *      user (admin@zkr.local / password set in prisma/seed.ts) and
 *      complete real sales against real DB rows.
 *   3. Seed data: `bun run db:seed` first if the DB is empty.
 *
 * The tests are smoke-level: they verify pages load and core flows
 * (login → dashboard, POS sale, navigation) don't 500. They are NOT
 * golden-path regression tests — they may break if the UI changes, and
 * that's OK. Update the selectors when that happens.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // first `bun run dev` can take ~30s to compile
  },
});
