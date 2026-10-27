# Belfiore customer account redesign

## Scope and reference

Implemented the supplied text specification using existing account components and APIs. The attachment folder contained only `Pasted text.txt`; no desktop/mobile mockup image was available, so pixel-for-pixel reference matching is not verified.

## Changes and files

- `src/components/Signup/AccountSidebar.jsx`: flat icon navigation (Dashboard, My Purchases, My Profile, My Addresses, Change Password, Logout), separated Logout, dark-green active state, content-height desktop panel and collapsed mobile menu with Escape/focus handling. No nested account submenu or Bank & Cards entry.
- `src/components/Signup/UserDashboard.jsx`: live customer orders and profile loaded independently; actual saved name, three summary cards, latest-order snapshot, direct order-details link, applicable delivery link, account information and quick links. Error states do not invent zero counts.
- `src/utils/customerDashboard.js`: de-duplicates order IDs, derives latest order by recorded creation date, excludes cancelled/completed records from transit, and does not count merely packed orders as in transit.
- `src/components/Signup/Order.jsx`: retained compact expandable cards, invoice, exceptions, payment/COD information and genuine tracking. Dashboard `orderId` links open that customer's matching details. No financial or tracking records changed.
- `src/components/Signup/User.jsx`: consistent 230px layout, profile heading, compact two-column form, existing preview/upload API, duplicate-save guard, file-reading error state, and no saving before existing account data has loaded. Frontend JPG/PNG and 1 MB validation remains; existing backend MIME/signature/size validation is reused.
- `src/components/Signup/Addresses.jsx`: consistent 230px account layout, compact cards, default address displayed first without mutating saved order, and practical action touch targets. Existing add/edit/remove/default, checkout preference and order-address snapshots are unchanged.
- `src/components/Signup/AccountSettings.jsx`: compact password form, three independent show/hide controls, autocomplete attributes, mismatch/current-equals-new checks, duplicate-submit guard and accessible success/error feedback. Existing password-update API/hash/session behavior remains.
- `src/App.jsx`: unsupported `/banks-cards` entry redirects to Dashboard. No payment tables, transactions, checkout methods or provider integrations removed.
- `server/src/routes/auth.js` and new `server/src/utils/customerPasswordLimit.js`: customer password-change attempts are limited to 10 per 15 minutes per authenticated customer. Atomic PostgreSQL upsert uses the existing `auth_security_buckets` table; concurrent requests cannot bypass the budget. Admin/Rider login, recovery and password-change branches are unchanged.
- `server/tests/customer-account-ui.test.js`: dashboard metric and real component rendering regressions.
- `server/tests/staff-auth.test.js`: dedicated isolated customer password-change tests added to the existing auth fixture.
- This report.

Reused: AccountSidebar, customer profile/address API, order lookup API, compact My Purchases rendering, TrackingMap, invoice utility, password-change API, and the existing image storage integration. Shared Navbar, mobile drawer, ticker and cart implementation were not redesigned in this task.

## Backend/database impact

No migration, new table, role change, account creation, production password update or database reset. Only the customer password-change endpoint gains an authenticated rate limit; it records attempt budgets in existing auth storage. Customer session invalidation follows the pre-existing implementation; this task does not introduce blanket session revocation. Admin/Rider security stays intact.

## Actual verification

- Inventory/order/profile/address integrations: **95 passed**, zero failed/skipped. Includes owned/private account data, saved address CRUD/default behavior, historical order snapshots, checkout prices/reservations, invoice/report flows and rider integrations.
- Authentication integrations: **39 passed**, zero failed/skipped. Includes role separation, Admin timed restrictions, Rider manual unlock, customer current-password verification, replacement hashing, password-attempt budget/expiry and unchanged staff counters.
- Account rendering/metrics and order-display/cart/address unit tests: **13 passed**, zero failed/skipped. Includes all five active account destinations, collapsed navigation defaults, absent Bank & Cards entry, secure password fields/reveal controls, de-duplicated dashboard statistics and unchanged cart identities.
- **147 total tests passed**, zero failed or skipped in those final runs.
- Targeted ESLint and whitespace checks passed.
- Final production frontend build passed.

Database integrations ran against disposable schemas in a dedicated local test cluster on port 55433 with dedicated test accounts and isolated SMTP; the application database and live customers were not changed.

## Remaining limits

No actual browser viewport or touch walkthrough was run at 320/360/375/390/425/768/1024/1440px. Server-rendered component checks verify markup, not visual clipping, live accordion clicks, native show/hide interaction, FileReader previews or Leaflet sizing in a browser. These remain manual browser acceptance checks. No real payment, courier sync or GPS device session was initiated. Recorded rider pins are not a fabricated travel history; delivered orders keep the existing recorded-location view and carrier history where available.
