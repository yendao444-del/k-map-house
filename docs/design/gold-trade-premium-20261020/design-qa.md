# Premium Mỹ Hạnh trade modal — option 1 — 2026-10-20

## Findings

No actionable P0/P1/P2 visual differences remain after the iterations below. The selected composition is implemented in the existing production GoldTradeModal, not a replacement app.

## Comparison target and evidence

- Source visual truth: `G:/PHONG TRO/app/tmp-product-design/gold-trade-premium-refined-20261020.png`, the first displayed option selected by the user; 1230×1278 pixels.
- Implementation: `G:/PHONG TRO/app/docs/design/gold-trade-premium-20261020/desktop-final.png`, 800×832 pixels, CSS viewport 800×832, DPR 1. Browser screenshot payload is JPEG despite the filename extension; comparison PNGs are normalized raster composites.
- Full-view combined comparison: `comparison-final.png`, source left and implementation right; source proportionally normalized to 800×832 for an equal-size comparison. Both were opened together and visually compared.
- Focused combined comparison: `comparison-price-footer.png`; price typography, source attribution, large total, primary action, and footer were inspected together.
- State: dark theme, buy, MH9999, 1 chỉ, 13.550.000đ/chỉ, total 13.550.000đ, quote time 19:01 20/10/2026. An isolated fixture supplies deterministic fictional quote/balances for repeatability. It does not access a real account or persist transactions.
- Actual-component preview: `http://127.0.0.1:4189/tmp-product-design/gold-qa/index.html?state=trade&quote=fixture`.

## Required fidelity surfaces

- Typography: existing Inter with Vietnamese glyph coverage, bold title/labels, readable source footnote, large 35px total and strong primary action. No clipped Vietnamese labels or major wrapping drift in the normalized desktop comparison.
- Layout: 650px bounded dialog, continuous navy surface, blue header, fixed product identity, quantity stepper/slider/presets, price, quiet attribution, total and footer follow the approved hierarchy. Compact-height spacing preserves the action at 1280×720 without body scrolling.
- Colors/tokens: navy surfaces, muted secondary text, emerald selected/purchase/total colors. Sale uses a distinct red action/total accent. The app's flat surface treatment is retained instead of the generated mock's subtle texture/gradient; minor P3 fidelity difference.
- Assets/icons: standard existing Font Awesome ring and existing library control icons; no placeholder art or hand-drawn SVG/CSS assets. The ring is flatter than the source's illustrative icon; P3 refinement, not a missing product asset. No new raster illustration was required for these standard UI icons.
- Copy/content: only Mỹ Hạnh MH9999. User-requested primary copy is “Mua vàng”, replacing “Xác nhận mua vàng”; sale uses “Bán vàng”. Enter hint is intentional. Normal-state payment-source/balance/insufficiency blocks are removed. Quote attribution is retained and is not represented as an official Mỹ Hạnh API.

## Comparison history

1. Initial capture `desktop-initial.png` / combined `comparison-initial.png`: P2 total was too small and the primary action inherited weak typography from tracker CSS. Fixed the total to 35px and added narrowly scoped button-weight/font selectors. Revised `desktop-final.png` and `comparison-final.png` show restored hierarchy. Focused `comparison-price-footer.png` confirms readable price/total/action after the fix.
2. Initial short-desktop capture `desktop-720.png`: P2 body needed 39px scrolling at 1280×720. Added compact-height spacing. Revised `desktop-720-final.png` has body client/scroll height 429/429; action top 611.78px and bottom 661.78px, visible within the 720px viewport.
3. Responsive evidence `mobile-390.png` (390×844) and `mobile-320-final.png` (320×640): no page-level horizontal overflow. At 320px the body scrolls internally (389px client, 445px content), while the action remains visible at y544.5–594.5. Internal scrolling at this small height is expected, not clipped persistent controls.

## Interactions and regression checks

- Browser-tested actual production component using an isolated in-memory save simulation, never a real trade, wallet transfer, API write, or database mutation.
- Presets, plus/minus, slider and formatted manual price update the total. Preset clicks return focus to quantity so Enter immediately submits.
- Funded simulation: preset 5 + Enter saved 67.750.000đ once. Another preset 2 + Enter saved 27.100.000đ once.
- Sale simulation: two-unit holding caps sale quantity; 5/10 presets and plus are disabled as appropriate. Dealer buy quote 13.250.000đ is used for sales. Manual 14.000.000đ price + Enter produced 28.000.000đ.
- Empty balance: opening the form shows zero alerts and an enabled purchase action. Click or Enter then reports the shortage and does not invoke save; editing clears the warning.
- Existing confirmed operating-wallet top-up/save pipeline is preserved. This modal prechecks on explicit submit and does not itself execute a transfer.
- Pending-save ref blocks duplicate submissions; repeat Enter is suppressed. Escape closes only when not saving. Tab/Shift+Tab remain in the modal and closing restores opener focus.
- Console errors/warnings: none in the final browser fixture check.
- 60 targeted tests passed: Mỹ Hạnh trade/provider/history, price suggestion/formatting, funding, wallet and auto-funding suites.
- Final `npm run build` passed node/web TypeScript checks and Electron main/preload/renderer bundles. Existing large-chunk/Browserslist warnings are non-blocking. Scoped diff whitespace check passed.

## Open questions and limitations

No design-choice blocker remains. Native Electron window rendering, packaged installer/deployment, actual ledger persistence and real-money transactions were not exercised. Browser verification is of the production component with fictional fixture data, not a claim of a deployed release.

## Implementation checklist

- [x] Apply approved option 1 to existing modal with scoped CSS.
- [x] Concise purchase/sale actions and quick Enter submission.
- [x] Defer funding warnings until explicit submission, retaining financial guards.
- [x] Verify duplicate-save prevention and sale limits.
- [x] Compare full view and focused footer after fixes; verify responsive sizes.
- [x] Run targeted tests and final production build.

## Follow-up polish

P3 only: retain existing flat navy treatment and library ring for design-system consistency; a future art-direction pass may refine them if desired.

final result: passed
