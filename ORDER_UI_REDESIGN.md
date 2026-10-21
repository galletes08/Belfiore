# Minimal Order Management redesign

## UI and components

- Four compact database-backed summary cards: Total Orders, Pending Action, In Progress and Delivered. Each order is deduplicated by ID. Pending Action includes Pending, Cancellation Requested, Refund Pending, COD Remittance Pending and inventory reconciliation issues. In Progress excludes Delivered/Cancelled and covers Preparing/Out for Delivery or recorded Packed/In Transit/Out for Delivery shipment states.
- Compact seven-column table: order reference, customer, historical total, order status, payment status, Manila creation date and actions. Authorized admin email remains under the customer name.
- Search includes numeric ID/reference, customer/email, assigned rider (existing courier display name), courier and tracking code. All status filters remain. Inclusive Manila From/To dates filter the complete fetched result before the added 20-order pagination. Reset clears search, dates, status and page.
- View Details opens a right-side native dialog drawer; More offers Payment details, Delivery & status and Order history. These menu entries navigate the drawer and do not mutate records.
- New `OrderDetailsDrawer` provides Overview, Items, Payment, Delivery and History tabs. It preserves order-ID navigation from Inventory History and the return link with saved history filters.
- Native modal dialog provides focus containment, Escape and focus restoration. Body scrolling is locked while open. Outside/Close dismissal is blocked during mutations and confirms discarding dirty delivery form values. Tabs support ArrowLeft/Right and Home/End. Reduced-motion preferences disable the short entrance animation.
- Summary cards use one/two/four columns. Filters wrap; the seven-column table scrolls inside its container. Drawer occupies the full screen on mobile and a bounded right panel on desktop.

## Preserved workflows and data

The existing delivery/status form and save, rider assignment, courier, tracking sync, cancellation, driver-link copy, confirmation and COD remittance handlers are reused. Important mutations remain inside the drawer. Confirmation dialogs remain for order confirmation and COD remittance; status changes prompt before saving. Delivered/Cancelled records cannot select a different normal order status in this UI.

Items use checkout unit prices, line totals, quantity, product code, batch references and the existing tag snapshot. No completed total is recalculated from inventory. Subtotal, delivery fee and grand total are displayed from the order response; unrecorded discounts are not fabricated. Old missing tags are explicitly Not recorded.

Payment displays server status, COD collection/remittance state and existing PayMongo reference/confirmation timestamp. Merely accepting an unpaid COD order does not label it Paid. Amount paid is not independently stored, so the drawer explicitly says Not separately recorded rather than deriving a payment amount from the order total. No secret keys are exposed.

Delivery retains GPS timestamp, proof, assignment and courier controls. When coordinates exist, View last recorded rider location opens those coordinates; it does not claim a live map. The existing private driver link functionality remains. Logistics keeps its existing non-GPS explanation and Track123 controls.

History uses actual creation, confirmation, provider-paid, rider-assigned/accepted, cancellation-request and cancellation timestamps plus an explicitly labelled latest-status snapshot. It is not presented as a complete audit trail. Unknown actors and missing historical transitions are not invented. Missing scheduled/delivered timestamps and customer IDs are not fabricated.

## Files and APIs

- `src/admin/AdminOrders.jsx`: compact page, summary/filter/pagination integration and existing form inside the drawer.
- `src/admin/OrderDetailsDrawer.jsx`: new accessible tabbed drawer and existing-data presentation.
- `src/admin/orderDrawer.css`: reduced-motion-aware entrance animation.
- `src/utils/orderDisplay.js`: summary, Manila date filtering and recorded timeline helpers.
- `server/src/routes/orders.js`: existing order response adds the already stored `productTag` snapshot. No new endpoint, migration or processing change.
- `server/tests/order-display.test.js`: summary, full-result search/date/page and timeline tests.

## Executed checks

- Full ESLint passed.
- Vite production build passed.
- Explicit isolated PostgreSQL inventory test run: **67 passed, 0 failed, 0 skipped**. Includes order/buyer snapshot reads, COD, mocked PayMongo, reservations, cancellation, historical price protection, batch allocations, sold handling, stock actions and archive/restore regressions.
- New display tests cover distinct counts, terminal progress exclusions, same-day Manila midnight/end-of-day boundaries, combined filters, full-result search before pagination, reset defaults and absent timeline events.
- Test PostgreSQL service stopped after checks. No application database reset, order deletion, product mutation or payment operation was performed for this redesign.

## Limits and separately reported issue

- The supplied attachment contains only text; exact comparison with a reference image was not possible.
- Browser click/keyboard automation and desktop/tablet/mobile screenshot verification were not executed. Native dialog and responsive CSS were inspected, but those browser scenarios are not claimed as passed.
- Provider calls in integration tests are mocked; no real PayMongo payment or courier request was sent.
- The existing backend admin update endpoint lacks an explicit general Delivered → Pending transition guard. This was reported during implementation. The redesigned normal UI disables such terminal status changes; the backend business logic was deliberately not rewritten as part of this UI-only task. A dedicated backend transition-policy fix remains separate work.
