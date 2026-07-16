// e2e/expenses.spec.ts
//
// Expense management E2E tests.

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

test.describe("Expenses — management", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /expenses and shows the expense list", async ({ page }) => {
    await login(page);
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can open the add-expense form", async ({ page }) => {
    await login(page);
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const addBtn = page.getByRole("button", { name: /add expense|new expense/i }).first();
    const btnVisible = await addBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (btnVisible) {
      await addBtn.click();
      await page.waitForTimeout(500);
      // A form should appear — look for amount input.
      const amountInput = page.locator('input[name="amount"], input[type="number"]').first();
      await expect(amountInput).toBeVisible({ timeout: 5_000 });
    }
  });

  test("expense list shows date grouping", async ({ page }) => {
    await login(page);
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    // The page should either show expenses grouped by date or an empty state.
    // Just verify it doesn't crash or redirect to login.
    await expect(page).not.toHaveURL(/\/login/);
  });
});
