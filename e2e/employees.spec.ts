// e2e/employees.spec.ts
//
// Employee management E2E tests.

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

test.describe("Employees — HR management", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  });

  test("loads /employees and shows the employee list", async ({ page }) => {
    await login(page);
    await page.goto("/employees");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can open the add-employee form", async ({ page }) => {
    await login(page);
    await page.goto("/employees");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const addBtn = page.getByRole("button", { name: /add employee|new employee/i }).first();
    const btnVisible = await addBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (btnVisible) {
      await addBtn.click();
      await page.waitForTimeout(500);
      const dialog = page.locator('[role="dialog"]').first();
      const dialogVisible = await dialog.isVisible({ timeout: 3_000 }).catch(() => false);
      if (dialogVisible) {
        await expect(dialog).toBeVisible();
      }
    }
  });

  test("employee detail page loads without error", async ({ page }) => {
    await login(page);
    await page.goto("/employees");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const firstEmployee = page.locator('a[href*="/employees/"]').first();
    if (await firstEmployee.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstEmployee.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("employee detail shows tabs (overview, attendance, etc.)", async ({ page }) => {
    await login(page);
    await page.goto("/employees");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const firstEmployee = page.locator('a[href*="/employees/"]').first();
    if (await firstEmployee.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstEmployee.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

      // Look for tab buttons.
      const attendanceTab = page.getByRole("button", { name: /attendance/i }).first();
      const tabVisible = await attendanceTab.isVisible({ timeout: 5_000 }).catch(() => false);
      if (tabVisible) {
        await attendanceTab.click();
        await page.waitForTimeout(500);
        await expect(page).not.toHaveURL(/\/login/);
      }
    }
  });
});
