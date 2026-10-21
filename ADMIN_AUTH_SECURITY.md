# Administrator authentication and recovery

Implemented October 18, 2026. The existing Administrator identity, registered email, password, role, account status and sessions were preserved while applying the additive migration. No production login failures, password reset requests or offline reset links were generated for testing.

## Administrator protection

- Default policy: **5 consecutive failures**, then a **15-minute temporary restriction**. State lives in PostgreSQL and survives browser refreshes, other devices and backend restarts. Successful authentication clears applicable account failures. Unlike the former window-only counter, unsuccessful attempts remain consecutive across idle windows until success or restriction expiry.
- Row locks serialize simultaneous attempts. Additional blocked attempts do not extend the restriction or create new lockout incidents. The next login safely clears an expired restriction and records its expiry once. Failed logins never disable or delete the sole Administrator.
- Default additional source protection remains 30 requests per 15 minutes. Response padding progresses from 450 ms in bounded steps, default 100 ms per failure capped at 1000 ms. Source restrictions are not erased by password recovery.
- Invalid credentials show **Invalid email or password.** Administrator restrictions show **Too many unsuccessful sign-in attempts. Please try again later or use Forgot Password.** Unknown email addresses follow matching generic responses and temporary subject restrictions.
- `loginContext` selects only public entry-point wording. Persisted account role always determines policy, permissions and destination; this hint cannot bypass a restriction or choose a role. Unknown email restrictions cannot be made permanent by selecting the Rider wording.
- Rider accounts retain their separate consecutive-failure security flag, no timed unlock, verified administrator Unlock Account and administrator-managed password reset. No Rider registration/email requirement was added. Existing assignments and GPS remain intact.

## Alert emails

The registered Administrator email is resolved from the trusted `users` record when sending, never taken from a submitted destination. Each new restriction has a unique incident UUID and at most one durable alert job. The subject and body match the requested Belfiore Administrator security notice.

`auth_admin_alert_queue` persists only account/incident IDs, HMAC-protected subject/source identifiers, state and timestamps. It stores no password, reset token, JWT or SMTP secret. Enqueueing occurs in a savepoint so unavailable mail settings or queue infrastructure cannot roll back login protection. Sending happens after commit; a startup/30-second sweep resumes queued work. Multiple workers claim jobs atomically with row locking.

There is one SMTP submission attempt per incident, with a stable Message-ID. Successfully accepted SMTP submissions are logged **Security Alert Sent**, with a result explicitly saying inbox delivery is not asserted. Failures or ambiguous outcomes are recorded for operator review and are never automatically replayed. An in-flight job abandoned for 20 minutes is marked failed rather than risk duplicate mail. Queued work that could not be claimed because the database was temporarily unavailable remains queued for a later sweep. This prioritizes the requested no-duplicate/no-spam behavior over automatic retries after uncertain SMTP acceptance.

Disabled/unconfigured delivery records **Security Alert Unavailable**, never Sent. Enabling email later does not backfill old unavailable incidents or silently resend failed jobs. A separate new incident can generate its own alert, including within an hour of the prior incident.

## Configuration and activation

Actual staff email delivery remains **disabled**. No official sender was chosen, no credentials were hardcoded and no live Belfiore email delivery was tested or claimed.

Use the existing server environment configuration:

| Variable | Purpose |
| --- | --- |
| `AUTH_EMAIL_DELIVERY_ENABLED` | Fail-closed master switch; keep `false` until official configuration is approved. |
| `EMAIL_PROVIDER=smtp` | Required for staff authentication mail. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Official SMTP endpoint/TLS configuration. |
| `SMTP_USER`, `SMTP_PASSWORD` | SMTP credentials; secrets stay on the backend. The authentication transport preserves the secret exactly. |
| `AUTH_EMAIL_SENDER_NAME`, `AUTH_EMAIL_SENDER_ADDRESS` | Official sender identity. Existing `EMAIL_FROM`/`SMTP_FROM` remains a compatible fallback. |
| `PUBLIC_APP_URL` | Public HTTPS origin for reset links; existing `FRONTEND_URL` remains a fallback. Local HTTP is permitted only for localhost/127.0.0.1 development. |
| `AUTH_MAX_FAILED_ATTEMPTS`, `AUTH_RESTRICTION_MINUTES` | Existing protection defaults, 5 and 15. |
| `AUTH_LOGIN_IP_LIMIT`, `AUTH_ATTEMPT_WINDOW_MINUTES` | Existing independent source budget/window, defaults 30 and 15. |
| `AUTH_LOGIN_DELAY_STEP_MS`, `AUTH_LOGIN_MAX_DELAY_MS` | Bounded progressive response padding, defaults 100 and 1000. |

After the official sender/SMTP/public URL is provided and verified in a controlled email environment, the authorized server operator can enable the master switch. An authenticated Administrator then activates the desired existing feature flags through `PATCH /api/admin/auth-email-settings` using `suspiciousLoginAlerts` and `passwordResetEmails`. The backend rejects activation when required configuration or the master switch is unavailable. Public APIs do not expose SMTP diagnostics or secrets. The general customer/contact email service was not changed.

## Forgot Password and Reset Password

- The existing Forgot Password link remains. Recovery is Administrator-only; unknown emails and Rider/customer emails receive the same generic public response.
- When ready, a cryptographically random 256-bit token is generated. Only its SHA-256 hash is stored, it expires after 15 minutes, prior unused links are invalidated and only one concurrent use can succeed.
- Requests have independent source and per-email budgets, a resend cooldown, and truthful generic responses. When delivery is unavailable, no email token is issued and the UI shows an amber unavailable notice directing the Administrator to the authorized system operator. It never claims an email was sent.
- Raw email reset tokens exist only in short-lived memory and the recipient's reset link; they are not placed in the durable alert queue or logs. Failed/reset email transport is logged without revealing details publicly. A resend issues a new token and invalidates older unused links; reset mail is not replayed after a process crash.
- The existing green-and-white reset page retains password confirmation, show/hide, policy guidance, loading/errors, expired/reused-link rejection and fragment-token/referrer protection. A successful reset confirms success, then redirects to Administrator sign-in after 2.5 seconds.
- Reset writes a secure bcrypt hash, clears the old plaintext field, consumes outstanding tokens, increments `auth_version` to revoke previous sessions, and clears only applicable Administrator account restrictions. It never changes the registered email, role or separate Rider lock state.

## Sole-Administrator recovery when SMTP is unavailable

This is a trusted **host/database operator** procedure, not a public API or a replacement for ownership verification.

1. Verify the existing Administrator's ownership using the organization's approved independent procedure and an internal case/reference. Possession of a typed email alone is not verification. Do not put identity document numbers or credentials in the reference/reason.
2. On the authorized server, use a private interactive terminal with no recording, transcript, shared screen, output redirection or untrusted session. Host access, database credentials and the application environment must remain restricted to authorized operators.
3. Confirm `PUBLIC_APP_URL` is the correct public HTTPS Belfiore origin. Keep staff email disabled if SMTP has not been approved.
4. From the project root, run `node server/scripts/admin-recovery.js --issue-reset-link`. The tool refuses non-interactive/redirected output. Enter the verified existing Administrator email, internal reference, recovery reason, and the exact prompted confirmation.
5. The tool selects only an existing Active Administrator. It cannot create an account, elevate a Rider/customer, enable a Disabled account or change credentials/email directly. It records **Admin Offline Recovery Authorized** and displays a sensitive single-use 15-minute reset link once after commit. Only a hash is saved in PostgreSQL.
6. Hand the link only to the verified Administrator through the approved secure channel. Do not paste it into logs, tickets or source files. The Administrator chooses a new password through the normal reset page. The normal token validation, session revocation and security audit apply.
7. Review the recovery completion event, sign in with the new credential and investigate suspicious attempts. Source throttles can remain active independently. Never bypass verification or create another public Administrator account to recover access.

Identity/ownership verification and the secure handoff are the authorized operator's responsibility. The application records an attestation/reference; it does not claim to perform identity verification automatically. This procedure was tested only with isolated fixtures, not the production Administrator.

## APIs, audit and database

Existing routes are reused: `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, and protected `GET/PATCH /api/admin/auth-email-settings`. Forgot Password now also returns a global `deliveryAvailable` boolean to style truthful unavailable notices; it does not indicate account existence. No public offline-recovery or registration endpoint was added.

Existing System Logs search, Authentication Security filter and CSV export display the new events without changing old records:

- Admin Login Restriction Activated / Expired.
- Security Alert Queued / Sent / Failed / Unavailable.
- Admin Password Reset Requested / Completed.
- Admin Offline Recovery Authorized.
- Existing Login Successful, Login Failed, source restrictions, reset-mail status and Rider security events.

New events retain backend timestamps, account identifiers, safe result/incident metadata and appropriate actor context. Passwords, reset tokens, JWTs and SMTP secrets are excluded. Historical event names remain unchanged; new Administrator reset events use the requested Admin-specific labels instead of duplicate generic completion records. System Logs displays result metadata and Philippine Time.

Migration **016_admin_auth_security.sql** has been applied through the existing migration ledger. It adds `users.admin_failed_attempts`, `admin_restricted_until`, `admin_lock_incident` and the durable alert queue/index. Existing account fields, password/email/role/status, Rider security state, orders, assignments, GPS, logs, failure budgets, reset tokens and email flags matched before/after database digests. The new production alert queue was empty after migration. No database reset or operational data rewrite occurred.

## Modified files

- `server/src/utils/staffAuth.js` — Administrator counters/expiry, progressive delays, incident alert enqueueing, generic responses and reset auditing/cleanup.
- `server/src/utils/authPolicy.js` — bounded delay configuration.
- `server/src/utils/adminAlertQueue.js` — durable single-submission alert worker and audit.
- `server/src/utils/authEmail.js`, `server/src/utils/authSmtp.js` — fail-closed authentication-only SMTP configuration, sender and public URL handling.
- `server/src/utils/offlineAdminRecovery.js`, `server/scripts/admin-recovery.js` — verified host-operator recovery utility and interactive guard.
- `server/src/db/migrations/016_admin_auth_security.sql`, `server/scripts/migrate-inventory.js` — additive schema migration.
- `server/src/index.js` — startup/periodic authentication-alert sweep.
- `server/src/routes/logs.js`, `src/admin/AdminLogs.jsx` — safe result display and PHT timestamps; existing filtering/export retained.
- `src/admin/PasswordRecovery.jsx` — truthful unavailable styling and successful-reset redirect.
- `src/admin/AdminLogin.jsx`, `src/api/client.js` — entry-point wording hint, independent of authorization.
- `server/.env.example` — new configuration placeholders and delay defaults; no official credentials added.
- `server/tests/adminSecurityChecks.js`, `server/tests/staff-auth.test.js`, `server/tests/inventory.test.js` — security tests, mocked/local SMTP and migration fixtures.
- `ADMIN_AUTH_SECURITY.md` and linked earlier authentication reports — current behavior and recovery procedure.

## Testing

Final results: **121 tests passed, 0 failed, 0 skipped** using `npm --prefix server run test:inventory` with the explicit isolated test database. `npm run lint` and `npm run build` passed. Read-only checks against the configured database confirmed authenticated email-status/System Logs access, unauthorized denial, and disabled staff email/alerts/recovery delivery. The recovery CLI correctly refused non-interactive execution without issuing a real link.

Tests use isolated PostgreSQL schemas with synthetic accounts, a local SMTP fixture, and explicitly injected mocked transports. No real Administrator failure/lockout, recovery token or password change was performed. Production email delivery remains disabled; successful local SMTP acceptance is not a claim of live sender/inbox delivery.

| Required case | Evidence |
| --- | --- |
| AUTH-001 / 002 | Valid Admin login, generic invalid credentials, role routing. |
| AUTH-003 / 004 | Five consecutive failures, shared persisted state, parallel attempts and correct-password restriction rejection. |
| AUTH-005 | Expiry safely restores login and records one expiry event under concurrent requests. |
| AUTH-006 / 007 | Exact alert notice, trusted database recipient, one job/submission per incident, new incidents, concurrent workers, SMTP failure isolation and ambiguous-send non-replay. |
| AUTH-008 / 009 | Generic/rate-limited Forgot Password, local SMTP reset link, disabled/unconfigured delivery truthfulness and no token issuance. |
| AUTH-010 / 011 | Invalid/expired token rejection and single-use concurrency. |
| AUTH-012 / 013 | Secure password update, unchanged email/account identity, account-counter cleanup and old-session revocation. |
| AUTH-014 | Events/results in existing private System Logs; no credentials/tokens in audit. |
| AUTH-015 | Persistent Rider lock, no automatic unlock, verified administrator unlock, reset separation, unchanged orders/GPS. |
| AUTH-016 | Backend role/authorization checks, no public privileged account creation/recovery endpoint, offline non-interactive refusal and generic entry-point responses. |

Browser/mobile interaction, physical GPS and live official SMTP/inbox delivery were not executed. Responsive existing UI patterns were retained and production compilation was checked. Mail failures that occur after ambiguous SMTP acceptance intentionally require operator review rather than automatic resend.
