# Admin Dashboard update

## Changes and files

- `src/admin/AdminDashboard.jsx`: replaced the tall decorative dashboard with the same compact header/container used by Inventory and Orders. Four cards show Monthly Sales, Monthly Orders, qualifying Average Order Value and distinct Needs Attention. Existing NotificationBell is reused beside Refresh. The sales chart is 240px high, with Month/Year selectors, real date spacing, exact-value tooltips/accessible labels and an empty state. Top 5 and stock/batch alerts sit side by side on desktop, stacked on smaller screens. The five newest orders link to the existing order drawer and reuse Order Management status colors. Details explain metric bases and current versus selected periods.
- `server/src/routes/dashboard.js`: existing GET endpoint is now admin-only and read-only. Returns bounded chart/top/recent/actionable data, configured stock thresholds, current-month card totals, and generation time. No operational refresh is invoked.
- `server/src/utils/reports.js`: exposes existing eligibility/cohort SQL and shared sales-series/product-ranking SQL. Reports and Dashboard use the same queries; Reports behavior is preserved.
- `src/api/client.js`: Dashboard wrapper accepts validated period parameters and AbortSignal.
- `src/utils/dashboardRefresh.js`: small testable polling lifecycle with cancellation, visibility handling and overlap prevention.
- `src/admin/AdminInventory.jsx`: safely resolves Dashboard product/batch deep links, locates the correct code, opens the existing product or batch interface, and displays an unavailable message for a missing target.
- `src/admin/HarvestBatches.jsx`: supports an initial linked batch, opens existing details and highlights that batch. No batch operation is automatically performed.
- `server/tests/dashboard.test.js`: period and polling lifecycle tests.
- `server/tests/reportChecks.js`: database reconciliation, configured thresholds, recent-order ordering, permissions and read-only checks within the existing isolated integration harness.
- `DASHBOARD_UPDATE.md`: this report.

No dependencies, migrations, notification system, payment workflow, GPS changes or carrier integrations were added. No application database reset or transaction/stock modifications were performed.

## API and calculation definitions

`GET /api/admin/dashboard?period=month|year&year=YYYY&month=1..12` requires an admin JWT. Invalid periods/years/months return 400; unauthenticated requests return 401 and unauthorized roles return 403. Responses are `Cache-Control: no-store`. Read queries use a repeatable-read READ ONLY transaction and a 30-second SQL timeout.

- Monthly cards always use the current Manila month, through the full current day, matching the Reports **This Month** preset. Chart and Top 5 use the independently selected full month/year. The UI labels the loaded chart period and explains this distinction.
- Monthly Sales: current Delivered + Paid orders created in that month, with COD Collected/Remitted or recorded verified ONLINE payment ID and paid timestamp. Cancelled, unpaid, failed, refund-pending/refunded and unverified online payments are excluded. Stored order totals include recorded delivery fees. Each order is counted once, without joining payment events.
- Monthly Orders: all distinct created orders in that cohort, including cancelled orders, without multiplying rows by order items.
- Average Order Value: the exact recognized revenue divided by the count of qualifying sales orders from the same cohort, zero when that count is zero.
- Top 5: the shared Reports ranking uses actual historical item line totals/quantities, edible variety or succulent name + historical tag, with product/batch codes retained in the response. It never recomputes past prices from inventory. Plants and 400g packs remain separate units.
- Inventory attention reuses the existing `inventoryAttention` helper and harvest functions. Distinct affected batches count once; parent stock reasons are included with those batches. A product with no affected batch counts once. Sold succulents and archived products are excluded according to the existing Inventory rules. On-hold/unverified/spoiled/disposal stock is physical stock, while availability uses only sellable batches.
- Edible low stock uses each product's configured threshold and current sellable packs, including the 9 available / threshold 10 case. No five-unit assumption remains.
- Order attention uses the existing Orders definition: Pending, Cancellation Requested, Refund Pending, COD Remittance Pending, or an inventory reconciliation issue. Multiple reasons on one order count once. Inventory records and order records are separate actionable entities. Normally completed sales without unresolved issues are excluded.
- Alerts are current across all dates. The first 20 affected products and first 20 actionable orders are returned for compact details; full counts and links to the existing modules are retained. Recent Orders is strictly newest creation time, then ID, limited to five. The browser receives no complete order/inventory datasets.

## Automatic refresh

Initial load fetches one summary request. A 60,000ms timer refreshes while the tab is visible; becoming visible triggers a fetch. Manual Refresh/Retry invokes the same guarded function. An in-flight flag prevents overlapping poll/manual requests. Unmount/filter changes abort the previous request, clear its interval and remove its visibility listener; disposed responses cannot change state. Chart filters and the open attention panel survive refresh. NotificationBell remains mounted and retains its own existing polling/dialog state.

Only a successful response replaces data and updates Last updated, shown in Philippine Time. Failures retain previous valid statistics and the previously loaded chart-period label, with an error and Retry. Initial failures show unavailable placeholders rather than fabricated zeros. A filter change starts a new lifecycle while preserving the last successful data until replacement succeeds.

## Executed verification

- Full test suite: **87 passed, 0 failed, 0 skipped**, including the existing Orders, Inventory, Payments, harvest, account, courier and Reports regressions.
- Real PostgreSQL/Express tests reconcile Monthly Sales, Monthly Orders and AOV against Reports, and compare month chart/Top 5 datasets exactly to equivalent Reports queries. Verified historical prices, payment exclusions and repeated-event protection remain covered by the shared report fixtures.
- Verified a real test product with 9 sellable packs and threshold 10 is flagged; inventory attention count matches Inventory's existing helper. Confirmed order attention counts distinct qualifying records and recent orders match SQL newest-first order.
- Fake-clock/lifecycle test verifies initial load, exact 60-second timer registration, hidden-tab pause, visibility refresh, manual refresh, in-flight suppression, retained successful data on failure, abort/interval/listener cleanup and discarded late results.
- Period tests verify Manila New Year rollover, leap-year February, month/year boundaries and invalid inputs.
- Verified authenticated access, non-admin denial and unchanged order/product/batch/movement records after Dashboard and report reads in a disposable random schema. Tests use an explicitly selected isolated local database, never the application's database.
- `npm run lint` and `npm run build` passed.

## Remaining limits

No browser surface was available in Computer Use (`apps: []`, `browsers: []`), so interactive desktop/mobile visual checks, actual-click drawer navigation and a live 60-second browser observation were not executed. Responsive CSS, deep-link resolution and existing modal wiring are implemented; polling was tested with controlled lifecycle events. Existing notification behavior was preserved and its backend regressions passed, but its dropdown was not exercised in a browser.

Sales is explicitly a current-status order-creation cohort, consistent with Reports, not an accounting recognition-date ledger. Original discounts, partial refund amounts and historical physical balances remain limited by existing data; no history was invented or rewritten. Dashboard no longer uses the old Delivered-only revenue definition. Existing audit history and operational records are preserved.
