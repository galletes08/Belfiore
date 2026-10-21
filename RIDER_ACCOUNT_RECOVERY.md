# Separate Administrator and Rider recovery

**Current Administrator recovery:** [Admin authentication security](ADMIN_AUTH_SECURITY.md) adds durable incident alerts and verified offline sole-Admin recovery while keeping SMTP disabled until officially configured.

**Updated security policy:** [Rider security lockout](RIDER_SECURITY_LOCKOUT.md) now requires a separate administrator Unlock Account action after five consecutive failures. Reset Password does not clear this lock; earlier timed Rider restriction descriptions below are historical.

## Result

Administrators retain email sign-in and secure email-based recovery, which remains disabled until the official sender is configured and authorized activation occurs. New Rider logins are created only by authenticated administrators in Rider Management, with an assigned username, temporary password and optional contact email. There is no public Rider registration or role selector.

Rider recovery uses **Reset Password** in Rider Management, not email. A reset requires explicit identity-verification attestation, an internal verification reference, a reason and final confirmation. It revokes previous JWT sessions, stores only a bcrypt hash, and requires the Rider to choose a different personal password before accessing the workspace. The administrator enters a new temporary credential; existing passwords are never displayed or returned.

The user confirmed that authorized administrators create Rider accounts in Rider Management. The application records the administrator's verification attestation; it does not pretend to perform identity verification itself or invent an approved identification procedure. Verification against the administrator-managed account record and secure delivery of the temporary credential remain the organization's responsibility. References should be internal tickets/records, not personal ID numbers or identity-document uploads.

## Existing accounts and migration

`013_rider_username_recovery` was applied through the existing migration ledger. It adds `users.username`, `legacy_email_login`, `must_change_password`, and security-event actor/details fields; it permits a null email for a Rider login. Existing passwords, hashes, role assignments and account statuses are not overwritten.

Existing Rider users without usernames receive collision-checked `rider-<user ID>` usernames, visible in Rider Management. Existing email sign-in is retained as a compatibility alias for those migrated accounts so they are not stranded; aliases and usernames share one failure bucket. Administrators can assign a different username in Edit Profile, which disables the old email alias and revokes existing sessions. **New Rider accounts do not receive an email login alias**, even if they have an optional contact email.

Existing users are not forced to change passwords merely because the migration ran. Only a newly issued administrator temporary credential requires the change. Previously issued unused Rider email-reset tokens are invalidated by the migration, and the reset endpoint independently rejects Rider tokens. Administrator tokens retain their normal expiry/single-use behavior.

Existing Rider profiles without linked logins can be provisioned through the same verified/confirmed reset action by assigning a username. This creates the login and links the existing profile instead of creating a duplicate Rider record. It never converts or replaces a linked non-Rider account. Existing records with inconsistent login links return a clear error for administrator resolution.

## Backend controls and APIs

- All `/api/admin/riders` routes now enforce administrator authorization before uploads or mutation. The previous open management handlers were replaced with transactional account/profile creation and updates.
- `POST /api/admin/riders`: administrator-created username/password login; optional email, fixed Rider role, bcrypt cost 12, required first-login password change. No plaintext password is returned.
- `PATCH /api/admin/riders/:id`: profile/username/status updates; cannot change a password through the general editor. Username/status/email changes revoke existing JWTs. An explicit new username retires a migrated email alias.
- `POST /api/admin/riders/:id/reset-password`: requires `temporaryPassword`, `identityVerified:true`, `confirmed:true`, `verificationReference` and `reason`. `username` is required when provisioning a profile that has no login. Role checks, bounded administrator reset requests, row locks, atomic hashing/session revocation and audit insertion protect the operation. The response contains a message and assigned username, never the temporary or existing password.
- Shared `/api/auth/login` accepts `identifier` (and legacy `email` request fields), resolves the persisted role and identifier configuration, and returns the existing role-routed session response plus username/password-change state. A submitted role cannot elevate privileges.
- Global authenticated middleware reads the persisted password-change flag. A restricted Rider can call only `PATCH /api/auth/password`; browser state or a misleading JWT flag cannot bypass it. That operation verifies the current credential, applies the existing staff password policy, clears the required-change flag, invalidates recovery links, advances the session version and logs the change atomically. A version predicate prevents an older in-flight session from overwriting a later credential reset.
- Successful password change signs the Rider out to sign in again with the personal password. The temporary credential and temporary JWT then fail.
- Forgot/Reset Password issues and consumes email tokens for **Admin only**. Known Rider emails and unknown addresses receive the same public response; no Rider recovery email/token is created. The UI explicitly directs Riders to an authorized administrator.
- System Logs include Rider Login Created/Provisioned, Rider Password Reset and Rider Password Changed events, backend timestamps, target IDs and administrator identity/reference where applicable. Passwords, JWTs and reset tokens are not logged.

## Configurable login limits

Documented in `server/.env.example`:

```dotenv
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_ATTEMPT_WINDOW_MINUTES=15
AUTH_RESTRICTION_MINUTES=15
AUTH_LOGIN_IP_LIMIT=30
AUTH_EMAIL_DELIVERY_ENABLED=false
```

Invalid or out-of-range values fall back to secure defaults. Shared PostgreSQL buckets enforce limits under concurrent requests; successful sign-in resets applicable failure counters, blocked requests do not extend the same incident, and expiry is automatic. Separate IP limits remain active. Case/whitespace and migrated username/email aliases cannot create separate guess budgets for the same account. Recovery/notification configuration cannot disable login protection.

## Modified files

- `server/src/db/migrations/013_rider_username_recovery.sql`: additive username/security fields, compatibility backfill and Rider token invalidation.
- `server/scripts/migrate-inventory.js`: registers migration 013.
- `server/src/utils/authPolicy.js`, `server/.env.example`: validated configurable login policy.
- `server/src/utils/staffAuth.js`: username resolution, shared alias counters, configurable restrictions, Admin-only email token recovery and optional-recipient security alerts.
- `server/src/utils/auth.js`: persisted required-password-change enforcement.
- `server/src/routes/auth.js`: password-change completion, optimistic session-version check and atomic audit/token invalidation.
- `server/src/routes/riders.js`: admin guard, delegates transactional management routes, optional contact email in self-profile updates.
- `server/src/routes/rider-admin-accounts.js`: administrator-only creation, updates, verified reset/provisioning and audit metadata.
- `server/src/routes/logs.js`: renders administrator identity and verification reference for credential-reset events.
- `src/api/client.js`: staff identifier, reset and Rider password-change requests.
- `src/admin/AdminLogin.jsx`: Email or assigned username input, automatic role routing, Rider help and required-change redirect.
- `src/admin/AdminRiders.jsx`: assigned username, optional email, initial temporary credential, reset action and required-change status.
- `src/admin/RiderResetDialog.jsx`: confirmation/verification/reference/reason and temporary credential form.
- `src/admin/PasswordRecovery.jsx`: Administrator-only recovery guidance and Rider contact-admin instructions.
- `src/rider/RiderPasswordChange.jsx`, `src/rider/RiderProtectedRoute.jsx`, `src/App.jsx`: dedicated change screen and frontend routing guard.
- `src/rider/RiderProfilePage.jsx`: optional contact email, matching the backend schema.
- `server/tests/staff-auth.test.js`, `server/tests/inventory.test.js`: migration, policy, username/recovery/session/security regressions.
- `STAFF_AUTH_SECURITY.md`, `AUTH_EMAIL_PREPARATION.md`, `RIDER_ACCOUNT_RECOVERY.md`: current policy and compatibility notes.

No dependencies, public Rider registration flow, database reset or unrelated operational-module rewrite were added.

## Executed verification

Full suite: **100 passed, 0 failed, 0 skipped**, using isolated PostgreSQL schemas and the local test SMTP sink. Lint and production build passed.

Covered existing Admin/Rider sign-in, preserved migrated Rider hashes/roles, new username accounts with null email, case-normalized username sign-in, shared legacy alias limits, five-attempt temporary restriction/cooldown and IP protection, configurable safe defaults, administrator authorization for creation/reset, missing verification/confirmation denial, role-preserving account creation, optional-email profile save, direct password-editor bypass rejection, reset/provision without duplicate profiles, revoked old sessions, persisted required-change enforcement even with a misleading JWT flag, temporary-to-personal password change, rejection of old temporary credentials, security audit actor/reference and no secrets in response/audit.

Also covered Admin email recovery, disabled/missing SMTP behavior, mail failure independence, expired/reused tokens, rejection of legacy Rider email tokens, existing customer/order/inventory/payment/report/notification regressions and unchanged operational record snapshots.

The applied migration and continued disabled email state were verified through metadata/boolean checks without printing account identities or credentials. No existing account was manually reset during implementation; reset/provisioning tests use synthetic test records only.

## Remaining limitations

- Browser/mobile interaction tests and actual credential handoff/identity verification were not executed. UI compilation, backend controls and database flows were tested; a human administrator must follow the organization's approved verification and secure handoff procedure.
- Migrated Rider email aliases remain until an administrator assigns a different username. New accounts already use username-only login. Administrators should communicate assigned usernames before retiring compatibility aliases.
- Revocation applies to JWT-based application sessions. Separately scoped legacy driver-access links are not rewritten; order records and GPS workflows remain untouched.
- Production email delivery remains disabled and untested until official configuration and authorized activation. No successful production email delivery is claimed.
- Temporary credentials require a personal change before workspace access; this update does not add a separate temporary-credential expiry scheduler or an external identity-verification service.
