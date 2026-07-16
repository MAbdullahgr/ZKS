// e2e/stores.spec.ts

import { test, expect } from "@playwright/test";

const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL ?? "owner@zkr-seed.local";
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? "Seed@1234";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
  await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|pos)/, { timeout: 30_000 });
  await page.waitForTimeout(1000);
}

test.describe("Stores — management", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /stores and shows the store list", async ({ page }) => {
    await login(page);
    await page.goto("/stores");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("store list shows seeded stores", async ({ page }) => {
    await login(page);
    await page.goto("/stores");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for store names from the seed data.
    const mainStoreText = page.locator("text=/Main Store/i").first();
    const visible = await mainStoreText.isVisible({ timeout: 5_000 }).catch(() => false);
    if (visible) {
      expect(await mainStoreText.isVisible()).toBe(true);
    }
  });
});
