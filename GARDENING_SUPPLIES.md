# Gardening supplies and product variants

Implemented October 18, 2026.

## Completed features

The existing Inventory, Products, cart, checkout, orders, inventory history, System Logs, dashboard and reports now support `GARDENING_SUPPLY`. Succulents remain individual plants; lettuce remains harvest-batch-managed 400g packs. Supplies have no harvest dates, freshness aging or automatic disposal rules.

Admin Inventory adds a Gardening Supplies filter, Add Gardening Supply, an idempotent Import Supply Catalog action, and supply-specific Details/Stock/More actions. The shared dialog supports parent metadata/images, variant creation/editing, prices, SKU, package metadata, thresholds, variant images, model selection, opening inventory, stock movements and safe archiving/restoration. Existing plant actions remain available.

The storefront shows one card per parent and a variant selector on Product Details. Selection changes the actual database price, SKU, package, availability and optional image. Cart keys include variant identity, keeping different sizes separate; mixed orders use the existing checkout, saved addresses, COD and online-payment flow. Cart quantities mean packs, bags or sets, never kilograms.

## Seeded catalog

| Parent / category | Variant | SKU | Selling unit | Package | PHP |
| --- | --- | --- | --- | --- | ---: |
| Black Plastic Circle Pots / Plant Pots | Extra Small | GS-POT-XS-5 | Pack | 5 pieces | 105 |
| Black Plastic Circle Pots / Plant Pots | Small | GS-POT-S-5 | Pack | 5 pieces | 160 |
| Black Plastic Circle Pots / Plant Pots | Medium | GS-POT-M-5 | Pack | 5 pieces | 250 |
| Belfiore Premium Succulent Potting Mix / Soil & Potting Mix | 1 kg | GS-MIX-1KG | Bag | 1 kg | 30 |
| Belfiore Premium Succulent Potting Mix / Soil & Potting Mix | 2.5 kg | GS-MIX-2-5KG | Bag | 2.5 kg | 75 |
| Plastic Grid Tray for 7cm Square Pots / Plant Trays | 5 Pieces | GS-TRAY-7CM-5 | Set | 5 trays | 1,150 |
| Plastic Grid Tray for 7cm Square Pots / Plant Trays | 10 Pieces | GS-TRAY-7CM-10 | Set | 10 trays | 2,300 |

Potting mix description: “Vermicast and Pumice Blend for Lush, Hardy Plants.”

The configured database contains these **3 parent products and 7 variants**, all with **uninitialized stock**. No supplier availability, sales counts, ratings or third-party images were imported. Main/variant image uploads reuse the existing storage service; empty images use existing fallbacks.

Run catalog setup again with `node server/scripts/setup-supplies.js`, or use the authenticated administrator import action. Stable catalog keys preserve identities after administrator renames/SKU edits. Matching records are retained without overwriting their names, prices or stock. Conflicting names/SKUs belonging to other parents require review and roll back the import. Missing catalog records may be inserted. Existing custom matches are located by name/SKU; automatic commercial-data replacement is not an import policy.

The setup script applies migration 019 when needed and verifies existing-row counts/content before committing. The first setup preserved all original records across 29 existing tables. A second setup preserved all records across 32 tables and retained exactly seven uninitialized variants, demonstrating repeatability. Three new parent-creation audit records are legitimate catalog events, not sales.

## Stock model and administrator steps

Pot packs and potting-mix bags use independent **prepacked** balances. Their warehouse quantities still require verified entry.

Tray packages start **unconfigured**. An administrator must explicitly choose:

1. **Separate prepacked stock**: each variant has its own stock pool; one ordered set deducts one prepacked set.
2. **Shared loose pieces**: both tray variants share one pool; a 5-piece set uses five trays and a 10-piece set uses ten. Variant availability is a capacity derived from that same pool, not independent stock to add together.

In Inventory → supply Details/Stock → Manage Variants, confirm the model. Then open Stock In / Out, select the variant, choose Verified Opening Stock, enter the verified selling-unit quantity/reference and confirm the displayed conversion. Opening zero stock is supported. A shared opening entry through four 5-piece sets initializes **20 loose trays**, making four 5-piece or two 10-piece sets available from the same pool. Do not initialize the second shared variant again.

After initialization, use Stock In or Stock Out with a positive whole quantity, reason/reference and confirmation. Stock Out consumes only unallocated stock and cannot use payment reservations or existing sale allocations. Retry keys prevent duplicate manual movements. Stock model and packaging conversions cannot change after initialization/orders; create a separately reviewed variant/listing when its physical definition changes.

Pools store free physical stock and payment-reserved stock. COD commits a sale and removes free stock immediately, without marking it paid. Verified online payment moves reserved stock into committed orders without deducting again. Active pre-dispatch commitments are included when deriving recorded physical pool quantities. Cancellation, failed payment and reservation expiry restore the correct snapshot conversion exactly once. Existing refund/manual reconciliation rules remain in effect; a financial refund does not invent a physical return. Authorized Returned Stock entries require actual received goods and an appropriate reference.

For compatibility with existing catalog availability controls, a supply parent's `stock` field is a derived availability indicator. It is **not a physical quantity**. Supply quantity displays use variant/pool fields and labeled units; parent physical/reserved/committed aggregate fields are null rather than summing unlike units.

## Database migration

`019_gardening_supplies.sql` is additive and registered in the existing migration runner.

- `products`: stock-model and stable catalog identity fields. Existing type validation is extended to accept supplies while retaining the full succulent validation function.
- `supply_variants`: unique SKU/name, catalog identity, price, selling unit, package pieces/weight, threshold, image, archive state and physical-pool conversion.
- `supply_stock_pools`: nullable uninitialized stock, reserved quantity and physical unit, shared only where explicitly configured.
- `supply_stock_requests`: keyed movement receipts.
- `order_items`: immutable variant/SKU/package/unit/price-context and pool/conversion snapshots.
- `inventory_movements`: variant identity/name and stock unit.

No historical orders, existing prices, stock, accounts, addresses, payments or GPS records were rewritten. No records were reset/truncated. Products and variants are archived rather than deleted. Active orders/reservations block unsafe listing-state changes.

## API changes

All supply mutations require authenticated administrator access on the backend:

- `POST /api/admin/supplies/import-catalog`
- `POST /api/admin/supplies` — parent creation; optional existing-style image upload.
- `PATCH /api/admin/supplies/:id` — parent metadata/image.
- `POST /api/admin/supplies/:id/variants`
- `PATCH /api/admin/supplies/:id/variants/:variantId` — metadata, price, image, threshold and archive/restore.
- `PATCH /api/admin/supplies/:id/model` — explicit model before initialization/orders.
- `POST /api/admin/supplies/:id/stock` — initial/in/out, variant, quantity, reason, confirmation and retry ID.

Existing `/api/products` and `/api/admin/inventory` include variant/pool projections. The existing quote/orders endpoints accept `variantId` and require the current expected unit price for supplies. Backend data determines SKU, package, conversion and final price; customer-provided totals do not set the charge. Parent/pool locks and conditional stock updates serialize competing orders and stock movements. Transactions roll back all allocations when a mixed order fails.

Inventory History retains its filters, pagination, responsible actor and related-order links. Supply events label the physical stock unit and include variant names/SKUs. Timestamps remain backend-generated and render in Philippine Time. System Logs reuse the same inventory events. There is no customer/rider inventory editing endpoint and no variant-delete endpoint.

## Orders, dashboard and reports

Order snapshots persist the original parent name, variant name, SKU, package pieces/weight, quantity, selling unit, price and line total. Variant edits do not rewrite old orders. Admin/customer order views, invoices and rider item summaries display variant details while preserving delivery permissions and tracking behavior.

Supply revenue uses the existing Delivered + verified Paid eligibility rules; cancelled, unpaid, failed, refunded/refund-pending orders remain excluded. Dashboard order/sales/AOV totals naturally include qualifying mixed orders. Variant stock alerts join existing attention monitoring without adding large summary cards or mixing plant/lettuce/supply quantities.

Best-selling rows label units and group supply variants by stable identity, using historical prices/SKUs. Reports add parent supply revenue, historical-category revenue, variant availability and physical-pool tables. Shared pools are listed once in physical totals; variant capacities are separate. Parent revenue excludes delivery fees, as existing item-revenue reports do. Stock movements use physical units; financial sales use selling units. PDF/XLSX exports reuse the report tables and existing all-row export implementation.

## Modified files

| Area | Files |
| --- | --- |
| Supply backend | `server/src/routes/gardening-supplies.js`, `server/src/utils/supplies.js` |
| Migration/setup | `server/src/db/migrations/019_gardening_supplies.sql`, `server/scripts/setup-supplies.js`, `server/scripts/migrate-inventory.js` |
| Existing inventory/order integration | `server/src/routes/products.js`, `server/src/routes/inventory-products.js`, `server/src/utils/inventory.js`, `server/src/utils/checkout.js`, `server/src/routes/orders.js` |
| Reporting/rider response | `server/src/utils/reports.js`, `server/src/routes/dashboard.js`, `server/src/routes/riders.js` |
| Admin UI | `src/admin/GardeningSupplies.jsx`, `src/admin/AdminInventory.jsx`, `src/admin/AdminDashboard.jsx`, `src/admin/OrderDetailsDrawer.jsx` |
| Storefront/cart/checkout | `src/components/Pages/Products.jsx`, `src/components/Pages/ProductDetail.jsx`, `src/components/CartSidebar.jsx`, `src/App.jsx`, `src/api/client.js`, `src/customer/sections/CheckoutSection.jsx`, `src/customer/sections/ShopSection.jsx`, `src/utils/customerCart.js`, `shared/cartIdentity.js` |
| History/order displays | `src/components/Signup/Order.jsx`, `src/utils/inventory.js`, `src/utils/invoice.js`, `src/rider/RiderHomePage.jsx`, `src/driver/DriverOrderPage.jsx` |
| Shared attention/filtering | `shared/inventoryRules.js`, `src/utils/inventoryAttention.js` |
| Tests | `server/tests/supplyChecks.js`, `server/tests/supply-cart.test.js`, migration fixture updates in `server/tests/inventory.test.js` and `server/tests/staff-auth.test.js` |

## Testing and limitations

Automated supply tests cover creation, the seven catalog variants/prices, no invented stock, duplicate validation, roles, independent balances, opening zero, normal movements/retries, reserved-stock protection, mixed COD, online payment/failure/expiry, competing shared tray orders, cancellation, immutable snapshots, archive/restore, storefront API projections, history and financial/stock reports. Cart identity has its own unit test. Existing lettuce freshness/disposal, individual succulent tracking, address/checkout, notifications, authentication, rider assignment and GPS ownership tests remain in the full regression suite.

**Final full regression: 142 passed, 0 failed, 0 skipped.** Frontend lint, production build and `git diff --check` passed. Tests use random schemas in the explicitly selected test database and the existing isolated payment fixture. They do not create real customer purchases or charge a live payment method.

**Manual checks still required:** GS-029 desktop/mobile visual interaction, keyboard testing in a real browser, actual supplied-image uploads in the configured storage environment, physical-device GPS behavior and live payment-provider delivery. No live payment or physical GPS test is claimed. Catalog records intentionally remain unsellable until the administrator verifies opening stock; the tray stock model remains a deliberate administrator decision, not an assumed warehouse fact.
