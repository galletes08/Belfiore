# Staff order status updates — 2026-10-27

> Follow-up: [STAFF_OPERATIONAL_CONTROL.md](STAFF_OPERATIONAL_CONTROL.md) documents the newly authorized operational rider/courier assignment controls and shared inventory UI. Earlier assignment restrictions below describe the prior scope.

## Allowed transitions

| Current status | Staff may select | Conditions |
| --- | --- | --- |
| Pending | Preparing | Existing acceptance service; confirmed shipping, valid allocated inventory and verified payment for online orders. |
| Preparing | Out for Delivery | Accepted order; same shipping/payment/inventory checks; existing administrator-assigned eligible rider, or configured J&T/LBC courier and tracking number. |
| Out for Delivery, Delivered, Cancelled, Cancellation Requested | No further transition | Official delivery confirmation or administrator review is required. |

Staff cannot change assignment, payment/COD state, fees, refunds, cancellation, proof of delivery, driver tokens or GPS. Out for Delivery records dispatch, never delivery completion. No packing workflow is restored.

## Implementation

Inspected Admin `updateOrderHandler`: status labels, PayMongo validation, allocated-inventory checks, terminal-state rules, courier status validation, optimistic update checks and delivery audit configuration. The broad Admin handler remains Admin-only.

The Admin and Staff forms now reuse `OrderStatusSelect` and the same canonical status labels. Staff's Overview **Update Status** opens the existing Delivery tab, where its limited dropdown and save button appear. Historical/terminal orders have a disabled control. Existing Pending acceptance remains available.

`PATCH /api/staff/orders/:id/status` requires `orders.status.update`, current authenticated account state, and a body containing only `status` and `expectedUpdatedAt`. The version comes from the existing full-precision `assignment_version` field. The transaction rechecks account revocation, locks the order, rejects stale versions/invalid transitions, validates the existing assignment, and writes only order/tracking statuses and actual backend timestamps. Pending acceptance reuses `acceptOrder`; dispatch reuses existing inventory eligibility and courier validation services.

Changes are recorded in `staff_activity` and `auth_security_events`, including Staff ID, old/new status and database timestamps. System Logs displays the transition description and actor. Courier dispatch also uses the existing delivery history trigger.

Successful updates refresh Staff immediately and invalidate existing Admin views. Customer order views also listen for same-browser invalidation, focus and visibility events, coalescing concurrent reloads. The existing 15-second polling remains the fallback across browsers/devices; there is no new WebSocket/push service.

## Files modified or added

- `shared/orderStatus.js` — shared status labels and limited Staff transition map.
- `src/admin/OrderStatusSelect.jsx` — reusable status dropdown.
- `src/admin/AdminOrders.jsx` — uses the shared dropdown.
- `src/staff/StaffOrderStatus.jsx` — scoped operational form.
- `src/staff/StaffOrderDetails.jsx` — connects the form to the shared Delivery tab.
- `server/src/utils/operationalOrderStatus.js` — transactional validation and scoped writes.
- `server/src/utils/staffPermissions.js` — adds only `orders.status.update`.
- `server/src/routes/operations-staff.js` — authorized status endpoint and audit.
- `server/src/routes/orders.js` — imports canonical status labels; Admin authorization retained.
- `server/src/routes/logs.js` — shows the Staff transition description.
- `src/components/Signup/Order.jsx` and `src/customer/pages/orders/OrdersPage.jsx` — event-driven read refresh only; no checkout/payment/GPS logic changes.
- `server/tests/operations-staff.test.js` and `server/tests/operations-staff-ui.test.js` — integration and rendered UI regression coverage.

## Actual verification

- Full isolated PostgreSQL suite: `node --test server/tests/*.test.js` — **210 passed, 0 failed, 0 skipped**.
- Final focused regression after the last inventory eligibility guard: `node --test --test-concurrency=1 server/tests/operations-staff.test.js server/tests/operations-staff-ui.test.js server/tests/auth-role-ui.test.js` — **31 passed, 0 failed, 0 skipped**.
- `npm.cmd run build` — passed.
- Scoped ESLint — passed.
- `git diff --check` — passed, apart from existing Windows line-ending notices.

Tests verify both transitions, unassigned/locked rider rejection, missing payment/shipping approval, direct privileged-field rejection, terminal/backward transition denial, stale and simultaneous updates, single audit records, unchanged protected fields, and matching Admin/Staff/Customer API statuses. Rendered fixture ORD-072 includes the shared dropdown and Update Status control with only permitted options.

All database tests used disposable schemas in a separate temporary PostgreSQL cluster. Actual ORD-072 and historical business orders were not mutated. No database reset/migration or account changes were performed. No manual browser/mobile interaction test was performed for this change.
