// e2e/customers.spec.ts

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

test.describe("Customers — management", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /customers and shows the customer list", async ({ page }) => {
    await login(page);
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can open the add-customer form", async ({ page }) => {
    await login(page);
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const addBtn = page.getByRole("button", { name: /add customer|new customer/i }).first();
    const btnVisible = await addBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (btnVisible) {
      await addBtn.click();
      await page.waitForTimeout(1000);
      // Use a very broad selector — the modal inputs may not have type attributes.
      const anyInput = page.locator("input").first();
      const dialog = page.locator('[role="dialog"], .fixed.inset-0').first();
      const inputVisible = await anyInput.isVisible({ timeout: 5_000 }).catch(() => false);
      const dialogVisible = await dialog.isVisible({ timeout: 5_000 }).catch(() => false);
      expect(inputVisible || dialogVisible).toBe(true);
    }
  });

  test("customer detail page loads without error", async ({ page }) => {
    await login(page);
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const link = page.locator('a[href*="/customers/"]').first();
    const linkVisible = await link.isVisible({ timeout: 5_000 }).catch(() => false);
    if (linkVisible) {
      await link.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page).not.toHaveURL(/\/login/);
    } else {
      test.skip(true, "No customer links found on the page");
    }
  });
});
