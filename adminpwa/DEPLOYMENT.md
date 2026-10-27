# PWA mobile — deployment and rollback

Scope: dedicated Cloudflare Pages project `ankhanghome-admin-pwa`, custom domain `app.phongtroankhang.com`. Never redeploy `ankhanghome-payment`, change pay/root/www DNS, or edit Electron. HTTPS is required; the requested HTTP entry should redirect to HTTPS.

## Current gate

`app.phongtroankhang.com` is live on the dedicated Pages project. Build/tests are not full product acceptance; read `IMPLEMENTATION-STATUS.md` and `design-qa.md` for the remaining mobile, backend, Auth, permissions and device checks.

`node --use-system-ca scripts/audit-hosting.mjs` reads Pages/DNS/domain state without mutation and writes redacted evidence. Private credentials are read from existing ignored configuration, never shipped as VITE variables. Do not expose service-role credentials in frontend or deploy logs.

## Backend prerequisites

- Apply only additive PWA investment migrations through `scripts/verify-investment-storage.mjs --apply-storage`; it bundles all three into one transaction. Verification uses rollback-only fixtures, compares operating-ledger fingerprints and does not retain any payment.
- Investment writes use an atomic server RPC, snapshot CAS and request dedupe. Separate cloud-only import is admin/empty-portfolio-only and posts no operating money. Electron files remain unchanged; new web changes are not auto-written to a local Electron investment JSON.
- Finish tenant-contract email server integration and browser-required adapters. Do not mark missing bridge actions available.
- NAV proxy `admin-pwa-market` is deployed separately via `node --use-system-ca scripts/deploy-market-proxy.mjs`; evidence is in `qa/market-proxy-deployment.json`. This script touches no shared email/payment/contract functions. Unauthorized online checks and actual upstream parsing passed; authorized HTTP invocation remains a release gate.
- SePay reconciliation is deployed separately via `node --use-system-ca scripts/deploy-sepay-backend.mjs`; evidence is in `qa/sepay-backend-deployment.json` and `qa/sepay-security-verification.json`. It is fail-closed: the browser cannot assert bank amount/account, direct client `source=sepay` writes are blocked, and the server re-fetches the provider transaction before an atomic ledger write.
- Regression-test shared RLS improvements against Electron and tenant portal before applying them. Preserve existing Auth site URL and existing redirects; the exact PWA recovery callback is now added additively and recorded in `qa/auth-redirect-production.json`.
- `20261008_management_rls_guard.sql` is now applied after role-simulation evidence; active admin/staff access remained available, while unknown/anonymous access to `app_settings`/`debt_entries` was denied. Keep tenant portal regression checks in the release audit.

## Release procedure

DNS observation 2026-10-08: the user purchased the domain at Spaceship, but public NS/SOA identify Cloudflare DNS (`aurora.ns.cloudflare.com`, `rudy.ns.cloudflare.com`). Pages custom-domain attachment is now pending with verification error `CNAME record not set`. Add only `app CNAME ankhanghome-admin-pwa.pages.dev` in the authoritative Cloudflare zone; do not switch nameservers at Spaceship or disturb pay/root/www.

1. Finish the full-scope requirement matrix, rendered mobile QA and safe integrated workflows. Production domain `https://app.phongtroankhang.com` is active; `qa/production-domain-verification.json` verifies DNS, TLS, HTTPS redirect, build entry, manifest, service worker and headers. Preview remains available for staging.
2. Build from `adminpwa/` with `VITE_PWA_ORIGIN=https://app.phongtroankhang.com`, public schema and the actual production contract-confirmation endpoint. Run typecheck, tests, bundle/private-key scan; ensure DEV harnesses do not ship.
3. Read Pages project and DNS again. Create the dedicated project only if absent. If `app` belongs to an unrelated project/record, stop; do not replace it without user direction.
4. Deploy this project's `dist/` only, retain the previous successful deployment ID for rollback, then attach only the `app` custom domain and its CNAME if absent.
5. Verify certificate/domain activation, HTTP → HTTPS, exact entry/build ID, required headers, public assets, manifest/service worker and absence of secret material. Open the deployed build in-browser and verify login/recovery, workflows and console. A 200 response alone is not acceptance.
6. Record actual deployment IDs, build ID, custom-domain status, timestamp and browser/runtime evidence in `deployment.json`; only then run the full goal completion audit.

## Rollback

Rollback the dedicated Pages project's deployment to its prior successful build; never switch a tenant/root-site project. For a first release failure, leave production DNS unattached until resolved. Investment migrations are additive: retain tables/history and stop new writes rather than delete data or reverse historical receipts. Restore Auth redirect additions from the captured prior list if needed; never overwrite unrelated entries. Record the rollback build and reverify domain/login/current SW behavior.

`public/_headers` includes CSP and private-page no-store policy. CSP, iframe invoice export, WASM OCR, camera file inputs, sharing and external quotes still require a production-preview browser test; these headers are not yet verified merely because they exist.
