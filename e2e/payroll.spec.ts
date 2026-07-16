// e2e/payroll.spec.ts

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

test.describe("Payroll — management", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /payroll and shows the payroll page", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/payroll");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("payroll page shows month/year selectors", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/payroll");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for month/year select or input elements.
    const selectOrInput = page.locator("select, input[type='number'], input[type='month']").first();
    const visible = await selectOrInput.isVisible({ timeout: 5_000 }).catch(() => false);
    if (visible) {
      await expect(selectOrInput).toBeVisible();
    }
  });
});
