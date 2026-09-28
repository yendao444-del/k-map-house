# Investment module source comparison

Audit date: 2026-09-25

References inspected:

- Source application: `E:\DU AN CA NHAN\QUAN LY DANH MUC\src\App.tsx`
- Source trackers: `src\components\GoldTracker.tsx`, `StockTracker.tsx`, `BondTracker.tsx`, `SavingsTracker.tsx`
- Electron implementation: `src\renderer\src\components\InvestmentsTab.tsx`

## Evidence

The source application was run from its Vite entry and its overview demo was inspected. The source overview visibly contains a dark branded shell, wealth goal progress, invested capital, time-range chart controls, current holdings, recent timeline, allocation donut, and allocation-health/target controls.

The Electron application was also opened from the current dev server. Its authentication screen blocks reaching the investment tab without credentials, so the Electron feature audit is supplemented by direct inspection of the rendered component and store/IPC code. This limits visual comparison of the authenticated Electron screen only.

## Parity matrix

| Source capability | Electron status | Action |
| --- | --- | --- |
| Overview total value and wealth goal | Partial | Keep branding, match source hierarchy and goal placement. |
| Invested capital and daily/period gain | Missing | Add derived capital and change metrics. |
| All-time chart with hover point and range controls | Partial | Add range state, source-style hover detail, and keep crypto excluded. |
| Current holdings table | Partial | Preserve grouped rows and asset detail action. |
| Recent transaction timeline | Partial | Add source-style timeline and user notes. |
| Allocation donut by category/by asset | Present | Reconcile target categories with the source model; crypto remains omitted. |
| Allocation health score and drift explanation | Missing | Add health score and actionable drift summary. |
| Target allocation popover | Partial | Include the same investable categories and enforce 100%. |
| Wallet statement and cash-flow semantics | Partial | Include buy/sell wallet impacts and opening-balance labels. |
| Asset detail panel | Missing | Add per-asset metrics and transaction history. |
| Gold tracker | Missing | Port source tracker behavior using the Electron data bridge. |
| Stock/fund tracker and watchlist | Missing | Port source watchlist/chart behavior without crypto. |
| Bond tracker and watchlist | Missing | Port source watchlist/chart behavior. |
| Savings maturity tracker | Partial | Parse metadata, then add maturity cards, interest, and maturity action. |
| Crypto | Intentionally excluded | Do not expose in navigation, holdings, transactions, or totals. |
| Telegram inbox | Intentionally excluded | Do not expose or wire into this module. |

## Gold history correction — 2026-09-26

History presentation follow-up: the gold screen now uses the original TransactionList table structure and its existing CSS classes (eight columns, transaction badges, time/source cells and actions), plus the original dashed EmptyState structure. This replaces the shared ledger's compact rows. Historical unit prices come from recorded amounts and quantities, not today's quote. Typecheck and production build passed; pixel-level visual comparison remains pending.

Source `App.tsx` renders `GoldTracker`, then the gold holdings table, then the category transaction list. The initial Electron port included the tracker but omitted both following sections. Redirecting a completed purchase to the shared ledger did not restore this behavior.

The Gold screen now includes holdings and its complete transaction history with quantity, amount, edit and delete actions. Its history shortcut scrolls to the local list. Saving a gold trade keeps the category open and scrolls to that list; the success notice expires after six seconds and clears on navigation. Category matching includes zero-balance holdings and known gold product symbols, so selling out does not hide the past trades.

Verification: category-history regression tests, TypeScript checks, production build and diff checks passed. No financial records were changed during verification. The full original asset-detail panel is not part of this correction.

## Implementation order

1. Bring the overview screen to source parity: metrics, chart ranges/hover, timeline, allocation health.
2. Bring category screens to source parity: wallet statement, savings maturity, asset detail.
3. Add gold, stocks/funds, and bonds tracker data contracts and UI using the existing Electron palette.
4. Run typecheck/build and repeat the authenticated visual audit.
