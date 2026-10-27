# Operations Staff Portal

> Update 2026-10-27: the additional Staff packing workflow is retired. See [STAFF_ORDER_SIMPLIFICATION.md](STAFF_ORDER_SIMPLIFICATION.md) for current behavior and verification. Earlier packing and assignment descriptions below are historical.

## Architecture inspected before implementation

The existing application uses React/Vite, Express and PostgreSQL. Persisted roles are lowercase `admin`, `rider`, `customer`; Admin/Seller is a single `admin` role. Workforce login uses `createStaffAuth`, bcrypt, 12-hour JWTs and database-backed attempt buckets. `auth_version`, account status and temporary-password restrictions revoke existing sessions. Customer and workforce portals have separate entry checks and browser storage.

Admin APIs explicitly require admin; customer and rider APIs use their own role checks. No existing Staff role or packing task exists. Orders use Pending, Preparing, Cancellation Requested, Out for Delivery, Delivered and Cancelled. Admin confirmation records `admin_confirmed_at`. Packing must be separate from delivery and payment statuses.

Stock is handled by transactional inventory services, row locks and idempotency receipts. Lettuce uses quantity mode after migration 020; unsafe batch balances must not be assumed migrated. Supplies use configured variant/pool conversion. Succulents retain unique product identities. Inventory movements and authentication security events already provide audit history. GPS, COD and PayMongo are independent existing workflows.

Implementation and verification results are recorded below as completed.

## Role, authentication and permissions

`staff` is the only new persisted role. Existing Admin/Seller remains `admin`. Customer and Rider roles, IDs and recovery rules are preserved.

The shared workforce login is available at `/staff/login`, `/admin/login` and `/rider/login`. Persisted role determines routing: Staff → `/staff/dashboard`, Admin → existing preferred Admin page, Rider → existing Rider workspace. No role selector or public Staff registration exists. Staff may sign in using their assigned username, or optional email when one is configured. Customer login rejects Staff without issuing credentials or charging the account's password-failure budget for a wrong-portal request.

Staff uses the existing configurable attempt policy: five failures and a fifteen-minute temporary restriction by default, plus source limits and security logging. Admin temporary restrictions and Rider administrator-controlled unlock remain intact. Staff password recovery is administrator-assisted; email recovery remains Admin-only and existing email configuration is unchanged.

`requirePermission` centrally checks JWT signature, persisted role, active status, auth version, temporary-password state and permission allowlist. It also allows existing Admin operational access. Staff can call the explicitly authorized new-product creation endpoints and their own new-supply setup endpoints. General Admin editing, reports, payment verification, settlement and account-management APIs remain restricted. Rider account management is separate from the limited operational rider-selection API. Stock routes expose only the narrow operational actions, rather than opening Admin endpoints to Staff.

Browser Staff credentials use a separate `staffToken` key. Staff sign-in clears incompatible Admin/Rider browser credentials. Admin/Rider sign-in clears Staff credentials. Route guards reject incompatible or expired browser tokens; backend permissions remain authoritative. Deactivation and password reset increment auth version, revoking existing sessions. First-use/reset temporary credentials require a personal password before operational access. Own password changes reuse the existing hashing, validation, throttling and session-revocation path.

## Pages and workflow

The dedicated green-and-white Staff portal has three primary modules: Dashboard, Inventory and Orders. Packing and shipment progress are inside Orders. Stock movements and personal stock history are inside Inventory. My Account is a secondary utility for secure profile/password management; personal activity remains available without a primary sidebar module. Old Packing/Stock/Shipments bookmarks redirect to the consolidated pages. It uses a desktop sidebar, compact dashboard cards and a native collapsible mobile navigation menu. Labels, normal keyboard focus, real buttons and native controls preserve keyboard accessibility. Long product identifiers wrap inside compact cards.

Admin navigation now includes **Staff**. Administrators can create, search, view, edit names/optional email, activate/deactivate, reset passwords with confirmation and identity-verification reference, and inspect paginated personal activity. Passwords are never retrieved or displayed. Account creation is manual and usernames remain unique.

### Eligibility and exact dashboard mappings

Staff preparation requires all of:

- Existing order status `Preparing` and recorded `admin_confirmed_at`: an authorized Admin or Staff member must accept the request first.
- Shipping status `Confirmed`: Staff cannot bypass unapproved shipping.
- COD, or online payment already `Paid` under the existing verified-payment process.
- Inventory not restored, no inventory reconciliation exception, and existing `harvest_order_sellable` compatibility checks satisfied.

Staff actions do not mark orders Paid or Delivered. Staff can accept requests, assign approved delivery and dispatch ready packages through the existing order handler. A separate `staff_fulfillment` row tracks:

`Not started` → `Preparing` → `Packed` → `Ready for Pickup`

Orders to Prepare counts eligible orders with no task. Orders to Pack counts tasks in Preparing. Ready for Pickup counts ready tasks whose order is still eligible and has not left the Preparing order state. Packed tasks awaiting readiness remain in the operational list. Cancelled, disputed/cancellation-requested, delivered, payment-blocked and shipping-blocked orders cannot advance packing. Shipments additionally shows previously handled tasks whose orders are Out for Delivery or Delivered, without offering preparation mutations on them.

Stock Alerts counts distinct visible product records, or supply variants, with actionable low/zero stock or incomplete configuration/reconciliation. Sold/reserved individually tracked succulents are not treated as replenishable zero-stock alerts. Quantities for unrelated units and shared pools are never summed into a warehouse total. Dashboard tasks are ordered oldest first; counts come from actual records rather than a limited visible page.

Each packing transition locks the order and task, verifies expected version and handling Staff, validates every item ID and all five checklist steps before Packed/Ready, and writes an audit event atomically. Concurrent/duplicate stale requests return 409 without repeating a transition. The selected handler, checks, verified item IDs, notes and backend timestamps persist independently of historical order lines. Product codes and variant snapshots are shown for picking. Another Staff member cannot overwrite a claimed task; an authorized Admin retains backend operational access.

### Stock and inventory

Staff inventory responses include public retail prices read-only and omit product-edit controls, costs, revenue and payment information. They include photos, identifiers, types, available/reserved/allocated quantities and supply variants. They do not expose customer account data.

- Lettuce: reuse `registerLettuceStock`; only confirmed New Harvest Stock In and disposal/spoilage/damage Stock Out with short notes are allowed for Staff. Stock Correction remains Admin-only. All units are 400g packs. Incomplete batch-to-quantity migration is blocked rather than guessed.
- Supplies: reuse the existing stock handler, variant lookup, stock factors and pool locks. Staff can perform normal Stock In and disposal/damage Stock Out only. Opening balances and stock-model configuration remain Admin-only. Existing prepacked/shared stock accounting and reservations are preserved.
- Succulents: read and picking verification only. Staff has no identity creation/editing, stock override, price or archive permission.

The stock form prevents duplicate clicks and retains an idempotency key for retries. Backend receipts and transactions remain authoritative. Stock Out cannot deduct reserved/committed allocations; invalid, negative, fractional and excessive amounts are rejected. Own Stock History is available below the movement form with pagination.

## APIs

New Staff endpoints:

- `GET /api/staff/dashboard`
- `GET /api/staff/orders`
- `GET /api/staff/orders/overview` (all statuses with read-only order totals/payment labels; no payment credentials)
- `POST /api/staff/orders/:id/fulfillment`
- `GET /api/staff/inventory`
- `POST /api/staff/inventory/:id/lettuce-stock`
- `POST /api/staff/supplies/:id/stock`
- `GET /api/staff/shipments`
- `GET /api/staff/activity?page=1` (optional `type=stock`; always authenticated user's own history)
- `GET, PATCH /api/staff/profile`
- `POST /api/staff/logout`

New Admin-only endpoints:

- `GET, POST /api/admin/staff`
- `PATCH /api/admin/staff/:id`
- `POST /api/admin/staff/:id/reset-password`
- `GET /api/admin/staff/:id/activity?page=1`

Reused existing login, password-change, inventory movement, reservation, product/variant conversion and audit services. Existing Admin management gates remain restricted except the explicitly shared, permission-checked creation endpoints described in the latest capability update.

## Audit logging

`staff_activity` records Staff/actor IDs, action, related order/product, old/new values, reason and actual backend timestamp. Stock changes retain the existing Inventory History entry and add a personal activity entry in the same transaction. Supply quantities in personal history identify the underlying pool unit, preserving shared conversion semantics.

Existing `auth_security_events` records login, failed login and credential events. Operational events also appear in existing System Logs with the persisted actor role, avoiding mislabelling Staff as Admin. Personal queries exclude the duplicate System Logs projection of an operational event. Staff cannot select another user's history via query parameters, read system-wide logs, or edit/delete activity. UI timestamps use Asia/Manila.

## Database migration and preservation

`021_operations_staff.sql` adds nullable `users.last_login_at`, the existing optional order-confirmation/restoration fields when missing, `staff_fulfillment`, `staff_activity` and an activity index. It does not create accounts, seed tasks, alter business balances, change roles or modify historical records.

Migration was applied on October 26, 2026 after a successful dry-run and a verified PostgreSQL custom archive:

`.backups/before-operations-staff-2026-10-26T03-03-39-223Z.dump` — 149,882 bytes.

`migrate-operations-staff.js` compared before/after hashes of users, products, orders, order items, historical batches, stock movements and supply variants/pools. All original data remained unchanged. The configured database has two quantity-mode lettuce products; migration 020 is complete for those records. No Staff accounts or packing/audit fixtures were created in the application database; the new operational tables were verified empty after migration.

The ordinary migration runner includes 021. For an existing deployment, the targeted script supports a read-only dry-run by default and explicit `--apply --backup=<verified-custom-archive>`. It refuses application when its integrity comparison changes. Backups remain local and excluded from Git. Do not restore the pre-migration archive over subsequent real business activity; use reviewed forward reconciliation once new transactions exist.

## Files modified or added for this task

Backend:

- `server/src/db/migrations/021_operations_staff.sql`
- `server/scripts/migrate-operations-staff.js`
- `server/scripts/migrate-inventory.js`
- `server/scripts/backup-lettuce.js` (optional backup filename label; existing default preserved)
- `server/src/index.js`
- `server/src/utils/staffPermissions.js`
- `server/src/utils/staffAuth.js`
- `server/src/utils/auth.js`
- `server/src/routes/auth.js`
- `server/src/routes/operations-staff.js`
- `server/src/routes/lettuce-stock.js`
- `server/src/routes/gardening-supplies.js`
- `server/src/routes/logs.js`

Frontend:

- `src/staff/StaffPortal.jsx`
- `src/staff/staffApi.js`
- `src/staff/StaffInventory.jsx`
- `src/staff/StaffOrders.jsx`
- `src/staff/inventoryDisplay.js`
- `src/admin/AdminStaff.jsx`
- `src/admin/AdminLayout.jsx`
- `src/admin/AdminLogin.jsx`
- `src/api/client.js`
- `src/App.jsx`

Tests/documentation:

- `server/tests/operations-staff.test.js`
- `server/tests/operations-staff-ui.test.js`
- `OPERATIONS_STAFF_PORTAL.md`

Other pre-existing working-tree changes were preserved.

## Executed verification

- Isolated PostgreSQL integration tests exercise account creation/uniqueness/hashing, workforce login, mandatory password change, email/username login and wrong-portal rejection, role/API boundaries, live dashboard counts, financial-field omission, payment/shipping blocking, packing concurrency/version checks, all packing stages, unchanged order snapshots, stock +10/-3, idempotent retry, concurrent Stock Out, invalid quantities, supply variant separation, forbidden corrections/initialization, personal activity, administrator history, reset/deactivation and session revocation, and five-attempt restriction.
- New server-rendered UI checks exercise the three primary Staff destinations, collapsed mobile navigation markup, desktop layout classes, mandatory-password screen and incompatible-role session guards. These are render tests, not actual viewport measurements.
- Full regression suite has passed with **194 tests, 0 failures, 0 skipped**, including existing Admin/Rider lockouts, isolated SMTP/reset tests, customer authorization/registration, checkout/payment/reservation tests, stock migration, supplies and historical order handling.
- Final focused Staff API/UI run: **15 passed, 0 failed** after optional-email login, cross-order checklist validation and fresh-schema migration checks. These final focused checks followed the full regression run.
- Frontend production build: passed. Scoped frontend/backend ESLint: passed.
- Configured running backend responds 401 to unauthenticated `/api/staff/dashboard`, confirming the new route is mounted and protected.

All mutation tests used disposable schemas on the isolated test PostgreSQL cluster. No real account was locked or reset; no real payment, order, shipment, GPS or stock transaction was submitted.

## Limits and operation notes

- The computer-use browser inventory was empty, native automation was unavailable, and opening the in-app browser returned “Browser is not available: iab.” Actual desktop/mobile visual, touch, focus walkthrough and real-device GPS tests could not be performed in this session. Production build, UI render tests and backend regressions passed; perform a browser walkthrough before release.
- There is deliberately no initial Staff account. Use Admin → Staff → Create Staff, share the temporary credential securely after verifying the person, and have them change it at first sign-in.
- Staff can accept eligible Pending orders. Unverified online payments and unapproved shipping remain blocked until resolved through the existing authorized workflow. No new shipping-approval or payment workflow was invented.
- Only the handling Staff member or an Admin can advance a claimed task. Staff cannot self-reassign another handler's work. Administrative task reassignment has no dedicated UI in this implementation; existing Admin operational authority remains available.
- Staff may dispatch a Ready for Pickup package through the existing fulfillment handler. Delivery completion remains in the existing Admin/Rider/courier workflows. Ready alone does not hand off or change delivery/payment state; dispatch requires an explicit confirmed handoff. It never marks Delivered, collects COD or marks Paid.
- Staff password reset does not clear existing login-attempt restrictions. Their temporary restriction expires under the configured policy; Rider permanent security unlock rules remain separate.

## Inventory/navigation refinement ? October 26, 2026

Staff Inventory now follows the Admin Inventory information hierarchy: four compact summary cards, actionable Needs Attention, Inventory Alerts, search/filter, product image/code/name/type/tag or variety, read-only retail price, available/reserved/allocated quantities, status, Details and permitted Stock In/Out. Products paginate in groups of 20; the wide table scrolls inside its container on narrow screens. Supply variants remain separate and no mixed-unit stock total is calculated. No Add Product, Edit, Archive or price mutation is available to Staff. Existing stock forms and backend authorization are reused. Stock selection preselects the correct product; in-flight stock forms cannot be closed or switched via the table. Refresh retains the current form and confirmation message.

Verification for this refinement: 18 focused Staff API/UI tests passed, including filters combined with SKU search, unit-specific summary counts, three-module navigation and Admin-style table rendering. Scoped lint and frontend production build passed. Earlier 194-test full regression results above are from the original portal implementation; the full suite was not rerun for this layout refinement. No database migration or business-record change was needed. Actual browser visual verification remains unavailable as described above.

## Staff Order Management visibility ? October 26, 2026

Staff Orders now follows the Admin Order Management screen: Total Orders, Pending Action, In Progress and Delivered cards; customer/order/courier/tracking search; Manila creation-date filters including the entire end date; All, Pending, Preparing, Out for Delivery, Cancel Requests, Cancelled and Delivered tabs; and a paginated table showing Order ID, customer, read-only total, order/payment labels, date and View Details. The full order dataset comes from the role-protected Staff overview endpoint, not just eligible packing tasks or visible rows. Existing shared order summary/filter helpers are reused.

This expands authorized Staff order visibility, including Pending and historical orders, without changing preparation permissions. The overview DTO excludes payment session IDs, driver access tokens, GPS coordinates and credentials. Packing controls appear only when the server reports existing acceptance/payment/shipping/inventory eligibility; historical item checkboxes are disabled. Read-only order totals and payment labels are operational information, not revenue analytics or permission to verify/settle payments. Existing Admin APIs remain inaccessible to Staff. No order records, payment calculations, inventory balances or database schema were changed.

Modified: StaffOrders.jsx (new), StaffPortal.jsx, operations-staff.js, operations-staff.test.js and operations-staff-ui.test.js. Verification: 24 focused Staff API/UI and shared order-display tests passed; scoped lint and production build passed. Actual browser visual verification remains unavailable as previously documented.

## Expanded operational permissions ? latest client instruction, October 26, 2026

This update supersedes the original read-only/new-product restrictions and administrator-only acceptance/assignment limitations described in earlier implementation notes. Staff remains a limited operational role, not Admin/Seller.

Staff can now:

- Accept eligible Pending requests through POST /api/staff/orders/:id/accept. Admin and Staff reuse orderAcceptance.js; payment verification, valid inventory and approved shipping remain prerequisites. Acceptance records the real backend confirmation timestamp and one Staff audit event, enables the existing invoice rule and never changes payment status. Customer confirmation wording and snapshot timeline now use neutral team wording rather than falsely attributing Staff acceptance to an administrator.
- Select eligible riders through GET /api/staff/riders and assign a rider or J&T Express/LBC courier through PATCH /api/staff/orders/:id/delivery. The approved checkout delivery method/fee remains unchanged; method changes requiring new shipping approval remain an Admin exception. Staff may enter courier tracking numbers and preparation notes. Ready packages may be explicitly dispatched; Delivered, POD, GPS and financial settlement remain protected.
- Add new Succulents, Lettuce and Gardening Supplies from Inventory ? Add Product. Existing product creation, upload validation, bulk individual-plant codes and idempotency receipts are reused. New lettuce starts at zero 400g packs and uses Stock In. Staff may set the initial retail price of a new product/variant but cannot edit existing prices, identities, images or descriptions.
- Configure variants and physical stock models only for their own newly created, unused supplies. Ownership is derived from server-written Product Added audit entries. Configuration is blocked after orders or initialized stock; general existing-product/model editing and catalog import stay Admin-only. Parent/variant creation requires stable request keys, and variant SKU uniqueness remains enforced. Configure New Supply allows safe recovery of an interrupted setup without creating another parent record.
- Record positive verified opening stock for their own unused new supplies, then normal Stock In / disposal-damage Stock Out. Existing/shared pool conversion, reservations, locks and history are reused. Opening stock for unrelated products, stock correction and inventory overrides remain restricted. Existing individually tracked succulent accounting is preserved.

The permission allowlist adds orders.accept, orders.assign_delivery and products.create; no broad Admin role is granted. The Staff forms remain in the same three primary modules. Existing Admin controls retain their behavior. Assignment reuses updateOrderHandler, applies an explicit narrow field allowlist, validates current account/rider security state, locks relevant rows, and uses a full-precision timestamp version to reject stale or duplicate submissions. Staff responses never return driver access tokens. All successful new actions write backend audit history.

Modified/added for this update:

- server/src/utils/staffPermissions.js
- server/src/utils/orderAcceptance.js (new shared acceptance service)
- server/src/routes/orders.js
- server/src/routes/operations-staff.js
- server/src/routes/inventory-products.js
- server/src/routes/gardening-supplies.js
- src/staff/StaffProductCreate.jsx (new)
- src/staff/StaffOrderActions.jsx (new)
- src/staff/StaffInventory.jsx
- src/staff/StaffOrders.jsx
- src/staff/StaffPortal.jsx
- src/staff/staffApi.js (authenticated multipart support)
- src/admin/GardeningSupplies.jsx (reused request injection and creation-only setup mode; Admin defaults preserved)
- src/components/Signup/Order.jsx
- src/utils/orderDisplay.js
- server/tests/operations-staff.test.js
- server/tests/operations-staff-ui.test.js

Verification: the full isolated regression suite passed 203 tests with zero failed/skipped. It covers existing Admin/Rider/Customer authentication, reservations/payments, inventory, supplies and history, plus new Staff acceptance, protected assignment, dispatch/locked-rider checks, product creation, duplicate retries, supply ownership/setup and initialization. Final focused Staff API/UI checks passed 24 tests; after the final setup-recovery UI change, all 9 UI/helper checks passed. Production build and scoped ESLint passed. Actual browser/device visual verification remains unavailable. No new migration, account reset, live test transaction, inventory rewrite or historical order modification was performed.

## Existing UI shared-data integration

See STAFF_UI_INTEGRATION.md for the latest targeted integration: shared movement history, Admin preparation metadata, cross-tab/focus/polling refresh, optional lettuce Stock In notes and 206 passing regression tests. Existing Staff layout and prior authorized capabilities were preserved; no new database migration or live business-data mutation was required.
