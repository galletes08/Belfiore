# Checkout saved delivery addresses

Implemented October 18, 2026.

## Customer experience

- Checkout loads addresses from the authenticated customer's existing account. It selects an explicit default, or the sole address, and shows a compact address card.
- Customers can switch addresses, enter a one-time destination, explicitly edit an address, or complete missing required fields. Complete saved addresses do not require the full form again.
- Profile name, email and phone prefill personal details. Order-specific edits do not overwrite the profile.
- Saving for future orders and changing the default require explicit choices. Profile Addresses supports Home, Work and Other labels, editing, deletion and default selection.
- Shipping validation is debounced and stale responses are ignored. Submission waits for a current server quote. Existing Belfiore styling, COD, online checkout, batch pricing and delivery coordinates are retained.

## Files

| File | Change |
| --- | --- |
| `src/components/Pages/CheckoutPage.jsx` | Allows customers to enter addresses directly at checkout instead of redirecting based on browser cache. |
| `src/customer/sections/CheckoutSection.jsx` | Saved selection/card, contact prefill, missing-field repair, optional saving, live backend quote and submission protection. |
| `src/components/Signup/Addresses.jsx` | Uses owned, validated address mutations and preserves labels. |
| `shared/checkoutAddress.js` | Shared address mapping, selection and completeness helpers. |
| `server/src/routes/customer-account.js` | Owned address CRUD and checkout quote endpoint. |
| `server/src/routes/locations.js` | Reuses existing location datasets for server-side destination validation. |
| `server/src/utils/checkout.js` | Destination resolution, authoritative item prices and shipping quotes. |
| `server/src/routes/orders.js` | Immutable structured destination/contact snapshot and transactional retry receipts. |
| `src/admin/OrderDetailsDrawer.jsx` | Displays order-specific contact email while retaining order ownership email. |
| `server/src/db/migrations/017_checkout_receipts.sql` | Additive snapshot columns and retry receipts. |
| `server/scripts/migrate-inventory.js` | Registers migration 017. |
| `server/tests/checkout-address.test.js`, `server/tests/checkoutChecks.js` | Selection and API/database integration tests. |
| `server/tests/inventory.test.js`, `server/tests/staff-auth.test.js` | Include migration and checkout regression coverage. |

## APIs and security

Reused `GET /api/customer/account`, existing location endpoints, `POST /api/orders`, customer JWT authentication and `users.saved_addresses` JSONB. No duplicate address table was added.

New customer-only endpoints:

- `POST /api/customer/account/addresses`
- `PATCH /api/customer/account/addresses/:id`
- `DELETE /api/customer/account/addresses/:id`
- `POST /api/customer/account/checkout-quote`

Address IDs are resolved only within the authenticated customer's array. Mutations lock the customer row to avoid lost concurrent changes and deduplicate identical saves. The legacy bulk PUT remains for the existing reviewed browser-address import flow.

Checkout sends a structured destination, optional saved-address ID, current expected item prices and a retry key. Backend validation checks ownership and location relationships, uses actual product/batch prices and recalculates shipping before committing. Concurrent retries with the same customer/key/body return the original result; changed bodies with the same key are rejected. The browser keeps a payload hash and retry key in account-scoped session storage, without storing raw delivery/contact details there.

## Database and historical data

Migration 017 was applied to the configured database. It adds nullable `orders.contact_email` and `orders.delivery_address`, plus `checkout_requests` for transactional retry receipts. Existing records are not backfilled or rewritten. Existing `orders.location` and ownership email remain intact.

Before/after row counts and content digests matched for users, riders, orders, order items, harvest batches, inventory movements, rider locations, rider assignments and authentication security events. No operational test orders or address mutations were made in that database.

New orders store the actual delivery details independently of saved-address references. Later address edits/deletion cannot change historical orders or their delivery coordinates.

## Shipping

No prices or free-shipping thresholds changed. Quotes use the existing shared delivery configuration with actual database subtotals. Local fees and free shipping are confirmed by the backend. Courier destinations with an unconfirmed fee retain the existing unknown-fee behavior; online payment remains unavailable until the fee can be confirmed. Client-provided totals and shipping fees are not authoritative.

## Verification

- Checkout integration tests pass for owned CRUD, explicit defaults, concurrent duplicate saves, foreign-address rejection, location/ZIP/coordinate validation, destination changes, actual prices, free shipping and incorrect expected prices.
- COD and isolated online-payment tests verify final totals, one-order retries, immutable historical destinations, per-order contact email and unchanged customer profiles.
- Batch quotes use the selected harvest price; missing batch selections are rejected.
- Shared helper tests cover no address, sole address, multiple addresses, explicit defaults, missing fields and coordinate mapping.
- Full PostgreSQL/unit regression suite: **126 passed, 0 failed, 0 skipped** (`npm.cmd --prefix server run test:inventory` with an isolated test database). Frontend lint and production build passed. `git diff --check` passed.

## Remaining limitations

- Desktop/mobile visual interaction and physical-device GPS permission behavior require manual browser verification; they were not exercised in this environment.
- Online checkout tests use the existing isolated payment fixture, not a live payment charge.
- Philippine ZIP consistency checks use the existing city ZIP mapping. Other Philippine destinations require four digits; this is not a nationwide postal directory.
- The compatibility order payload remains supported. The new checkout sends the structured destination and uses the stricter location validation described above.
- A retry receipt protects normal retries/concurrent submissions. It does not provide a new payment-provider guarantee for an external session created immediately before a process or database failure.
