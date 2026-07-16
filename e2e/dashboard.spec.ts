// e2e/dashboard.spec.ts

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
    await page.request.patch("/api/auth/store", {
      data: { storeId: "main-store" },
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    });
  } catch {}
}

test.describe("Dashboard — overview", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /dashboard and shows module grid", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const moduleLinks = page.locator('a[href^="/"]');
    await moduleLinks.first().waitFor({ state: "visible", timeout: 15_000 });
    expect(await moduleLinks.count()).toBeGreaterThan(0);
  });

  test("dashboard shows KPI cards or summary", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    // The dashboard should show some content — modules, KPIs, or text.
    const content = page.locator("main, [id='main-content'], .flex-1").first();
    await expect(content).toBeVisible({ timeout: 10_000 });
  });

  test("dashboard navigation to /sales works", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const salesLink = page.locator('a[href="/sales"]').first();
    await salesLink.waitFor({ state: "visible", timeout: 10_000 });
    await salesLink.click();
    await expect(page).toHaveURL(/\/sales/, { timeout: 10_000 });
  });

  test("dashboard navigation to /inventory works", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const invLink = page.locator('a[href="/inventory"]').first();
    await invLink.waitFor({ state: "visible", timeout: 10_000 });
    await invLink.click();
    await expect(page).toHaveURL(/\/inventory/, { timeout: 10_000 });
  });

  test("dashboard navigation to /reports works", async ({ page }) => {
    await login(page);
    await selectStore(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const reportsLink = page.locator('a[href="/reports"]').first();
    await reportsLink.waitFor({ state: "visible", timeout: 10_000 });
    await reportsLink.click();
    await expect(page).toHaveURL(/\/reports/, { timeout: 15_000 });
  });
});
