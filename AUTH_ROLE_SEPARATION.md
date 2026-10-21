# Authentication role separation

## Root cause

`/api/auth/login` called the staff authentication handler before the legacy customer handler. The staff handler accepted valid Admin/Rider credentials regardless of the login portal; only known customers bypassed it. Customer Login then stored the returned staff JWT under `customerToken` and set customer login flags without validating the returned role. The fallback customer handler also lacked an explicit customer-only role condition.

Storage keys were already separate (`adminToken`, `riderToken`, `customerToken`); this was a wrong-role token being written into customer storage, not a shared-cookie issue. Customer profile/address APIs already enforced customer role. The investigation does not establish that staff credentials exposed another customer's private profile.

A read-only aggregate check of the configured application database found zero duplicate normalized email groups, zero duplicate normalized username groups, and zero unsupported/null roles. No account identifiers or credentials were printed or modified. This check does not determine whether a particular real person's role assignment is organizationally correct.

## Changes

- One existing login security handler now handles both portals. Missing/non-staff workspace selects customer-only authentication; explicit `workspace: staff` permits only persisted Admin/Rider roles. Browser-supplied roles never change the account role. The unprotected legacy customer login fallback was removed.
- Wrong-portal attempts return generic 401 responses without tokens or identity details. They consume the existing source/IP rate limit and generate `Login Portal Rejected` audit events; they do not increment or reset account password-failure budgets or unlock accounts.
- Existing Admin five-failure/15-minute and Rider five-failure/manual-unlock policies remain in the same handler. Customer password failures now use its bounded configurable temporary restriction and source limits too. Registration still activates customers only through the existing verification flow.
- Order creation requires a customer JWT before inventory processing, including the older payload path without a checkout request ID. Existing profile, saved-address/quote, order ownership, Admin and Rider API role guards remain enforced independently of the UI. Public product browsing remains public. There is no separate server cart API; customer cart/session scoping remains in the existing client implementation.
- Customer API token lookup rejects expired, malformed or non-customer tokens and clears incompatible customer flags/name/email. It does not remove independent staff sessions. Customer Login validates the response role before storing it, and the customer route guard requires an explicit customer role. JWT decoding in the UI is only a presentation/session safeguard; server signature, account-state/version and endpoint role checks remain authoritative.

## Files

- `server/src/routes/auth.js`
- `server/src/utils/staffAuth.js`
- `server/src/routes/orders.js`
- `src/api/client.js`
- `src/components/Signup/Login.jsx`
- `src/components/Signup/CustomerProtectedRoute.jsx`
- `server/tests/staff-auth.test.js` (mount real protected routes; include existing profile/address migration in isolated fixture)
- `server/tests/roleSeparationChecks.js`
- `server/tests/auth-role-ui.test.js`
- `server/tests/inventory.test.js` (expect generic 401 for disabled-account login; existing token denial remains 403)
- This report.

## Validation and limits

Final results: 38/38 authentication/security tests, 95/95 inventory/order integration tests, and 3/3 customer session/checkout-address/cart tests passed (136 total; zero failures or skips). Production frontend build, targeted ESLint and whitespace checks passed. Initial test harness errors (GET request bodies and a missing existing address-schema migration) were corrected; the final suites were rerun successfully. The disabled-customer login assertion now expects the intentionally generic 401 instead of the previous identifying 403 response.

Tests use a dedicated local PostgreSQL cluster on port 55432 and disposable schemas/accounts, not the application's database or sole Administrator. Role checks cover correct/wrong portals, forged role fields, no token on rejection, unchanged failure budgets, audit events, private profile/address/quote access, Admin APIs, Rider deliveries/GPS, and existing Authorization headers at login. Storage tests cover clean browser state, cached staff/expired/malformed customer tokens, independent staff-session preservation and invalid login responses. Existing integration tests cover customer checkout, orders, inventory, reservations and history.

Actual browser Incognito/manual mobile navigation was not exercised; clean/existing-session behavior is automated at API and storage level. Existing localStorage bearer tokens remain subject to the application's existing browser/XSS security model; this change does not migrate sessions to HttpOnly cookies. Existing legitimate staff sessions remain valid only for their allowed APIs; no global account/session reset is performed. Email-delivery configuration is unchanged.
