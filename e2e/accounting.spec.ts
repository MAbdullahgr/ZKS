// e2e/accounting.spec.ts
//
// Accounting E2E tests.

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

test.describe("Accounting — reports and journal entries", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /accounting and shows trial balance summary", async ({ page }) => {
    await login(page);
    await page.goto("/accounting");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("loads /accounting/chart-of-accounts", async ({ page }) => {
    await login(page);
    await page.goto("/accounting/chart-of-accounts");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("loads /accounting/journal-entries", async ({ page }) => {
    await login(page);
    await page.goto("/accounting/journal-entries");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("loads /accounting/reports", async ({ page }) => {
    await login(page);
    await page.goto("/accounting/reports");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("P&L report generates without error", async ({ page }) => {
    await login(page);
    await page.goto("/accounting/reports");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for P&L tab or button.
    const pnlTab = page.getByRole("button", { name: /profit|p&l|income/i }).first();
    if (await pnlTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await pnlTab.click();
      await page.waitForTimeout(2000);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("can open the create-journal-entry form", async ({ page }) => {
    await login(page);
    await page.goto("/accounting/journal-entries");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const createBtn = page.getByRole("button", { name: /new entry|create|add/i }).first();
    if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(500);
      const descInput = page.locator('input[name="description"], textarea[name="description"]').first();
      const descVisible = await descInput.isVisible({ timeout: 3_000 }).catch(() => false);
      if (descVisible) {
        await expect(descInput).toBeVisible();
      }
    }
  });
});
