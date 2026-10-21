# Inventory dashboard UI update

- Four compact primary cards: active products, available individual succulents, sellable lettuce packs, and distinct affected records.
- Responsive summary grid: one column on narrow mobile, two from the small breakpoint, four from the desktop breakpoint.
- Compact Harvest Monitoring panel retains all five existing database-driven monitoring metrics. View Details lists affected products and batches and opens the existing product or harvest management modal.
- Needs Attention counts each active affected batch once, regardless of overlapping reasons. A parent product with affected batches is not counted again for its stock alert. Products without affected batches count once for low stock, zero stock (excluding Reserved), or legacy individual-plant validation. Empty/disposed batches and archived products do not add batch alerts.
- Reserved quantities remain in the inventory table and product/batch details. Underlying overview statistics remain available from the existing API.
- Existing search, filters, table, pagination, history, stock actions, archive/restore and batch management handlers are preserved. Existing reload-after-change and 30-second refresh remain; no additional API requests were introduced.
- Loading placeholders and monitoring error messaging avoid presenting initial zero counts as confirmed healthy inventory. Native buttons retain keyboard support.

## Validation

- Full ESLint passed.
- Vite production build passed (rerun with approved permissions after sandbox denied config directory access).
- Executed Node assertions for attention deduplication, multiple batches on one product, overlapping stock alerts, reserved and archived exclusions, fresh/disposed/empty batches, legacy review, and empty/healthy inventory. All passed.
- Responsive CSS and existing action wiring inspected. Browser interaction, visual viewport checks, and live database workflow tests were not run for this layout update.
- No backend, migrations, database records, reservation/pricing logic, or Day-14/Day-21 rules were changed. No database reset or product mutation was performed.

Modified source files: `src/admin/AdminInventory.jsx`, `src/utils/inventoryAttention.js`.
