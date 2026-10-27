# Mỹ Hạnh gold-price implementation — 2026-10-19

## Scope and visual truth

- Approved source: `G:/PHONG TRO/app/tmp-product-design/gold-myhanh-original-layout-20261019.png` (1015 × 1550 pixels).
- Implementation: production `GoldTracker` and `GoldTradeModal`, rendered in Codex in-app browser through a read-only component harness. This is not a screenshot of the native Electron window or an installed release.
- Main evidence: `final-desktop.jpg` (1432 × 1149 pixels), CSS viewport 1440 × 1100, DPR 1; browser capture excludes the 8px scrollbar and includes full document height.
- State: dark investment theme, Mỹ Hạnh default, MH9999 selected, actual provider timestamp 19/10/2026 11:43. Reference prices were fetched separately from Vang.Today. No financial/account data loaded or written.
- Normalization: crop the approved outer panel to x26/y13, 966 × 1524; resize proportionally to 713px width. Compare to the rendered left panel crop x16/y16, width 713. Right-hand history panel is outside the approved crop and is checked separately.
- Full-view comparison: `initial-comparison.png`, `revised-comparison.png`, `final-comparison.png`.
- Focused comparisons: `final-hero-comparison.png` (source hero 905 × 431 scaled to 671px wide; rendered hero 671 × 328), `final-table-comparison.png` (source table 905 × 455 scaled to 671px; rendered table 671 × 334).

## Findings and comparison history

1. [P2, fixed] Generic table CSS made product names small/uppercase and painted the selected row header dark instead of emerald. Evidence: `initial-comparison.png`. Added scoped font/case overrides and transparent row-header background, preserving semantic row headers. `revised-comparison.png` confirms all three selected columns share the emerald background.
2. [P2, fixed] Small tables at 320px squeezed numerical columns and clipped prices. Evidence: `mobile-320-initial.jpg` and DOM measurement (21 cells overflowed). Added a bounded horizontal table scroller and visible swipe hint only for narrow widget containers. Final 320px DOM measurement: zero clipped cells, no page-level horizontal overflow. `mobile-320.jpg` is post-fix evidence.
3. [P2, fixed] Mobile source tabs wrapped the Mỹ Hạnh label and increased control height. Reduced tab padding/font at narrow container widths and kept names on one line. Final 390/320 screenshots confirm the fix.
4. [P3, acceptable] Native Inter rendering, small metadata weights, time-before-date locale formatting and flat existing navy surfaces differ slightly from generated image texture. No text is clipped. Preview-only badge is intentionally omitted; a working refresh control replaces it. The actual timestamp is preserved.

The initial visual result remained blocked during these fixes. After recapture, the full-view and focused comparisons show no remaining actionable P0/P1/P2 differences for this component scope.

## Required fidelity surfaces

- Typography: existing locally bundled Inter Latin/Vietnamese faces; heading/price/table hierarchy retained, Vietnamese accents readable. Product labels and numerical columns now have consistent 16px desktop type; responsive tables use 12px with horizontal scrolling when necessary.
- Spacing/layout: four source buttons, amber hero, paired buy/sell tiles, unit equivalents, spread, seven-product table and secondary branded table preserve approved order and proportions. Responsive narrow views stack quote tiles rather than compress prices.
- Colors/tokens: existing investment navy surfaces and emerald active state, green dealer-buy tile and amber dealer-sell tile. Styles are scoped to the gold widget, not other tabs or the operating wallet.
- Assets/icons: source requires no raster assets. Existing Lucide Info/Check/Refresh icons and the existing trade-dialog Font Awesome ring remain library icons. The pre-existing SVG history chart is retained as a data visualization, not a replacement for an image asset.
- Copy/content: real Mỹ Hạnh product table, explicit aggregated-source attribution, đ/chỉ and 1 lượng = 10 chỉ, correct spread. Branded references use the same unit. Source errors never become zero/fake/SJC quotes. Jewelry and silver remain distinct catalog items; only MH9999 is added as a new trade product.

## Interaction and data checks

- MH9999 initial state: buy 13,250,000 and sell 13,550,000 VND/chỉ, spread 300,000; corresponding lượng values 132,500,000 / 135,500,000. These are captured provider values, not constants in application code.
- Selecting Trang sức 24K updates hero to 13,120,000 / 13,490,000 and spread 370,000.
- SJC selection updates both hero and chart; live SJC chart captured in `sjc-history.jpg`, coverage 23/11/2025–19/10/2026. Rapid PNJ → Bảo Tín → Mỹ Hạnh switching did not retain a stale branded chart.
- Mỹ Hạnh history is honestly empty: provider currently publishes no historical series. Removed synthetic history and cross-brand SJC reference stitching from this API.
- Refresh works; loading prevents duplicate presses. Timeout, empty/error and stale-source states are explicit. `source-error.jpg` and `source-stale.jpg` show independent source failure and >36h warning.
- Read-only trade fixture: default new product MH9999; customer purchase suggests dealer sell 13,550,000; quantity +1 makes 2 chỉ / 27,100,000 total. Customer sale suggests dealer buy 13,250,000. No Save button was pressed. `trade-buy.jpg` / `trade-sell.jpg`.
- Legacy SJC holding symbols remain unchanged. Closed MH9999 positions remain in gold transaction history.
- At CSS widths 390 and 320 there is no page-level horizontal overflow; narrow tables intentionally scroll inside their own border. The chart follows below the price widget.
- Final clean-browser console check returned no warnings/errors. An earlier harness-only React HMR duplicate-root warning was fixed by retaining the root across hot updates; it was not an application runtime failure.

## Validation and residual limits

- `npm run build`: passed (both TypeScript projects plus Electron main/preload/renderer builds). Existing Browserslist-age and chunk-size warnings remain non-blocking.
- `node --test scripts/my-hanh-gold.test.cjs scripts/gold-price-suggestion.test.mjs scripts/investment-history.test.mjs scripts/investment-funding.test.mjs scripts/investment-wallet.test.mjs`: 30 passed.
- Direct read-only main-provider request: success, all seven products parsed with explicit per-chi units and source timestamp.
- Provider is fixed/allowlisted, no arbitrary URL IPC; trusted Electron sender checks remain active. Ten-second timeout, five-minute successful-response cache, duplicate in-flight request coalescing, strict price/time validation.
- No native Electron window capture, installer packaging, release deployment, real ledger mutation or long-term external-source uptime test performed. Browser harness verifies the production components, not the full logged-in application.

## Implementation checklist

- [x] Approved widget and responsive layout implemented.
- [x] Real source, attribution, units, error/stale states verified.
- [x] Buy/sell suggestion boundaries and legacy symbol separation tested.
- [x] Full-view and focused comparison completed after fixes.
- [x] Build and 30 regression tests passed.

final result: passed
