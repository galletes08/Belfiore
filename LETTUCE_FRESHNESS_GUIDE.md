# Lettuce Freshness Guide

## Implementation

Admin → Inventory → Harvest Monitoring now has an always-enabled **Freshness Guide** button immediately left of View Details. It opens a centered, scrollable, 980px maximum-width native dialog, with a leaf icon, X, footer Close button, Escape support, body scroll lock and native dialog focus containment.

Two keyboard-accessible tabs share the same open modal: Lifecycle Guide (default) and Affected Batches. Tab arrows/Home/End move focus and selection. Inventory polling is not duplicated and refreshes do not reset the guide tab.

The lifecycle cards document existing Day 0–7 Fresh, Day 8–13 Aging, Day 14–20 On Hold and Day 21+ For Disposal rules, physical-quality requirements, manual pricing/disposal and inspection guidance. No new expiration rules or mutations were introduced.

## Files and reused components

- `src/admin/AdminInventory.jsx`: monitoring button, guide modal mode, optional wider modal/icon/close control, existing refresh data and batch navigation.
- `src/admin/LettuceFreshnessGuide.jsx`: lifecycle reference, accessible tabs, responsive affected-batch cards, actual quantities/condition/available metadata, error/empty states and context-dependent action links.
- `src/admin/HarvestBatches.jsx`: optional initial action for a linked batch. Inspection opens existing Price/Condition form; disposal opens existing disposal form. Default existing batch links still open details. Archived products open read-only batch details.
- `server/tests/freshness-guide-ui.test.js`: guide/list rendering and input-preservation regressions.
- This report.

Existing Inventory Modal, HarvestBatches, batch form handlers, inventory API and automatic refresh are reused. No new backend endpoint, database migration, role or polling interval.

## Data and safety

The guide consumes `apiInventory()` product batch records already held by the page. `server/src/utils/harvest.js` supplies the batch ID/code, physical/available/reserved/allocated quantities, condition and existing timestamps/actor. Backend `harvest_batch_age` uses Asia/Manila calendar dates and `harvest_batch_status` gives the authoritative status; the guide does not recalculate or override them. Missing age/date displays Unverified, never zero. Fresh or zero-physical-stock batches do not create attention entries; recorded held/unsafe/unverified batches are included and batch IDs are de-duplicated.

Viewing the guide has no mutation request. Age, price, stock and disposition changes still require the existing authenticated administrator endpoints, validation, confirmations, idempotency keys and audit records. Holds/disposal stages remain excluded from checkout by the existing backend. Original harvest dates, FEFO, 400g units, batch pricing, reservations and existing history are untouched. Recorded By is the available creation actor, not an invented last inspector.

## Actual checks

- **102 tests passed**, zero failed/skipped: existing inventory/order and stock UI suites against disposable schemas in the dedicated PostgreSQL test cluster on port 55433. Includes Manila Day 7/8/13/14/20/21, missing/legacy dates, unsafe-condition overrides, checkout holds, FEFO, prices, reservations, real disposal authorization/quantities and audit preservation.
- **5 tests passed**, zero failed/skipped: lifecycle default and exact thresholds, quality reminder, empty/error states, supplied-data-only attention selection, no input mutation/render-time action, contextual labels and read-only archived path.
- **107 total tests passed**, zero failed or skipped in those runs.
- Targeted ESLint and production frontend build passed. Backend has no separate compilation step and was not changed.

## Remaining visual checks

Only the text task was present in the attachment directory, not an approved screenshot. The layout follows the text specification using compact responsive batch cards rather than a horizontally overflowing table. Actual desktop/mobile browser checks for opening/closing, keyboard tab changes and direct form navigation were not run; component rendering and existing backend form integrations passed. No sample batches were inserted into the application database, no application records changed, and no real inventory operation was submitted.
