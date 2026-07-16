// e2e/api-docs.spec.ts

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

test.describe("API Documentation — page", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /api-docs and shows the documentation", async ({ page }) => {
    await login(page);
    await page.goto("/api-docs", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    await expect(
      page.getByRole("heading", { name: /api documentation/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("API docs show route entries", async ({ page }) => {
    await login(page);
    await page.goto("/api-docs", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for /api/auth route text.
    const routeText = page.locator("code, td").filter({ hasText: "/api/auth" }).first();
    await expect(routeText).toBeVisible({ timeout: 10_000 });
  });

  test("API docs show method badges", async ({ page }) => {
    await login(page);
    await page.goto("/api-docs", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    // Look for GET or POST badges.
    const getBadge = page.locator("text=/GET/").first();
    const postBadge = page.locator("text=/POST/").first();
    const getVisible = await getBadge.isVisible({ timeout: 5_000 }).catch(() => false);
    const postVisible = await postBadge.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(getVisible || postVisible).toBe(true);
  });
});
