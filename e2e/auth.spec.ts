// e2e/auth.spec.ts
//
// Login flow E2E tests. Run with:
//
//   bun run dev         # in another terminal — http://localhost:3000
//   bunx playwright test e2e/auth.spec.ts

import { test, expect } from "@playwright/test";

const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL ?? "owner@zkr-seed.local";
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? "Seed@1234";

test.describe("Auth — login flow", () => {
  test("redirects unauthenticated users from /dashboard to /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });

  test("shows the login form on /login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in/i }),
    ).toBeVisible();
  });

  test("rejects an invalid email/password combination with an error", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("wrong@example.com");
    await page.locator('input[type="password"]').fill("WrongPass123!");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should stay on /login and show an error message.
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    // Look for an error message — the login page shows errors in a red alert.
    await expect(page.locator("text=/invalid email or password/i")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("logs in with valid seeded credentials and redirects to a dashboard", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
    await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to /dashboard or /pos (not stay on /login).
    await expect(page).toHaveURL(/\/(dashboard|pos)/, { timeout: 30_000 });
  });

  test("sets the storeos_token cookie on successful login", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
    await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for the redirect to happen — this confirms the login API
    // responded successfully and set the cookie.
    await expect(page).toHaveURL(/\/(dashboard|pos)/, { timeout: 30_000 });

    // Give the browser a moment to process the Set-Cookie header.
    await page.waitForTimeout(1000);

    const cookies = await page.context().cookies();
    const token = cookies.find((c) => c.name === "storeos_token");
    expect(token).toBeTruthy();
    expect(token?.httpOnly).toBe(true);
  });
});
