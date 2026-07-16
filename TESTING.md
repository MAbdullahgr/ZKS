# ZKS Store Management — Production Testing Guide

This guide walks you through testing **every feature** of the ZKS system after deploying to Vercel. Follow each section in order. Check off each item as you verify it works.

---

## Prerequisites

1. Deploy to Vercel
2. Run the database migration: `npx prisma migrate deploy`
3. Run the seed script (one-time setup): `npx prisma db seed` then `npx tsx prisma/seed-accounting.ts`
4. Visit your Vercel URL and log in with: `owner@zkr-seed.local` / `Seed@1234`
5. **Change the default password immediately** after first login (Settings → or the system will prompt you)

---

## 1. Authentication & User Management

### Login
- [ ] Login with correct credentials → redirects to Dashboard
- [ ] Login with wrong password → shows error, stays on login page
- [ ] Login with non-existent email → shows error
- [ ] "Forgot password" flow → enter email → recovery code → new password
- [ ] Logout (click avatar → Logout) → redirects to login

### Store Switching (Owner/Admin only)
- [ ] Click "All Stores" dropdown in top bar
- [ ] Select a specific store (e.g., "Main Store") → dashboard shows that store's data
- [ ] Switch back to "All Stores" → shows cross-store aggregated data
- [ ] Verify KPIs change when switching stores

---

## 2. Dashboard

### KPI Tiles (manager+ role)
- [ ] "Today's Revenue" shows a number with trend badge (↑X% vs yesterday)
- [ ] "Today's Sales" shows transaction count with trend badge
- [ ] "Low Stock" shows count of low-stock items
- [ ] "Total Products" shows product count + total stock units
- [ ] Click any tile → navigates to the relevant page

### Sales Trend Chart
- [ ] Chart shows 7-day revenue trend with gradient fill
- [ ] Hover over a data point → tooltip shows date, revenue, and sale count
- [ ] Summary shows total revenue + avg daily revenue

### Recent Sales
- [ ] List shows recent transactions with invoice #, customer, time, amount
- [ ] Click a sale → navigates to sale detail page
- [ ] Empty state shows "No sales today yet" with CTA (if no sales)

### Quick Actions
- [ ] "New Sale" → navigates to POS
- [ ] "New Purchase" → navigates to purchase creation
- [ ] "Low Stock Items" → navigates to inventory
- [ ] "Customers" → navigates to customers

### Top Products Widget
- [ ] Shows top 5 products by revenue (last 30 days)
- [ ] Each product has a progress bar proportional to revenue
- [ ] Click "View all" → navigates to reports

### Module Grid
- [ ] All modules show with correct icons and colors
- [ ] Click an accessible module → navigates to it
- [ ] Locked modules (insufficient role) show lock overlay on hover

---

## 3. Point of Sale (POS)

### Register Management
- [ ] Navigate to /pos → shows "Open Register" if no open session
- [ ] Enter opening cash → click "Open Register" → register opens
- [ ] POS register screen appears with product grid + cart panel

### Making a Sale
- [ ] Click a product → adds to cart
- [ ] Adjust quantity in cart → cart total updates
- [ ] Click "Payment" button → payment screen opens

### Payment Screen
- [ ] All 6 payment methods visible: Cash, Card, Easypaisa, JazzCash, Mobile, Customer Account
- [ ] **Back button** and **Validate/Complete Sale button** are visible at the bottom (test on laptop + desktop)
- [ ] Select "Cash" → enter amount → click "Exact" → button changes to "Complete Sale"
- [ ] Complete a cash sale → success message, returns to register
- [ ] Complete a JazzCash sale → success
- [ ] Complete an Easypaisa sale → success
- [ ] Complete a Card sale → success
- [ ] Add a customer → "Customer Account" (khata) method becomes enabled
- [ ] Complete a khata (credit) sale → customer balance increases

### Close Register
- [ ] Click "Close Register" → modal opens
- [ ] Verify breakdown shows all payment methods: Cash, Khata, Card, Mobile, JazzCash, Easypaisa
- [ ] "Expected Cash" = Opening Cash + Cash In - Cash Out + Cash Sales (should NOT include card/mobile/jazzcash/easypaisa)
- [ ] Enter counted cash → shows surplus/shortage
- [ ] If discrepancy > Rs 100, closing note becomes mandatory
- [ ] Close register → redirects to /pos

---

## 4. Sales History

### List View
- [ ] Navigate to /sales → shows list of all sales
- [ ] Stats tiles show: Total Sales, Page Revenue, Avg Sale, This Page count
- [ ] Search by sale number or customer name
- [ ] Filter by date range (From/To)
- [ ] Filter by payment method (includes JazzCash, Easypaisa)
- [ ] Filter by status (completed, pending, cancelled, returned)
- [ ] Payment method badges show readable labels ("JazzCash" not "jazzcash")
- [ ] Status badges show with correct colors
- [ ] Pagination works (if > 20 sales)
- [ ] Click "View" → sale detail page

### Sale Detail
- [ ] Shows sale number, date, customer, cashier, store
- [ ] Shows all line items with quantities, prices, totals
- [ ] Shows payment method with correct label
- [ ] Shows subtotal, tax, discount, total, paid amount, due amount
- [ ] Print receipt works (Ctrl+P or Print button)
- [ ] "Process Return" button works (if sale is returnable)

### Sale Returns
- [ ] From sale detail → click "Return" → return wizard opens
- [ ] Select items to return with quantities
- [ ] Choose refund method
- [ ] Complete return → stock restored, customer balance adjusted (if khata)
- [ ] Original sale shows "returned" status

---

## 5. Inventory Management

### Product List
- [ ] Navigate to /inventory → shows product list
- [ ] Search by name, SKU, or barcode
- [ ] Filter by category (no duplicate categories in "All Stores" mode)
- [ ] Filter by brand
- [ ] Toggle "Show Inactive" products
- [ ] Table has zebra striping, bold headers
- [ ] Each product shows: name, store, brand, category, stock, cost, price, status
- [ ] Low stock products show warning indicator
- [ ] Out of stock products show red indicator
- [ ] Click product → detail page
- [ ] "Add Product" button → product creation modal
- [ ] "Import/Export" button → import/export modal

### Product Detail
- [ ] Shows all product info: name, SKU, barcode, description
- [ ] Shows pricing: cost price, selling price, profit margin
- [ ] Shows stock levels: current stock, minimum stock level
- [ ] Shows category, brand, supplier, tax rate
- [ ] Shows product image (if uploaded)
- [ ] "Edit" button → edit modal
- [ ] "Receive Stock" button → stock receiving modal
- [ ] Stock movement history shows
- [ ] Print barcode works

### Product CRUD
- [ ] Create a new product → appears in list
- [ ] Edit a product → changes saved
- [ ] Deactivate a product → shows as inactive
- [ ] Reactivate a product → shows as active
- [ ] Delete a product (if no sales) → removed
- [ ] Receive stock → stock quantity increases, inventory adjustment recorded

### Import/Export
- [ ] Export products → downloads CSV/Excel
- [ ] Import products via CSV → products created
- [ ] Invalid CSV → shows error with row numbers

---

## 6. Customers (Khata)

### List View
- [ ] Navigate to /customers → shows customer list
- [ ] Stats tiles show: Total Customers, With Balance, Total Outstanding, Advance Holders
- [ ] Search by name or phone
- [ ] Each customer shows: name, phone, balance, credit limit, store
- [ ] Positive balance (red) = customer owes money
- [ ] Negative balance (green) = customer has advance
- [ ] Click customer → detail page
- [ ] "Add Customer" button → creation modal

### Customer Detail
- [ ] Shows customer info: name, phone, address, credit limit
- [ ] Shows current balance
- [ ] Shows transaction history (khata ledger)
- [ ] "Record Payment" → reduces balance
- [ ] "Add Credit" → increases balance (sale on credit)
- [ ] "Edit Customer" → edit modal
- [ ] Print statement works

### Khata Operations
- [ ] Record a payment from customer → balance decreases
- [ ] Add credit (manual) → balance increases
- [ ] Transaction history updates after each operation
- [ ] Running balance is correct after multiple transactions

---

## 7. Purchases

### Purchase Order List
- [ ] Navigate to /purchases → shows PO list
- [ ] Stats tiles show: Total Orders, Received, Pending, Page Value
- [ ] Filter by status: Draft (RFQ), Ordered, Partial, Received, Cancelled
- [ ] Click PO → detail page
- [ ] "New" button → PO creation page

### Create Purchase Order
- [ ] Select supplier
- [ ] Add products with quantities and unit costs
- [ ] Set expected date
- [ ] Save as draft or submit as ordered
- [ ] Total auto-calculates

### Purchase Detail
- [ ] Shows PO number, supplier, status, dates
- [ ] Shows line items with ordered vs received quantities
- [ ] "Send PO" button (if draft) → changes to ordered
- [ ] "Receive" button → receive stock modal
- [ ] Partial receipt works (receive some items)
- [ ] Full receipt → status changes to "Received", stock increases
- [ ] "Cancel" button → cancels PO

### Supplier Payment
- [ ] From supplier detail → "Pay" button
- [ ] Enter payment amount → supplier balance decreases
- [ ] Payment recorded in supplier ledger

---

## 8. Suppliers (Bakaya)

### List View
- [ ] Navigate to /suppliers → shows supplier list
- [ ] Stats tiles show: Total Suppliers, This Page, Total Bakaya, With Balance
- [ ] Search by name, phone, or contact person
- [ ] Each supplier shows: name, contact, phone, balance, store
- [ ] Click supplier → detail page
- [ ] "Add Supplier" button → creation modal

### Supplier Detail
- [ ] Shows supplier info: name, contact person, phone, address
- [ ] Shows current balance (bakaya)
- [ ] Shows transaction ledger
- [ ] "Record Payment" → reduces balance
- [ ] "Edit Supplier" → edit modal
- [ ] Print statement works

---

## 9. Stock Transfers

### List View
- [ ] Navigate to /transfers → shows transfer list
- [ ] Stats tiles show: Total Transfers, In Transit, Received, Page Value
- [ ] Filter by direction: All, Outgoing, Incoming
- [ ] Each transfer shows: number, source → dest, status, value, date
- [ ] Click transfer → detail page
- [ ] "New Transfer" button → creation modal
- [ ] "Settle Transfers" button → settles inter-store balances

### Create Transfer
- [ ] Select source store and destination store
- [ ] Add products with quantities
- [ ] Save as draft or dispatch

### Transfer Flow
- [ ] Draft → "Dispatch" → status changes to "in_transit", stock decremented from source
- [ ] In transit → "Receive" → status changes to "received", stock incremented at destination
- [ ] Cancel transfer (if draft) → cancelled
- [ ] Stock levels update correctly at both stores

---

## 10. Expenses (Kharcha)

### List View
- [ ] Navigate to /expenses → shows expense list
- [ ] Stats tiles show: Page Total, Total Entries, This Page, Avg Expense
- [ ] Filter by date range and category
- [ ] Each expense shows: date, amount, category, description, user, store
- [ ] "Add Expense" button → creation modal

### Expense CRUD
- [ ] Create expense → appears in list
- [ ] Delete expense → removed
- [ ] Category filter works
- [ ] Date range filter works

---

## 11. Reports & Analytics

### Main Reports Page
- [ ] Navigate to /reports → shows analytics dashboard
- [ ] Select time period (7/30/90/365 days)
- [ ] KPI cards show: Total Revenue, Gross Profit, Net Profit, Outstanding Khata, Inventory Value, Potential Profit
- [ ] Revenue Over Time chart renders with data
- [ ] Top Products by Revenue chart renders
- [ ] Payment Method Breakdown pie chart renders
- [ ] Low Stock Products list shows

### Daily Z Report
- [ ] Navigate to /reports/daily-z → shows daily Z report
- [ ] Select date
- [ ] Shows total sales, returns, payment method breakdown
- [ ] Payment method breakdown includes all methods (Cash, Card, Mobile, JazzCash, Easypaisa, Khata)
- [ ] Shows cash drawer reconciliation
- [ ] Print/export works

---

## 12. Accounting

### Dashboard
- [ ] Navigate to /accounting → shows accounting overview
- [ ] Profit & Loss summary shows (requires specific store selected)
- [ ] Trial Balance summary shows
- [ ] Balance Sheet summary shows

### Chart of Accounts
- [ ] Navigate to /accounting/chart-of-accounts → shows all accounts
- [ ] Accounts grouped by type: Assets, Liabilities, Equity, Revenue, Expenses
- [ ] Each account shows: code, name, type, balance, system flag
- [ ] "Add Account" button → creation modal
- [ ] Edit account works
- [ ] System accounts cannot be deleted

### Journal Entries
- [ ] Navigate to /accounting/journal-entries → shows JE list
- [ ] Each JE shows: date, description, debit, credit, status
- [ ] Click JE → detail page shows line items
- [ ] "New Entry" button → creation modal
- [ ] Create a manual JE → debits must equal credits
- [ ] Post/reverse JE works

### Accounting Reports
- [ ] Profit & Loss Statement → renders correctly
- [ ] Trial Balance → renders correctly, debits = credits
- [ ] Balance Sheet → renders correctly, assets = liabilities + equity

---

## 13. HR & Payroll

### Employees
- [ ] Navigate to /employees → shows employee list
- [ ] Each employee shows: name, role, salary, store, status
- [ ] Click employee → detail page
- [ ] "Add Employee" → creation modal
- [ ] Edit employee works
- [ ] Promote employee (change role + salary)
- [ ] Record attendance
- [ ] Manage leaves
- [ ] Record advances
- [ ] Add notes

### Payroll
- [ ] Navigate to /payroll → shows payroll list
- [ ] Select month/year
- [ ] Generate payroll for employees
- [ ] Shows: base salary, deductions, advances, bonus, net payable
- [ ] Mark payroll as paid
- [ ] Print payslip

---

## 14. Staff Management

### Staff List
- [ ] Navigate to /staff → shows staff (system users) list
- [ ] Each staff shows: name, email, role, store, status
- [ ] "Add Staff" → creation modal
- [ ] Reset password → generates temp password
- [ ] Change role
- [ ] Activate/deactivate staff
- [ ] Assign to store

---

## 15. Settings

### Store Settings
- [ ] Navigate to /settings → shows store configuration
- [ ] Edit store name, address, phone
- [ ] Set tax rate
- [ ] Set currency
- [ ] Set POS PIN
- [ ] Save settings → persists

### Categories
- [ ] Navigate to /categories → shows category list
- [ ] Add category
- [ ] Edit category
- [ ] Delete category (if no products assigned)

### Brands
- [ ] Navigate to /brands → shows brand list
- [ ] Add brand
- [ ] Edit brand
- [ ] Delete brand (if no products assigned)

### Taxes
- [ ] Navigate to /taxes → shows tax rate list
- [ ] Add tax rate
- [ ] Edit tax rate
- [ ] Delete tax rate (if no products assigned)

---

## 16. Store Management

### Store List
- [ ] Navigate to /stores → shows all stores
- [ ] Each store shows: name, type, address, phone, user count, product count
- [ ] "Add Store" → creation modal

### Create New Store (verify auto-seeding)
- [ ] Create a new store → store appears in list
- [ ] Switch to the new store → verify it's immediately functional:
  - [ ] Chart of accounts has 20 default accounts
  - [ ] Settings exist (no "select store" error)
  - [ ] Categories show 7 default categories
  - [ ] Taxes show 4 default tax rates
  - [ ] Can add products immediately
  - [ ] Can make sales immediately
  - [ ] Accounting reports work

---

## 17. Audit Logs

- [ ] Navigate to /audit-logs → shows activity log
- [ ] Filter by action type, user, date range
- [ ] Each log shows: timestamp, user, action, entity, details, IP
- [ ] Verify sales, purchases, transfers, settings changes all logged

---

## 18. Dark Mode & Responsive

### Dark Mode
- [ ] Click theme toggle (moon/sun icon in top bar)
- [ ] All pages render correctly in dark mode
- [ ] No contrast issues
- [ ] Charts adapt to dark mode
- [ ] Toggle back to light mode

### Responsive
- [ ] Test on mobile (375px) — no horizontal overflow
- [ ] Test on tablet (768px) — layout adapts
- [ ] Test on laptop (1280px) — POS buttons visible
- [ ] Test on desktop (1920px) — layout expands
- [ ] Tables scroll horizontally on mobile (not broken)
- [ ] Navigation adapts to mobile

---

## 19. Notifications

- [ ] Click bell icon in top bar → notifications panel
- [ ] Low stock alerts show
- [ ] Expiry alerts show (if batches with expiry dates exist)
- [ ] Mark as read works
- [ ] Clear notifications works

---

## 20. Error Handling

- [ ] Visit a non-existent page → 404 page shows
- [ ] Visit a page without permission → 403 error
- [ ] API error → toast notification shows
- [ ] Network disconnection during sale → error toast, sale not lost
- [ ] Session expiry → redirect to login

---

## Post-Testing Checklist

- [ ] All critical flows tested (POS sale, purchase, transfer, return)
- [ ] All payment methods work (cash, card, mobile, jazzcash, easypaisa, khata)
- [ ] Register reconciliation correct (Expected Cash excludes non-cash)
- [ ] All pages responsive (mobile, tablet, laptop, desktop)
- [ ] Dark mode works everywhere
- [ ] No console errors in browser DevTools
- [ ] Audit logs capturing all key actions

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Please select a store" error | Use store selector in top bar to pick a specific store |
| Charts show no data | Make sure you have sales in the selected period |
| Accounting reports empty | Ensure store has chart of accounts (auto-created for new stores) |
| Cannot make khata sale | Select a customer first (khata requires a customer) |
| Payment screen buttons hidden | Scroll down in the left panel, or resize browser window |
| Dark mode not working | Click the moon/sun icon in the top bar |
| Login fails after deploy | Run `prisma migrate deploy` + seed scripts on production DB |

---

**Need help?** Check the worklog at `/home/z/my-project/worklog.md` for the full development history and known issues.
