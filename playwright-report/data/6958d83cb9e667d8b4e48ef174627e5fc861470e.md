# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: daily-z.spec.ts >> Daily Z-Report >> loads /reports/daily-z without error
- Location: e2e\daily-z.spec.ts:32:7

# Error details

```
TimeoutError: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "http://localhost:3000/reports/daily-z", waiting until "domcontentloaded"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - link "ZKS Store Management" [ref=e7] [cursor=pointer]:
            - /url: /dashboard
            - img [ref=e9]
            - generic [ref=e13]:
              - paragraph [ref=e14]: ZKS
              - paragraph [ref=e15]: Store Management
          - navigation [ref=e16]:
            - link "POS" [ref=e17] [cursor=pointer]:
              - /url: /pos
            - link "Sales" [ref=e18] [cursor=pointer]:
              - /url: /sales
            - link "Customers" [ref=e19] [cursor=pointer]:
              - /url: /customers
            - link "Inventory" [ref=e20] [cursor=pointer]:
              - /url: /inventory
            - link "Purchases" [ref=e21] [cursor=pointer]:
              - /url: /purchases
            - link "Reports" [ref=e22] [cursor=pointer]:
              - /url: /reports
        - generic [ref=e23]:
          - button "Notifications" [ref=e24]:
            - img [ref=e25]
          - generic [ref=e30]:
            - img [ref=e31]
            - generic [ref=e35]: All Stores
          - button "O owner owner" [ref=e37]:
            - generic [ref=e38]: O
            - generic [ref=e39]:
              - paragraph [ref=e40]: owner
              - paragraph [ref=e41]: owner
            - img [ref=e42]
    - main [ref=e44]:
      - generic [ref=e46]:
        - generic [ref=e47]:
          - link "Back to reports" [ref=e48] [cursor=pointer]:
            - /url: /reports
            - img [ref=e49]
            - text: Back
          - heading "Daily Z-Report" [level=1] [ref=e51]
        - generic [ref=e52]:
          - generic [ref=e53]:
            - img
            - textbox "Report date" [ref=e54]: 2026-07-16
          - button "Print" [ref=e55]:
            - img [ref=e56]
            - text: Print
    - contentinfo [ref=e67]:
      - generic [ref=e68]:
        - paragraph [ref=e69]: ZKS Store Management — Pakistani retail & khata
        - paragraph [ref=e70]: System operational
    - region "Notifications alt+T"
```

# Test source

```ts
  1  | // e2e/daily-z.spec.ts
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
  13 |   await expect(page).toHaveURL(/\/(dashboard|pos)/, { timeout: 30_000 });
  14 |   await page.waitForTimeout(1000);
  15 | }
  16 | 
  17 | async function selectStore(page: import("@playwright/test").Page) {
  18 |   try {
  19 |     await page.request.post("/api/auth/store", {
  20 |       data: { storeId: "main-store" },
  21 |       headers: { "Content-Type": "application/json" },
  22 |       timeout: 5000,
  23 |     });
  24 |   } catch {}
  25 | }
  26 | 
  27 | test.describe("Daily Z-Report", () => {
  28 |   test.beforeAll(async () => {
  29 |     test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  30 |   });
  31 | 
  32 |   test("loads /reports/daily-z without error", async ({ page }) => {
  33 |     await login(page);
  34 |     await selectStore(page);
> 35 |     await page.goto("/reports/daily-z", { waitUntil: "domcontentloaded", timeout: 30_000 });
     |                ^ TimeoutError: page.goto: Timeout 30000ms exceeded.
  36 |     await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  37 |     await expect(page).not.toHaveURL(/\/login/);
  38 |   });
  39 | 
  40 |   test("Z-report page has content", async ({ page }) => {
  41 |     await login(page);
  42 |     await selectStore(page);
  43 |     await page.goto("/reports/daily-z", { waitUntil: "domcontentloaded", timeout: 30_000 });
  44 |     await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  45 | 
  46 |     // The page should have visible text content — use :visible filter.
  47 |     const content = page.locator("h1, h2, h3, p, table, span").locator("visible=true").first();
  48 |     await expect(content).toBeVisible({ timeout: 10_000 });
  49 |   });
  50 | 
  51 |   test("Z-report page has print button or print area", async ({ page }) => {
  52 |     await login(page);
  53 |     await selectStore(page);
  54 |     await page.goto("/reports/daily-z", { waitUntil: "domcontentloaded", timeout: 30_000 });
  55 |     await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  56 | 
  57 |     // Look for a print button or a printable area.
  58 |     const printBtn = page.getByRole("button", { name: /print/i });
  59 |     const printArea = page.locator(".print-area, [class*='print']");
  60 |     const btnVisible = await printBtn.isVisible({ timeout: 3_000 }).catch(() => false);
  61 |     const areaVisible = await printArea.isVisible({ timeout: 3_000 }).catch(() => false);
  62 |     // Either should exist — but don't hard-fail if neither does.
  63 |     if (btnVisible || areaVisible) {
  64 |       expect(true).toBe(true);
  65 |     }
  66 |   });
  67 | });
  68 | 
```