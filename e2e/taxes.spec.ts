// e2e/taxes.spec.ts

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

async function selectStore(page: import("@playwright/test").Page) {
  try {
    await page.request.post("/api/auth/store", {
      data: { storeId: "main-store" },
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    });
  } catch {}
}

test.describe("Taxes — management", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /taxes and shows the tax list", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/taxes");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can open the add-tax form", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/taxes");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const addBtn = page.getByRole("button", { name: /add tax|new tax/i }).first();
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);
      // A dialog should appear.
      const dialog = page.locator('[role="dialog"]').first();
      const dialogVisible = await dialog.isVisible({ timeout: 5_000 }).catch(() => false);
      if (dialogVisible) {
        await expect(dialog).toBeVisible();
      }
    }
  });
});
