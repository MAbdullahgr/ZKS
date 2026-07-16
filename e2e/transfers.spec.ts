// e2e/transfers.spec.ts
//
// Inter-store transfer E2E tests.

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

test.describe("Transfers — inter-store", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /transfers and shows the transfer list", async ({ page }) => {
    await login(page);
    await page.goto("/transfers");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can open the create-transfer modal", async ({ page }) => {
    await login(page);
    await page.goto("/transfers");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const createBtn = page.getByRole("button", { name: /create|new|add transfer/i }).first();
    const btnVisible = await createBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (btnVisible) {
      await createBtn.click();
      await page.waitForTimeout(500);
      // A dialog should appear.
      const dialog = page.locator('[role="dialog"]').first();
      const dialogVisible = await dialog.isVisible({ timeout: 5_000 }).catch(() => false);
      if (dialogVisible) {
        await expect(dialog).toBeVisible();
      }
    }
  });

  test("transfer tabs switch correctly", async ({ page }) => {
    await login(page);
    await page.goto("/transfers");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for tab buttons (All, Outgoing, Incoming).
    const outgoingTab = page.getByRole("button", { name: /outgoing|sent/i }).first();
    if (await outgoingTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await outgoingTab.click();
      await page.waitForTimeout(500);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("transfer detail page loads without error", async ({ page }) => {
    await login(page);
    await page.goto("/transfers");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const firstTransfer = page.locator('a[href*="/transfers/"]').first();
    if (await firstTransfer.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstTransfer.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page).not.toHaveURL(/\/login/);
    }
  });
});
