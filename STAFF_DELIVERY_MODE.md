# Staff delivery mode selection

Staff Order Details now uses a Delivery Mode dropdown with Rider delivery and Logistics only. Logistics displays the existing J&T Express/LBC courier choices and tracking-number field. Rider delivery retains the actual eligible-rider selector.

Delivery configuration can be saved on accepted Preparing orders. The scoped `PATCH /api/staff/orders/:id/delivery` action uses `orders.delivery.manage` and the shared Admin order-update service. It validates courier/rider selection, order version, dispatch prerequisites, role and account state. Concurrent stale saves are rejected. Mode changes after COD collection/payment and configuration changes after dispatch are rejected.

Confirmed shipping fees, totals, payment status and COD status are preserved. Staff cannot submit financial overrides, cancellation or Delivered transitions. Official delivery confirmation and existing courier tracking remain responsible for shipment completion. Audit history records the Staff user, previous/new delivery configuration, status and backend timestamp. No product, order history or GPS history is deleted.

## Files modified

- `src/staff/StaffOrderStatus.jsx`
- `server/src/utils/staffPermissions.js`
- `server/src/routes/operations-staff.js`
- `server/src/routes/orders.js`
- `server/tests/operations-staff.test.js`
- `server/tests/operations-staff-ui.test.js`
- `STAFF_RIDER_ASSIGNMENT.md` and this report

## Verification

- 35 automated tests passed across operations-staff, operations-staff-ui and auth-role-ui, using an isolated temporary PostgreSQL database. Coverage includes logistics selection, courier/tracking changes, rider/logistics switching, dispatch, concurrency conflicts, role denials, audit history, financial preservation and existing inventory/authentication regressions.
- Frontend production build passed.
- ESLint passed for all six modified source/test files.
- No live order was changed and no database reset was performed. Manual browser and viewport testing were not performed.

Shipping-fee changes still require administrator review; switching delivery mode does not calculate a new courier charge.
