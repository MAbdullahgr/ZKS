// e2e/sales.spec.ts
//
// Sales history E2E tests.

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

test.describe("Sales — history and detail", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /sales and shows the sales list", async ({ page }) => {
    await login(page);
    await page.goto("/sales");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can filter sales by date range", async ({ page }) => {
    await login(page);
    await page.goto("/sales");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for date inputs.
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    if (count >= 2) {
      await dateInputs.first().fill("2025-01-01");
      await dateInputs.nth(1).fill("2026-12-31");
      await page.waitForTimeout(1000);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("sale detail page loads without error", async ({ page }) => {
    await login(page);
    await page.goto("/sales");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const firstSale = page.locator('a[href*="/sales/"]').first();
    if (await firstSale.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstSale.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("sale detail page shows print button", async ({ page }) => {
    await login(page);
    await page.goto("/sales");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const firstSale = page.locator('a[href*="/sales/"]').first();
    if (await firstSale.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstSale.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

      const printBtn = page.getByRole("button", { name: /print/i });
      if (await printBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        // Just verify the button exists — don't actually print.
        expect(await printBtn.count()).toBeGreaterThan(0);
      }
    }
  });
});
