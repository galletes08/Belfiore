# Staff order workflow simplification — 2026-10-27

> Follow-up: [STAFF_ORDER_STATUS_UPDATE.md](STAFF_ORDER_STATUS_UPDATE.md) documents the newly authorized, limited Staff status transitions. Assignment and financial changes remain Admin-only; the packing workflow remains retired.

This supersedes the packing workflow described in earlier Staff portal reports.

## Changes

- Staff Orders continues to reuse `OrdersTable` and the Admin `OrderDetailsDrawer`, with Overview, Items, Payment, Delivery and History tabs.
- Removed `PackingCard`, its injection into Staff Orders, the entire Preparation & Packing section, item picking, five packing checks, preparation notes and preparation-stage buttons.
- Removed legacy preparation badges from the Staff presentation. The dashboard now counts actual Pending, Preparing and Out for Delivery orders instead of packing stages.
- Kept the existing authorized Staff acceptance action, including payment, shipping and inventory checks. Assignment, dispatch and financial changes remain Admin-only.
- Retired `POST /api/staff/orders/:id/fulfillment`: authenticated authorized workforce callers receive 410; unrelated roles remain denied. It performs no writes. Removed the Staff prepare/pack/ready permissions.
- Removed the legacy delivery endpoint's dependency on a Ready for Pickup record. Existing Admin delivery processing also works without any fulfillment row.

## Data preservation

Inspected `staff_fulfillment`, its API, dashboard consumers and Admin metadata helper. The table, existing checklist values, notes, timestamps and System Logs remain intact. The existing Admin metadata reader can still show historical preparation records. No migration, data cleanup or database reset was performed. Inventory code and stock permissions were not changed.

## Files modified

- `src/staff/StaffOrderDetails.jsx`
- `src/staff/StaffOrders.jsx`
- `src/staff/StaffPortal.jsx`
- `server/src/routes/operations-staff.js`
- `server/src/utils/staffPermissions.js`
- `server/tests/operations-staff.test.js`
- `server/tests/operations-staff-ui.test.js`
- This report and supersession notices in the earlier Staff reports.

## Tests executed

- `node --test --test-concurrency=1 server/tests/operations-staff.test.js server/tests/operations-staff-ui.test.js server/tests/auth-role-ui.test.js`: **29 passed, 0 failed, 0 skipped**, using a separate local PostgreSQL cluster and disposable schema, never the application database.
- Coverage includes retired API rejection without data changes, existing fulfillment history preservation, guarded Staff acceptance, matching Admin/Staff status and totals, Admin delivery processing with no packing record, denied Staff assignment/financial changes, role-session separation and existing inventory regression checks.
- Server-rendered UI tests confirm five shared tabs and no picking controls, checklist, preparation buttons or assignment/financial actions in the Staff drawer.
- `npm.cmd run build`: passed.
- Scoped ESLint for changed source/tests: passed.
- `git diff --check`: passed; existing Windows line-ending notices only.

No live-browser, mobile viewport or manual order-mutation tests were performed for this change.
