# Customer avatars and saved addresses

## Source inspection and necessary storage

The existing customer Profile and Addresses pages stored their data only in browser `localStorage` (`customerProfile` and `customerAddresses`). There was no customer profile/address table or server-side relationship for an admin on another device to query. Rider profile data is separate and was not reused incorrectly.

Added migration `010_customer_profile_addresses.sql`: two JSONB columns on the existing users table, `customer_profile` and `saved_addresses`, defaulting to empty objects/lists. This stores the existing form shapes against the authenticated customer without creating a duplicate address table. Migration applied successfully; no browser-only data was guessed, copied into unrelated accounts or automatically rewritten.

## Admin UI

- Circular avatar beside the table name and a larger avatar in Overview; initials appear for missing or failed images.
- Refresh on the list and drawer retrieves current profile/photo/address data. New uploaded photo URLs are unique, so subsequent changes do not reuse stale image URLs.
- Overview displays persisted profile name, email, phone, status, registration information, saved addresses and existing order statistics.
- Saved addresses are default-first, defensively deduplicated and explicitly labelled Default Address / Additional Saved Addresses. Supported recipient/contact/street/barangay/city/province/ZIP/label/landmark values are displayed only when present. Empty state is “No saved address.”
- Main customer list includes no saved addresses or phone details. Admin details responses omit address GPS coordinates and unrelated profile attributes.
- Purchase History, Account Activity, linked Orders drawer and historical order address snapshots remain unchanged.

## Existing customer forms reused

The existing Profile form, FileReader image picker, JPG/PNG limit (1 MB), address form, default/address editing and map-pin handling remain. Their Save actions now persist through authenticated APIs and show success only after the server responds. Images use the existing local/Supabase storage utility; local uploads are stored under unique filenames. Invalid image types/signatures/sizes are rejected.

Browser caches are now scoped to the signed-in account. Checkout loads the account's saved profile/addresses, keeps the same form fields and preserves any fields already edited while the request was pending. It still stores the final delivery information as an order-time snapshot; changing a saved address never updates existing orders.

Old global browser addresses remain untouched and are offered for explicit review/import by the signed-in customer. No automatic ownership assignment occurs. An old profile/photo is offered for review/save only where its email matches the signed-in account. Customers must use their original browser to review and save that browser-only information once; the server cannot remotely retrieve another browser's localStorage. Login email is preserved from the verified account, rather than changing account/order ownership through the old browser-only email field.

## APIs and access controls

Reused existing admin management/details/purchase-history APIs, JWT account-state/session-version guard, image URL resolver and storage helper.

Added:

- `GET /api/customer/account`: the authenticated customer's own profile and addresses.
- `PATCH /api/customer/account/profile`: own profile/photo save only; account email cannot be changed here.
- `PUT /api/customer/account/addresses`: own validated address list, distinct IDs/content, at most one default and bounded size/coordinates.

Admin customer list/details responses now include the photo URL; only authorized admin details include saved addresses. Customer-supplied IDs cannot change whose record is read/written. Admins have no new address-modification API. No public address endpoint was added. Passwords, tokens and payment credentials are never included.

## Files modified

- New `src/admin/CustomerAvatar.jsx`.
- `src/admin/AdminCustomers.jsx`, `src/admin/CustomerDetailsDrawer.jsx`.
- `src/components/Signup/User.jsx`, `src/components/Signup/Addresses.jsx`, `src/customer/sections/CheckoutSection.jsx`.
- `src/api/client.js`.
- New `server/src/routes/customer-account.js`, `server/src/db/migrations/010_customer_profile_addresses.sql`.
- `server/src/routes/customers.js`, `server/src/index.js`, `server/scripts/migrate-inventory.js`, `server/tests/inventory.test.js`.

## Executed validation

- **78 tests passed, 0 failed, 0 skipped** on isolated PostgreSQL.
- New integration coverage verifies a real PNG upload and served file, persisted avatar/profile name/phone, unchanged verified email, matching admin list/detail photo, saved-address persistence and default-first presentation, separate-customer isolation, empty address/photo responses, no street-address exposure in the list, customer/no-token/admin-write rejection, duplicate/default validation and invalid image rejection.
- Historical order address/name/contact snapshots were compared before/after saved-default changes and remained identical; purchase history totals still match.
- Existing registration completion/login, account disable/re-enable/session revocation, orders/payments, notifications, delivery, stock/batches/history and archive/restore regressions passed.
- ESLint, production build and whitespace checks passed. Test profile images and isolated schema are cleaned up by the suite.

## Remaining limits

Actual browser avatar/error-fallback rendering, legacy review clicks, photo form interaction and desktop/mobile screenshots were not executed. Avatar fallback behavior is implemented; empty-photo data and upload serving were tested through the real backend. Existing browser-only records require the customer review/save step described above. No production customer address or photo was imported/changed by this implementation.

Restart the backend if not in watch mode to load the new account routes and 2 MB profile-request parser, then refresh the app.
