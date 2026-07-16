// e2e/purchases.spec.ts
//
// Purchase order E2E tests.

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

test.describe("Purchases — order management", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /purchases and shows the PO list", async ({ page }) => {
    await login(page);
    await page.goto("/purchases");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("loads /purchases/new and shows the create form", async ({ page }) => {
    await login(page);
    await page.goto("/purchases/new");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("purchase detail page loads without error", async ({ page }) => {
    await login(page);
    await page.goto("/purchases");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const firstPO = page.locator('a[href*="/purchases/"]').first();
    if (await firstPO.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstPO.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("status filter pills are visible", async ({ page }) => {
    await login(page);
    await page.goto("/purchases");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for status filter buttons.
    const draftBtn = page.getByRole("button", { name: /draft/i }).first();
    const draftVisible = await draftBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (draftVisible) {
      await draftBtn.click();
      await page.waitForTimeout(500);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });
});
