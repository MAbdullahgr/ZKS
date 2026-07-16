# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> Dashboard — overview >> dashboard navigation to /reports works
- Location: e2e\dashboard.spec.ts:86:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/reports/
Received string:  "http://localhost:3000/dashboard"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    32 × unexpected value "http://localhost:3000/dashboard"

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- alert
- banner:
  - link "ZKS Store Management":
    - /url: /dashboard
    - paragraph: ZKS
    - paragraph: Store Management
  - navigation:
    - link "POS":
      - /url: /pos
    - link "Sales":
      - /url: /sales
    - link "Customers":
      - /url: /customers
    - link "Inventory":
      - /url: /inventory
    - link "Purchases":
      - /url: /purchases
    - link "Reports":
      - /url: /reports
  - button "Toggle theme"
  - button "Notifications"
  - button "Main Store"
  - button "O owner owner":
    - text: O
    - paragraph: owner
    - paragraph: owner
- main:
  - paragraph: Good afternoon
  - heading "Welcome back, owner" [level=1]
  - paragraph: Select a module to get started — your retail command center is ready.
  - paragraph: Active Store
  - paragraph: Main Store
  - heading "Modules" [level=2]
  - link "Point of Sale Quick sales & checkout":
    - /url: /pos
    - img
    - heading "Point of Sale" [level=3]
    - paragraph: Quick sales & checkout
  - link "Sales History View past transactions":
    - /url: /sales
    - img
    - heading "Sales History" [level=3]
    - paragraph: View past transactions
  - link "Customers Khata & contact book":
    - /url: /customers
    - img
    - heading "Customers" [level=3]
    - paragraph: Khata & contact book
  - link "Inventory Products & stock levels":
    - /url: /inventory
    - img
    - heading "Inventory" [level=3]
    - paragraph: Products & stock levels
  - link "Purchases Orders & receiving":
    - /url: /purchases
    - img
    - heading "Purchases" [level=3]
    - paragraph: Orders & receiving
  - link "Suppliers Vendor management":
    - /url: /suppliers
    - img
    - heading "Suppliers" [level=3]
    - paragraph: Vendor management
  - link "Stock Transfers Inter-store transfers":
    - /url: /transfers
    - img
    - heading "Stock Transfers" [level=3]
    - paragraph: Inter-store transfers
  - link "Categories Product groups":
    - /url: /categories
    - img
    - heading "Categories" [level=3]
    - paragraph: Product groups
  - link "Brands Manage product brands":
    - /url: /brands
    - img
    - heading "Brands" [level=3]
    - paragraph: Manage product brands
  - link "Expenses Daily store Kharcha":
    - /url: /expenses
    - img
    - heading "Expenses" [level=3]
    - paragraph: Daily store Kharcha
  - link "Reports Analytics & insights":
    - /url: /reports
    - img
    - heading "Reports" [level=3]
    - paragraph: Analytics & insights
  - link "Accounting Ledger & financial reports":
    - /url: /accounting
    - img
    - heading "Accounting" [level=3]
    - paragraph: Ledger & financial reports
  - link "Employees HR, payroll & attendance":
    - /url: /employees
    - img
    - heading "Employees" [level=3]
    - paragraph: HR, payroll & attendance
  - link "Staff System access & roles":
    - /url: /staff
    - img
    - heading "Staff" [level=3]
    - paragraph: System access & roles
  - link "Taxes Tax rates & FBR codes":
    - /url: /taxes
    - img
    - heading "Taxes" [level=3]
    - paragraph: Tax rates & FBR codes
  - link "Payroll Salaries & attendance":
    - /url: /payroll
    - img
    - heading "Payroll" [level=3]
    - paragraph: Salaries & attendance
  - link "Audit Logs Track all system actions":
    - /url: /audit-logs
    - img
    - heading "Audit Logs" [level=3]
    - paragraph: Track all system actions
  - link "Settings Store configuration":
    - /url: /settings
    - img
    - heading "Settings" [level=3]
    - paragraph: Store configuration
  - link "Stores Manage locations & warehouses":
    - /url: /stores
    - img
    - heading "Stores" [level=3]
    - paragraph: Manage locations & warehouses
  - paragraph: "Tip: Locked modules are shown so you know what features are available. Upgrade your role to access them."
  - text: ✓ All clear
  - paragraph: No low-stock, out-of-stock, or expiring-batch alerts. Inventory is healthy.
- contentinfo:
  - paragraph: ZKS Store Management — Pakistani retail & khata
  - paragraph: System operational
- region "Notifications alt+T"
```

# Test source

```ts
  1   | // e2e/dashboard.spec.ts
  2   | 
  3   | import { test, expect } from "@playwright/test";
  4   | 
  5   | const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL ?? "owner@zkr-seed.local";
  6   | const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? "Seed@1234";
  7   | 
  8   | async function login(page: import("@playwright/test").Page) {
  9   |   await page.goto("/login");
  10  |   await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
  11  |   await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
  12  |   await page.getByRole("button", { name: /sign in/i }).click();
  13  |   await expect(page).toHaveURL(/\/(dashboard|pos)/, { timeout: 30_000 });
  14  |   await page.waitForTimeout(1000);
  15  | }
  16  | 
  17  | async function selectStore(page: import("@playwright/test").Page) {
  18  |   try {
  19  |     await page.request.patch("/api/auth/store", {
  20  |       data: { storeId: "main-store" },
  21  |       headers: { "Content-Type": "application/json" },
  22  |       timeout: 5000,
  23  |     });
  24  |   } catch {}
  25  | }
  26  | 
  27  | test.describe("Dashboard — overview", () => {
  28  |   test.beforeAll(async () => {
  29  |     test.skip(!process.env.DATABASE_URL, "Needs DATABASE_URL");
  30  |   });
  31  | 
  32  |   test("loads /dashboard and shows module grid", async ({ page }) => {
  33  |     await login(page);
  34  |     await selectStore(page);
  35  |     await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  36  |     await page
  37  |       .waitForLoadState("networkidle", { timeout: 20_000 })
  38  |       .catch(() => {});
  39  | 
  40  |     const moduleLinks = page.locator('a[href^="/"]');
  41  |     await moduleLinks.first().waitFor({ state: "visible", timeout: 15_000 });
  42  |     expect(await moduleLinks.count()).toBeGreaterThan(0);
  43  |   });
  44  | 
  45  |   test("dashboard shows KPI cards or summary", async ({ page }) => {
  46  |     await login(page);
  47  |     await selectStore(page);
  48  |     await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  49  |     await page
  50  |       .waitForLoadState("networkidle", { timeout: 20_000 })
  51  |       .catch(() => {});
  52  | 
  53  |     // The dashboard should show some content — modules, KPIs, or text.
  54  |     const content = page.locator("main, [id='main-content'], .flex-1").first();
  55  |     await expect(content).toBeVisible({ timeout: 10_000 });
  56  |   });
  57  | 
  58  |   test("dashboard navigation to /sales works", async ({ page }) => {
  59  |     await login(page);
  60  |     await selectStore(page);
  61  |     await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  62  |     await page
  63  |       .waitForLoadState("networkidle", { timeout: 20_000 })
  64  |       .catch(() => {});
  65  | 
  66  |     const salesLink = page.locator('a[href="/sales"]').first();
  67  |     await salesLink.waitFor({ state: "visible", timeout: 10_000 });
  68  |     await salesLink.click();
  69  |     await expect(page).toHaveURL(/\/sales/, { timeout: 10_000 });
  70  |   });
  71  | 
  72  |   test("dashboard navigation to /inventory works", async ({ page }) => {
  73  |     await login(page);
  74  |     await selectStore(page);
  75  |     await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  76  |     await page
  77  |       .waitForLoadState("networkidle", { timeout: 20_000 })
  78  |       .catch(() => {});
  79  | 
  80  |     const invLink = page.locator('a[href="/inventory"]').first();
  81  |     await invLink.waitFor({ state: "visible", timeout: 10_000 });
  82  |     await invLink.click();
  83  |     await expect(page).toHaveURL(/\/inventory/, { timeout: 10_000 });
  84  |   });
  85  | 
  86  |   test("dashboard navigation to /reports works", async ({ page }) => {
  87  |     await login(page);
  88  |     await selectStore(page);
  89  |     await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  90  |     await page
  91  |       .waitForLoadState("networkidle", { timeout: 20_000 })
  92  |       .catch(() => {});
  93  | 
  94  |     const reportsLink = page.locator('a[href="/reports"]').first();
  95  |     await reportsLink.waitFor({ state: "visible", timeout: 10_000 });
  96  |     await reportsLink.click();
> 97  |     await expect(page).toHaveURL(/\/reports/, { timeout: 15_000 });
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  98  |   });
  99  | });
  100 | 
```