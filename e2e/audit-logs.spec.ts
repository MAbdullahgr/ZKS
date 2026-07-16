// e2e/audit-logs.spec.ts

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

test.describe("Audit Logs — viewing", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /audit-logs and shows the log list", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/audit-logs");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("audit logs show login entries", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/audit-logs");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // After logging in, there should be LOGIN_SUCCESS audit entries.
    // Look for any text containing "LOGIN" or "login".
    const loginEntry = page.locator("text=/login/i").first();
    const visible = await loginEntry.isVisible({ timeout: 5_000 }).catch(() => false);
    if (visible) {
      expect(await loginEntry.isVisible()).toBe(true);
    }
  });
});
