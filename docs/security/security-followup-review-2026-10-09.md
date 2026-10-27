# Security follow-up review - 2026-10-09

## Findings

1. **High, existing unresolved exposure:** privileged credentials previously appeared in tool output. No rotation/revocation was performed in this follow-up. Local file ACLs do not invalidate copied credentials. Supabase service-role access bypasses application RLS; the website checks below do not mitigate misuse of a stolen privileged key. Coordinate consumer migration and revocation with provider access before considering this resolved.
2. **Medium, fixed verification regression:** `webmobile/scripts/verify-tenant-accounts.mjs` and `webmobile/scripts/verify-tenant-payment-production.mjs` still expected private metadata removed from public `/api/health`. These scripts failed before reaching subsequent security assertions. They now check HTTP success and the minimal health contract. Account verification additionally requests an unauthenticated session and requires HTTP 401; payment verification retains the real API 401/CSRF 403, database grants and worker checks. Both scripts passed live after the fix. No application redeployment is needed for these script-only edits.

No additional remotely exploitable flaw was confirmed within this follow-up's tested scope. This is not a guarantee of absence of vulnerabilities or evidence about historical compromise.

## Fresh evidence

- Main app and tenant portal returned HTTP 200 with HTML, CSP, HSTS, X-Frame-Options DENY and nosniff. Public health returned only `ok`, `backend`, `ocrConfigured`, without Set-Cookie.
- Production database metadata: 46 public tables, all with RLS; 64 policies.
- Management RLS test: active admin/staff can read settings and debt; unknown subject gets zero rows; anonymous lacks these SELECT grants.
- User-directory rollback tests passed: active manager directory reads and self-profile updates work; staff promotion is denied; inactive account cannot read other profiles/settings; unknown subject sees no directory.
- Storage rollback tests passed: anon and unknown subject cannot insert; anon cannot delete; active admin/staff can insert/delete metadata. No physical upload was performed.
- No non-trigger public function was executable by anon in the current database catalog.
- Auth: public signup disabled; minimum password 8; current-password and reauthentication requirements enabled. Inactivity/timebox remain 0 and CAPTCHA remains disabled.
- Internal schemas net/cron/vault rejected through PostgREST. Vault SELECT denied to anon/authenticated. Server email/SePay health verification passed.
- 114 PWA tests and 65 portal/backend tests passed.
- `npm audit --omit=dev`: zero reported vulnerabilities for both website projects. This does not cover all possible dependency vulnerabilities or development dependencies.
- Existing local build scanners passed. A separate fetch/scan of 43 linked production JS/CSS resources found no matching private values loaded by the local configuration helper and no service-role JWT. This scan cannot discover an unknown or differently encoded secret.
- Updated tenant account/payment production verifiers passed, including unauthenticated access rejection and CSRF rejection.

## Scope and limits

No customer password, payment, contract or email was changed/sent during this follow-up. SQL role/profile simulations were rolled back. No new authenticated browser journey, production physical upload, destructive attack, load test or full source-to-deployed-function comparison was performed. Prior live password/recovery verification remains separate evidence; it was not rerun here.

Supabase session time limits and leaked-password checking previously returned a paid-plan requirement. CAPTCHA requires integration and provider configuration. These are remaining hardening options, not newly demonstrated exploits.
