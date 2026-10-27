# Gold holdings: default, responsive layout and live valuation

Scope: Electron investment gold screen. Existing navy/emerald direction retained.
No production credentials, wallet postings or real financial transactions were used.

## Changes

- Entering Gold selects “Vàng đang nắm giữ”. A successful buy/sell also selects holdings, without forced scrolling. History remains an explicit action.
- Tracker refresh and its five-minute timer publish the same Mỹ Hạnh quote to holdings. Removed the independent one-shot holdings fetch.
- Remaining cost is kept separate from read-only market marks. Gold is valued using dealer **buy** price (the customer's resale price), per chỉ. PnL = market value minus remaining cost; percent = PnL / remaining cost. Quotes never rewrite the store or wallet ledger.
- Actual average purchase cost, current resale price, current value and PnL are separate labeled fields. Portfolio weights are recalculated instead of displaying stored zero weights.
- Failed/stale/missing quotes display unavailable marks, not fictitious +0%. Legacy non-Mỹ-Hạnh identities are not valued using Mỹ Hạnh quotes.
- Removed fixed table minimum widths. Pane-aware cards, wrapping navigation, compact chart and short-window spacing avoid nested scrolling. Mobile/long lists retain natural page scrolling; no rows are clipped or hidden to force a fit.

## Automated checks

90 passing tests across gold valuation, compact panel, trade modal, password authorization, wallet guards/accounting and investment funding suites. Electron typecheck + production build passed.

Valuation cases: gains, losses despite a higher dealer ask, partial-sale remaining basis, legacy marked holdings, missing/stale/invalid quotes, preserved asset identities, immutable cost basis and repeated refresh.

## Browser checks

Actual production components, loopback fixture with fictional in-memory store and quotes; not a production Electron runtime or live market-price verification.

- Seed: 1 chỉ, cost 13,330,000 VND. Bid 13,400,000 -> +70,000 / +0.53%. Bid 13,250,000 -> -80,000 / -0.60%.
- Increase bid by 100,000 and click “Làm mới giá vàng”: both price widget and holdings update, PnL +170,000 / +1.28%.
- In-memory purchase at ask 13,700,000: holdings selected after save, scrollTop 0, PnL -300,000 against bid 13,400,000. Existing recent-password gate was exercised; no additional funding popup.
- Select history, leave Gold, return: holdings selected again.
- 1280×720: main clientHeight = scrollHeight = 656; clientWidth = scrollWidth = 972. One holding and full chart/quote content visible.
- 1024×768: main clientHeight = scrollHeight = 704; clientWidth = scrollWidth = 936.
- 390×844: main clientWidth = scrollWidth = 382; no nested scrollable descendants. Natural page scroll is retained. Two-column holding cards, detail dialog and history actions verified.
- No browser warning/error logs observed in these flows.

Evidence (all explicitly simulated):

- `gold-holdings-1366-20261021.jpg`
- `gold-holdings-1280-20261021.jpg`
- `gold-holdings-1024-20261021.jpg`
- `gold-holdings-390-20261021.jpg`
- `gold-holdings-loss-20261021.jpg`

Not covered: rebuilding/installing a distributable, running the user's installed Electron process, changing production data, or redesigning the separate admin PWA.
