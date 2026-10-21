# Inventory History buyer details and View Order

## Behavior

History keeps its existing filters, Manila timestamps, stock changes, batch events and pagination. Customer-related entries now include a compact expandable transaction summary: buyer name, order reference, checkout product name/code, quantity, snapshot unit price and line total, tag/variety, batch reference, payment method and current payment/order/reservation status.

The original inventory movement timestamp remains the transaction-event date. Current payment status is explicitly labelled; an accepted unpaid COD order displays Pending Collection, not Paid. No payment or stock transitions were changed.

View Order navigates to the existing `/admin/orders?orderId=...` module and opens its existing details/editor modal from the authorized orders response. It performs no save, confirmation or other order operation. Back to Inventory History restores history scope, search, activity/date filters and page, plus the inventory table filter/search/page. Missing/inaccessible order IDs show a general unavailable/access message. No linked order means no broken navigation button.

## Data and security

- Modified existing admin-only `GET /api/admin/inventory/history`; no new endpoint. One additional bounded query enriches the current history page, avoiding per-row requests.
- Links require the movement's actual order ID and matching order-item product ID; batch movements require matching batch IDs. Multiple lines remain distinct. No email-based guessing or fabricated order references.
- Buyer name comes from the order snapshot, not today's customer profile. Product name/code, quantity and price come from checkout item snapshots. Legacy missing codes may use the historical movement code, never today's product price. No snapshot values are rewritten.
- Buyer enrichment is limited to sale/reservation/allocation and order-related stock events. Other events retain their existing audit presentation.
- The admin authorization middleware runs before querying buyer data. Existing Orders APIs enforce admin access; customer role rejection is tested.
- History transaction payloads omit email, phone, address, coordinates, credentials and driver/provider tokens. Email-like values in actor labels are redacted without modifying stored audit records. Full order details remain in the existing authorized Orders interface.

## Necessary additive migration

Old order items lacked a checkout tag snapshot. Migration `005_order_item_tag.sql` adds nullable `order_items.product_tag`; new checkout records save the selected product tag. Existing rows remain NULL and show Not recorded. The migration runner successfully applied this migration to the configured application database, preserving historical values and quantities. This is an additive schema change, not a data backfill or reset.

## Files modified

- `src/admin/AdminInventory.jsx`: expandable buyer presentation, View Order and restored history/table state.
- `src/admin/AdminOrders.jsx`: safe order-ID query parameter handling, reuse of existing order form/modal, return navigation.
- `server/src/routes/inventory-products.js`: bounded authorized history enrichment and actor email minimization.
- `server/src/routes/orders.js`: checkout tag snapshot only; no payment transition changes.
- `server/src/db/migrations/005_order_item_tag.sql` and `server/scripts/migrate-inventory.js`: nullable snapshot column.
- `server/tests/inventory.test.js`: migration setup and buyer/security/history snapshot regression coverage.

## Executed validation

- Full inventory suite on explicit isolated PostgreSQL test database: **64 passed, 0 failed, 0 skipped**.
- New integration assertions verify COD remains unpaid, correct buyer/order/code/tag/quantity/price, rejection of customer-role history and order access, minimized payload and actor label, no buyer payload for Product Added, exact batch-specific line matching, historical name/tag/price after product edits, and unchanged order/product rows after history/orders reads.
- Existing history date/pagination, payment/reservation, archive/restore, stock adjustment and batch aging/disposal regression checks passed. Provider responses are mocked.
- ESLint and Vite production build passed. Migration command passed.

## Limits

Browser interaction, direct URL/modal click automation, return-navigation viewport checks and mobile visual tests were not executed. Existing historical tags cannot be reconstructed and remain explicitly missing. Existing historical movement records without field-level metadata cannot acquire missing past field changes through this read-only display update. No separate correction/return workflow was added. No real PayMongo event or payment operation was performed.
