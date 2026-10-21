# Automatic courier-based order status

## Implemented

Automatic courier tracking is enabled in the existing server configuration using the configured Track123 key. Only the enable flag was changed; credentials were not printed or replaced.

The backend sweeper checks every minute for eligible logistics shipments due for a refresh (approximately five minutes since the last successful check, up to 20 per sweep). It works without a customer page being open. Saving logistics tracking information also schedules a background lookup after the admin transaction commits. Provider/network failures do not fail that save.

Actual carrier In Transit / Out for Delivery states update the order to Out for Delivery; actual Delivered updates both order and shipment to Delivered. Tracking-number entry alone still does not dispatch an order. Pending/unknown, failure text, stale checkpoints, backwards progress, cancelled/completed orders, rider orders and unpaid online orders cannot be used to invent or regress shipment progress.

COD delivery sets Remittance Pending where appropriate and leaves the payment state unchanged. Provider statuses do not modify inventory quantities, checkout prices or online payment records. The existing delivery history trigger records automatic status changes with actor “Courier tracking service.”

Admin/customer wording now describes automatic tracking. The admin shipment selector is disabled when the order response identifies active automatic tracking; existing reference/courier management remains. The customer panel uses an authenticated, read-only cached tracking endpoint. Customer requests no longer register shipments, contact providers or mutate orders.

## Provider correctness and security

- Updated the query request to the official `trackNoInfos` format documented by [Track123 Get trackings](https://docs.track123.com/reference/get-package-trackings).
- Application error codes are checked even on HTTP 200; requests have timeouts.
- Match the requested tracking number explicitly rather than choosing unrelated query results.
- Use canonical carrier status strings and actual UTC checkpoint timestamps where present. Unknown statuses are not coerced into a completed delivery. Registration metadata/scheduled lookup times are not fabricated as shipment events.
- Per-order advisory locking and fresh-row checks prevent duplicate in-flight syncing and applying a response after the tracking reference, courier or delivery mode changes.
- Customer tracking access requires a valid JWT and matching order email; admins retain authorized access. Other customers receive an unavailable response. Provider credentials stay server-side.
- Optional verified webhooks re-query the trusted provider through the same safe update service instead of directly overwriting order fields. With no webhook verification token configured, webhook requests remain disabled; polling does not require a public webhook.

## Migration and files

Applied additive migration `008_courier_tracking_cache.sql` for `order_courier_tracking`, storing the reference, returned events and last successful check. No existing tracking data was deleted or backfilled with invented events.

New: `server/src/utils/courierTracking.js`, `server/src/db/migrations/008_courier_tracking_cache.sql`, `server/tests/courier-tracking.test.js`.

Updated: `server/src/utils/track123.js`, `server/src/routes/orders.js`, `server/src/routes/track123.js`, `server/src/index.js`, `server/scripts/migrate-inventory.js`, `server/tests/inventory.test.js`, `src/api/client.js`, `src/components/Signup/Order.jsx`, `src/admin/AdminOrders.jsx`, `src/admin/OrderDetailsDrawer.jsx`, `src/admin/DeliveryHistory.jsx`, and the local server enable flag.

## Executed validation

- Real Track123 query accepted the configured key: HTTP 200, provider code 00000.
- Live automatic courier lookup completed; order #56 is Delivered with 11 returned carrier events cached. No fake status was assigned to missing events.
- **76 tests passed, 0 failed, 0 skipped** on isolated PostgreSQL. New coverage verifies carrier transit/completion synchronization, event history, cached customer reads without mutations, other-customer/no-token rejection, COD not marked Paid, unchanged inventory, and mapping/terminal/stale-checkpoint protection.
- Existing order, rider, PayMongo (mocked), cancellation, notification, inventory and batch regressions passed.
- ESLint and Vite production build passed.

## Operational notes and limits

Restart the Node backend if not running in watch mode so it loads the enabled flag and new polling worker; refresh the customer/admin page to load updated code. Updates depend on the provider returning events for a genuine supported courier reference. Empty results show Awaiting carrier updates and preserve the recorded status.

Browser/mobile interaction and continuous long-running polling were not automated. Webhook delivery was not tested or configured publicly. Test carrier transitions use mocked responses; the separate live lookup described above used the configured provider account.
