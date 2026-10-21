# Reports & Analytics implementation

The existing Reports page now has a compact Belfiore header with its notification bell aligned to the title, four summary cards, one global Philippine Time period filter, and Sales, Inventory, Orders and Delivery tabs. Only the selected tab requests and renders detailed report data. Responsive grids and horizontally scrollable tables preserve the sidebar and other pages.

## Files changed for this task

- `src/admin/AdminReports.jsx`: layout, filters, exact-value sales chart, summary/definitions, paginated tables, order links, export/loading/error states.
- `src/api/client.js`: authenticated report JSON and binary-download helpers.
- `server/src/routes/reports.js`: admin-only read-only report and export endpoints.
- `server/src/utils/reports.js`: validated period presets, shared report queries, explicit metric definitions and table pagination.
- `server/src/utils/reportExports.js`: PDFKit reports and editable ExcelJS workbooks.
- `server/src/index.js`: registers the reports router.
- `server/package.json`, `server/package-lock.json`: PDFKit and ExcelJS; scoped compatible UUID override for ExcelJS's older transitive dependency.
- `server/tests/inventory.test.js`: registers reports in the existing isolated integration harness and invokes report checks.
- `server/tests/reportChecks.js`, `server/tests/reports.test.js`: database reconciliation, authorization, boundaries, exports and preset tests.
- `REPORTS_ANALYTICS_UPDATE.md`: implementation and verification notes.

Existing uncommitted changes in these and other files were preserved. No operational records, audit timestamps, historical prices, migrations, GPS, payment processing, reservation logic, batch age rules, or courier integration were changed by this task.

## API and queries

`GET /api/admin/reports` returns summary metrics plus only the requested tab's datasets. `GET /api/admin/reports/export?format=pdf|xlsx` generates the selected report from the same query builder, including every matching row regardless of table pagination. Both require an authenticated admin JWT; customers and riders cannot access them. Responses use `Cache-Control: no-store`.

Parameters: `tab=sales|inventory|orders|delivery`; `preset=today|week|month|lastMonth|year|custom`; custom `fromDate` and `toDate` in validated YYYY-MM-DD format; independent `productsPage`, `ordersPage`, `movementsPage`, `alertsPage`, `disposalsPage`, `shipmentsPage`. Page size is 20, with total counts and bounded page values.

No new database tables or migration are required. Existing `orders`, `order_items`, `products`, `harvest_batches`, `inventory_movements`, `order_delivery_history`, `order_rider_assignments`, and `riders` are reused. Existing stock-status and harvest-status/sellability functions are evaluated directly. The old dashboard API was not reused because it refreshes operational inventory caches and uses a different revenue definition. View Order links reuse `/admin/orders?orderId=...` and the existing order drawer.

Queries run in a repeatable-read, **READ ONLY** transaction with a 30-second SQL timeout. Date bounds are parameterized Manila midnight through the exclusive midnight after the end date. Counts/aggregations happen in SQL before pagination. Delivery events are grouped per order before joining; repeated events never multiply financial or fulfillment values. Reports do not invoke inventory refresh, expiry or carrier sync.

## Metric definitions

- **Total Sales / net eligible sales:** stored order totals for orders created in the period that are currently Delivered and Paid. COD additionally requires Collected or Remitted; ONLINE requires a recorded payment ID and paid timestamp from the existing payment workflow. Cancelled, unpaid, failed, refund-pending and refunded orders are excluded. This is a current-status **order-creation cohort**, not payment cash flow, original recognition dates, or historical statuses as of period end. Stored delivery fees are included. No payment-event join is used.
- **Gross sales before discounts / separate discounts / refund amounts:** unavailable, because authoritative original-price/discount/refund-amount ledgers are absent. Stored discounted selling prices are not misrepresented as pre-discount gross sales. Refund exclusions are not represented as zero refunds. No profit is invented.
- **Total Orders:** distinct orders created in the period, including cancelled orders.
- **Available Inventory:** current available succulent plants and current sellable 400g lettuce packs shown separately. Archived/quarantined stock is excluded; held/disposal batches are not sellable. This is explicitly current inventory even for a historical period.
- **Completed Deliveries:** currently Delivered orders with a reliable recorded completion event within the period: first recorded courier Delivered transition or existing rider assignment `completed_at`. Repeated completion records count once. Mutable `updated_at` and `status_updated_at` are not invented completion dates. Creation-cohort deliveries without a reliable completion date are counted separately as undated and excluded from completion-period totals.
- **Best sellers:** historical order-item quantity and line totals, grouped by edible variety or succulent name + historical tag. Product and batch references remain expandable on screen and are retained in exports. Missing legacy snapshots remain Unknown/Unavailable. Current prices and tags never rewrite historical sales. Units remain explicitly plants or packs.
- **Inventory movements:** backend recording period, per product/code/type/batch. Stock In includes recorded Stock In and initial individual-plant Product Added events; batch creation is not added a second time. Stock Out includes explicit adjustments only, excludes allocations/sale/reservation events, and is separate from confirmed disposal. Recorded fulfilled quantities use known completion events only; missing evidence is not a zero. Beginning/ending physical stock shows **Historical stock unavailable** because full legacy/dispatch physical history cannot be reconciled safely. These are recorded activity totals, not a fabricated stock roll-forward.
- **Current alerts:** low/out stock (excluding Sold/Reserved succulents), aging, manually/automatically held, unverified, unsellable and disposal batches. Existing Day 14/21 and early hold rules remain authoritative. Batch alerts use physical quantities including reserved/unshipped committed allocations. Confirmed disposals are separate dated records.
- **Orders and shipments:** creation-period cohort with current status; known order statuses show zero when absent. Delivery method/status breakdown, current rider/courier assigned counts and delivered counts are provided. Preparing orders are not classified as already in transit. Dispatch timestamps, duration averages and failed/returned counts remain unavailable where the existing workflow does not reliably record them. The report reads stored statuses and events only.

## Exports

PDF reports use green-and-white landscape pages, company/title/period/generated-PHT metadata, key metrics, applicable tables, repeated table headings, page numbers, and definitions. Normal rows remain on one page; exceptionally large text/code lists continue in smaller blocks. XLSX workbooks have a summary sheet and named data sheets, typed numeric quantities/currency, real Excel date cells explicitly represented as Manila wall time (Excel has no timezone), frozen headings, filters, readable widths and editable values. Summary metrics provide useful totals. Both use all matching report rows rather than the currently visible 20.

Exports omit customer email, phone, full address, driver tokens, payment credentials and payment IDs. Customer names and order IDs are included only in relevant authorized order reports.

## Verification

- Full PostgreSQL/Express regression suite: **84 passed, 0 failed, 0 skipped**, using a random disposable schema in an explicitly selected local test database. No application database is used by these tests.
- Verified exact Manila start/end milliseconds and exclusive next midnight; leap dates, invalid/injected dates, reverse ranges and year/month/week preset boundaries.
- Reconciled Delivered/Paid COD + verified online revenue against fixtures, including all unpaid/failed/cancelled/refund and unverified-payment exclusions; historical batch prices and succulent tag/code grouping; distinct orders and repeated completion-event deduplication.
- Verified current plant/pack snapshots, explicit adjustment versus allocation/disposal separation, known dated fulfillment quantities, disposal quantities and exclusion of Sold plants from shortages. Existing harvest/stock/order tests cover the underlying workflows.
- Verified database pagination with 32 matching orders, empty periods, all four report tabs, unauthorized JSON/download rejection and unchanged orders/products/batches/movement history after report generation.
- Generated both formats for all four tabs. Reloaded XLSX files with ExcelJS to verify numeric/date types, totals, filters, and all 32 order rows even when page 2 was requested. Decoded PDF text streams to verify values, dates, privacy and all 32 orders across multiple pages.
- `npm run lint` and `npm run build` passed.

## Remaining limitations

- Browser interaction, desktop/mobile visual QA and PDF visual rendering were not executed; responsive layout is implemented and the production build passes. PDF structure/content and Excel contents were checked programmatically.
- Older rider deliveries commonly lack immutable completion events: those deliveries remain visible in the creation-cohort shipment report, but cannot be assigned an invented completion day. No historical data is backfilled.
- Financial recognition uses the explicitly documented current-status creation cohort. A true accounting ledger with recognition dates, original discounts, partial refunds and costs is outside the available schema and this read-only task.
- Historical physical opening/closing balances and full fulfillment dates remain incomplete. No operational timestamps or records were changed to make reports appear complete.
- Server dependency audit still reports six existing advisories outside the newly added export dependency path. Broad unrelated dependency upgrades were not performed. The new ExcelJS UUID path was overridden to the compatible patched CommonJS version and workbook exports were regression tested.
