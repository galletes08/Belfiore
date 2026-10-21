# Customer Management update

## Completed UI

- Replaced the oversized gradient banner with CUSTOMER ACCOUNTS / Customer Management and the requested subtitle. The notification bell stays aligned with the heading.
- Three compact real-data cards: Total Customers, New Customers (Last 30 Days), Active Accounts. Administrator/rider users are excluded. Latest Account was removed.
- Server-side name/email/ID search, active/disabled filters, inclusive Manila registration-date range, reset, newest creation date / ID sorting and 20-row pagination over all matching records.
- Compact table: customer/name ID, email, account status, date registered, total orders and View Details / More. No address/contact/password data in the list.
- Right-side Customer Details native-dialog drawer with Overview, Purchase History and Account Activity tabs; Escape/Close, keyboard tabs, focus containment/restoration, body-scroll lock and full-screen mobile width.
- Purchase History has order-ID search, status filter and pagination. View Order reuses the existing Orders drawer; Back to Customer Management restores customer/list scope and purchase-history filters/page.
- Separate native confirmation for Disable/Enable. Disable reasons follow the requested choices, with required description for Other. Success appears only after the confirmed backend response. Pending orders are identified as separate administrative work and are never automatically cancelled.

## Data and accounting

Customer/order association reuses the existing case-insensitive order email relationship. Orders do not currently have a customer-account FK; no identity links were fabricated or historical snapshots rewritten.

Overview uses persisted account information and counts each matching order once. Amount Spent is SUM of historical grand totals for Delivered + Paid orders only; cancelled, unpaid COD, Refunded and Refund Pending orders are excluded. This paid-customer metric is clearly labelled. Existing Reports/dashboard use gross Delivered totals, so they can differ when unpaid/refunded deliveries exist; those unrelated reporting calculations were preserved.

Account Activity shows the persisted registration timestamp plus newly recorded status administration events. Missing past profile/status transitions are not invented. Account status audit entries also appear in existing System Logs.

## Security and sessions

All management endpoints require an admin JWT. Responses explicitly select safe fields and never return passwords/hashes, tokens or payment credentials. Parameterized queries and ID/page/date/status/reason validation are used.

Status changes lock the customer row and commit its status, session version and audit event atomically. Repeated same-state requests do not create duplicate audit records or advance the session version. Password hashes and order/payment/inventory data are untouched.

A shared request guard rechecks customer account state and session version in PostgreSQL. Disabled customers lose access through existing JWTs. Disable/enable advances `auth_version`; re-enabling requires a new login rather than reactivating an old token. Existing sessions start at version zero and remain valid for unchanged active accounts. Public signed payment webhooks and internal processing still run so disabling an account does not corrupt pending payments or auto-cancel paid orders.

## APIs

Existing `GET /api/admin/customers` array response remains compatible with Reports.

- `GET /api/admin/customers/manage`: filtered paginated list, total and global summary.
- `GET /api/admin/customers/:id/details`: safe profile and order statistics.
- `GET /api/admin/customers/:id/orders`: paginated historical order summaries.
- `GET /api/admin/customers/:id/activity`: paginated actual account activity.
- Modified `PATCH /api/admin/customers/:id/status`: requires `confirmed:true`, valid status and disable reason/Other description; transactional audit and session revocation.

No customer account or audit delete endpoints were added.

## Migration and files

Applied `009_customer_account_activity.sql`: additive `users.auth_version` default zero, plus `customer_account_activity` table/index. No historical event backfill or account-state changes.

Modified:

- `src/admin/AdminCustomers.jsx` — redesigned list and account confirmation.
- New `src/admin/CustomerDetailsDrawer.jsx` — details, purchase history and activity.
- `src/admin/AdminOrders.jsx`, `src/admin/OrderDetailsDrawer.jsx` — return navigation and configurable return label.
- `src/api/client.js` — management reads and confirmed status payload.
- `server/src/routes/customers.js` — admin management APIs and audited status transitions.
- `server/src/utils/auth.js`, `server/src/index.js` — persisted account/session guard.
- `server/src/routes/auth.js` — login session-version claim; user-column introspection respects current schema so isolated tests and default public-schema installations both work.
- `server/src/routes/logs.js` — real account status audit events.
- `server/scripts/migrate-inventory.js`, migration 009, `server/tests/inventory.test.js`.

## Executed verification

- **77 tests passed, 0 failed, 0 skipped**, using explicit isolated PostgreSQL test database.
- Customer test covers role exclusions/counts, email/ID search, valid account filtering, paid-only spent totals, actual purchase/cancelled history, account-created record, no sensitive hash in responses, authentication/authorization rejection, reasons/confirmation validation, concurrent duplicate disable deduplication, blocked existing JWTs, login rejection while disabled, revoked old JWT after re-enable, new login session version, unchanged password hash and exact historical order snapshots, and System Logs audit entries.
- Additional assertions in that test cover verified registration completion, login after verification, 25-customer full-result pagination/newest-ID ties, inclusive Manila start/end day and disabled filtering.
- Existing checkout, COD, mocked PayMongo, notification, rider/courier, inventory, batch and archive/restore regressions passed with the new customer guard enabled.
- ESLint, production build and whitespace checks passed.
- Migration applied successfully to the configured application database. No existing customer was disabled/enabled by this implementation, no customer account was deleted, and no production orders/payments/inventory quantities were modified.

## Limits

Browser click/focus/return navigation and desktop/mobile screenshots were not executed. Registration verification completion and login were exercised through the real backend; actual registration email delivery was not sent or tested. Provider payment tests remain mocked. Partial refund accounting cannot be reconstructed beyond the stored payment status because no separate refund amount ledger is available. Existing current-email matching is preserved; missing historical account FK associations are not guessed.

Restart the backend if it is not in watch mode to load the new middleware/routes and login claim, then refresh the customer page.
