# Staff operational controls — 2026-10-27

> Superseded by [STAFF_PORTAL_REDESIGN.md](STAFF_PORTAL_REDESIGN.md): the latest attached specification restores Admin-only rider assignment while retaining the approved Staff inventory scope and operational status updates.

This supersedes earlier reports describing all assignment fields as read-only for Staff. The current request authorizes operational control of orders and inventory.

## Orders

- Shared Admin Orders table, details drawer, tabs and status dropdown remain in use.
- Staff can accept eligible Pending requests, select an eligible rider for an accepted Preparing order, configure J&T/LBC courier tracking, save delivery notes and dispatch an eligible order.
- Assignment and dispatch use the existing Admin `updateOrderHandler`, reached through a narrow server-authorized Staff adapter. Direct broad Admin API access remains denied. Only the adapter can set the internal Staff assignment context; a request body cannot enable it.
- Staff fields are allowlisted, the full-precision order version is checked, and the write retains Admin's optimistic order/tracking checks. Rider account/duty/security state is rechecked inside the transaction.
- The approved delivery method and shipping fee remain authoritative. Changes that require shipping/financial approval are not granted by this operational permission.
- Payment/COD amounts and statuses are preserved by Staff assignment writes. Staff cannot confirm delivery, settle COD, verify payments, refund, approve sensitive cancellations or manage rider accounts. Private driver tokens are never returned to Staff.
- Recorded assignment/status changes remain visible through the same order records and existing refresh/invalidation behavior. Staff ID, before/after assignment and status, timestamp and notes are recorded in existing audit tables.

## Inventory

- Add Product, Details, Stock In/Out and History now use the same modal component as Admin.
- Admin and Staff reuse the same Inventory History component, including database-backed date range, activity, search and pagination filters. The existing Staff API still applies its restricted history response.
- Lettuce Stock In/Out reuses the Admin stock form with an injected Staff request, authorized reasons and required Stock Out notes. Admin defaults are unchanged.
- Gardening supply variant stock operations and verified opening stock continue using the existing protected Staff functionality. Stock In/Out can be chosen directly from the shared inventory action menu.
- Existing Add Product functionality for all three product types remains intact. Product details open in a modal instead of expanding a table row.
- Existing product editing, price changes, Archive/Restore, catalog import and stock overrides remain Admin-only under the previously authorized inventory scope. An optional scope question was presented; absent a broader selection, these privileges were not added.
- No products, orders, stock balances, historical data or accounts were modified as part of implementation. No migration/reset was run. Packing remains retired.

## Files modified or added

- `server/src/routes/orders.js` — shared, scoped assignment handling and transaction audit; financial fields preserved for Staff.
- `server/src/routes/operations-staff.js` — narrow assignment/rider-list authorization.
- `server/src/utils/staffPermissions.js` — grants `orders.assign_delivery`, without general rider/account management.
- `src/staff/StaffOrderStatus.jsx` — functional rider/courier controls and unified save action.
- `src/admin/InventoryModal.jsx` — extracted existing Admin modal.
- `src/admin/InventoryHistory.jsx` — extracted existing Admin History with request injection.
- `src/admin/AdminInventory.jsx` — uses extracted shared components.
- `src/admin/LettuceStock.jsx` — optional request/reason/note/path adapters with unchanged Admin defaults.
- `src/staff/StaffInventory.jsx` — shared modals, history, lettuce stock form and stock action menu.
- `src/staff/StaffProductCreate.jsx` — supports rendering within the shared modal.
- `src/staff/StaffPortal.jsx` — accepts a preselected Stock In/Out direction.
- `src/staff/StaffOrders.jsx` — opens the order selected by a History order link.
- `server/tests/operations-staff.test.js` and `server/tests/operations-staff-ui.test.js` — updated authorized-operation regression coverage.

## Verification

- Isolated PostgreSQL operations suite: 17 passed, 0 failed, 0 skipped.
- Focused UI/auth/lettuce regression: 15 passed; additional freshness-guide regression run: 18 passed.
- Production frontend build: passed after the shared component extraction.
- Scoped ESLint and `git diff --check`: passed (existing Windows line-ending notices only).
- Full isolated PostgreSQL regression: `node --test server/tests/*.test.js` — **210 passed, 0 failed, 0 skipped**.

Tests used disposable schemas and dedicated test accounts in a separate local PostgreSQL cluster. They cover rider lock rejection, valid assignment/dispatch, stale versions, protected financial fields, cross-role denial, masked driver tokens, stock reservation safety, creation and retired packing behavior. No manual browser/mobile interaction test was performed for this change.
