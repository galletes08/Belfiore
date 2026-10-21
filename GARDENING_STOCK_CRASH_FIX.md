# Gardening Supplies Stock white-screen fix

## Exact root cause

Clicking Stock opens the shared `InventoryActionMenu` portal. Its menu item renderer assigned `const ItemIcon = item.icon` and unconditionally rendered `<ItemIcon />`.

The Gardening Supplies items (`Stock In / Stock Out`, `Manage Variants`, `View Stock History`) omitted their `icon` properties. React therefore tried to render an undefined component and threw:

```text
Element type is invalid: expected a string (for built-in components)
or a class/function (for composite components) but got: undefined.
```

This was reproduced with an actual React render of the shared menu items before applying the fix. Lettuce's equivalent menu already supplied icons. The exception occurred while opening the menu, before a supply stock transaction or stock-model lookup.

## Fix

- Supply Stock actions now provide their appropriate icons.
- The shared menu renders optional icons conditionally. Its item renderer is a named component so regression tests exercise the same rendering path used by the portal.
- Null, missing, non-array and null-entry variant collections normalize to a safe list in the supply dialog.
- Products with no active variants show an Add/Restore Variant message and a Manage Variants action.
- Unconfigured models or incomplete pool/conversion setup show a clear Configure Stock Model action that opens the existing variant/configuration tab.
- A correct active variant must be explicitly selected. Submission stays disabled and is also guarded in the submit handler until the variant, stock model, conversion and movement are valid.
- Uninitialized balances require Verified Opening Stock. Initialized balances use Stock In/Out; initialized zero remains distinct from an uninitialized null balance.
- Selecting a variant resets confirmation and selects the appropriate initial/normal movement. Changing the stock model also clears confirmation. Existing immediate submission guards and keyed movement retries remain in place.
- No backend stock-accounting, authorization, lettuce, succulent, reservation or history logic was changed.

## Files modified

| File | Change |
| --- | --- |
| `src/admin/InventoryActionMenu.jsx` | Conditional icon rendering; shared `InventoryMenuItems` renderer. |
| `src/admin/AdminInventory.jsx` | Supplies action icons. Lettuce handlers remain unchanged. |
| `src/admin/GardeningSupplies.jsx` | Defensive variant handling, explicit setup/empty states and valid stock-submission guards. |
| `server/tests/inventory-stock-ui.test.js` | React/Vite component rendering regression tests, including the original failure. Uses existing dependencies. |
| `server/tests/supplyChecks.js` | Stock In/Out on both mix weights; missing variant rejection; shared 5/10-piece movement conversions. |
| `GARDENING_STOCK_CRASH_FIX.md` | This report. |

## Verification

The reproduction test failed before the icon fix with the exact React error above. It passes after the fix.

Component cases:

- Supply menu actions without optional icons.
- Existing lettuce icons and harvest Stock In form.
- Potting mix 1 kg and 2.5 kg with null balances.
- Unconfigured 5-piece and 10-piece trays, with a visible configuration action.
- Empty, missing, null and malformed variant collections.
- Configured shared tray variants with initialized zero balances and mandatory explicit selection.

Database integration cases use isolated test schemas. They verify stock increases/decreases for both mix variants; 5/10-tray conversion against one shared physical pool; correct history records; opening-stock rules; missing-variant, zero and negative-quantity rejection; insufficient/negative-stock prevention; reservation protection; concurrent order safety; retry protection and administrator-only mutations. Existing lettuce stock/harvest and individual succulent regression coverage is retained.

Final full suite: **149 passed, 0 failed, 0 skipped** (`npm.cmd --prefix server run test:inventory` with the isolated database). Frontend lint, production build and `git diff --check` passed. The seven component-render checks were also rerun after the final confirmation-state safeguard. Component tests render the actual React components through Vite and ReactDOM server rendering; they are not a completed interactive browser or mobile viewport test. Browser sessions were unavailable in this environment.

The operational database was inspected read-only. It contains seven supply variants with no initialized balances. No opening stock was entered, catalog import executed, migration applied, record reset or history deleted for this fix. Variant/pool content fingerprints matched before and after testing.
