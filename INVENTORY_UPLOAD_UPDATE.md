# Inventory naming, bulk uploads and summary update

## Changes

- New succulent forms suggest **Aloe Hybrid**, including when switching back from Edible Plant. The name stays editable. Existing names, prices, product codes and order references are not renamed or rewritten.
- Inventory keeps the name and code in separate columns. Catalog and details show the same stored name with the succulent's code in smaller monospace text. Orders and invoices show the original order name and its code; reports use `name — code` for individual plants. Lettuce names do not receive an appended code.
- Bulk creation preserves one image, quantity one, a generated unique code and the selected name/tag/price for each plant.
- Upload progress shows actual request transfer percentage, then a saving phase. The success message reports the confirmed product count. Products are committed as one transaction, so failed image storage or validation does not leave partial product or history records. Failed-image errors identify the filename.
- Creation requests use a persistent idempotency key and a fingerprint of form values and image contents. Concurrent or repeated requests with the same key replay the saved receipt; changed input with the same key is rejected. Keep the form unchanged and retry after an uncertain network result. Editing the submission or opening a new Add Product form creates a new request key.
- The existing green/white layout, table actions, filtering, search and reservation/payment logic remain in place.

## Summary rules

All values come from `GET /api/admin/inventory`.

| Card | Calculation |
|---|---|
| Total Products | All product records without `archived_at` |
| Available Succulents | Sum of available stock on active succulent records whose status is Available; excludes legacy unavailable, reserved and sold plants |
| Available Lettuce Packs | Sum of available `stock` on active edible product records; reserved quantities were already removed from available stock, so they are not subtracted a second time; 400g per pack |
| Low Stock | Active edible records with positive available stock at or below their own threshold; zero-stock records are counted separately |
| Out of Stock | Active records with available quantity zero, including Sold plants; fully Reserved succulents are excluded and remain in the Reserved filter |
| Total Inventory Overview | Active succulent record count and active edible product/variety record count shown separately |

The All Products filter now shows active records; archived products remain accessible through Archived. The Out of Stock filter follows the same zero-stock rule as its card. Low-stock and out-of-stock figures count product records, not units or packs. Existing duplicate edible listings are not merged automatically.

## Changed files for this update

- `src/admin/AdminInventory.jsx`, `AdminOrders.jsx`, `AdminReports.jsx`
- `src/api/client.js`, `src/utils/inventory.js`, `src/utils/invoice.js`
- `src/components/Pages/Products.jsx`, `ProductDetail.jsx`, `src/components/Signup/Order.jsx`
- `src/customer/sections/ShopSection.jsx`, `src/customer/pages/orders/OrdersPage.jsx`
- `server/src/routes/inventory-products.js`, `server/src/routes/orders.js`
- `server/src/db/migrations/002_product_uploads.sql`
- `server/scripts/migrate-inventory.js`, `server/scripts/check-inventory.js`
- `server/tests/inventory.test.js`

The one additive migration is necessary for retry protection across connections/server restarts and separate product-code/type snapshots in new orders. It adds `inventory_product_requests` and two nullable fields on `order_items`. It does not backfill or overwrite existing historical information. Existing order lines display their original name and the linked product code when no stored code snapshot exists. New orders retain their own code snapshot if the product is later edited.

The migration has been applied to the currently connected database and readiness verified. For another environment, run `npm.cmd --prefix server run migrate:inventory` before deploying the updated backend.

## Verification and limits

Final results: **36 tests passed**, full-project ESLint passed, and Vite production build passed.

Real PostgreSQL and Express integration tests cover one-image upload, ten-image batches, distinct images/codes, editable names, quantity one, immediate image HTTP retrieval, repeated and concurrent keyed retries, missing required fields, invalid files, forced image-storage failure with full transaction rollback, existing-record preservation, summary calculations, order snapshots and all previous reservation/payment/history tests.

The local storage path and Express image serving are verified with actual PNG files. PayMongo responses remain mocked in these tests; no live charges are made. Supabase storage availability and browser progress rendering still require checks in the deployed environment. If a Supabase batch fails after some images were stored, unused storage objects may remain even though all product records roll back. Transfer progress describes bytes uploaded, not prematurely committed product counts. A newly opened form is a new submission; safely retry an unchanged open form after a lost response.

Test commands:

```powershell
$env:INVENTORY_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55432/postgres'
npm.cmd --prefix server run test:inventory
npm.cmd run lint
npm.cmd run build
```

The database URL above is for a separately running local test database. Tests never fall back to the production connection, and create/remove only their randomly named test schema and their own generated image files.
