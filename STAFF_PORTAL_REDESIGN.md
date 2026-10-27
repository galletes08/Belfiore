# Complete Staff portal redesign — 2026-10-27

> Latest permission update: [STAFF_RIDER_ASSIGNMENT.md](STAFF_RIDER_ASSIGNMENT.md). The user explicitly authorized Staff rider assignment after this redesign. The Admin-only assignment statements below describe the earlier specification.

This report supersedes earlier Staff UI reports. The attached specification explicitly makes rider assignment Admin-only; the broader assignment permission from the preceding task has been removed from Staff.

## Completed UI

- Deep forest-green sticky desktop sidebar with Belfiore logo, shared Admin navigation styling, Lucide icons, mint active links, verified Staff identity and Sign Out. Tablet/mobile uses a hamburger-triggered native dialog with Escape/backdrop close, focus containment/return, scroll lock and automatic close on switching to desktop width.
- Dashboard uses real Total Orders, Pending Action, In Progress and Delivered counts; shared order table; recent recorded orders; inventory alerts; quick links; and personal activity. No sales/financial cards or fabricated counts.
- Inventory uses shared summary cards/page header alongside the existing search, filters, product images/codes, availability table and shared Admin modal/history/lettuce-stock components. Gardening supplies retain exact-variant stock operations. Stock Out remains selected when choosing an initialized supply variant.
- Orders uses the shared Admin summary cards, table, detail drawer and status selector. Its five tabs remain Overview, Items, Payment, Delivery and History. Staff packing, picking, batch management and freshness-guide UI are absent.
- My Account has Profile Information, Account Details, Change Password and Sign Out sections, compact responsive forms and feedback. Only existing permitted first/last-name updates are submitted. Email, username, role and account state are not editable.
- Existing My Activity route is retained and styled consistently. Legacy routes still redirect to the appropriate existing page.
- Loading, error/retry and empty states are retained. Mobile summary cards use two columns where practical, with one column below 360px; wide tables scroll within their own containers. Reduced-motion styles disable nonessential movement.

## Shared components reused

- `WorkspaceNavLink`, `WorkspacePageHeader`, `SummaryCard` in the new `src/admin/WorkspacePrimitives.jsx`. Admin navigation and Admin Orders now consume the same presentation primitives; Admin business actions remain unchanged.
- Existing `OrdersTable`, `OrderDetailsDrawer`, `OrderStatusSelect`, `InventoryModal`, `InventoryHistory`, `LettuceStock`, `GardeningSupplies` and `InventoryActionMenu`.
- Shared `orderSummary` calculation, extracted without changing its logic. Staff dashboard and Admin order summaries now use the same calculation and COD interpretation against their real order data.

## Permissions and business data

Staff retains Add Product, authorized Stock In/Out, History, personal profile/password actions, order reads and limited operational status updates. Pending → Preparing uses existing acceptance checks; Preparing → Out for Delivery requires the already approved assignment, shipping/payment/inventory validation and optimistic version checks. Delivered, cancellation exceptions, payments, COD settlement, refunds, rider assignment/account management, product edits/prices and Archive/Restore stay protected.

Staff assignment endpoints now reject Staff server-side; the shared broad Admin update handler is Admin-only. Existing Admin rider assignment still passes integration tests. No tables were dropped, no migration/reset was run, and no business records were changed. Existing order, stock, reservation, unique-plant, 400g-pack, variant, GPS, payment and audit behavior is preserved.

## Files modified or added

- `src/admin/WorkspacePrimitives.jsx` (new), `src/admin/AdminLayout.jsx`, `src/admin/AdminOrders.jsx`.
- `src/staff/StaffLayout.jsx`, `StaffDashboard.jsx`, `StaffAccount.jsx`, `StaffActivity.jsx`, `staffDisplay.js`, `staffPortal.css` (new).
- `src/staff/StaffPortal.jsx`, `StaffInventory.jsx`, `StaffOrders.jsx`, `StaffOrderStatus.jsx`.
- `shared/orderSummary.js` (new), `src/utils/orderDisplay.js`.
- `server/src/routes/operations-staff.js`, `server/src/routes/orders.js`, `server/src/utils/staffPermissions.js`.
- `server/tests/operations-staff-ui.test.js`, `server/tests/operations-staff.test.js`.
- This report and a supersession note in the prior operational-control report.

## Actual validation

- Full suite against an isolated temporary PostgreSQL cluster: **212 passed, 0 failed, 0 skipped**.
- Final focused database/UI/lettuce regression after shared summary/COD alignment: **32 passed, 0 failed, 0 skipped**.
- Frontend production build after the final Activity styling: **passed**.
- Scoped ESLint: **passed**.
- `git diff --check`: **passed**, with existing Windows line-ending notices only.

Coverage includes real Admin/Staff dashboard-summary parity, shared order details and filters, personal profile rendering, navigation/role guards, database-enforced assignment denial, valid Admin assignment, authorized status changes, financial restrictions, stock reservations/history, product creation and retired packing behavior. Dedicated fixture accounts and disposable schemas were used; the actual Staff/Admin accounts and ORD-072 were not mutated.

Responsive classes, two-column/narrow-screen fallback, table scroll boundaries, native drawer focus/scroll behavior and accessible controls were reviewed in source and server-rendered tests. Browser viewport screenshots, live mobile interactions and console verification are separate manual checks; they are not claimed by the automated test results above.
