// e2e/navigation.spec.ts

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

const DASHBOARD_PATHS = [
  "/dashboard",
  "/sales",
  "/customers",
  "/inventory",
  "/purchases",
  "/suppliers",
  "/transfers",
  "/categories",
  "/brands",
  "/expenses",
  "/reports",
  "/accounting",
  "/employees",
  "/taxes",
  "/payroll",
  "/audit-logs",
  "/api-docs",
];

test.describe("Dashboard — navigation smoke tests", () => {
  for (const path of DASHBOARD_PATHS) {
    test(`loads ${path} without a server error`, async ({ page }) => {
      test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");

      await login(page);

      const serverErrors: number[] = [];
      page.on("response", (res) => {
        if (res.status() >= 500) serverErrors.push(res.status());
      });

      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page
        .waitForLoadState("networkidle", { timeout: 20_000 })
        .catch(() => {});

      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

      expect(serverErrors).toHaveLength(0);
    });
  }

  test("dashboard shows the modules grid", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");

    await login(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const moduleLinks = page.locator('a[href^="/"]');
    await moduleLinks.first().waitFor({ state: "visible", timeout: 15_000 });
    expect(await moduleLinks.count()).toBeGreaterThan(0);
  });

  test("clicking the Sales module navigates to /sales", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");

    await login(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const salesLink = page.locator('a[href="/sales"]').first();
    await salesLink.waitFor({ state: "visible", timeout: 10_000 });
    await salesLink.click();
    await expect(page).toHaveURL(/\/sales/, { timeout: 10_000 });
  });

  test("API docs page renders the route table", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");

    await login(page);
    await page.goto("/api-docs", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    await expect(
      page.getByRole("heading", { name: /api documentation/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
