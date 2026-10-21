# Unified Inventory Add Product

Implemented October 18, 2026.

## Changes

- Inventory header now has only **History**, **Refresh** and **Add Product** as primary actions.
- Add Product opens the existing modal with a single **Product Type** selector: Succulent, Lettuce or Gardening Supply.
- Succulent and lettuce creation reuse the original form, validation, upload workflow and backend APIs. Unique plants, tag/code rules, 400g packs, initial harvest-date validation and existing batch management are preserved.
- Gardening Supply renders the existing supply-details form instead of plant fields. After the parent saves, the same modal continues to the existing variant manager for multiple variants, SKU/price/package/unit/threshold settings and explicit stock-model selection. Verified opening inventory remains a separate existing stock action.
- Type switching resets unsaved type-specific fields and does not call a creation API. Type changes, repeated saves and closing are blocked while a mutation is pending. Supply forms coordinate their loading state with the parent modal.
- Import Supply Catalog moved into a collapsed **Admin inventory setup** area below the table. It remains administrator-only and requires an explicit click and confirmation. Expanding the area, changing product type, loading inventory and auto-refresh never invoke import.
- Setup shows current catalog counts from the already loaded inventory response, without another API request.

The summary cards, filters, table actions, Harvest Monitoring, History and 30-second/visibility refresh behavior are preserved. No order, payment, GPS, reservation, harvest-freshness or physical-stock accounting code was changed for this task.

## Duplicate submission protection

The existing immediate form guards and succulent/lettuce request keys are retained. The parent inventory modal now also uses an immediate shared mutation guard.

Supply creation accepts an **optional `requestId`** on the existing `POST /api/admin/supplies` endpoint. The unified form reuses it for unchanged retries. The backend reuses `inventory_product_requests` and transaction/advisory locks to return the same parent for concurrent/unchanged retries, or reject a changed submission with that key. Fingerprints include canonical product details and uploaded image content/type. Existing callers without a key remain compatible; no new endpoint or table was introduced. Variant SKU/name uniqueness and administrator authorization remain enforced.

## Data preservation

The operational catalog was checked read-only: **3 catalog parent products, 7 variants, 0 initialized stock balances**. Catalog variant/pool content fingerprints matched before and after implementation. No operational product creation, import, stock movement or data reset was executed. No migration was required or applied.

## Modified files and reused components

| File | Scope |
| --- | --- |
| `src/admin/AdminInventory.jsx` | Compact primary actions, unified type selector, existing plant form, shared mutation guard and secondary setup disclosure. |
| `src/admin/GardeningSupplies.jsx` | Reuses supply creation/variant manager; adds creation continuation, shared loading state and a stable creation retry key. |
| `server/src/routes/gardening-supplies.js` | Optional supply creation retry handling using the existing request-receipt table. Existing validation, image storage, role checks and stock APIs are reused. |
| `server/tests/supplyChecks.js` | Extends existing creation tests with concurrent/repeated supply creation, changed-payload rejection, invalid key rejection and an exact one-parent assertion. |
| `INVENTORY_UNIFIED_ADD_PRODUCT.md` | This implementation/test report. |

Reused UI: Inventory `Modal`, `Field`, existing product form, `GardeningSupplies`, existing variant forms/stock-model controls, native keyboard-accessible selects and disclosure. Reused APIs: product create/bulk/update, supply create/variants/model, inventory/history and the administrator catalog import endpoint. Existing local/Supabase product-image storage remains unchanged.

## Verification

**142 tests passed, 0 failed, 0 skipped** in the full isolated PostgreSQL/unit regression suite (`npm.cmd --prefix server run test:inventory`). `npm.cmd run lint` and `npm.cmd run build` passed. Regression coverage exercises succulent and lettuce creation, supply parent/variant saving, SKU validation, isolated stock models, archive/restore, History, authorization and idempotent catalog behavior. New assertions verify two simultaneous supply saves and an unchanged retry produce the same parent, with no extra parent record. Changed/invalid request keys are rejected.

No browser sessions were available in this environment. Actual modal opening, interactive type switching, focus/keyboard behavior, and desktop/mobile visual interaction therefore remain manual checks. The implementation keeps the responsive grids and existing modal layout; a successful build is not claimed as a completed visual test.
