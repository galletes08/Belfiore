# Lettuce Stock In / Stock Out

## Workflow and quantities

Active edible product rows now have dedicated **Stock In** and **Stock Out** buttons. Succulents and archived products do not have these controls. The existing green/white layout and other row actions remain.

Each dialog shows the read-only variety/name, code, recorded physical stock, reserved quantity, unshipped order allocations and available packs. Administrators enter a positive whole pack quantity, choose the operation's reason, and enter optional notes (required for Other). The preview shows the new recorded physical and available stock. Confirm is disabled while saving; the success message uses the authoritative before/after values returned by the backend. Inventory and summary cards refresh after success; existing catalog refresh continues to expose the updated available quantity.

Each pack is always 400g. Existing lettuce prices and varieties are not changed.

`products.stock` is already **sellable available stock**, not total physical stock. Checkout removes allocated packs immediately; `reserved_stock` separately tracks pending online reservations. Therefore Stock Out is limited to `stock` and never deducts commitments a second time.

The dialog's **recorded physical stock** is available stock + online reserved stock + order-allocated quantities not yet shipped. Order allocations are calculated from committed/legacy orders in Pending, Preparing or Cancellation Requested state whose inventory has not been restored. Out for Delivery and Delivered allocations are excluded. This is the system's recorded on-hand quantity; it still requires physical inventory verification and does not track unrecorded spoilage.

## Backend and history

The existing `POST /api/admin/inventory/:id/adjust` endpoint now requires an `Idempotency-Key` header. The UI sends `{direction:'in'|'out', quantity, reasonType, notes}`. Stock In reasons are New Harvest, Inventory Correction, Returned Sellable Stock and Other. Stock Out reasons are Damaged / Spoiled, Expired / Unsellable, Inventory Correction and Other. Older free-text `reason` payloads remain readable/accepted, but they also require a request key.

The backend validates role, product type, active listing state, integral quantity, reason/notes and available stock. It ignores user-supplied current-stock values. A transaction locks the request key and product row, applies the quantity delta, records history/notes/snapshots and saves the receipt together. The existing request ledger is reused with a `stock-adjust:` key namespace, so no separate retry table is introduced. Identical retries return the same receipt; reusing a key for changed input returns a conflict. Different concurrent adjustments serialize on the product row. A failed audit insert rolls back both stock and the receipt.

Inventory History keeps the existing movement record and timestamp. New adjustments store notes and explicit physical-stock before/after snapshots. The adjustment quantity derives from the stock delta. History shows those values alongside available/reserved/status changes, administrator, reason, PHT timestamp and existing date/activity filters. No timestamp edit/delete endpoint is added. System Logs continues reading the same movement records.

Returned Sellable Stock is an explicit manual stock-in reason, not an automated refund/restocking operation. Administrators must inspect the returned packs and avoid re-adding quantities already restored by cancellation.

## Files and migration

- `src/admin/AdminInventory.jsx`: buttons, dialogs, previews and history details.
- `src/api/client.js`: stock adjustment request key.
- `server/src/routes/inventory-products.js`: quantity validation, locking, retry receipts, allocation metadata and history snapshots.
- `server/src/routes/products.js`: physical/reserved/committed metadata.
- `server/src/db/migrations/003_adjustment_notes.sql`: nullable notes, previous physical stock and new physical stock fields on existing inventory movements.
- `server/scripts/migrate-inventory.js`: applies migration 003 once.
- `server/tests/inventory.test.js`: adjustment validation, retry, concurrency, physical audit and rollback coverage.

Migration 003 has been applied to the currently connected database. It adds nullable metadata only; existing inventory, prices, historical timestamps and sales are not overwritten. For another environment, run `npm.cmd --prefix server run migrate:inventory` before starting the updated backend. Old movements without explicit physical snapshots show their existing recorded available + reserved quantities; historical unshipped commitments are not reconstructed or fabricated.

## Verification and limits

All **52 tests passed**, including +10 and -3 packs, invalid/negative/decimal/boolean/array quantities, excessive Stock Out, archived/succulent restrictions, Other notes, authorization, simultaneous distinct adjustments, concurrent identical retries, audit notes/snapshots, live catalog quantities, reservation/COD/paid-allocation protection and audit-failure rollback. All existing checkout, payment, archive/restore, history and report tests still pass. Full-project lint and production build passed.

Database/API tests use a separate local PostgreSQL database and generated test fixtures; no production stock was adjusted for verification. PayMongo responses are mocked. Browser layout/progress inspection and actual provider payment calls were not executed. Safely retry an unchanged open adjustment dialog after an uncertain response; opening a new dialog or editing the fields creates a new request key and represents a new adjustment.
