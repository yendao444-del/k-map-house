# Wallet guard RPC correction — 2026-10-21

## Cause and scope

The production database was inspected read-only during diagnosis: the expected project had `wallet_guard_version()` returning integer 2, authenticated EXECUTE permission, and both wallet reconciliation/accounting-basis tables. No migration replay is needed for that project.

Both Electron and management PWA called the stable version read using the SDK's default POST. The management pre-request hook classifies this non-exempt POST as sensitive, unlike GET. Every RPC error was then replaced with a missing-migration message, hiding session/security/network/permission failures. The exact failed user request was not captured, so its underlying response is not claimed as directly observed.

Updated only the wallet guard in each application's existing `db.ts`:

- Use `rpc('wallet_guard_version', undefined, { get: true })` for the stable read.
- Distinguish management-session verification, expired/invalid login, denied permissions, missing function, transport/server failures and unsupported version.
- Only PGRST202/42883 missing-function errors request the migration. Unknown versions remain blocked as incompatible.
- Keep existing financial writes and their security/funding checks unchanged. No fallback to POST, skipped guard, automatic transaction retry, migration or database write was added.

## Verification

73 tests passed with:

```powershell
node --test scripts/wallet-guard-rpc.test.cjs scripts/wallet-accounting.test.cjs scripts/investment-funding.test.mjs scripts/investment-wallet.test.mjs scripts/investment-auto-funding.test.cjs scripts/my-hanh-trade.test.cjs scripts/sepay-session-policy.test.cjs
```

The new suite executes the actual production guard and normalizer, checks both source trees, tests versions/errors, and verifies financial entry points retain the guard before database writes. Actual installed Supabase SDK tests intercept fetch in memory: GET succeeds under a simulated valid session with stale step-up while POST would be rejected. No real network or financial transaction is used by these tests.

`npm run build` passed for Electron (node/web TypeScript and main/preload/renderer bundles) and `npm run build` passed in `adminpwa` (TypeScript, Vite, PWA generation and public-bundle scan). Existing chunk-size/Browserslist warnings remain non-blocking.

No production database changes, financial mutations, deployment or installer packaging were performed. Native Electron and the user's live purchase were not exercised. Existing development sessions must reload; an installed release needs the updated packaged build.

## Follow-up: missing investment write step-up

The user's second screenshot shows the session/security message from the subsequent financial write, rather than the obsolete missing-migration message. Restarting Electron does not renew the server's recent password confirmation. The previous guard fix did not wire a confirmation dialog into the investment workflow.

Added the existing `usePasswordConfirmation` hook and portal to both InvestmentsTab implementations. `commitWalletChange` now awaits `requirePassword('Ghi giao dịch đầu tư')` before preparing/committing wallet movements or persisting the portfolio. Recent approval follows the existing server-backed hook; cancelled/rejected/unavailable confirmation aborts before mutation. No automatic replay of a failed financial write, bypass, new authentication endpoint, or relaxation of database security was added.

Six new tests execute the actual commit callback from each production component with controlled dependencies. They verify pending confirmation blocks all downstream calls, cancellation/security failure writes nothing, approved continuation persists once, and the dialog hook/portal are wired. The combined regression run (previous command plus `scripts/investment-password-confirmation.test.cjs`) passes 79 tests. Both production builds pass after this change.

Browser verification uses `tmp-product-design/preview-investment-password.cjs`: actual InvestmentsTab, GoldTradeModal, password dialog/hook and funding-confirmation components, with strictly fictional in-memory auth/ledger adapters. The loopback fixture has `connect-src 'none'`; no real credentials or customer funds are used.

- Electron component: buy opens the password dialog above the existing trade form. Screenshot: `docs/qa/investment-password-dialog-20261021.jpg` (1280×720).
- Cancel leaves only a password-status event, with no posting/persist; the buy form remains usable.
- Wrong fixture password keeps the confirmation open and does not write. Correct fixture password plus Enter opens the existing capital-transfer confirmation.
- Explicit simulated funding approval produces event order `password-confirmed → posting → persist` and one purchase-success notification for 1 chỉ at 13.330.000đ. These are in-memory events, not production financial writes.
- PWA component: after entering a fictional price, buy opens the same password confirmation; cancel produces no posting/persist.
- Browser console errors/warnings: none for either fixture route.

Native Electron window, the user's live security endpoint/session, real ledger writes, installer packaging and deployment remain untested/unperformed. The screenshot is browser evidence of the production component, not a claim of a live transaction or an installed release.

## User refinement: password only, no transfer confirmation popup

Per the next user instruction, removed `useInvestmentFundingConfirmation` and its dialog from both investment screens. Password step-up remains the sole confirmation. After that resolves, `prepareInvestmentPurchase` accepts the already-authorized purchase without another decision dialog. Exact-shortfall calculation, operating-balance recheck, insufficient-funds rejection, ledger linking, duplicate prevention and rollback behavior are unchanged. Unrelated deletion prompts and the reusable funding-dialog files were not removed.

Regression tests now also assert that neither investment screen mounts/calls the transfer-confirmation UI and that funding preparation runs only after the password gate. All 79 tests and both production builds passed again.

Actual Electron component browser fixture: starting with a fictional 5.000.000đ investment wallet and purchasing 1 chỉ for 13.330.000đ, submit opens only password verification. Entering the fixture-only password plus Enter yields `password-status → password-confirmed → posting → persist`, exactly one simulated save, zero transfer-confirmation dialogs, and a purchase-success notification. Final evidence: `docs/qa/investment-password-only-success-20261021.jpg`. Console errors/warnings: none. This is isolated in-memory verification, not a real financial transaction or native Electron execution.
