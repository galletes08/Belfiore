# Lettuce quantity inventory transition

Implemented and verified on October 25, 2026 (Asia/Manila).

## Existing dependencies and accounting

Lettuce previously used harvest-batch balances, batch prices and batch allocations throughout checkout, reservations, stock restoration, monitoring, Dashboard and Reports. `products.stock` was already a derived available-stock cache; adding the retained batch quantities to it would duplicate inventory.

The new quantity model uses product-level available packs. Each pack remains 400g. Online reservations and active committed allocations remain separate from available stock. Physical stock includes available stock plus reserved and active warehouse allocations. Dispatch/completion follows the existing inventory lifecycle. COD, payment verification, GPS, succulent tracking and gardening-supply stock models retain their existing behavior.

## Changes

- Admin lettuce actions now provide Stock In, Stock Out and Stock History. Stock In requires confirmed quality-checked packaged quantities; Stock Out supports disposal/spoilage, damage and authorized corrections.
- Positive whole quantities, reason validation, administrator authorization, product locks and idempotent request receipts prevent negative stock, concurrent overselling and duplicate submissions.
- Disposal creates a disposal audit entry. Available, reserved and physical balances appear in the stock form.
- Active freshness holds, disposal schedules, harvest-date entry and batch selection are removed for converted products. Historical batches remain readable and cannot change current quantity balances.
- Customers select lettuce variety and quantity without a batch. Product price remains the price per 400g pack. Existing stale batch cart entries must be removed and re-added; checkout rejects them rather than silently changing prices.
- Inventory Alerts, Dashboard and Reports use the quantity model. Historical sales and inventory movements remain intact. The initial migration audit is not counted as a new harvest/Stock In.
- Unsafe legacy products remain blocked from new orders until reconciled. Existing legacy order allocation/restoration paths remain supported.

## Applied database migration and reconciliation

Migration `020_lettuce_quantity.sql` adds a product stock-model field and a reconciliation ledger containing before-product and before-batch snapshots. Existing products begin in batch mode; new products default to quantity mode. Schema installation and actual reconciliation are separate operations.

The reconciliation rejects unresolved reservations/order commitments, held/unusable stock, cache discrepancies and differing active batch prices. Converted products are skipped on repeat execution. No additional stock is added.

| Existing product | Code | Available packs | Reserved packs | Price per pack |
| --- | --- | ---: | ---: | ---: |
| Romaine (Tiberius RZ) | BF-000068 | 21 | 0 | PHP 130 |
| Crystal Lettuce (Lalique) | BF-000070 | 45 | 0 | PHP 130 |

Only these two lettuce products exist in the configured database. The other three varieties were not fabricated or created. Neither product had active commitments or unresolved remaining batch stock. Both converted successfully, with exactly one Initial Balance Migration audit record each.

Orders, order items, harvest batches, gardening-supply variants/pools and other original product fields were verified unchanged using pre/post integrity comparisons. Migrated products retained their original fields and quantities apart from the stock-model flag and normal update timestamp.

## Backup and rollback

A PostgreSQL custom archive was created and its directory verified before applying reconciliation:

`.backups/before-lettuce-quantity-2026-10-25T07-10-19-383Z.dump`

It is 142,728 bytes. A separate local integrity snapshot is retained in `.backups/lettuce-transition-integrity.json`. Backups are excluded from Git.

Scripts:

- `node server/scripts/backup-lettuce.js`: create and verify a backup using environment configuration.
- `node server/scripts/transition-lettuce.js`: dry-run reconciliation, then roll back.
- `node server/scripts/transition-lettuce.js --apply --backup=<verified-archive-path>`: explicitly apply reconciliation after reviewing the dry-run and verifying the archive.

Do not simply switch converted products back to batch mode: retained batches are historical snapshots and become stale after new quantity transactions. Before new activity, rollback requires a reviewed maintenance-window restoration of the verified archive, with application writes stopped. After new stock/order activity, use forward reconciliation preserving those transactions; restoring the old database would lose them. No rollback was executed.

## Files changed for this task

Backend/schema/scripts:

- `.gitignore`
- `server/scripts/backup-lettuce.js`
- `server/scripts/transition-lettuce.js`
- `server/scripts/migrate-inventory.js`
- `server/src/db/migrations/020_lettuce_quantity.sql`
- `server/src/routes/lettuce-stock.js`
- `server/src/routes/inventory-products.js`
- `server/src/routes/products.js`
- `server/src/routes/orders.js`
- `server/src/routes/harvest-batches.js`
- `server/src/routes/dashboard.js`
- `server/src/utils/checkout.js`
- `server/src/utils/harvest.js`
- `server/src/utils/reports.js`

Frontend:

- `src/admin/LettuceStock.jsx`
- `src/admin/AdminInventory.jsx`
- `src/admin/HarvestBatches.jsx`
- `src/api/client.js`
- `src/utils/inventory.js`
- `src/utils/inventoryAttention.js`
- `src/App.jsx`
- `src/components/Pages/Products.jsx`
- `src/components/Pages/ProductDetail.jsx`
- `src/components/CartSidebar.jsx`
- `src/customer/sections/CheckoutSection.jsx`

Tests:

- `server/tests/inventory.test.js`
- `server/tests/lettuceQuantityChecks.js`
- `server/tests/lettuce-stock-ui.test.js`

Other working-tree changes predate this task and were preserved.

## Actual verification

- Full isolated PostgreSQL/Node suite: `node --test server/tests/*.test.js` — **178 passed, 0 failed, 0 skipped**.
- Includes migration idempotency/snapshots and blocked states, Stock In/Out, disposal, validation, permissions, repeated requests, concurrent checkout, online success/failure/expiry, COD, cancellation/restoration, historical batch cancellation, public/admin stock, Dashboard, Reports and UI rendering.
- Targeted inventory and lettuce UI run — **102 passed**.
- Scoped ESLint covering frontend/backend code and added scripts/tests — passed without diagnostics.
- `npm.cmd run build` — passed.
- Configured application's public product API returned HTTP 200, quantity-mode stock 21/45, unchanged PHP 130 prices and no selectable batches.
- No live Stock In/Out, payment, customer order or GPS transaction was submitted for testing. Mutation tests used isolated disposable schemas.

## Remaining operational limits

- Browser/device walkthroughs, mobile visual inspection and live payment/GPS testing were not performed; automated API, integration and server-rendered UI checks passed.
- Stock Out cannot consume committed packs. Insufficient available stock returns a fulfillment-reconciliation exception with affected order links where applicable. It does not silently cancel, refund, mark Paid or change orders. An administrator must resolve affected orders separately. This is a rejected transaction and UI warning, not a persistent order exception flag.
- Administrators remain responsible for checking quality before Stock In and recording spoilage/disposal through Stock Out; converted stock no longer uses automatic age-based sales holds.
- Old batch cart entries require remove/re-add. Review any future blocked reconciliation results rather than inventing balances.
