# Mỹ Hạnh only — 2026-10-20

User requested removing other brands and keeping only Mỹ Hạnh. Scoped continuation of the previously approved gold widget, not a new visual direction. Previous visual evidence: `../gold-history-compact-20261019/without-lower-tables-1150.jpg`; approved base: `G:/PHONG TRO/app/tmp-product-design/gold-myhanh-original-layout-20261019.png`.

Removed SJC/PNJ/Bảo Tín source buttons and their selection state/conditional UI from GoldTracker. Heading is now “Giá vàng Mỹ Hạnh”. Current quotes use fetchMyHanhPrices directly; the widget no longer requests the branded quote feed. Chart code is fixed to MH9999. Removed unused source-tab styling and retained 30/90/365-day controls, existing palette, refresh, units and history behavior.

Verified actual production component in the isolated browser harness: no other-brand text, zero source selectors, zero lower tables, actual Mỹ Hạnh quote timestamp 19:01 20/10/2026 and matching chart. Evidence: `desktop.jpg`. This is browser component verification, not a native Electron-window capture.

34 source/history/funding/wallet regression tests passed. Production build/typechecks passed. No stored holdings, trade history, ledger, shared legacy quote API or trading form was deleted or changed. Earlier history-source limitation remains deferred as the user requested. No installer or deployment performed.

## Follow-up: price input grouping

User reference: clipboard-40c8879c-c1be-490d-81f9-d92142170778.png. GoldTradeModal price input now displays Vietnamese grouping (13.550.000) for suggested, typed and pasted integer prices, in both buy/sell modes. Underlying draft remains digits so totals/saved amounts retain their numeric value. Blank input stays blank; letters, negatives and exponent notation are rejected. Production-component browser check: default 13.550.000, manual 14.000.000 with two chỉ gives 28.000.000; pasted 13.550.000 restores the formatted amount. No transaction submitted. Evidence: `formatted-price.jpg`, `formatted-price-detail.jpg`. 30 targeted formatter/price/funding/wallet tests and production build passed. Existing product selectors were outside this follow-up's scope.

## Correction: purchase and sale forms are now Mỹ Hạnh only

User reference: clipboard-5c1f5f9e-6fe0-4da9-9169-dc595d89bf82.png. The previous tracker-only change missed the purchase/sale selector; this correction supersedes that limitation. Removed all other-brand product cards and the redundant selected-product block, replacing them with one compact, fixed MH9999 identity. Retained approved dark palette, quantity buttons/slider, grouped price input, total, wallet funding checks and save action. Modal fetches only the Mỹ Hạnh feed, without a branded-feed request. Buy uses dealer sellPerChi; sell uses dealer buyPerChi. Stale/failed/missing quotes are not suggested as current prices.

Corrected holding action routing: MH9999 now opens this fixed-product modal. Existing legacy holdings retain their identity and existing edit/trade flow; no old record is deleted or relabeled as Mỹ Hạnh. Removed the obsolete initial-symbol prop/state, so it cannot silently select a different asset in the fixed modal.

Browser QA used the real production components in the isolated fixture, not a native Electron capture. Buy: 13.550.000/chỉ, two chỉ totals 27.100.000. Sell: 13.250.000/chỉ, two chỉ totals 26.500.000; increase button disabled at fixture stock of two Mỹ Hạnh chỉ. No SJC/PNJ/Bảo Tín chooser in either form. Evidence: `trade-buy-myhanh-only.png`, `trade-sell-myhanh-only.png`. No transaction submitted; fixture wallet is fictional. 35 targeted regression tests passed, including server-rendered buy/sell forms, legacy stock exclusion and quote direction. `npm run build` passed (node/web typechecks and bundles), with existing Browserslist/chunk-size warnings. No installer or deployment performed.
