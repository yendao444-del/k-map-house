# Management MFA implementation status — 2026-10-09

Status: **mandatory management MFA enabled and verified on 2026-10-10. The rollout section below supersedes the earlier staged status.**

## Desktop regression fixed

The previous MFA integration imported the PWA `auth-storage` helper into the desktop login without creating or wiring its desktop equivalent. Vite could not resolve the import and could not render the application. The same change also omitted the React `useEffect` import and incorrectly marked the required enrollment challenge ID as optional.

- Added desktop Auth token storage and connected it to the desktop Supabase client.
- Persistent login is opt-in; the previous Supabase storage key migrates once into the selected storage without overwriting a newer login.
- Fixed the two profile/MFA compilation errors in both applications.
- Restored the desktop login class and a valid version fallback.
- The live development renderer at `http://localhost:5173/` visibly renders the login form with no import overlay. Evidence: `qa/login-import-fixed-2026-10-09.jpg`.

## Security progress after the regression

- Password sign-in and restored-session bootstrap use the same MFA UI guard.
- A verified TOTP factor with AAL1 triggers a bound challenge; AAL2 passes. Factor/assurance/challenge errors reject access rather than behaving as an account without MFA.
- Desktop/PWA startup can show the restored challenge. PWA foreground validation clears business queries when MFA is required.
- Cancelling the MFA screen signs out the local AAL1 session and clears the entered password/code.
- Enrollment is closed unless the deployed `security_mfa_readiness` RPC explicitly returns `enrollment_enabled: true`. The production readiness RPC is deployed and `enrollment_enabled` is now true; mandatory enforcement remains disabled while the owner completes enrollment and recovery acknowledgement.
- Removed the unsafe direct-disable button from the profile. A verified factor cannot be disabled through this incomplete UI.
- The local profile fixture aliases both database and MFA modules to non-network fixtures; it cannot modify real profiles or enroll real accounts.

## Evidence and limits

`node --test scripts/auth-storage.test.cjs scripts/mfa-session.test.cjs adminpwa/tests/auth-gateway.test.mjs adminpwa/tests/password-change-security.test.mjs`: **37 passed**. Tests cover session storage/migration, rejected MFA lookups, invalid TOTP, cancellation, and restored/password login paths. These are mock/client tests and do not prove backend enforcement or live email/recovery.

Final verification: **desktop `npm run build` passed** (both TypeScript projects and all three Vite builds); **PWA `npm run build` passed**, including the public bundle scan; **PWA `npm test` passed 131 tests**. The live profile preview reloads without the former `auth-storage` Vite overlay, and the production PWA bundle was redeployed successfully with the corrected security menu copy.

The local profile fixture was also tested in the browser: its security section renders and enrollment is visibly disabled while the backend is unavailable. Evidence: `qa/profile-security-gated-2026-10-09.jpg`.

Read-only production metadata was re-inspected at `2026-10-10T03:31:53Z`; see `qa/mfa-production-metadata-2026-10-09.json`:

- Management security sessions, recovery codes, trusted devices, audit events and readiness RPC are deployed.
- The AAL2 access guard, restrictive RLS policies and PostgREST pre-request hook are deployed (`pre_request_configured=true`).
- No verified TOTP factors exist yet; this is expected until the owner enrolls.
- Supabase global password minimum remains 8 because the Auth configuration endpoint returned HTTP 402; management password changes require 12 in the app. Auth requires current password and reauthentication for password change.
- Supabase global inactivity/timebox and HIBP settings remain unavailable on the current plan; management sessions enforce 6-hour idle and 6-hour maximum limits.

No production authentication configuration, account, or customer data was changed by this regression repair. The UI guard is not backend authorization. The active security goal remains unfinished.

## Verified 2026-10-10

- Added email step-up UI, recovery-code acknowledgement, recovery-only re-enrollment, trusted-device/session overview, device revocation and sign-out-all controls in both Electron and PWA.
- Moved session authorization ahead of profile/data reads, so an AAL1 or unverified step-up session cannot bootstrap business data.
- Enabled `pgrst.db_pre_request = public.security_management_pre_request` after compatibility checks; read-only requests avoid writes while still enforcing access.
- Applied recovery resume migration and verified the complete disposable flow against production Auth/DB. Evidence: `qa/mfa-complete-flow-2026-10-10.json`, `qa/mfa-hook-2026-10-10.json`.
- Rollout flags are `enrollment_enabled=true` and `enforce_management=false`; a database rollout guard rejects enforcement until every active admin/staff has verified TOTP and acknowledged recovery codes. Current production has 3 active management accounts and 0 ready accounts; no customer data changed and disposable identities were removed.
- The live owner session reaches **Hồ sơ → Bảo mật** and shows the “Bật Google Authenticator” enrollment action. Owner enrollment remains a handoff step because it requires the owner to scan the QR, enter the current OTP, and save the one-time recovery bundle.
- Fixed abandoned-enrollment retries: the client now removes only stale `unverified` TOTP factors before issuing a new QR, while refusing to create a second factor when a verified factor already exists. The fix is deployed to the PWA and covered by desktop/PWA MFA session tests.
- Real production verification reproduced Supabase's behavior (`data.totp` empty while the abandoned factor appears in `data.all`) and confirmed the shipped desktop/PWA functions remove the stale factor, return a new QR, and obtain a real gateway challenge. The focused MFA regression suite now passes 16/16. Evidence: `qa/mfa-enrollment-retry-2026-10-10.json`.
- Supabase Auth config PATCH returned HTTP 402 for password/session hardening. The app and management security layer enforce 12-character password changes plus 6-hour idle and 6-hour management-session limits; global Auth timebox/HIBP settings remain unavailable on the current plan. Evidence: `qa/auth-hardening-2026-10-10.json`.

## Earlier rollout plan (superseded by mandatory enrollment request)

1. Owner completes Google Authenticator enrollment and acknowledges the one-time recovery bundle. The database rollout guard prevents accidental enforcement before this is true.
2. Verify the owner can sign in from the enrolled device, a new device, and the recovery path.
3. Review the owner verification evidence, then enable `enforce_management=true` in a controlled rollout window.
4. Upgrade the Supabase Auth plan or use a server-side password-change action if global 12-character minimum, HIBP and Auth session timebox are required. The current project endpoint returns HTTP 402 for those settings.
5. Rotate previously exposed privileged credentials as a separate operational task; no secret values belong in reports.

## Mandatory enrollment enabled — 2026-10-10

Per the user’s explicit request, all current/future active Admin and staff accounts must finish Google Authenticator setup before business access. Both production flags are true. The prior all-accounts-ready trigger was replaced with a guard requiring the enrollment service and configured request protection; users without setup are redirected into enrollment rather than being allowed into the application. Tenant login remains a separate phase, pending the unanswered scope clarification.

Backend enforcement includes restrictive RLS, PostgREST and caller-session checks before service-role operations in SePay, account administration, manual notification email, tenant account administration and contract administration. Updated desktop/PWA clients revalidate visible sessions every 15 seconds and on return to foreground. Desktop build passed locally; PWA and five Edge functions were deployed.

Real Admin/staff disposable tests verify REST reads/writes, business RPC and six Edge endpoints deny incomplete sessions. TOTP + required email + saved recovery codes restores business access; trusted devices still need TOTP. Recovery and revocation passed. Complete-flow tests intercept only disposable email delivery, so owner email delivery/enrollment is not claimed. Browser staff login/reload/QR/sign-out passed. All disposable accounts and the temporary credential file were removed.

Evidence: [Admin flow](qa/mfa-mandatory-admin-2026-10-10.json), [staff flow](qa/mfa-mandatory-user-2026-10-10.json), [setup screen](qa/mfa-mandatory-setup-2026-10-10.png), [final acceptance](qa/mfa-mandatory-acceptance-2026-10-10.json). See the phase document for deployment and verification detail. Paid-plan password/HIBP limitations remain as described above.
