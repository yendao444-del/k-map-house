# Purchase funding verification — 2026-10-20

## Behavior

- Gold, stocks/funds, bonds and savings use the investment wallet first.
- When funds are short, ask for confirmation before transferring the exact shortfall from the rental/operating wallet.
- The confirmation displays the purchase total, investment funds, shortfall, cash/bank split and operating funds remaining.
- Cancellation makes no writes. Insufficient funds reject the purchase.
- Recheck operating funds after confirmation. Electron also rechecks the portfolio before creating receipts; PWA retains its server version check and atomic commit.
- Record deposits alongside the purchase. Electron links the operating receipts to those deposits. PWA derives receipts inside the existing database transaction.
- Failed Electron saves compensate created receipts; failed compensation requires reconciliation.

## Checks

- `node --test scripts/investment-auto-funding.test.cjs scripts/investment-funding.test.mjs scripts/investment-wallet.test.mjs scripts/investment-history.test.mjs` — 37 passed.
- `node --test adminpwa/tests/investment-cloud.test.mjs` — 14 passed, including uncertain-commit behavior and version conflicts.
- `npm run typecheck` in the workspace and `adminpwa` — passed.
- `node scripts/verify-investment-auto-funding-ui.cjs` — 8 isolated browser cases covering four purchase forms on Electron/PWA; cancellation, exact shortfall and insufficient funds passed.

The browser fixture uses real form components and funding helpers with synthetic wallet/store data. External requests are blocked. No production asset purchase or money transfer was performed during verification.

Browser evidence: [investment-auto-funding-ui.json](investment-auto-funding-ui.json).
