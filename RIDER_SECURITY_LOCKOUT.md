# Administrator-controlled Rider security lockout

**Administrator policy update:** [Admin authentication security](ADMIN_AUTH_SECURITY.md) adds separate temporary Admin counters, alert queue and recovery. The shared login now uses entry-point wording without changing role-based policy; Rider manual unlock remains in force.

Implemented October 18, 2026. This replaces the Rider's timed account restriction with a persistent administrator-controlled lock. Administrator login protection retains its configured threshold, time window, cooldown, recovery and IP restrictions. The shared public restriction message was standardized to avoid exposing different account roles or existence through the error text.

## Rules

- `AUTH_MAX_FAILED_ATTEMPTS` remains configurable with a default of **5**. A Rider's consecutive failures are persisted on the linked `users` record, not in a browser or process memory. They do not expire when the 15-minute source/Admin window expires.
- Attempts 1–4 return the same generic invalid-credentials error. A valid successful login before lock clears the consecutive counter.
- The fifth failure sets a separate security flag and a backend timestamp. Correct credentials, a fresh browser/device, elapsed time, username/contact profile edits, Enable Account and Reset Password cannot remove it.
- Login returns: **Your account is temporarily restricted for security reasons. Please contact your administrator for assistance.** No public response includes failure counts, lock timestamps, role or account-existence markers. Unknown identifiers receive matching restricted responses after repeated failures, including after their ordinary bucket expires, using an opaque hashed shadow restriction.
- Existing live account failure budgets from the prior implementation are retained on the next processed login. An expired old window is not reconstructed from historical logs, and no historical events are fabricated.
- IP/source protection remains independent: default 30 attempts per 15-minute window with its existing cooldown. Forwarded headers are not trusted to select a new source. Unlock does not erase IP budgets. Login responses retain the existing minimum 450 ms response padding and password comparisons remain server-side.

## Administrator workflow

1. In **Rider Management → More**, **Unlock Account** appears only when that rider is Security Locked. A separate badge and Security Locked filter identify these accounts.
2. The dialog displays the rider's name, assigned username, ID, consecutive count and the 20 most recent relevant security records, dated in Asia/Manila.
3. The administrator verifies the rider against the administrator-managed account record, records an internal reference and reason, enters the exact rider ID and explicitly confirms the unlock.
4. The backend rechecks persisted administrator authorization, current account linkage and current security lock under database locks. It clears only the security flag, consecutive counter and account-specific restriction bucket. It does **not** enable a Disabled account, replace credentials, remove a mandatory password change, change duty preference, clear source throttles or alter an order.
5. The unlock records the administrator ID, reason, verification reference and actual timestamp. The next successful authentication records **Successful Login After Unlock** once.

Repeated unlocks after the state changed return 409. Concurrent unlocks permit only one success. Administrator unlock requests have a separate 10-per-15-minute budget.

## Password reset and active deliveries

Existing verified administrator-assisted password reset remains available and uses secure bcrypt hashing, mandatory personal password change and session-version revocation. It never returns the current or temporary password. Reset does not clear the security flag, consecutive counter or login restriction; use the separate authorized unlock action as well when necessary. Rider email remains optional, and no public registration or Rider email recovery was added.

Account state and operational state are separate:

| Indicator | Meaning |
| --- | --- |
| Active / Disabled | Normal account access setting; independent of the security flag. |
| Security Locked | New authentication is blocked until verified administrator unlock. |
| Available | Enabled account, On Duty, no ongoing assignment, no pending password change, and not security locked. |
| Busy | Enabled rider has an ongoing assignment; Security Locked is shown separately. |
| Offline | Not currently eligible/On Duty with no ongoing work, or a Disabled account. |

The database assignment guard rejects new assignments to security-locked riders and serializes eligibility checks against security-state changes. Existing orders, assignment history and GPS coordinates are never cancelled, deleted or rewritten by lock/unlock. A locked rider with ongoing deliveries is explicitly flagged for administrator review in the list and Details drawer.

A security lock blocks **new sign-ins**. It does not automatically revoke previously authenticated delivery sessions or independent order-scoped driver links, preserving ongoing delivery/GPS access. Existing Disable and Password Reset actions retain their separate session revocation behavior. Administrators should review flagged assignments and use the existing safe operational workflows when additional intervention is needed.

## API and database changes

All administrator endpoints require an authenticated, persisted administrator account. Responses use `Cache-Control: no-store`.

- **New** `GET /api/admin/riders/:id/security`: safe Rider state and relevant recent login/security records. No password hashes, credentials or authentication tokens are returned.
- **New** `POST /api/admin/riders/:id/unlock`: requires `confirmed: true`, `identityVerified: true`, exact rider ID in `confirmation`, `reason` (4–300 characters) and `verificationReference` (4–160 characters).
- Existing login persists Rider consecutive attempts and checks the permanent lock. Existing Admin temporary policy is preserved.
- Existing Rider list/details/profile formatting adds `securityLocked`, `failedLoginAttempts`, `securityLockedAt` and `assignmentReviewRequired`. List filtering supports `Security Locked`; availability excludes locked riders.
- Existing Reset Password no longer clears Rider account failure budgets. Other verification/password-change/revocation protections are preserved.

Migration **015_rider_security_lock.sql** is registered with the existing migration runner and applied to the configured Belfiore database. It adds `users.rider_failed_attempts`, `rider_security_locked`, `rider_security_locked_at`, `rider_security_unlocked_at`, `rider_login_after_unlock_pending`, and `auth_security_buckets.rider_lock_shadow`. It updates only the existing assignment eligibility function to check the security flag under row locks; assignment history logic is retained.

New fields default to an unlocked state. No existing accounts, roles, usernames, credentials, account statuses, orders, assignments, GPS records, events or failure budgets were reset or deleted. Before/after database digests matched for every pre-existing field in users, profiles, orders, assignments, locations, security logs and failure buckets when applying the migration.

## Audit events

The existing System Logs and Rider Account Activity reuse `auth_security_events`:

- `Login Failed`, with the target account ID where known and an HMAC-protected source identifier.
- `Rider Account Security Locked` and subsequent rejected/restricted login events.
- `Administrator Unlock`, with administrator ID, reason and verification reference.
- Existing `Rider Password Reset`.
- `Successful Login After Unlock` and normal successful-login events.

Actual backend timestamps are used. Passwords, reset credentials and authentication tokens are not included in events. Email delivery remains disabled in the configured application environment; lockout and unlock work independently of email.

## Modified files

- `server/src/utils/staffAuth.js`: persistent Rider counter, lock enforcement, generic restrictions, rollout compatibility and login audit.
- `server/src/utils/riderManagement.js`: security-aware availability SQL and formatting rules.
- `server/src/routes/rider-admin-accounts.js`: security review/unlock endpoints, serialized confirmation, audit, no-store responses and reset separation.
- `server/src/routes/riders.js`: safe security/review fields.
- `server/src/db/migrations/015_rider_security_lock.sql`, `server/scripts/migrate-inventory.js`: additive database changes.
- `src/admin/RiderUnlockDialog.jsx`: verified administrator unlock dialog and security-record review.
- `src/admin/AdminRiders.jsx`: separate badge, filter, conditional menu action and assignment review alert.
- `src/admin/RiderDetailsDrawer.jsx`: security restriction/review banner.
- `server/tests/riderLockChecks.js`: new real-database security checks.
- `server/tests/staff-auth.test.js`, `server/tests/inventory.test.js`, `server/tests/riderManagementChecks.js`: migration fixtures, security-log API and updated operational-state expectations.
- `server/.env.example`: documents manual Rider unlock versus timed Admin/source policy; no credentials added.
- `AUTH_EMAIL_PREPARATION.md`, `RIDER_ACCOUNT_RECOVERY.md`, `RIDER_MANAGEMENT_UPDATE.md`: links superseding earlier timed Rider policy.
- `RIDER_SECURITY_LOCKOUT.md`: this report.

## Validation and remaining limits

Final results: **114 tests passed, 0 failed, 0 skipped** using the full `npm --prefix server run test:inventory` suite against the explicit isolated test database. `npm run lint` and `npm run build` passed. Read-only smoke checks against the configured Belfiore database passed for security fields, the Security Locked filter, authenticated security review, no-store responses and unauthenticated denial. Staff email delivery was verified disabled. No real Rider account was deliberately failed, locked, unlocked or password-reset for testing.

Automated tests use explicit isolated PostgreSQL schemas and synthetic accounts. They cover valid login, consecutive failures and successful reset of the counter; threshold five; elapsed-window and separate-source persistence; correct-password rejection while locked; unauthorized/self unlock; confirmation, reason and verification validation; manual unlock; separately Disabled accounts; reset/profile/Enable bypass prevention; temporary password change; session revocation; source budgets and forwarded-header spoofing; concurrent failures/unlocks; rollout of live prior budgets; System Logs; preserved assignment snapshots and GPS; existing Admin security and inventory/order/report regressions.

Browser refresh/device behavior is verified through separate stateless requests and trusted synthetic source contexts sharing the real backend database. Physical browser/mobile interaction and live-device GPS were not executed; the existing modal/menu patterns and responsive Belfiore design are reused.

An administrator-controlled five-failure policy can still be targeted by distributed attackers. Source limiting, response padding and audit events reduce abuse and expose repeated attempts; they cannot eliminate that inherent tradeoff. Identity verification and secure credential handoff remain the authorized administrator's responsibility, not an automated claim by the application.
