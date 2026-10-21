# Customer registration, verification and saved checkout addresses

Implemented October 18, 2026.

## Behavior

Registration retains First Name, Last Name, Email, Password and Confirm Password, with the existing green-and-white two-column design. No delivery address, phone, marketing consent or public staff registration was added.

The existing `pending_registrations` table stages unverified registrations. A usable `users` customer account is created only when the verification token is consumed. This deliberately reuses the existing staging design instead of adding incomplete users or duplicating account storage. Pending registrations receive no login token and cannot access customer addresses or checkout. Existing customer accounts remain usable without retroactive verification or password changes.

The form now includes field-level errors, password guidance, show/hide buttons, accessible labels, submission loading and an immediate duplicate-submit guard. Pending/resend pages explain delivery availability truthfully. Login and signup link to verification recovery. Passwords are never trimmed, lowercased, returned or logged.

As confirmed by the project owner, approved Terms and Privacy content is not yet available. The linked pages clearly say **not yet published**. They do not invent legal commitments or collect an unsupported consent acknowledgement. Approved content remains a launch prerequisite for those pages.

## Validation and security

- Names: strings, trimmed, 1–100 characters.
- Email: required valid basic format, maximum 254 characters, trimmed and lowercased consistently.
- Password: minimum 15 Unicode code points; maximum 72 UTF-8 bytes to avoid bcrypt truncation; local common/predictable-password checks. No mandatory character composition rules. Confirmation must match exactly on both frontend and backend.
- New registration passwords use existing bcrypt, cost 12. Current account passwords are preserved.
- Guidance follows the length and blocklist direction in [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/). The included local denylist is limited, not a full compromised-password corpus or a claim of complete NIST compliance.
- Public registration whitelists fields and always creates role `customer`; submitted privileged roles/statuses are ignored.
- Tokens use 32 random bytes; only SHA-256 hashes persist. Expiry is configurable. Atomic deletion and customer creation in one transaction prevent reuse/concurrent verification.
- A new resend invalidates the prior token. A valid pending registration's credentials are not replaced by someone resubmitting the same email. After expiry, a new registration may replace the expired draft.
- New links put the token in the URL fragment. The verification page removes it from the URL and sends it in a POST body. GET verification remains only for existing links; deployment access logs should redact token query parameters on legacy URLs.
- Resend uses a persisted per-email cooldown. Registration/resend share a persisted source limit of 30 requests/hour, including invalid requests. Verification is limited to 120/hour. Source keys are HMACs, not raw IP addresses. Reverse-proxy trust must match the deployment; forwarded headers do not grant an automatic bypass.
- Eligible, existing and unknown emails get the same normal pending response. Transport failures explicitly report an inability to submit email and never activate an account.

## Email configuration

Actual email delivery remains disabled. Both the master and customer-specific flags were verified false after migration. No real customer email was sent during implementation.

To enable after the official sender is approved, configure environment variables securely:

```dotenv
AUTH_EMAIL_DELIVERY_ENABLED=true
CUSTOMER_VERIFICATION_EMAIL_ENABLED=true
EMAIL_PROVIDER=smtp
SMTP_HOST=<official SMTP host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<SMTP username>
SMTP_PASSWORD=<SMTP credential>
AUTH_EMAIL_SENDER_ADDRESS=<approved sender address>
PUBLIC_APP_URL=https://<official storefront host>
CUSTOMER_VERIFICATION_TTL_MINUTES=30
CUSTOMER_VERIFICATION_RESEND_SECONDS=60
```

Use port/security settings required by the actual provider. Existing `EMAIL_FROM` or `SMTP_FROM` may supply the sender instead. Credentials must not be committed. Restart the backend after configuration changes. Customer verification does not enable administrator alert/reset feature settings.

Without configuration, registration returns an explicit unavailable-delivery message, retains a pending hashed registration, and does not claim an email was sent. Customers can resend once service is configured. There is no production or development auto-activation switch or raw-token API.

For development, use a separate test database, a local SMTP capture service with sandbox credentials, `NODE_ENV=development`, and `PUBLIC_APP_URL=http://localhost:5173`. Explicitly enable the two flags only in that local test environment. Inspect the captured message and use its link. Never use real customer recipients for smoke tests. The automated suite supplies its own isolated SMTP server and schemas; it never sends to the internet or uses the operational database for registration tests.

## Saved addresses and shipping

The previously implemented customer address CRUD, Home/Work/Other labels, owned access, default selection, compact checkout address card, missing-field repair, optional saving, profile contact prefill, immutable order snapshots and keyed order retries are reused. No duplicate address store or new registration address fields were introduced.

Existing server rules remain authoritative: free local delivery at subtotal **PHP 2,000 or more**, only for eligible local destinations. Courier fees retain their existing confirmation rules. Storefront messages now match this existing policy; the policy itself did not change. Cart uses the shared threshold and no longer adds an arbitrary PHP 120 before knowing the destination. It displays an items-only estimated total and confirms shipping at checkout. Address changes trigger the existing server quote, with final backend price/fee validation.

## Files and APIs

| Files | Change |
| --- | --- |
| `shared/customerRegistration.js` | Shared field/password validation and guidance. |
| `server/src/routes/customer-registration.js` | Pending registration, resend, atomic verification, cooldown and source limits. |
| `server/src/routes/auth.js` | Mounts the new registration router; preserves existing login/staff authentication. Removes the old pending-row check that could block an already existing customer. |
| `server/src/db/migrations/018_customer_verification.sql` | Adds pending `last_attempt_at` and hashed source rate-limit buckets. |
| `server/scripts/migrate-inventory.js` | Registers migration 018. |
| `server/.env.example` | Disabled-by-default verification settings. |
| `src/components/Signup/Signup.jsx` | Five-field registration validation/UI. |
| `src/components/Signup/VerificationPending.jsx` | Pending state and resend/cooldown form. |
| `src/components/Signup/VerifyEmail.jsx` | Fragment token handling, POST verification and expired-link recovery. |
| `src/components/Signup/Login.jsx` | Verification recovery link, removes obsolete sent-email claim. |
| `src/components/Signup/PolicyPage.jsx`, `src/App.jsx` | Pending and unpublished-policy routes. |
| `src/api/client.js` | Field errors, POST verification and resend API. |
| `src/components/CartSidebar.jsx` | Shared threshold and honest destination-unconfirmed estimate. |
| `src/components/Navbar.jsx`, `src/components/NewVisitorSignup.jsx`, `src/customer/CustomerHome.jsx`, `src/customer/layout/CustomerLayout.jsx` | Accurate eligible-local-delivery promotion. |
| `server/tests/customerRegistrationChecks.js`, `server/tests/customer-registration.test.js` | Registration, SMTP fixture, password and verification cases. |
| `server/tests/staff-auth.test.js`, `server/tests/inventory.test.js`, `server/tests/checkoutChecks.js` | Migration setup, generated-token fixture and exact shipping threshold checks. |

API changes:

- `POST /api/auth/register`: requires `confirmPassword`; returns generic pending/delivery-availability information, not an authenticated session.
- `POST /api/auth/resend-verification`: accepts email; generic pending response and cooldown.
- `POST /api/auth/verify-email`: consumes token from body; no automatic login. Legacy GET endpoint retained.
- Existing saved-address, shipping quote, orders, payments and rider endpoints unchanged.

Migration 018 was applied to the configured database. Before/after row counts and content digests matched across all 28 existing tables (excluding the newly added nullable field from the comparison). No users, passwords, pending credentials, orders, addresses, inventory or tracking records were overwritten or deleted.

## Testing and limits

Automated tests exercise REG-001–010, validation, mass-assignment rejection, email normalization, disabled delivery, isolated SMTP acceptance/failure, cooldown, invalidated/expired/reused tokens, concurrent verification, generic duplicates, login after verification and persisted request limits. Existing address and checkout integration tests exercise ownership, CRUD/defaults, profile independence, shipping changes, PHP 1,999/2,000 boundaries, COD/online fixture checkout, retries and historical address preservation.

Final full regression suite: **132 passed, 0 failed, 0 skipped**. Frontend lint and production build passed; the password-policy unit test was also rerun after final validation edits. SMTP tests verify only the isolated server; **official sender delivery and inbox arrival have not been tested**. Desktop/mobile visual interaction, actual GPS permissions and live payment charges remain manual checks. Local password screening is limited; existing ZIP coverage limitations remain documented in `CHECKOUT_SAVED_ADDRESSES.md`. The rate-limit table stores one bucket per source/action; production operations should establish retention for expired buckets and pending drafts without deleting active customer/history data.
