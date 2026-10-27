# Gold workspace — approved option 2 — 2026-10-20

## Scope and visual truth

Approved source: `G:/PHONG TRO/app/docs/design/gold-compact-2026-10-20/split.png`, the second displayed design option. Implemented in the existing Electron renderer, not a replacement application or the admin PWA.

Implementation screenshot: `qa/desktop-final.png`. Source and implementation both measure 1711×919 pixels; browser CSS viewport 1711×919, DPR 1. Dark theme, MH9999, matching two daily observations and quotes, empty holdings tab. No density resampling was needed. Comparison excludes the unchanged top 56px application header: the isolated fixture intentionally labels its fictional data instead of pretending to be the authenticated application.

Full combined evidence (source left, implementation right): `qa/comparison-final.png`. Focused combined evidence: `qa/quotes-final.png`, `qa/tabs-final.png`. Both were opened and visually inspected. Sidebar remains the actual application navigation; its small width difference from the generated mock is intentional.

## Findings and comparison history

1. **P2, corrected — excess quote-panel height.** Initial `qa/comparison-initial.png` showed a roughly 542px quote/chart row against the source's roughly 486px row, pushing the lower panel off screen. Reduced inner spacing, placed the unit caption alongside the update line on desktop, flattened nested quote containers and compacted the empty state. Final row is 488.77px; the complete lower panel ends at 889.77px in the 919px viewport. Main scrollHeight equals clientHeight. Post-fix evidence: `qa/comparison-final.png`, `qa/quotes-final.png`, `qa/tabs-final.png`.
2. **P2, corrected — mobile chart label scaling.** The inherited fixed desktop SVG viewBox shrank labels on phones. The existing business chart now measures its rendered dimensions with ResizeObserver; narrow widths use adjusted chart margins and 190px chart height. Post-fix evidence: `qa/mobile-390-tabs.png`, `qa/mobile-320-tabs.png`. Labels remain legible and neither viewport has page-level horizontal overflow.
3. **P3, accepted — generated surface texture and optical font differences.** The mock has subtly textured navy surfaces and slightly different font rendering. Implementation preserves the product's existing Inter font, flat navy surfaces and library icon family. No core hierarchy or legibility issue remains; no decorative raster recreation is required.

No actionable P0/P1/P2 findings remain.

## Required fidelity surfaces

- **Fonts/typography:** existing Inter and Vietnamese font subset retained. Header, quote values, units, secondary attribution and tab counts preserve the reference hierarchy; no clipped labels in inspected desktop/tablet/phone states. Minor raster/antialiasing differences accepted as P3.
- **Spacing/layout rhythm:** compact shared header, narrow price column and wider chart, aligned top-card heights, one lower tab panel, consistent dividers and modest radii. Desktop columns are approximately 36.7%/63.3%. At 850px and below they stack; tables scroll inside their own container.
- **Colors/tokens:** existing navy palette retained; emerald dealer-buy line/value, amber dealer-sell line/value, emerald primary buy action and red sell action. Selected tabs and visible keyboard focus remain distinct.
- **Image quality/assets:** existing actual brand asset and existing library icons retained. No new raster assets, image placeholders or decorative CSS/SVG substitutes. SVG is the pre-existing data visualization, now dimension-aware, not an approximation of an illustration.
- **Copy/content:** Vietnamese labels and separate empty holdings/history messages are readable. Source attribution deliberately says “Nguồn tổng hợp” rather than implying an official direct API. History disclaimer states only recorded observations are plotted; no invented historical series.

## Browser checks

Actual `InvestmentsTab`, `GoldTracker`, holdings, history and trade form components were rendered in the isolated loopback fixture at `http://127.0.0.1:4190/docs/design/gold-compact-2026-10-20/qa/index.html`. DB and quote aliases apply only to this fixture. Financial writes throw; data is fictional and deterministic.

- Default tab, accurate counts, concise empty states, no duplicate add button or empty table headings.
- Header history action selects, scrolls to and focuses the history tab. Mouse and arrow-key tab navigation, linked ARIA tab/panel IDs and roving keyboard focus checked.
- Period filters and refresh; error, stale and single-observation chart states checked without fabricated fallback prices.
- Buy/sell open existing forms with the correct dealer price direction; two-unit purchase calculation remains 27,100,000đ at 13,550,000đ/chỉ.
- Populated holdings, detailed modal, MH9999 row sale routing and closed-position history checked. Existing edit form opens with original transaction identity. No save/delete submitted.
- Widths 1711, 1024, 390 and 320 inspected; no page-level horizontal overflow. Narrow tables retain internal scrolling. Evidence: `qa/tablet-1024.png`, `qa/mobile-390.png`, `qa/mobile-390-tabs.png`, `qa/mobile-320.png`, `qa/mobile-320-tabs.png`, `qa/populated-history.png`.
- Final browser console errors/warnings: none.

## Automated validation

`node --test scripts/gold-compact-ui.test.cjs scripts/my-hanh-gold.test.cjs scripts/gold-price-suggestion.test.mjs scripts/investment-history.test.mjs scripts/investment-funding.test.mjs scripts/investment-wallet.test.mjs scripts/vnd-price-input.test.cjs`: **37 passed, 0 failed**. Five new actual-component SSR tests cover tab counts, linked accessibility, empty states, retained holdings actions and closed-position history.

Final `npm run typecheck:web` and `npm run build` passed after the last chart cleanup. Production main/preload/renderer bundles built. Existing module-format, Browserslist-age and bundle-size warnings are nonblocking.

## Limitations and implementation checklist

- [x] Approved option 2 implemented in the existing Electron renderer.
- [x] Actual component interactions and responsive layouts checked with safe fixture data.
- [x] Full and focused visual comparisons opened; P2 issues fixed and recaptured.
- [x] Existing trading callbacks, wallet rules, legacy identity and financial storage preserved.
- [x] Tests and final production build passed.
- [ ] Native Electron-window rendering, authenticated live-account integration and real ledger writes were not exercised.
- [ ] Installer packaging, admin-PWA mirroring and deployment were not requested or performed.

The fixture is an actual-component verification surface, not proof of a deployed or logged-in application. Preview remains available locally. P3 texture/font polish is optional follow-up, not a blocker.

final result: passed
