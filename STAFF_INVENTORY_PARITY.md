# Shared Admin and Staff Inventory

Admin and Staff now use `InventoryOverview` for the same title/bell alignment, summary cards, inventory alerts, search/filter controls, table cells, status badges, spacing and pagination. Read-only product details and actionable alert details also use shared components. Search and ordering use the same helper, including SKU search, available/reserved/sold ordering and archived-record filtering.

`GET /api/staff/inventory/overview` is protected by the existing backend `inventory.read` permission and reuses the exact Admin inventory read handler. Products, supply variants, balances, prices, statuses and summary calculations are identical to `/api/admin/inventory`. The additional Staff metadata identifies that user's own newly created supplies eligible for the existing initialization workflow. It does not grant editing access to existing supplies.

The Staff Portal consumes this overview with one inventory request and adapts its fields to the existing Stock In/Out forms. The earlier Staff inventory endpoint remains available for existing callers. Existing refresh/invalidation and reservation/accounting rules are retained.

Staff actions remain Details, Add Product, authorized Stock In/Out, History, and the existing configuration step for their own newly created supply records. Existing-product editing, price changes, Archive/Restore and catalog import remain unavailable to Staff and protected server-side. Archived listings can be inspected through the same filter, but cannot receive Staff stock movements. Sold succulents remain read-only with Details/History.

## Files changed

- `src/admin/InventoryOverview.jsx` — shared presentation, product details and alert details.
- `src/admin/AdminInventory.jsx` — reuses shared presentation; existing Admin forms/actions retained.
- `src/staff/StaffInventory.jsx` — same presentation with Staff-authorized actions and existing forms/history.
- `src/staff/StaffPortal.jsx` — loads the shared overview through the Staff endpoint.
- `src/utils/inventoryPresentation.js` — shared filters/order and stock-form adapter.
- `server/src/routes/inventory-products.js` — shared role-protected inventory read handler.
- `server/tests/inventory-overview-ui.test.js`, `operations-staff.test.js`, `operations-staff-ui.test.js` — parity, rendering and permission regression coverage.

## Tests actually executed

- **144 passed, 0 failed, 0 skipped**, across inventory-overview UI, operations-staff UI/integration and existing inventory tests.
- Integration assertions compare Admin and Staff products and summary objects for exact equality and verify no product balance change from the read. Customer/Rider/unauthenticated access is rejected; Staff still cannot call the Admin inventory endpoint.
- Existing stock/reservation, supply variants/shared pools, creation, history, archive/restore and permission regressions passed.
- Frontend production build passed.
- Scoped ESLint passed.
- No live inventory mutation, database migration/reset or historical-data deletion was performed.

Browser-interactive and viewport screenshot testing was not performed for this change. Responsive markup and table overflow behavior were checked through rendering tests; both pages now share the same responsive component.
