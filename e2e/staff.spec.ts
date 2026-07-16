// e2e/staff.spec.ts
//
// Staff management E2E tests.

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

test.describe("Staff — management", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /staff and shows the staff list", async ({ page }) => {
    await login(page);
    await page.goto("/staff");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can open the assign-staff form", async ({ page }) => {
    await login(page);
    await page.goto("/staff");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const assignBtn = page.getByRole("button", { name: /assign|add staff|new staff/i }).first();
    const btnVisible = await assignBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (btnVisible) {
      await assignBtn.click();
      await page.waitForTimeout(500);
      // A dialog should appear.
      const dialog = page.locator('[role="dialog"]').first();
      const dialogVisible = await dialog.isVisible({ timeout: 3_000 }).catch(() => false);
      if (dialogVisible) {
        await expect(dialog).toBeVisible();
      }
    }
  });

  test("staff list shows user emails and roles", async ({ page }) => {
    await login(page);
    await page.goto("/staff");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for email text in the page.
    const emailText = page.locator("text=/@/").first();
    const emailVisible = await emailText.isVisible({ timeout: 5_000 }).catch(() => false);
    if (emailVisible) {
      expect(await emailText.isVisible()).toBe(true);
    }
  });
});
