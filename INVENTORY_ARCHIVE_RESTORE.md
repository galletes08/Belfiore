# Safe archive and restore

Archived rows now have a Restore button with an icon, alongside Details, Edit and History. Both Archive and Restore open confirmation dialogs. Archive requires a selected reason and a description for Other Reason. Restore displays the previous archive reason, requires inspection notes, and requires an explicit physical sellability confirmation when recorded stock is positive. Feedback and inventory totals refresh only after backend confirmation.

## Safety rules

The admin-only archive and restore endpoints lock the product row inside a database transaction. They verify existence, current listing state, reserved quantities, active reservation records and unresolved order commitments. Concurrent duplicate actions return a conflict instead of making a second state change or audit record. Neither action cancels orders, changes stock quantities, or deletes history.

Succulent restore additionally validates the unique code, sold marker and completed-sale history. Sold plants cannot be restored. A plant must have exactly one available unit and no legacy quantity review flag. Physical inspection and sellability confirmation are required, including checking previous damage or unavailability.

Lettuce restores the listing with its existing name, price and pack quantity. Zero packs remains Out of Stock; positive packs derive Available or Low Stock from the existing threshold. Use the existing Stock In/Out workflow after restoration. Reserved quantities and outstanding commitments must be reconciled through the existing order workflow before changing the listing state.

Archived records show their recorded quantity separately from Available for Sale: 0. They remain excluded from available-stock summaries and the public catalog. Legacy grouped plants show a warning. Verify the physical plants, create separately coded individual listings with their own images, and keep the grouped record archived for history; the system does not split, delete or silently reduce those quantities.

## Database and APIs

No new migration is needed. The existing `archived_at`, stock/reservation fields and transactional inventory-movement trigger are reused. Archive reasons come from existing history records, rather than overwriting product descriptions. Successful actions record Product Archived or Product Restored, previous/new status, reason, administrator and database timestamp. History's Activity Type filter includes Product Restored; existing System Logs reads the same records. Timestamps display in Asia/Manila and remain read-only.

- `POST /api/admin/inventory/:id/archive`: `{reasonType, reason}`. Reason types are Damaged Plant, Dead Plant, No Longer for Sale, Temporarily Unavailable, Other Reason.
- `POST /api/admin/inventory/:id/restore`: `{reason, confirmSellable}`. Inspection confirmation must be boolean `true` when positive stock exists.
- The previous `DELETE /api/products/:id` remains a soft-archive endpoint, now requiring the same reason payload and safety checks. It never permanently deletes the record.

## Modified files

- `src/admin/AdminInventory.jsx`: row actions, dialogs, recorded versus sale quantity, feedback and review warnings.
- `src/api/client.js`: archive and restore requests.
- `src/utils/inventory.js`: restored activity filter option.
- `server/src/routes/inventory-products.js`: transactional validation, endpoints, latest archive reason and history filter support.
- `server/src/routes/products.js`: archive reason metadata.
- `server/tests/inventory.test.js`: archive/restore, authorization, preservation and concurrent-submission coverage.

## Verification and limits

All 46 PostgreSQL/API and unit tests passed. Coverage includes available succulent archive/restore, repeated restore, reserved-plant archive rejection, active COD commitments, sold-plant rejection, stocked/zero-stock lettuce, catalog exclusion, archived filter visibility, audit reasons/statuses, concurrent duplicate submissions, unchanged order snapshots, grouped legacy review, and existing payment/reservation/history behavior. Full-project lint and production build passed.

Physical sellability is an administrator's inspection responsibility; software cannot determine whether a plant is alive or packs remain fresh. There is no new sold-product return/restocking workflow: those records remain blocked from restore. Grouped legacy correction remains an explicit physical review and individual-listing process. Local integration tests use a separate PostgreSQL test database; no production products were archived or restored for testing. Browser layout inspection and real provider payment calls were not part of these checks.
