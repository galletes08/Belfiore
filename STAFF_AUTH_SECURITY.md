# Admin and Rider authentication security

**Recovery separation update:** [Rider Account Recovery](RIDER_ACCOUNT_RECOVERY.md) now supersedes Rider email recovery: new Riders use administrator-assigned usernames with optional contact emails; only administrators use email-based recovery. Riders are reset through verified, confirmed administrator actions and must change temporary credentials before workspace access.

**Current delivery state:** staff security-alert and password-recovery emails are disabled. The later [email preparation update](AUTH_EMAIL_PREPARATION.md) adds the fail-closed server switch and administrator feature activation. Its delivery settings supersede the original automatic-email description below; rate limits, logging, token security and account behavior remain in place.

## Implemented behavior

The existing Admin/Rider sign-in page and role routing are preserved. Staff sign-in now uses shared PostgreSQL-backed failure counters and IP request budgets. The page adds Show/Hide Password, generic errors, and Forgot Password. New green-and-white recovery pages provide password confirmation, passphrase guidance, loading/error/success states and invalid-link recovery.

Five failed attempts for a normalized staff email within 15 minutes temporarily restrict that subject for 15 minutes. Blocked requests cannot extend that incident. Successful login clears that account's applicable failure counter, while retaining independent IP protection and alert throttling. The same counter behavior and public failures apply to unknown emails and staff-workspace attempts using non-staff accounts. Whitespace/case normalization prevents simple capitalization bypasses.

A separate IP budget allows 30 staff sign-in requests per 15-minute window. Account and IP counters are locked transactionally, including concurrent failures and successful counter reset. A dummy bcrypt comparison and a 450ms minimum staff-response duration reduce simple timing differences; these are not a claim of perfect constant-time behavior. Restrictions expire on the next request without an administrator unlocking the account. There is no permanent lockout.

At the account threshold, active eligible staff receive one security alert at most per hour. The alert contains no password, reset token or automatic reset link. Entering an incorrect password never initiates password recovery. SMTP errors do not roll back authentication and are recorded as restricted security events.

## Recovery and password storage

`POST /api/auth/forgot-password` always responds:

> If an account is associated with this email, password reset instructions will be sent.

The response remains generic for unknown, customer, inactive, throttled or failed-mail cases. The endpoint allows 10 requests per IP per 15 minutes; eligible email subjects allow at most three sends in a window and a minimum 60-second resend interval. Recovery requests do not lock login. A newer permitted reset request invalidates previous outstanding links.

Tokens use 32 cryptographically random bytes. Only SHA-256 hashes are stored, with a 15-minute expiry. The reset link uses `/reset-password#token=...`; the fragment is not sent in HTTP URL/access logs. The page removes it from the address bar after reading it and applies a no-referrer policy. Neither application logging nor security audits include the reset token.

`POST /api/auth/reset-password` verifies the hash, expiry, staff role and active account on the backend. Row locks and a second validity check ensure only one concurrent use succeeds. All outstanding tokens for that account are consumed upon success. Passwords are hashed with bcrypt cost 12, the legacy password column is cleared, the account's failure restriction is reset, and `auth_version` is incremented. Existing Admin/Rider JWTs are then rejected by persisted-version checks on protected APIs. This does not change account roles or automatically sign the user in.

New staff reset/change passwords require 15–64 Unicode characters, at most 72 UTF-8 bytes to avoid bcrypt truncation. Spaces/passphrases are supported; a small predictable-password/repetition denylist is included. Existing passwords remain valid at sign-in. The existing customer login/registration workflow and password policy are preserved; this task does not claim to retrofit all customer authentication endpoints.

The existing authenticated staff password-change endpoint also applies the staff password policy, advances the session version and atomically consumes outstanding recovery links. No passwords are emailed.

Guidance consulted: [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), and [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html). This implementation does not claim full NIST certification or a comprehensive breached-password screening service.

## Modified files

- `server/src/db/migrations/011_staff_auth_security.sql`: additive security buckets, reset hashes and security audit tables; preserves existing users/roles/passwords.
- `server/scripts/migrate-inventory.js`: includes migration 011 in the existing transactional migration ledger.
- `server/src/utils/staffAuth.js`: transactional staff protection, secure recovery, email throttling and audit events, reusing existing Nodemailer/Resend infrastructure.
- `shared/staffPasswordPolicy.js`: shared staff reset/change validation, including bcrypt's byte limit.
- `server/src/routes/auth.js`: protects existing staff login, mounts recovery routes and applies staff password-change revocation.
- `server/src/utils/auth.js`: extends the existing persisted account/session checks to Admin and Rider JWTs. The existing middleware export/name remains compatible.
- `server/src/routes/logs.js`: reads authentication security events in existing admin-only System Logs; no secret values are returned.
- `src/admin/AdminLogs.jsx`: adds the Authentication Security filter.
- `src/admin/AdminLogin.jsx`: staff-workspace request, Show/Hide, Forgot Password and accessible error feedback.
- `src/admin/PasswordRecovery.jsx`: Forgot/Reset pages and client validation.
- `src/App.jsx`: public recovery routes.
- `src/api/client.js`: staff-workspace and password-recovery requests.
- `server/tests/staff-auth.test.js`: isolated PostgreSQL and local SMTP security tests.
- `server/tests/inventory.test.js`: applies migration 011, uses real role-correct admin/rider test identities for persisted authorization, and verifies System Logs security/privacy. Existing actor assertions reflect those corrected test identities.
- `STAFF_AUTH_SECURITY.md`: this report.

No packages were added. Existing Orders, Inventory, PayMongo, carrier and GPS workflows were not rewritten.

## Migration and deployment configuration

Migration **011_staff_auth_security** was applied with the existing migration runner and its ledger/table presence verified. It creates `auth_security_buckets`, `auth_password_resets` and `auth_security_events`, and ensures the existing `users.auth_version` column exists. It does not reset the database or update existing passwords/roles. Other deployments must run `npm --prefix server run migrate:inventory` before serving the updated code and restart/redeploy the backend as usual.

Reuse the existing `server/.env` email configuration, with no credentials placed in frontend files:

- SMTP: `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, optional `SMTP_SECURE`, and `EMAIL_FROM`/`SMTP_FROM`.
- Existing Resend alternative: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`.
- `FRONTEND_URL`: canonical application origin used in recovery links. Production links require HTTPS; localhost HTTP is allowed for development. Request Host headers are never used to build recovery links.
- `JWT_SECRET`: existing shared secret, also used to HMAC the email/IP bucket identifiers. Do not rotate it casually; rotation invalidates JWTs and changes rate-key derivation.

Current configuration presence checks passed for email, frontend URL and JWT secret, without printing their values. Production mailbox delivery was **not** attempted or claimed. SMTP tests used only a loopback mail sink with synthetic recipients and credentials.

API additions: `POST /api/auth/forgot-password {email}` and `POST /api/auth/reset-password {token,password}`. Existing `POST /api/auth/login` accepts `workspace:'staff'` from the staff form. Known staff are protected even if they omit/change that field or submit through another login page. Login success retains the existing `{token,user}` role response. Staff failure is generic 401; temporary/IP restriction is generic 429. No remaining-attempt count or account existence is returned. Protected middleware also denies disabled or revoked staff sessions.

Security audit records include backend timestamps, action, known user ID/role when appropriate, and HMAC subject/IP identifiers. They do not contain submitted emails, raw IPs, passwords, JWTs or reset tokens. System Logs expose the event action/role/ID to authorized administrators only. Relevant events include failure, restriction, suspicious repeated attempts, login success, recovery request/throttle/completion and mail acceptance/failure. SMTP acceptance is explicitly not proof of inbox delivery.

## Executed testing

Final full suite: **97 passed, 0 failed, 0 skipped**. Real PostgreSQL tests use random disposable schemas and the explicitly selected local test server. An explicit server-port assertion protects the standalone staff harness against accidentally connecting to another configured database.

Verified:

- Existing Admin/Rider role-correct successful login and failure-counter reset.
- Concurrent case/whitespace-normalized failures, fifth-attempt restriction, unchanged lock expiry on blocked hits, automatic cooldown recovery, and one throttled alert.
- Identical known/unknown login failures; IP limiting across changing email subjects and spoofed `X-Forwarded-For` headers.
- Generic recovery response for unknown/customer addresses; registered staff SMTP acceptance through a safe local mail server; resend throttling and no recovery token in security-alert mail.
- Hash-only reset storage, invalid password policy, expired/reused token rejection and two concurrent reset submissions with exactly one success.
- Bcrypt-only password update, preserved role, incremented session version, rejection of old Admin and Rider JWTs, successful new-password login and rejection of the old password.
- Authenticated staff password-change policy, session revocation and atomic invalidation of outstanding reset links; malformed token rejection.
- Mail failure remains generic and does not prevent valid login; security audit actions omit passwords, emails and raw IPs.
- Authentication events appear in existing System Logs; customer/rider access to those logs is denied.
- Existing customer, Orders, Inventory, Reports, Payments, harvest and notification regression tests pass.
- `npm run lint` and `npm run build` passed.

Browser/mobile interactions and actual production mailbox delivery were not executed. No available browser surface was present earlier in this session. Client role routing is preserved by implementation and backend role assertions; an end-to-end browser sign-in was not claimed.

## Security limitations and operations

- Account-wide temporary restrictions can still be deliberately triggered by someone who knows an email. Bounded expiry, non-extending blocked hits, IP limits and independent recovery reduce that risk; they do not replace MFA or upstream bot controls.
- Express retains its safe default of not trusting arbitrary forwarded-IP headers. Behind a reverse proxy, configure only the exact trusted proxy boundary in deployment; otherwise many users may share a single apparent proxy IP. No permissive proxy-trust setting was enabled.
- Email dispatch uses a short-lived in-process task so tokens are not stored as plaintext in a durable outbox and mail eligibility does not change API responses. A process restart can lose an unsent message; request a new link after the resend interval. Failures are auditable. There is no automatic retry queue containing reset tokens.
- JWT revocation is enforced for authenticated application APIs. Existing separately scoped driver-access links are a distinct legacy authorization mechanism; this task does not modify order records to revoke those links.
- Legacy password representations are read compatibly at sign-in; recovery writes only bcrypt and clears the legacy column. No mass password rewrite or forced reset was performed.
- The built-in predictable-password list is small. Comprehensive breached-password checks, MFA, distributed edge controls and a formal security audit remain outside this change.
- Security audit records are retained. Plan retention/maintenance for expired counter/reset rows as part of deployment operations; this task does not delete historical audit data.
