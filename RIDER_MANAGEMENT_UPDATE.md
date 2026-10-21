# Rider Management update

**Current security policy:** [Administrator-controlled Rider lockout](RIDER_SECURITY_LOCKOUT.md) adds separate Security Locked indicators, assignment review alerts and verified manual unlock. Disabled account availability now displays Offline; its account indicator and Disabled filter remain separate.

Implemented on October 18, 2026. Existing accounts, usernames, passwords, orders, assignment snapshots, GPS records and authentication security remain intact. No database reset or operational records were deleted.

## UI and functionality

- Compact **Rider Management** header with the notification bell on the title row, three database-backed summaries, Add New Rider and Refresh.
- Search name, username, phone and optional email; All / Available / Busy / Offline / Disabled filters. PostgreSQL applies filtering before 20-record pagination. Summary counts describe all riders, independently of the current filter.
- Circular avatars reuse the existing image URL helper and initials/error fallback. Optional uploads retain existing storage and its actual 2 MB JPG/PNG/WEBP limit.
- Visible View Details and accessible More menu reuse the existing portal menu. Edit Profile, Reset Password and Enable/Disable remain available.
- Native right-side Details drawer: Overview, Delivery History and Account Activity; Escape dismissal, modal focus containment, keyboard tabs and independently paginated histories.
- Overview includes account/duty information, actual delivery counts and current assignments. View Order opens the existing `/admin/orders?orderId=...` details workflow. Times use Asia/Manila with PHT labels.
- Delivery records reuse `order_rider_assignments` plus current order snapshots when no ledger exists for that rider/order. Missing timestamps display **Not recorded**. Real account events reuse `auth_security_events`; no historical account events are fabricated.

## Availability and account safety

The existing `riders.is_available` field is retained as the **manual On Duty preference**. It is not interpreted as GPS presence. No automatic online indicator or new presence table was introduced.

| State | Rule |
| --- | --- |
| Disabled | Rider profile or linked Rider login is disabled/unavailable. |
| Busy | Enabled rider has an ongoing assigned order (all statuses except Delivered/Cancelled). |
| Available | Enabled Rider login, On Duty, no ongoing assignment, and no mandatory password change outstanding. |
| Offline | Enabled account with no ongoing assignment that is Off Duty or must first change its temporary password. |

- Total Riders includes disabled and legacy profiles; Active Accounts requires an active linked Rider login. New temporary-password accounts count as active but cannot accept assignments until the required change is complete.
- Database row locks enforce one ongoing order per rider. Assignment eligibility is enforced by an order trigger, including concurrent assignments and assignment-versus-disable races; the UI selector also identifies unavailable options.
- Existing simultaneous assignments are preserved rather than cancelled or rewritten. Such riders remain Busy until all ongoing orders are resolved; new conflicting assignments are rejected.
- Disable/Enable requires a reason, explicit confirmation and matching rider ID while showing the rider's name/username. Ongoing deliveries must first be resolved or reassigned through Order Management. Profile edits cannot bypass this workflow.
- Both actions revoke existing login sessions through `auth_version` and audit the administrator and reason. Enabling leaves the rider Off Duty. Completion never overwrites the duty preference.
- Existing password reset verification/reference/confirmation, bcrypt hashing, mandatory personal password change and session revocation are preserved. A browser Web Crypto generator offers a 192-bit temporary credential; admins can also enter a policy-compliant credential. The API never returns the temporary password, and it is cleared after success without local storage or logging.
- Rider email remains optional. No Rider registration or credential-email endpoint was introduced. Staff email delivery remains disabled.
- Existing order-scoped driver access links remain separate from authenticated Rider sessions; their pre-existing scope is preserved. JWT session revocation does not claim to revoke those independent order links.

## APIs

All `/api/admin/riders` endpoints require a persisted, authenticated administrator account.

| Endpoint | Change |
| --- | --- |
| `GET /api/admin/riders/manage?search=&filter=All&page=1` | New filtered/paginated list, global summaries, total/page/pageSize. |
| `GET /api/admin/riders/:id/details` | New safe profile, delivery statistics and current assignments. |
| `GET /api/admin/riders/:id/deliveries?page=1` | New paginated actual ledger/current-order history. |
| `GET /api/admin/riders/:id/activity?page=1` | New paginated actual security/account events, actor and available reason/reference. |
| `PATCH /api/admin/riders/:id/status` | New confirmed status workflow; `status`, `reason`, `confirmed: true`, `confirmation: "<rider ID>"`. Busy transitions return 409. |
| `GET /api/admin/riders` | Existing array shape retained for Order Management; derived eligibility fields added. |
| `POST /api/admin/riders` | Existing creation, optional photo/email and secure first-login password requirement preserved. |
| `PATCH /api/admin/riders/:id` | Existing profile/photo update; status transitions now require the dedicated confirmed endpoint; profile/duty saves are audited. |
| `POST /api/admin/riders/:id/reset-password` | Existing verified administrator-assisted reset reused without exposing credentials. |
| `GET/PATCH /api/rider/profile` | Actual derived availability returned; rider self-profile saves audited. |
| `PATCH /api/admin/orders/:id` | Assignment eligibility/conflict database failures return 409. Existing fulfillment workflow retained. |

GPS endpoints, ownership checks, delivery photos and customer tracking remain unchanged. No courier provider or Track123 functionality was added or changed by this task.

## Migration

`014_rider_management.sql`, registered in the existing migration runner, has been applied to the configured Belfiore database.

- Adds an active-order rider index and assignment guard/history triggers.
- Reuses the existing assignment table. Allows null assignment timestamps only to represent genuinely unknown legacy assignment dates.
- Does not backfill or rewrite historical rows. New observed transitions record their real backend timestamp. When an older ongoing assignment changes, its existing assignment/acceptance snapshot is preserved; unknown dates remain null.
- Existing completed/cancelled/reassigned ledger rows are not rewritten by later updates.
- Before/after row counts and database row digests matched for users, riders, orders, assignments, locations and security events when applying the migration.

## Files changed for this task

- `src/admin/AdminRiders.jsx` — list, summaries, filters, pagination, actions, existing editor.
- `src/admin/RiderDetailsDrawer.jsx` — new details/history/activity drawer.
- `src/admin/RiderStatusDialog.jsx` — new confirmed status dialog.
- `src/admin/RiderResetDialog.jsx` — optional secure credential generation and controlled visibility.
- `shared/riderTemporaryPassword.js` — Web Crypto generation, no persistence.
- `src/admin/AdminOrders.jsx` — derived rider labels and unavailable assignment options.
- `src/rider/RiderProfilePage.jsx` — correct derived availability label.
- `src/api/client.js` — authenticated management requests.
- `server/src/routes/rider-admin-accounts.js` — administrator reads, summaries, status controls and audit.
- `server/src/routes/riders.js` — safe derived fields and self-profile audit.
- `server/src/routes/orders.js` — assignment conflict response.
- `server/src/utils/riderManagement.js` — shared eligibility/history SQL and formatting logic.
- `server/src/db/migrations/014_rider_management.sql` and `server/scripts/migrate-inventory.js` — additive migration.
- `server/tests/riderManagementChecks.js`, `server/tests/rider-password.test.js`, `server/tests/inventory.test.js`, `server/tests/staff-auth.test.js` — new checks and migration fixtures.
- `RIDER_MANAGEMENT_UPDATE.md` — this report.

Existing unrelated working-tree changes from earlier tasks were retained.

## Validation and limitations

Automated checks cover real PostgreSQL list/summary/search/filter/pagination; administrator-only details/history/activity; empty history; password generator policy; concurrent assignment conflicts; assignment-versus-disable race; active delivery disable rejection; confirmation/reason enforcement; session revocation; enable remaining Off Duty; explicit duty updates; legacy timestamps; actual new completion/reassignment events; unchanged read/migration snapshots; GPS upload, order ownership and customer tracking; existing login restrictions/reset security; inventory/order/payment/report regressions.

Results: **107 tests passed, 0 failed, 0 skipped** using `npm --prefix server run test:inventory` with the explicit isolated test database. The production build (`npm run build`) and ESLint (`npm run lint`) pass. Read-only API smoke checks also passed against the configured database for rider list, summaries, details, delivery history, account activity and unauthenticated denial. Staff email delivery was verified disabled.

Browser interaction, desktop/mobile visual layout, focus behavior, broken-image rendering and live-device GPS were not executed because no browser/device surface was available. Responsive classes, native dialogs and the existing keyboard menu/avatar components are reused; interactive acceptance testing remains necessary.

Older reassignments or account events that were never stored cannot be reconstructed. The current rider order model does not provide a separate failed-delivery workflow; Failed counts include only genuinely recorded failed assignment statuses and otherwise remain zero. No fabricated failure records or timestamps were introduced.
