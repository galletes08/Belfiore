# Inventory sorting, sold records and stock alerts

## Changes and rules

- All Products sorts the entire fetched database result before the existing 20-row pagination: Available, Reserved, Low Stock/Out of Stock, other unavailable records, then Sold succulents. Within each group: creation timestamp descending, product ID descending. Other filters retain their existing order. Name/code searches operate on the full result, including sold records.
- Shared stock-alert logic excludes archived records and Sold/Reserved succulents. Active edible products with zero sellable packs still count, even when physical packs remain held. Low-stock thresholds and batch aging/hold/disposal metrics are unchanged.
- Needs Attention excludes normally sold plants. Stable product and batch IDs deduplicate input records. Each affected physical batch counts once; stock alerts on its parent do not add another count. A product without affected batches counts once for stock shortage or legacy plant validation.
- Sold succulent rows expose Details and History, with the existing gray Sold badge. Normal Edit is guarded in the UI and rejected with HTTP 409 by the backend while holding the product lock. The backend checks sold_at and non-cancelled paid/refund/delivered sale references. It rejects all ordinary sold-product edits, including metadata, code, price, status or quantity submissions. A future separately authorized correction/return workflow is required; none was invented here.
- Existing restore rejection for sold plants remains. Product responses now expose soldAt so an archived sold plant also stays read-only in this UI. Sale prices in order items, original product data, and order/payment/history records are not rewritten.
- Existing reload after changes and visible-tab polling continue to update the listing and metrics after sales. No additional requests were introduced.

## Modified files

- `shared/inventoryRules.js`: shared alert predicate, sold detection, deterministic priority comparator.
- `src/admin/AdminInventory.jsx`: full-result sorting, read-only sold actions and edit guard.
- `src/utils/inventory.js`: corrected Out of Stock filter.
- `src/utils/inventoryAttention.js`: sold exclusion and stable-ID deduplication.
- `server/src/routes/inventory-products.js`: corrected summary and transactional sold-edit protection.
- `server/src/routes/products.js`: soldAt response field.
- `server/tests/inventory-display.test.js`: sorting/pagination, search/filter, alerts and attention tests.
- `server/tests/inventory.test.js`: corrected expected stock-alert rule and sale/edit/purchase regression assertions.

## Executed validation

- ESLint passed; Vite production build passed.
- Full inventory test run with explicit isolated local PostgreSQL test database: **63 passed, 0 failed, 0 skipped**. The tests create and remove a separate random schema; the application database was not used.
- Verified new plant creation, actual backend paid-sale transition (mocked provider events), quantity zero/Sold, rejected re-purchase and ordinary edits, unchanged persisted sold record and payment status.
- Verified whole-result priority sorting across pages and creation-date/ID ties; sold search/filter inclusion; sold-only alert counts zero; edible shortages, held/disposal batches, duplicate alert IDs, archived/reserved exclusions and legacy issues.
- Existing integration coverage passed for history, reservations, stock adjustments, archive/restore, immutable order snapshots, manual batch prices, aging thresholds and disposal.
- Test PostgreSQL service stopped after the run.

## Limits

Browser/mobile interaction and visual menu checks were not executed. Provider requests/events were mocked; no real PayMongo charge or payment event was sent. No new metadata-correction or return workflow was added. Ordinary sold records remain read-only.

No migration, database reset, existing product-price update or historical-sales rewrite was performed. Existing sidebar and compact UI design are preserved.
