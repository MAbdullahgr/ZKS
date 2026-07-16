# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customers.spec.ts >> Customers — management >> customer detail page loads without error
- Location: e2e\customers.spec.ts:48:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/(dashboard|pos)/
Received string:  "http://localhost:3000/login"
Timeout: 30000ms

Call log:
  - Expect "toHaveURL" with timeout 30000ms
    62 × unexpected value "http://localhost:3000/login"

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- alert
- paragraph: ZKS Store
- paragraph: Management System
- heading "Run your store with confidence." [level=2]
- paragraph: POS, inventory, khata, payroll & accounting — built for Pakistani retail. Multi-store ready, FBR-aware, and offline-capable at the till.
- list:
  - listitem: Lightning-fast checkout with register sessions
  - listitem: Live stock levels across every branch
  - listitem: Customer khata & supplier bakaya ledgers
- text: © 2026 ZKS. Crafted for retailers.
- heading "Welcome back" [level=1]
- paragraph: Sign in to your ZKS workspace
- text: Email Address
- textbox "Email Address":
  - /placeholder: owner@zkr.local
  - text: owner@zkr-seed.local
- text: Password
- textbox "Password":
  - /placeholder: Enter your password
  - text: Seed@1234
- button "Show password"
- button "Signing in…" [disabled]
- button "Forgot password?"
- paragraph: Enter your work email and password
```

# Test source

```ts
  1  | // e2e/customers.spec.ts
  2  | 
  3  | import { test, expect } from "@playwright/test";
  4  | 
  5  | const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL ?? "owner@zkr-seed.local";
  6  | const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? "Seed@1234";
  7  | 
  8  | async function login(page: import("@playwright/test").Page) {
  9  |   await page.goto("/login");
  10 |   await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
  11 |   await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
  12 |   await page.getByRole("button", { name: /sign in/i }).click();
> 13 |   await expect(page).toHaveURL(/\/(dashboard|pos)/, { timeout: 30_000 });
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  14 |   await page.waitForTimeout(1000);
  15 | }
  16 | 
  17 | test.describe("Customers — management", () => {
  18 |   test.beforeAll(async () => {
  19 |     test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  20 |   });
  21 | 
  22 |   test("loads /customers and shows the customer list", async ({ page }) => {
  23 |     await login(page);
  24 |     await page.goto("/customers");
  25 |     await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  26 |     await expect(page).not.toHaveURL(/\/login/);
  27 |   });
  28 | 
  29 |   test("can open the add-customer form", async ({ page }) => {
  30 |     await login(page);
  31 |     await page.goto("/customers");
  32 |     await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  33 | 
  34 |     const addBtn = page.getByRole("button", { name: /add customer|new customer/i }).first();
  35 |     const btnVisible = await addBtn.isVisible({ timeout: 5_000 }).catch(() => false);
  36 |     if (btnVisible) {
  37 |       await addBtn.click();
  38 |       await page.waitForTimeout(1000);
  39 |       // Use a very broad selector — the modal inputs may not have type attributes.
  40 |       const anyInput = page.locator("input").first();
  41 |       const dialog = page.locator('[role="dialog"], .fixed.inset-0').first();
  42 |       const inputVisible = await anyInput.isVisible({ timeout: 5_000 }).catch(() => false);
  43 |       const dialogVisible = await dialog.isVisible({ timeout: 5_000 }).catch(() => false);
  44 |       expect(inputVisible || dialogVisible).toBe(true);
  45 |     }
  46 |   });
  47 | 
  48 |   test("customer detail page loads without error", async ({ page }) => {
  49 |     await login(page);
  50 |     await page.goto("/customers");
  51 |     await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  52 | 
  53 |     const link = page.locator('a[href*="/customers/"]').first();
  54 |     const linkVisible = await link.isVisible({ timeout: 5_000 }).catch(() => false);
  55 |     if (linkVisible) {
  56 |       await link.click();
  57 |       await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  58 |       await expect(page).not.toHaveURL(/\/login/);
  59 |     } else {
  60 |       test.skip(true, "No customer links found on the page");
  61 |     }
  62 |   });
  63 | });
  64 | 
```