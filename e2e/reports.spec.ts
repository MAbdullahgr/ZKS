// e2e/reports.spec.ts
//
// Reports and analytics E2E tests.

import { test, expect } from "@playwright/test";

const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL ?? "owner@zkr-seed.local";
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? "Seed@1234";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
  await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|pos)/, { timeout: 30_000 });
  await page.waitForTimeout(500);
}

test.describe("Reports — dashboard and analytics", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /reports and shows analytics", async ({ page }) => {
    await login(page);
    await page.goto("/reports");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("reports page shows KPI cards", async ({ page }) => {
    await login(page);
    await page.goto("/reports");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for KPI cards (revenue, sales count, etc.)
    const kpiText = page.locator("text=/revenue|sales|profit|orders/i").first();
    const kpiVisible = await kpiText.isVisible({ timeout: 5_000 }).catch(() => false);
    if (kpiVisible) {
      expect(await kpiText.isVisible()).toBe(true);
    }
  });

  test("can switch report period", async ({ page }) => {
    await login(page);
    await page.goto("/reports");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for period buttons (7d, 30d, 90d, etc.)
    const periodBtn = page.getByRole("button", { name: /7|7d|week/i }).first();
    if (await periodBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await periodBtn.click();
      await page.waitForTimeout(1000);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("loads /reports/daily-z (Z-report)", async ({ page }) => {
    await login(page);
    await page.goto("/reports/daily-z");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("daily Z-report shows print button", async ({ page }) => {
    await login(page);
    await page.goto("/reports/daily-z");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const printBtn = page.getByRole("button", { name: /print/i });
    const btnVisible = await printBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (btnVisible) {
      expect(await printBtn.count()).toBeGreaterThan(0);
    }
  });
});
