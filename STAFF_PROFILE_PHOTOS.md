# Staff profile photos and My Account

## Existing architecture and scope

Staff accounts remain rows in `users`, authenticated by the existing username/password Staff session. Existing `profile.own.update`, active-account checks, session versions, temporary-password restrictions and audit services are reused. The original self-service profile API permits first/last-name edits only. Optional email and username therefore remain read-only to Staff and editable through the existing authorized administrator workflow.

## Completed UI

- Compact My Account profile header with a 96px circular avatar, actual name/username, Operations Staff role, account badge and Change Photo.
- Photo dialog with current photo, client-validated circular preview, explicit Save/Cancel, and a separate removal confirmation. No upload occurs when merely selecting a file.
- Shared avatar for My Account, Staff sidebar, Admin Staff Directory and Admin Staff Details. Missing/broken images fall back to the same initials.
- Compact Profile Information and read-only Account Details. Password & Security is collapsed by default; password change includes confirmation and Show/Hide controls, preserving the shared 15–64-character / 72-byte password policy and backend session revocation.
- The redundant My Account Sign Out card is removed; sidebar logout and notification behavior remain available.

## Migration

`022_staff_profile_photo.sql` adds nullable `users.staff_profile_image_path` and a constraint permitting only generated `staff/<uuid>.jpg` keys. No base64, submitted URLs, credentials or duplicated account table is introduced.

The focused migration was applied with `node server/scripts/migrate-staff-photo.js --apply`. Its before/after comparison confirmed existing account data was unchanged. It is also registered in the normal migration runner. Deployments must run this additive migration before starting the updated backend; no reset is needed.

## Storage and security

The existing `STORAGE_DRIVER` convention is reused. Local normalized images live in `server/uploads/staff/`; configured Supabase storage uses the existing bucket under `staff/`. Local deployment must retain/mount `server/uploads` across releases; images are not stored in Vite output or a temporary directory.

- Authenticated Staff identity comes from the verified token, never a submitted Staff ID. Admin, Rider and Customer cannot call the photo mutation endpoint. Current role, active status, session version and temporary-password restriction are rechecked under a database row lock.
- Shared frontend/backend maximum: 2 MB. JPEG, PNG and WebP only. Sharp validates actual decoded format and pixels, rejects malformed/truncated/mismatched/animated/over-dimension images, re-orients and re-encodes a 512px square JPEG without original metadata or filenames.
- Random server filenames, no overwrite, constrained relative keys and bounded multipart fields prevent submitted path traversal and executable filenames. SVG is rejected.
- A persistent per-account rate bucket allows at most 20 photo mutation attempts per 15 minutes. Existing Bearer authorization is used; these endpoints do not authenticate from ambient cookies.
- Expected-photo comparison and row locking reject duplicate/stale concurrent saves with 409. A failed upload/storage operation preserves the previous active reference. No success is reported before database commit.
- Existing audit services record Profile Photo Updated / Profile Photo Removed with Staff actor and backend timestamp, without image bytes, passwords, tokens or private filesystem paths.
- Existing successful image files are retained when replacing/removing a reference. No shared or historical file is deleted. Unreferenced-file cleanup is deliberately left to a reviewed storage-retention process, including files left by a failed database commit after storage succeeded.

Images follow the application's existing public image-storage convention: generated asset URLs are public/unlisted, not private authenticated downloads. Account/profile APIs and photo mutations remain role-protected. No directory listing is enabled. A deployment requiring private avatar downloads would need a separate private-storage/read policy.

Sharp options were checked against its [official constructor documentation](https://sharp.pixelplumbing.com/api-constructor/) and [image operations documentation](https://sharp.pixelplumbing.com/api-operation/).

## APIs and synchronization

New:

- `POST /api/staff/profile/photo`: multipart `photo` and current `expectedPhoto`; returns committed profile.
- `DELETE /api/staff/profile/photo`: `confirmed: true` plus current `expectedPhoto`; clears only the authenticated Staff reference.

Reused:

- `GET /api/staff/profile` and `GET /api/admin/staff` now include the same generated `profile_image_url` and managed key.
- `PATCH /api/staff/profile` still updates only existing authorized name fields and now returns the committed profile.
- `PATCH /api/auth/password`, Staff login/logout, Admin create/edit/reset/status/activity endpoints are unchanged in authorization and business behavior.

Confirmed responses update current-window profile state immediately. Other tabs receive only a timestamp invalidation marker, then reload through their own authenticated API/session. Profile data, tokens and image bytes are not put into this marker. Focus refresh and normal profile loads also refresh avatars. Each saved picture has a new stable filename, preventing stale-image caching without random query strings on every render.

## Files added or modified

- `src/staff/StaffAccount.jsx`, `StaffPhotoDialog.jsx`, `StaffLayout.jsx`
- `src/components/StaffAvatar.jsx`
- `src/admin/AdminStaff.jsx`, `StaffAccountDrawer.jsx`
- `src/utils/staffAccountValidation.js`, `staffProfileSync.js`
- `shared/staffPhotoPolicy.js`
- `server/src/routes/staff-photo.js`, `operations-staff.js`
- `server/src/utils/staffPhoto.js`, `storage.js`
- `server/src/db/migrations/022_staff_profile_photo.sql`
- `server/scripts/migrate-staff-photo.js`, `migrate-inventory.js`
- Server dependency manifests: Sharp added for secure image decoding/re-encoding.
- `server/tests/staff-photo.test.js`, `staff-photo-ui.test.js`, `operations-staff-ui.test.js`
- This report.

## Tests actually executed

- Broad regression run: **101 passed, 0 failed, 0 skipped**, including existing Staff/Admin/Rider/Customer authentication, lockouts, session revocation, administrator account operations and operational inventory/order checks. All database tests used random schemas in the isolated temporary PostgreSQL instance.
- After the final profile-sync change, focused regression run: **63 passed, 0 failed, 0 skipped**. This includes JPG/PNG/WebP normalization, malformed/spoofed/oversized/over-dimension input rejection, ownership/role/session checks, concurrency and audit counts, safe removal, storage failure, repeatable migration, HTTP-server restart/file persistence, subsequent login, profile edits retaining photos, password policy/session revocation and rate limiting.
- Frontend tests cover shared size/type policy, password confirmation/UTF-8 policy, summary/dialog/avatar markup, responsive classes, collapsed password section, optional read-only email and local/cross-tab event payload boundaries.
- Frontend production build: passed after final synchronization changes.
- Scoped ESLint: passed for changed source, scripts and tests.

No real Staff photo, password, role, username or status was changed during tests. No database reset, order/payment/inventory change or historical-data deletion was performed.

## Remaining verification and limits

- Browser-interactive upload/preview, keyboard/touch interactions and viewport screenshots were not manually exercised in this task; responsive markup was tested through rendering checks. Cross-tab event utilities were tested, while actual multi-tab browser interaction remains a manual check.
- Local storage was tested with an isolated persistent directory and HTTP-server restart. Supabase network delivery and production deployment-volume retention were not exercised.
- The preview uses centered `object-fit: cover` and server square cropping; drag/zoom crop controls are not added.
- Optional email remains read-only because self-service email changes are not authorized by the existing backend.
