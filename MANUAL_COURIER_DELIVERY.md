# Manual courier delivery management

## Completed changes

- Removed Track123 Sync, its loading/errors, sync timestamp, carrier code, auto-detection helper and unused admin frontend handler/API wrapper.
- Kept J&T Express/LBC selection, manual tracking number, Order Status, Delivery Mode and supported Delivery Status choices.
- Entering/saving a tracking reference no longer automatically sets Out for Delivery or In Transit in either frontend or backend.
- Delivery Management explains that updates are manual. Added optional notes, actual Last Updated timestamp, Save Delivery Details and View Delivery History.
- Retained rider assignment, rider form, private driver links, coordinates, last recorded location and proof-of-delivery functionality.

## Workflow and validation

Save a courier/reference while Pending or Preparing; it is only a reference. Explicitly select the actual order/shipment state when the parcel moves. Supported existing shipment states are Pending, Preparing, Packed, In Transit, Out for Delivery and Delivered. Cancelled remains tied to the existing order cancellation workflow. No Ready for Pickup, Failed Delivery or Returned to Sender database statuses were invented; those require a separate complete status-model change.

The backend rejects backwards shipment transitions, terminal reopening, unknown statuses and incompatible states. In Transit/Out for Delivery shipment requires Out for Delivery order status; confirmed delivery requires both statuses Delivered. These are explicit administrator choices, not automatic changes from a reference number. Updates compare the original order and shipment states atomically to reject stale forms.

Courier Delivered leaves COD Unpaid/Remittance Pending until the existing Confirm COD Payment Received workflow is used. Online payment confirmation, rider COD collection and inventory allocation rules remain unchanged. Saving tracking details does not adjust physical/reserved quantities.

## History and migration

Migration `007_manual_delivery_history.sql` creates `order_delivery_history` and a trigger that captures confirmed manual logistics shipment-status changes. Records include order ID, courier/reference, old/new status, administrator ID, optional notes and a backend timestamp. Order update and history insert share a transaction; failures roll back together. Repeated unchanged saves do not produce duplicate status events.

History is read-only, paginated and rendered in Asia/Manila. Old events are not backfilled or fabricated. Existing provider checkpoint fields and all historical tracking information are preserved.

New authorized endpoint: `GET /api/admin/orders/:id/delivery-history?page=1` (25 entries/page). No history timestamp edit/delete endpoint was added.

## Dependency review

The customer-facing `/api/orders/:id/logistics-updates` endpoint and the existing webhook/sync routes still reference the legacy Track123 utility. Those backend files, historical columns and existing credential variable names were retained, not deleted.

Automatic integration now requires explicit `TRACK123_ENABLED=true` as well as an API key; default is manual/disabled, documented in `server/.env.example`. Webhook acceptance also requires the explicit integration opt-in and a configured verification token. Disabled integration endpoints return an understandable manual-mode message. No actual `.env` credentials were read, printed or deleted. No new tracking service was introduced.

## Modified files

- `src/admin/AdminOrders.jsx`: simplified manual form, notes/save label, removed sync state and implicit dispatch.
- `src/admin/OrderDetailsDrawer.jsx`: actual update timestamp and history action.
- `src/admin/DeliveryHistory.jsx`: new paginated, read-only manual event list.
- `src/api/client.js`: removed unused admin sync wrapper; added history fetch.
- `server/src/routes/orders.js`: explicit manual validation, transactional audit context, stale-form checks, history API and manual-mode messages.
- `server/src/utils/manualDelivery.js`: supported forward transition/consistency validation.
- `server/src/utils/track123.js`: explicit opt-in and fail-closed webhook verification.
- `server/src/db/migrations/007_manual_delivery_history.sql`, `server/scripts/migrate-inventory.js`, `server/.env.example`.
- `server/tests/inventory.test.js`, `server/tests/manual-delivery.test.js`.

## Executed testing

- **73 tests passed, 0 failed, 0 skipped** on isolated PostgreSQL.
- Verified manual tracking save/persistence without dispatch, courier selection, explicit Packed → In Transit → Delivered updates, invalid/backward transitions, actual actor/notes/time audit records, duplicate-save deduplication, unauthorized history rejection, COD remaining unpaid after courier delivery, unchanged inventory and disabled legacy sync.
- Existing rider proof-delivery and stale-admin protection, online payments (mocked provider), cancellations, notifications, stock, batch prices/history and archive/restore regressions passed.
- ESLint and production build passed; source scan found no Track123-specific admin/frontend sync references left.
- Migration applied successfully to the configured application database. No existing orders, shipment statuses, prices, quantities or history records were rewritten.

## Limits

Browser clicks, mobile layout, real rider GPS sessions and actual courier/PayMongo network integration were not exercised. Backend rider/payment regressions ran against the isolated database with mocked provider calls. Manual history begins with new changes after migration. Restart the backend if it is not in watch mode so the updated validation/history endpoint loads.
