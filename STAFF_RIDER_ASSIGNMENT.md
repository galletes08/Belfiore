# Staff rider assignment — 2026-10-27

The user's latest instruction explicitly authorizes Staff to assign riders, superseding the Admin-only assignment restriction in the preceding redesign specification. Other Staff restrictions and the approved inventory scope remain unchanged.

Update: Staff can now also select logistics and configure its courier/tracking through a separate scoped delivery action. See `STAFF_DELIVERY_MODE.md` for the current delivery-mode permissions and verification. The rider-only endpoint described below remains restricted to rider assignments.

- Staff Delivery now has an enabled Assigned Rider dropdown for accepted Preparing orders using the approved rider delivery method. It displays actual rider names and availability. Offline/busy riders cannot receive new assignments.
- Saving uses `PATCH /api/staff/orders/:id/rider`, authorized through the narrow `orders.assign_rider` permission. The list uses `GET /api/staff/riders` under the same permission; rider/account management is not granted.
- Allowed request fields are rider ID, optional permitted operational status, and the existing full-precision order version. Payment, COD, fee, delivery-method override, cancellation and Delivered fields/transitions are rejected.
- The scoped adapter reuses Admin's existing order update service and assignment/token/history behavior. It checks acceptance, shipping/payment/inventory approval, current order version, terminal state and the selected rider's enabled/duty/security/assignment state. Rider/account state is locked and rechecked inside the transaction.
- Concurrent or stale saves are rejected. Unchanged assignments do not create duplicate audit events. Staff assignment preserves payment/COD statuses and financial amounts; it does not expose private driver tokens.
- Existing Staff operational status updates remain available; selecting a new rider and Out for Delivery can be saved atomically through the scoped action. Completed, cancelled, already-dispatched and logistics orders cannot be reassigned through this rider action.
- Shared Admin, Staff and customer views read the same saved assignment. Existing refresh/invalidation remains active. Staff ID, before/after assignment and status, database timestamp and action are written to existing audit logs.

## Files changed

- `src/staff/StaffOrderStatus.jsx`
- `server/src/utils/staffPermissions.js`
- `server/src/routes/operations-staff.js`
- `server/src/routes/orders.js`
- `server/tests/operations-staff.test.js`
- `server/tests/operations-staff-ui.test.js`
- This report and the supersession note in `STAFF_PORTAL_REDESIGN.md`.

## Verification

- Isolated PostgreSQL operations tests: **18 passed**, including successful Staff assignment, rejected locked/offline/busy riders, simultaneous/stale saves, no-op audit protection, role denial, unchanged financial fields and matching Admin/Staff/customer assignment.
- UI/auth regression: **16 passed**, including the enabled Staff rider dropdown and existing role-session protection.
- `npm.cmd run build`: passed.
- Scoped ESLint: passed.
- No actual order assignment, stock transaction, account change, migration or database reset was performed. Manual browser interaction was not performed for this change.
