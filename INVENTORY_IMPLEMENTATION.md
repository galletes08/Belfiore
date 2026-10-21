# Belfiore inventory implementation

The existing React/Express/PostgreSQL architecture remains in place. Inventory now distinguishes individual succulent records from 400g lettuce packs. Existing order, rider, delivery, authentication and payment routes remain in use.

## Implemented behavior

- Unique, case-insensitive product codes; generated `BF-000001` codes when an administrator leaves the code blank. Succulent creation requires one individual plant per record. Bulk images still create distinct plants, never a combined stock record.
- White/Green/Red tags and administrator-entered prices remain editable. Five lettuce varieties and their suggested prices are available as defaults for new listings only. No existing price or quantity is overwritten.
- Lettuce stock is measured in packs, always 400g each. Stock adjustments require a positive integral pack count and a reason. Stock Out can remove available stock only, never another customer's reserved packs. Thresholds are configurable per product.
- Inventory cards, search by name/code, all requested filters, details, history, pagination, archive, safe image placeholders and dynamic product forms. Admin inventory and customer catalogs refresh every 30 seconds and when a hidden page becomes visible.
- `products.stock` retains its existing meaning of **available quantity** for backward compatibility. `reserved_stock` records pending online checkout quantities. Reserving removes available stock atomically; a verified sale removes the reserved count without subtracting available stock a second time. COD retains the existing immediate stock allocation and delivery/payment rules.
- Configurable 15-minute online reservations. A server sweep runs at startup and every 30 seconds, and checkout also sweeps expired reservations. Multiple server instances use PostgreSQL locks with `SKIP LOCKED`.
- Signed, idempotent PayMongo success webhooks and authenticated server-to-server payment verification share one transactional inventory transition. Duplicate event IDs and repeated paid confirmations do not create a second sale. Missing webhook secrets reject requests. Test/live signature modes are separated.
- Matched `payment.failed` events release pending reservations once. Returning from cancelled PayMongo checkout calls the existing authenticated cancellation route. Closing the browser does not prevent server expiration.
- Late successful payments enter the existing **Refund Pending** payment state, cancel fulfillment, and record an explicit reconciliation reason. Released stock is never reacquired, so another customer's reservation or purchase is preserved. The admin order editor displays the reason.
- Products are archived through the existing DELETE endpoint; completed order items cannot be erased. Inventory history and order snapshots are retained. Pre-shipment cancellation restores inventory once; shipped/delivered orders continue to require the existing return/refund process.
- Transactional inventory movement history includes quantity/status before and after, reserved quantities, reason, actor, order reference and timestamp. A migration baseline records existing quantities without fabricating historic sales. System Logs reads these movements; dashboard/report low-stock values use lettuce thresholds and packs.

## Files

Core backend: `server/src/routes/products.js`, `inventory-products.js`, `orders.js`, `paymongo.js`, `dashboard.js`, `logs.js`; `server/src/utils/inventory.js`, `paymongo.js`; `server/src/index.js`.

Database/tooling: `server/src/db/migrations/001_inventory.sql`, `server/scripts/migrate-inventory.js`, `server/tests/inventory.test.js`, `server/package.json`, `server/.env.example`.

Frontend: `src/admin/AdminInventory.jsx`, `AdminOrders.jsx`, `AdminDashboard.jsx`, `AdminReports.jsx`; `src/api/client.js`; `src/utils/inventory.js`, `customerCart.js`; `src/components/Pages/Products.jsx`, `ProductDetail.jsx`; `src/components/Signup/Order.jsx`; `src/components/CartSidebar.jsx`; `src/customer/sections/CheckoutSection.jsx`; `public/product-placeholder.svg`.

The pre-existing lockfile edits are not part of this implementation.

## Migration and running the application

1. Back up the database and deploy backend/frontend together during a maintenance window. Use the existing base `server/src/db/schema.sql` when installing a fresh database. Do not rerun the base schema as a substitute for the inventory migration.
2. Keep the existing `DATABASE_URL`, JWT, storage and payment configuration in `server/.env`. Add `INVENTORY_RESERVATION_MINUTES=15`. Set a real `PAYMONGO_WEBHOOK_SECRET`; unsigned webhooks are intentionally rejected. Secret keys remain on the server.
3. From the repository root, run `npm.cmd --prefix server run migrate:inventory`. The migration runner uses a transaction, advisory lock and migration ledger; subsequent runs do not repeat the baseline or backfill. This migration has **not** been applied to production as part of development.
4. Review old succulent listings with quantity above one. The migration preserves their quantities/prices, flags them `Unavailable`, and excludes them from customer checkout. Verify the actual plants, create one individual listing per plant and archive the old grouped record. No automatic splitting or invented images is performed.
5. Review pre-deployment unpaid online orders. They remain `inventory_state='legacy'` with their existing allocation and payment history. They are deliberately not expired automatically by the new reservation mechanism. Cancel/reconcile them using the existing business process before accepting new traffic.
6. In PayMongo, point the webhook at `https://your-backend/api/paymongo/webhook` and enable `checkout_session.payment.paid` and `payment.failed`. Match the webhook secret to the account's test/live environment. The existing v1 Checkout Sessions integration is preserved. Official [PayMongo webhook events documentation](https://docs.paymongo.com/docs/developer-tools-webhooks-events) describes the event identifiers and payloads.
7. Start the backend with `npm.cmd --prefix server run dev`, then the frontend with `npm.cmd run dev`. The catalog now uses the backend inventory API even if the old `VITE_USE_SUPABASE_PRODUCTS` setting was enabled; storage may still use Supabase. This avoids bypassing archive/type/availability handling through direct product-table reads.
8. Log in as admin and open Inventory. Create an individual plant; select each lettuce default; add packs using Stock Adjustment; inspect movement history. Check the catalog and checkout selling units, then place COD and PayMongo **test-mode** orders.

## APIs

| Route | Behavior |
|---|---|
| `GET /api/products` | Public catalog, inventory metadata; excludes archived and quarantined records |
| `GET /api/admin/inventory` | Admin products, derived statuses and separate plant/pack summaries |
| `GET /api/admin/inventory/history` | Admin history; `productId`, `search`, `action`, `page`; 50 entries per page |
| `POST /api/products` | Admin single plant or lettuce listing; supports existing multipart image uploads |
| `POST /api/products/bulk` | Admin individual succulent images, up to 50, with generated codes |
| `PATCH /api/products/:id` | Admin product details, price and threshold; quantity changes use Stock Adjustment |
| `POST /api/admin/inventory/:id/adjust` | Admin `{direction:'in'|'out', quantity, reason}`; edible products only |
| `DELETE /api/products/:id` | Admin archive; refuses active online reservations |
| `POST /api/orders` | Atomic inventory reservation for ONLINE; existing COD allocation |
| `POST /api/orders/:id/cancel` | Existing authenticated cancellation rules, transactional inventory release |
| `POST /api/orders/:id/payment/verify` | Existing customer ownership check and PayMongo retrieval; commits or reconciles inventory |
| `POST /api/paymongo/webhook` | Signed success/failure events, idempotency and inventory transition |
| `POST /api/admin/orders/:id/confirm` | Refuses preparing an unverified ONLINE payment |
| `PATCH /api/admin/orders/:id` | Existing fulfillment editor; ONLINE payment cannot be manually marked Paid |
| `DELETE /api/admin/orders/:orderId/items/:itemId` | Completed-history removal now returns 409; archive product instead |
| `GET /api/admin/dashboard` | Lettuce low-stock thresholds and separate inventory summary |
| `GET /api/admin/logs` | Persistent inventory movements in existing system logs |

## Tests

Tests use only `INVENTORY_TEST_DATABASE_URL`, never the production `DATABASE_URL`. Each run creates a random isolated schema, applies the existing base schema and additive migration, starts the actual Express routers, executes requests, then removes that test schema. PayMongo responses are mocked; PostgreSQL locks and concurrent requests are real.

PowerShell example with a separately provisioned local test database:

```powershell
$env:INVENTORY_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55432/postgres'
npm.cmd --prefix server run test:inventory
npm.cmd run lint
npm.cmd run build
```

Without a test database URL, only the two unit tests run and database integration is explicitly skipped. Never point the test URL at a production database.

Verified locally: all 27 test results passed, including real concurrent last-plant/last-pack checkout, atomic rollback, payment commit, duplicate webhooks, payment failure, cancellation, expiry, late payment before/after sweep, audit history, migration preservation, legacy grouped-order cancellation, large generated codes, reserved-pack adjustment protection, API auth, archive, reporting, COD compatibility and shipped-order cancellation restrictions. Full-project ESLint and production Vite build passed. Backend modules pass Node syntax checks; this JavaScript backend has no separate compiler/build step. Browser layout inspection is not included in these automated checks.

## Operational limits

- A real PayMongo test-account checkout and public webhook delivery still need deployment validation; local tests mock provider responses and sign test payloads. No live charge or refund was created.
- Refund Pending is an explicit manual reconciliation queue, not an automatic refund API. Verify and refund the actual payment in PayMongo. Never replenish shipped/damaged goods just because payment is refunded.
- Generic failed-payment events can be correlated immediately only when their payment-intent ID matches the session's stored intent. Otherwise the bounded server reservation expiry still releases the inventory; unmatched events do not guess an order.
- Expiry depends on the backend running. A restart sweeps overdue reservations. During downtime, reserved stock remains unavailable; a late payment is reconciled safely on recovery. Release normally occurs within 30 seconds after the deadline.
- Existing grouped succulent records require physical review and manual individual creation. Pre-deployment unpaid ONLINE orders remain legacy records for manual review, preserving production data.
- Archiving is currently one-way in the UI. History remains searchable; there is no permanent-delete control.
