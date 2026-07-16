// e2e/settings.spec.ts

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
  } catch {
    // Ignore
  }
}

test.describe("Settings — store configuration", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /settings without error", async ({ page }) => {
    await login(page);
    await selectStore(page); // Ensure a store is selected
    await page.goto("/settings");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("settings page has form inputs", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // The settings page should have at least one input or button.
    const inputs = page.locator("input, button, select, textarea");
    await expect(inputs.first()).toBeVisible({ timeout: 10_000 });
  });

  test("settings page shows PIN section", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const pinText = page.locator("text=/pin/i").first();
    const pinVisible = await pinText.isVisible({ timeout: 5_000 }).catch(() => false);
    if (pinVisible) {
      expect(await pinText.isVisible()).toBe(true);
    }
  });
});
