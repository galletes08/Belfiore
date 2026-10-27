# Existing Staff UI: shared inventory and orders integration

> Update 2026-10-27: the additional Staff packing workflow is retired. See [STAFF_ORDER_SIMPLIFICATION.md](STAFF_ORDER_SIMPLIFICATION.md) for current behavior and verification. Earlier packing and assignment descriptions below are historical.

Completed October 26, 2026, Asia/Manila.

## Existing UI and services inspected

The existing Staff UI is `src/staff/StaffPortal.jsx`, `StaffInventory.jsx`, `StaffOrders.jsx`, `StaffOrderActions.jsx`, `StaffProductCreate.jsx`, `inventoryDisplay.js` and `staffApi.js`. Its three primary modules, sidebar, colors, cards, tables, forms and responsive classes were retained. No replacement dashboard or parallel inventory/order system was created.

Existing connections already used the common products, orders, order_items, supply variants/pools, inventory movements and reservation services. The missing integration points were:

1. Admin Order Management did not receive/display the preparation metadata recorded by Staff.
2. Staff data refreshed only on entry, a local action or manual Refresh, so external Admin changes could remain stale.
3. Staff Inventory History displayed personal activity instead of the canonical shared movement history.
4. Staff lettuce Stock In unnecessarily required notes, contrary to the requested optional-notes policy.

## Functional changes

- Admin order responses now attach the existing per-order preparation metadata: actual stage, handling account/name, checklist, verified items, notes, version and recorded timestamps. The Admin status cell and existing details drawer display it. Historical orders without preparation records show no fabricated stage or timestamp.
- Staff and Admin continue reading/writing the same stock and order records. No independent Staff balances were introduced.
- Staff stock history now uses the existing inventory history handler, including canonical movement IDs, actors, before/after quantities, reasons, timestamps, linked order/variant IDs and server pagination. Its restricted DTO omits Admin transaction enrichment, customer contact details and authentication information.
- Read-only product descriptions are connected to the existing Staff Details view.
- Lettuce New Harvest Stock In accepts optional notes; Stock Out still requires a short disposal/damage note. Whole-positive quantities, confirmation, available-stock protection, transactions, row locks and idempotency are unchanged.
- Preparation and packing remain separate from payment and delivery. Packed and Ready for Pickup do not mark orders Paid, Shipped or Delivered.

No layout redesign was needed. Small functional additions are the preparation status line/details, correct shared-history heading/actors and the optional-notes label.

## Shared services and connected APIs

Reused backend functionality:

- `registerLettuceStock`: common Admin/Staff product-level lettuce accounting.
- `registerSupplyStock`, `readSupplyVariants`, stock factors/pools: gardening-supply variants and shared/prepacked conversion.
- Existing reservation, cancellation/restoration and checkout services in `inventory.js` and existing order routes.
- Shared `acceptOrder` and `updateOrderHandler` for previously authorized Staff order operations.
- Existing `inventory_movements` history query, filters, Philippine date boundaries and pagination, now exposed as the shared `inventoryHistoryHandler`.
- Existing `staff_fulfillment`: preparation metadata referencing the actual order. This is not a duplicate Staff order ledger. No new fulfillment table was created.
- Existing Staff activity and Admin System Logs integrations preserve the actual actor and backend timestamps.

New connection: `GET /api/staff/inventory/history`, guarded by `inventory.history.read`.

Existing Staff connections retained: `/api/staff/dashboard`, `/api/staff/inventory`, `/api/staff/orders/overview`, order acceptance/fulfillment/approved-delivery actions, lettuce/supply stock endpoints and personal profile/activity. Admin `/api/admin/orders` and its existing single-order mutation responses now include preparation metadata.

## Permissions and security

The only newly added permission in this integration is `inventory.history.read`, enforced with the existing central persisted-account/JWT/session-version checks. Staff still receives 403 from Admin-only history, financial reports, account management, payment verification and COD-settlement endpoints. No general `riders.assign` or full Admin capability was granted.

Previously explicitly authorized Staff creation, acceptance and limited approved-delivery assignment remain in place; this task did not broaden those permissions. Existing product price/code editing, general stock corrections, reservation overrides, cancellation/refund consequences and historical-order changes remain protected. New individual succulent creation continues through the existing controlled creation permission, never bulk incrementing an existing plant code.

Staff stock-history access is to operational inventory movements, not another user's security/account activity. Personal account/activity endpoints remain scoped to the authenticated account. No passwords, tokens or payment credentials are included in invalidations or new DTO fields.

## Refresh and synchronization behavior

- Successful relevant Admin/Staff API mutations emit an invalidation event and write a data-free version signal to local storage. Authorized tabs on the same origin can refresh promptly without copying records into browser messages.
- Staff Dashboard, Inventory and Orders refresh on focus, visibility return, relevant invalidation and a 15-second visible-page interval.
- Existing Admin Orders retains its 15-second polling/focus refresh and also listens for invalidation. Admin Inventory retains its 30-second refresh and adds focus/invalidation handling.
- Quiet refresh retains existing UI and last successful data, pauses while operational forms are being edited, and avoids overlapping automatic Staff requests. Admin/Staff inventory readers ignore stale out-of-order responses.
- Open Staff stock history refreshes alongside inventory changes. Local successful actions still perform their existing explicit refresh.
- The customer catalog's existing 30-second/visibility refresh was inspected and preserved; its product API already uses the same authoritative balances.

This is refresh/invalidation, not a new WebSocket system. Server reads reflect committed changes immediately. Separate browsers/devices fall back to focus/polling. Active drafts intentionally pause automatic updates; backend version/stock checks remain authoritative when saving.

## Tests actually executed

Full command: `node --test server/tests/*.test.js`, with an explicit isolated `INVENTORY_TEST_DATABASE_URL`.

**206 passed, 0 failed, 0 skipped.**

Final focused PostgreSQL integration rerun: **16 passed, 0 failed** with external courier synchronization explicitly disabled for test isolation. The final history null-balance display was also rebuilt and linted successfully.

The integration tests verify:

- Staff New Harvest +20 packs without notes updates 10 to 30; retrying the same request creates no duplicate movement.
- Admin Stock In +10 updates all three views to 40; Staff disposal of 5 updates them to 35.
- Actual Staff, Admin and public customer product APIs return the same quantities after each action.
- Reserving 3 packs leaves 32 available; deducting 33 is rejected even though physical stock includes those reserved packs.
- An authorized Admin cancellation restores availability to 35 and appears Cancelled in Staff Orders.
- Simultaneous Admin -1 / Staff +2 transactions produce 36 in every view without lost updates.
- Staff and Admin canonical history returns the same movement IDs; Staff actor references are present and duplicate retries do not create another Stock In.
- Staff Packed and Ready for Pickup appear in actual Admin API responses with the same handler and notes. Order/payment snapshots remain unchanged by packing.
- Cross-tab/focus/polling invalidation, hidden-page/draft suppression, request coalescing and listener cleanup work without private data in events.
- Existing Admin drawer renders the shared stage/handler/notes; Staff navigation, inventory/order tables and secure forms still render.
- Existing full-suite tests cover role separation, session revocation, stock validation, unique succulent creation, supplies, checkout/reservations, payment protections, Rider workflows and audit logging.

`npm.cmd run build`: **passed**.

Scoped ESLint over frontend, backend and relevant tests: **passed without diagnostics**.

The running configured backend also returned 401 for unauthenticated Staff history access. No live business mutation was used for verification. All stock/order fixtures were confined to disposable schemas on the isolated test cluster; no real administrator was locked or reset.

## Modified files for this integration

Backend:

- `server/src/utils/orderPreparation.js` — new shared metadata reader.
- `server/src/routes/orders.js` — Admin preparation metadata attachment.
- `server/src/routes/inventory-products.js` — shared history handler and safe Staff projection.
- `server/src/routes/operations-staff.js` — history route and read-only description data.
- `server/src/routes/lettuce-stock.js` — optional Staff Stock In notes.
- `server/src/utils/staffPermissions.js` — inventory history permission.

Frontend:

- `src/utils/operationsSync.js` — data-free invalidation/subscription utilities.
- `src/hooks/useOperationsSync.js` — Staff automatic refresh hook.
- `src/api/client.js` — Admin operation invalidations.
- `src/admin/AdminInventory.jsx` — invalidation/focus refresh and stale-response protection.
- `src/admin/AdminOrders.jsx` — shared preparation display and invalidation refresh.
- `src/admin/OrderDetailsDrawer.jsx` — preparation details in the existing drawer.
- `src/staff/staffApi.js` — Staff operation invalidations.
- `src/staff/StaffPortal.jsx` — quiet refresh, editing protection, shared-history rendering and optional notes.
- `src/staff/StaffInventory.jsx` — canonical shared history and product description.
- `src/staff/StaffOrders.jsx` — preparation status under the existing order badge.
- `src/staff/StaffProductCreate.jsx`, `src/staff/StaffOrderActions.jsx` — editing markers only.

Tests/documentation:

- `server/tests/operations-staff.test.js`
- `server/tests/operations-staff-ui.test.js`
- `server/tests/operations-sync.test.js` — new invalidation tests.
- `STAFF_UI_INTEGRATION.md`
- `OPERATIONS_STAFF_PORTAL.md` — link to this current integration report.

## Migrations and remaining limitations

**No new database migration, table, account, initial balance or business-data reset was required.** Existing roles, IDs, products, historical orders/batches and stock history were preserved. Existing lettuce quantity-mode migration remains the prerequisite; unconverted balances stay blocked rather than invented.

Actual desktop/mobile visual and interaction testing could not run: the computer-use inventory returned no browsers/apps and reported an unavailable native pipe. Existing responsive styling was preserved and server-rendered checks/build passed, but those checks do not establish pixel-level visual or touch/focus behavior. Perform that browser walkthrough before release. No real payment, live GPS or physical stock transaction was simulated against application data.
