# Authentication email preparation

**Current Administrator implementation:** [Admin login security and recovery](ADMIN_AUTH_SECURITY.md) documents consecutive attempts, timed restrictions, durable incident alerts, disabled SMTP behavior and verified sole-Admin operator recovery. Older window-only Admin counter/email descriptions below are historical.

**Updated Rider policy:** [Administrator-controlled Rider security lockout](RIDER_SECURITY_LOCKOUT.md) replaces timed Rider unlock with manual administrator unlock. Admin cooldown protection and disabled email delivery remain in effect. Timed Rider restriction descriptions below are historical.

**Current recovery policy:** [Administrator/Rider recovery separation](RIDER_ACCOUNT_RECOVERY.md) makes password-reset emails Administrator-only. Rider recovery is administrator-assisted and requires no email. The disabled delivery switches described here remain unchanged.

Admin/Rider security email delivery is now **disabled by default and explicitly disabled in the local server environment**. Existing SMTP values do not enable it. The applied `012_auth_email_settings` migration initializes both feature switches to false. No official sender was selected, no recipient/credential was hardcoded, and no production email was sent.

## Current behavior

- Login protection remains PostgreSQL-backed: five failed attempts per normalized subject within 15 minutes, a bounded 15-minute restriction, independent IP limits, concurrent-request protection, cooldown recovery and audit logs.
- Optional email-settings reads are isolated with a database savepoint so an unavailable email-settings table cannot roll back an otherwise valid login restriction or security audit event.
- Security alerts are recorded as Email Disabled or Email Not Configured when delivery is unavailable. They are never recorded as accepted without an actual successful transport call.
- Forgot Password returns the same explicit unavailable message for all addresses when disabled or unconfigured. It does not claim a reset email was sent and does not generate/store new reset tokens in that mode. Request limits and security logging remain active.
- When enabled later, reset tokens still use secure random bytes, hash-only storage, 15-minute expiry, single use, bcrypt password updates and JWT session revocation. Already issued, unexpired links retain their normal validation; disabling future issuance does not silently rewrite those records.
- Email failures remain isolated from login. The existing staff accounts, roles, customer authentication, inventory, orders and payments are preserved.
- Existing customer verification/contact email flows are outside these **staff authentication** feature gates and were not changed.

## Future activation by authorized administrators

1. An authorized server administrator supplies the official sender and SMTP configuration through environment variables: `EMAIL_PROVIDER=smtp`, `EMAIL_FROM` or `SMTP_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and appropriate `SMTP_SECURE`. Set the canonical `FRONTEND_URL`, using HTTPS in production for reset links. Do not put credentials in frontend code or API requests.
2. Once the official configuration is approved, the server administrator explicitly sets `AUTH_EMAIL_DELIVERY_ENABLED=true` and restarts/redeploys the backend. It currently remains **false**.
3. An authenticated Admin can inspect `GET /api/admin/auth-email-settings`. This returns readiness, flags and missing configuration **names**, without credentials, addresses or passwords.
4. An authenticated Admin can enable either feature independently with `PATCH /api/admin/auth-email-settings` and JSON booleans:

   ```json
   {"suspiciousLoginAlerts": true, "passwordResetEmails": false}
   ```

   Both fields are required. Attempting activation before the server switch and required configuration are ready returns 409. Riders/customers receive 403; unauthenticated access is denied. Feature changes are audited and persisted in PostgreSQL. This backend API is provided for authorized administration; no additional settings UI was added.

5. Setting both booleans false disables both features. Setting the server master switch false disables delivery regardless of stored feature flags. Disabling is permitted even if SMTP configuration is incomplete.

The service rechecks readiness immediately before sending, so queued work cannot bypass a subsequent disable. Only actual SMTP acceptance produces Email Accepted; this is not a claim of inbox delivery. No dummy mail sender, success simulator or plaintext-token outbox was added.

## Modified files

- `server/src/utils/authEmail.js`: environment configuration/readiness and fail-closed notification service, reusing existing transport.
- `server/src/utils/staffAuth.js`: gated alert delivery/reset issuance, explicit unavailable response and admin-only settings APIs/auditing.
- `server/src/db/migrations/012_auth_email_settings.sql`: disabled-by-default persisted feature settings.
- `server/scripts/migrate-inventory.js`: migration registration.
- `server/.env.example`: disabled master switch and blank sender/SMTP placeholders.
- `server/.env` (ignored): explicitly sets only the non-secret master switch to false; existing secrets were not printed or replaced.
- `server/tests/staff-auth.test.js`: disabled/missing-SMTP cases, independent feature flags and permission checks; existing enabled delivery tests opt in only inside the isolated SMTP test environment.
- `server/tests/inventory.test.js`: applies migration 012 in the isolated regression schema.
- `STAFF_AUTH_SECURITY.md`, `AUTH_EMAIL_PREPARATION.md`: current state and activation instructions.

## Verification

- Migration 012 applied; current master flag, alert flag and reset-email flag verified false, with both readiness flags false.
- Full suite: **98 passed, 0 failed, 0 skipped**. Verified restrictions still operate with emails disabled, no SMTP messages/new reset tokens in disabled or missing-configuration cases, generic known/unknown responses, unauthorized activation denial, independent feature activation and disabled-state audit behavior. Existing enabled-path recovery/alert tests continue using a loopback SMTP sink with synthetic test accounts only.
- Existing authentication, account, inventory, orders, payments, reports and notification regressions passed.
- `npm run lint` passed. No frontend UI code was changed in this update.

Official sender authentication, production SMTP acceptance and actual inbox delivery remain untested because the official configuration has not been supplied. Browser settings interaction is not applicable because activation is currently through the secured backend endpoint or server deployment configuration. Existing security limitations are documented in `STAFF_AUTH_SECURITY.md`.
