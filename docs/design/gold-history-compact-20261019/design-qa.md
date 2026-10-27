# Gold history and compact layout — 2026-10-19

## Scope and comparison

Scoped correction to the existing approved Mỹ Hạnh widget, not a new design direction.
Approved visual: `G:/PHONG TRO/app/tmp-product-design/gold-myhanh-original-layout-20261019.png`.
User bug references: clipboard `90e256f8-d349-4a8b-92f5-2dacafa02ece`, `d4a6c16b-1d3c-4064-8500-d9fca5168413`, `7190db2e-b06c-4b56-b0c0-f23f29548dd7` in `C:/Users/Admin/AppData/Local/Temp/`.

Preserved from the approved target: navy background, emerald buying price, amber selling price, Mỹ Hạnh default/primary focus, seven distinct products, third-party attribution, explicit chỉ/lượng conversion, and secondary branded reference prices.
Requested deviation: the tall stacked left column is split into a top quote/chart row and a bottom local/reference table row. All seven local products remain accessible, without hiding them behind pagination.

## Rendered evidence

- `my-hanh-1150.jpg`: actual production component at 1150×900, live provider quote and one real observed day.
- `sjc-1150.jpg`: selected SJC, actual 331-day source history, no cross-brand substitution.
- `mobile-390.jpg`, `mobile-320.jpg`: single-column behavior, bounded table scrolling at the narrowest width, no page-level horizontal overflow. Quote unit labels wrap separately to avoid clipping.
- `source-error.jpg`: failed Mỹ Hạnh source and preload/history path, explicit retry/restart message, no fabricated quote or chart.

Final desktop widget height measured 752.94px. Quote and chart top panels both measured 379.94px. Bottom tables share a row instead of extending a single tall column. This is component/browser evidence, not a native Electron-window capture.
Product selection was exercised: MH9999 → 24K updates both current and chart prices (13,120,000 / 13,490,000 đ/chỉ for the observed 24K quote). Switching to SJC produced 331 historical daily points. Switching back restored only Mỹ Hạnh data. Final browser console had no errors or warnings.

## History source limitation

Verified public GET endpoint:
`https://tuanquangdong.com/wp-admin/admin-ajax.php?action=gptqd_history_data&profile_id=52&render_id=0`

Actual response during this work:
`{"success":true,"data":{"profile_id":52,"days":[],"products":[]}}`

The app now requests this endpoint instead of hardcoding an empty history. A strict parser accepts only known Mỹ Hạnh products, full valid dates and valid per-chỉ prices. If source history is populated later it is merged by product/date; past source days take precedence over local observations.

Until then the app plots actual observed quotes, including a single-point chart with explicit coverage and explanation. It does not claim to have downloaded earlier months, invent earlier dates, copy SJC history or join different purities. Local history stores the latest observed quote for each day; this is not an official end-of-day closing price. Refreshing on the same date does not invent more daily points.

Daily observations are persisted under Electron userData as `my-hanh-price-history.json`, using bounded validation and atomic replacement. A corrupt existing history file is preserved and persistence failure is surfaced. Public quotes only; no wallet/ledger/account data is written. The widget refreshes every five minutes while mounted; there is no background automation and no collection while the app is closed.

## Verification

- 39 tests passed: source validation, history parsing, daily persistence/reload/deduplication, corruption preservation, provider-empty/outage/backfill, exact product/range selection, single conversion, existing funding/wallet/history regressions, and trusted IPC.
- `npm run build` passed: both TypeScript projects and Electron main/preload/renderer bundles. Existing Browserslist-age and chunk-size build warnings remain.
- Browser harness uses actual source/component code, isolated from user accounts and financial writes. Browser history storage is in-memory; durable disk behavior is covered by temporary-file tests. Real Electron userData is only used when the user runs the app.
- No installer, release deployment, real transaction or native Electron visual verification was performed.

Result: compact layout and history integration verified. Download of pre-existing Mỹ Hạnh history remains unavailable because the upstream endpoint returns no records. Restart an app using the updated build to load the new preload/main IPC.

## Follow-up: remove lower tables

User reference: `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-c24960b8-d568-497d-9775-fab6ab9e5dab.png`.
Both highlighted lower tables (Mỹ Hạnh product list and branded reference list) have been removed from the production component, not merely hidden. The grid now has only quote/chart areas, including its narrow-screen variant, so no empty lower row remains. Mỹ Hạnh focuses on MH9999. Existing source buttons, current buy/sell quotes, chart/history collection and trading/backend behavior are unchanged.
Updated browser evidence: `without-lower-tables-1150.jpg`. Earlier captures above describe the previous iteration and are retained as history.
