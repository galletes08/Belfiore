# Compact Inventory UI redesign

## Changes

Updated `src/admin/AdminInventory.jsx` and added reusable `src/admin/InventoryActionMenu.jsx`. No backend, database, navigation, or unrelated module changes.

- Four compact icon summary cards retain database-backed values and the existing distinct attention calculation.
- Harvest Monitoring retains all five metrics, subtle separators, restrained warning accents, and the existing actionable details panel.
- Smaller header controls with icons, a search icon, compact aligned table rows, smaller rounded thumbnails, readable prices, and distinct available/reserved/stock-warning badges.
- Edible rows show Details / Stock / More. Stock contains Stock In, Stock Out and View Harvest Batches. More contains Edit, History and Archive or Restore.
- Succulent rows show Details / Edit / More, with History and Archive or Restore in More.
- Existing handlers and confirmation dialogs are reused. Active reservations disable Archive with an explanation. Archived edible stock mutations are disabled with explanations; batch viewing remains accessible. Existing server validation continues to enforce unresolved orders and sold-plant restore restrictions.
- Menus use a body portal and fixed viewport coordinates so table overflow cannot clip them. Placement switches above the trigger when space below is insufficient; menus have bounded height and their own scrolling. Outside pointer clicks, Escape, resize and surrounding scroll dismiss them.
- Native trigger/menu buttons support Enter/Space; Arrow keys, Home and End navigate menu items. Escape restores trigger focus. Restricted items use aria-disabled, retain focusability for reading explanations, and cannot execute. Opening a menu performs no inventory mutation.
- Responsive cards use one/two/four columns. Header controls and monitoring metrics wrap; the table scrolls inside its container and row actions remain inline.

## Executed checks

- Full ESLint: passed.
- Vite production build: passed.
- Existing `npm --prefix server run test:inventory`: 4 tests passed; PostgreSQL integration suite skipped because no explicit test database URL was supplied. This run did not execute the previous 64 integration cases.
- Attention-count assertions for overlapping batch/stock alerts, multiple affected batches, reserved/archived exclusions and empty state: passed.
- `git diff --check`: no whitespace errors (existing CRLF conversion warnings).

## Remaining validation

The attachment contained task text but no reference image, so the implementation follows its written visual specifications. Exact image matching could not be assessed. Browser interaction, keyboard automation, viewport screenshots and live database stock/archive/restore workflows were not executed. Their handlers were inspected and preserved, but build success does not establish those end-to-end results. No browser testing dependency was added.

No database reset, migrations, product edits, quantity changes or production transactions were performed by this task.
