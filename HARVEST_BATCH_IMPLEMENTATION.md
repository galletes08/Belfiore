# Harvest batch management

## Implemented

Edible varieties retain their main product record. New harvests create linked, uniquely numbered `HB-...` batches with whole 400g pack quantities, their actual harvest date, initial and remaining stock, reservations, unshipped allocations, regular-price snapshot, batch price, condition, creator and database timestamps. New duplicate edible product names are rejected; existing duplicate listings are not merged or deleted.

Inventory has View Harvest Batches, dated New Harvest/Stock In, existing-batch corrections/returns, stock removal, price/condition editing, legacy inspection, details, history and physical disposal forms. The green/white theme and main inventory layout remain. Summary cards include reserved inventory, aging batches, held/unverified packs and batches awaiting disposal review. Alerts display on the batch management interface. Customer availability is refreshed through the existing catalog polling.

## Lifecycle

Age is the difference between the actual harvest date and the current Asia/Manila calendar date, evaluated on the backend with `clock_timestamp()`.

| Age | Effective status | New purchases |
|---|---|---|
| Day 0–7 | Fresh, subject to manual condition | Allowed only for acceptable stock |
| Day 8–13 | Aging | Allowed only for acceptable stock; no automatic markdown |
| Day 14–20 | On Hold | Blocked |
| Day 21+ | For Disposal | Blocked; physical stock retained |
| Unknown harvest date | Unverified | Blocked until inspected and verified |

Manual On Hold, Unsellable and For Disposal conditions also block sale. Disposed cannot be reactivated through condition editing. Changing a price or condition cannot override an age hold; verified harvest dates cannot be changed to reset age. The monitor runs at startup and every minute, records threshold alerts once, and refreshes derived aggregates. Retrieval, atomic reservation and payment/fulfillment validation evaluate the rules independently of the scheduler.

`harvest_batches.stock` is the remaining **uncommitted physical** quantity, including held stock. Reserved quantities are separate. Recorded physical stock includes unshipped order allocations; shipped/delivered quantities are not counted twice. Product available stock is the sum of eligible batch stock. A held batch therefore retains physical packs but contributes zero sale availability. Derived product-cache updates do not create duplicate movement records.

## Pricing and checkout

The regular product price remains unchanged. An administrator can change one batch's price with a reason and notes; previous/new values are recorded in Inventory History. Other batches and existing order prices are unaffected.

The customer chooses an explicit batch/price option on Product Details. Eligible options are sorted by harvest date, oldest first, implementing FEFO as the default recommendation while honoring the customer's explicit batch choice. Different batches remain separate cart/order lines, with their own agreed prices; prices are never averaged and batches are never silently substituted. The cart shows the batch code and price per 400g pack.

Checkout requires the Batch ID and displayed expected unit price. The backend validates current eligibility, stock and price, and returns a conflict if the displayed price changed. Product and batch locks prevent concurrent over-allocation. Order lines store Batch ID, batch-code snapshot and exact agreed unit price. PayMongo line descriptions identify the selected batches. Signed/idempotent payment handling checks the paid amount and PHP currency against the server order total.

If a pending reservation's batch becomes held, a successful payment cannot commit it: inventory is released back to that batch's held stock and the order becomes Refund Pending for reconciliation. Paid orders are not automatically repriced, reallocated or cancelled because a batch ages; further admin fulfillment is blocked pending reconciliation. Existing delivery/GPS routes are not redesigned. Refunds and physical quality decisions require the administrator's existing business process.

## Disposal

Disposal can occur early for spoiled/unsellable stock or after Day 21 review. The administrator specifies quantity, reason, physical disposal date, notes and explicit disposal confirmation. Only uncommitted physical packs can be removed. Partial disposal preserves the remainder; fully Disposed requires no remaining free packs, reservations or unresolved allocations, including shipped orders awaiting completion. Newer batches, product listings and order history remain intact. There is no automatic deletion or physical stock deduction at an age threshold.

## Migration and APIs

`004_harvest_batches.sql` adds batches, order-line batch references, history batch/value fields and backend lifecycle functions. Existing edible free stock and reservations are preserved in an **Unverified** legacy batch with no invented date. Sale availability is held at zero until actual harvest records and physical condition are verified. Old order snapshots are not rewritten; legacy allocations remain associated with their imported stock for reconciliation. Existing prices and succulent rules are preserved.

Run `npm.cmd --prefix server run migrate:inventory` before deploying to another environment. The migration ledger prevents repeating the import.

Migration 004 has been applied to the currently connected database; the harvest tables and order-validation function were verified.

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/inventory/:id/batches` | Batch details, current lifecycle/quantities and alerts |
| `POST /api/admin/inventory/:id/batches` | New dated harvest or explicitly justified traceable batch |
| `PATCH /api/admin/inventory/:id/batches/:batchId` | Price/condition change; inspection-based verification of an unknown date |
| `POST /api/admin/inventory/:id/batches/:batchId/adjust` | Existing-batch correction, sellable return or removal |
| `POST /api/admin/inventory/:id/batches/:batchId/dispose` | Confirm partial/full physical disposal |
| `POST /api/admin/inventory/:id/adjust` | Compatibility route requiring batch selection or a new dated harvest |
| `GET /api/admin/inventory/history?batchId=...` | Existing history with batch scope and existing date/activity filters |

Mutations require administrator authentication, a reason and an Idempotency-Key. Identical retries replay their receipt; changed payloads with the same key are rejected. Updates, audit entries and receipts commit or roll back together. Timestamps remain database-generated and read-only.

## Modified files

- Backend: `server/src/routes/harvest-batches.js`, `inventory-products.js`, `products.js`, `orders.js`, `dashboard.js`; `server/src/utils/harvest.js`, `inventory.js`, `paymongo.js`; `server/src/index.js`.
- Migration/tooling: `server/src/db/migrations/004_harvest_batches.sql`, `server/scripts/migrate-inventory.js`, `check-inventory.js`, `server/tests/inventory.test.js`.
- Frontend: `src/admin/HarvestBatches.jsx`, `AdminInventory.jsx`, `AdminOrders.jsx`; `src/api/client.js`, `src/utils/inventory.js`; `src/App.jsx`; `src/components/Pages/Products.jsx`, `ProductDetail.jsx`; `src/components/CartSidebar.jsx`, `src/components/Signup/Order.jsx`; `src/customer/sections/CheckoutSection.jsx`.

## Tests and limitations

**64 tests passed**, including existing inventory/order/payment regression tests. New coverage includes multiple independent harvests; all Day 7/8/13/14/20/21 boundaries; physical versus available totals; separate batch prices and order snapshots; FEFO option ordering; held/disposed sale rejection; early/partial/full disposal; protected allocations; retry receipts; threshold-alert deduplication; legacy date verification; exact multi-batch totals; payment amount mismatch; and a simulated Day-14 transition blocking paid fulfillment and reconciling a pending payment. Lint and production build passed.

Tests use real isolated PostgreSQL transactions and Express requests. Provider responses are mocked; no live charge/refund was created. Real PayMongo webhook delivery and browser layout/interaction inspection were not executed. Physical quality, actual legacy harvest dates, sellable returns and refunds still require administrator verification. There is no automatic paid-order batch substitution or refund API. Existing duplicate legacy variety records require manual review; no merge is performed. Alerts are in-app and audited, not email/push notifications.
