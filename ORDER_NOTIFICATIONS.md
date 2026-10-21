# In-app administrator order notifications

## Completed behavior

The shared administrator layout now contains one notification bell across Dashboard, Orders, Inventory, Customers, Riders, Reports and Logs. It shows an unread badge, a responsive native-dialog dropdown, read/unread styling, Philippine timestamps, individual read actions, Mark All as Read and paginated View All Notifications. Empty state: “No new notifications.” Error states offer Retry.

The component polls a count-only API every 20 seconds while visible. Opening loads the newest 10 notifications; View All uses 25 per page. Polling stops on unmount. In-flight requests are deduplicated per view, and stale count/list responses do not overwrite the current view. It does not poll the order dataset.

View Order uses the existing `/admin/orders?orderId=...&notificationId=...` path and existing Order Details drawer. The notification is acknowledged only after the authorized order list successfully resolves and opens that order. Missing/inaccessible orders keep the notification unread and show the existing unavailable/access message. Other administrative order operations still require a separate action.

## Backend triggers and reliability

Migration `006_order_notifications.sql` adds:

- `notification_settings`: enablement cutoff, preventing historical-order backlog.
- `admin_notifications`: unique ID/event key/type, minimal title/message, order link, authorized admin recipient role and creation timestamp.
- `admin_notification_reads`: per-notification, per-admin read status and read timestamp. One admin reading a shared event does not acknowledge it for other admins.
- `order_notification_outbox`: committed event payload and delivery status for durable retries.
- Candidate and AFTER INSERT/UPDATE trigger functions on orders.

Triggers capture COD creation, backend-verified online Paid with payment reference/timestamp, saved Cancellation Requested, verified payment.failed state and Refund Pending cases requiring intervention. Ordinary abandoned/expired Pending checkouts do not generate failure alerts. Existing order state transitions and payment processing are unchanged.

Notifications and outbox events are transactional with their actual order update: rolled-back events never become visible. Unique event keys distinguish COD/payment/failure/reconciliation events and cancellation-request timestamps; duplicate processing cannot create identical notifications. Failure to deliver a notification is isolated in a database subtransaction, logs an actionable PostgreSQL server message and leaves its committed outbox payload for retry. An outbox capture failure also logs without blocking the real order; durable order-state candidates provide fallback repair.

The background worker runs at startup and every 30 seconds, repairs eligible missed candidates, delivers up to 500 pending events and acknowledges delivered outbox rows. Delivery failure is logged in the Node server and retried on the next sweep. Multiple workers are safe through uniqueness constraints. No existing prices, quantities or historical transactions are updated by this mechanism.

## APIs

All require a valid admin JWT with userId:

- `GET /api/admin/notifications?page=1&limit=10` (limit 10 or 25): newest entries, total, unread count and mark-all watermark.
- `GET /api/admin/notifications/unread-count`: lightweight badge count.
- `POST /api/admin/notifications/:id/read`: idempotent own read receipt.
- `POST /api/admin/notifications/read-all` with `throughId`: acknowledge existing records through the loaded snapshot; concurrently arriving alerts remain unread.

Payloads contain no customer contact/address information, provider credentials or driver tokens. Details are retrieved only through the existing authorized Orders API. No customer/rider notification access is granted.

## Files

- New: `src/admin/NotificationBell.jsx`.
- Updated: `src/admin/AdminLayout.jsx`, `src/admin/AdminOrders.jsx`, `src/api/client.js`.
- New: `server/src/db/migrations/006_order_notifications.sql`, `server/src/routes/notifications.js`, `server/src/utils/notifications.js`.
- Updated: `server/src/index.js`, `server/scripts/migrate-inventory.js`, `server/tests/inventory.test.js`.

## Validation and activation

- **70 tests passed, 0 failed, 0 skipped** on the isolated PostgreSQL test database.
- Tested COD notification/unpaid preservation; verified online payment and duplicate webhook handling; actual saved cancellation request; verified failure and late-payment review alerts; expired checkout exclusion; unread counts; idempotent read timestamps; independent admin receipts; mark-all; API pagination validation; customer/no-token rejection; minimal payload; concurrent reconciliation deduplication; forced delivery failure followed by retry; and uncommitted/rolled-back notification invisibility.
- Existing inventory, order, rider-delivery, COD, mocked PayMongo, batch and historical-price regressions passed.
- ESLint and Vite production build passed.
- Migration applied successfully to the configured application database. Read-only verification confirmed the trigger is installed, the six existing orders remain, and no historical alerts/outbox events were generated (both zero).
- No emails, SMS, push integrations or third-party notification service were added.

## Limits

Browser interaction/keyboard automation, page-to-page bell persistence, logout/login UI interaction, polling timing, direct View Order clicks and mobile visual checks were not executed. Persistence/read behavior and authorization were tested through the real API/database. PayMongo events in tests are mocked. New events are captured from activation onward; existing historical orders are not backfilled.

The Node backend must reload/restart to register the new APIs and retry worker if it is not running in watch mode. Database event capture is already active after the migration.
