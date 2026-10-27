# System account security status — 12/10/2026

## Approved reference

- `demo.png`: user-approved visual direction, with a Bảo mật column and two independent compact badges per account.
- All screenshots and UI fixtures in this directory use fictional account identities and states.

## Comparison with implementation

| Reference requirement | Implementation and verification |
| --- | --- |
| Preserve current account list, toolbar, roles, active status and actions | Existing screen retained; no changes to role mutations, permissions or auto update. |
| Bảo mật between Trạng thái and Đăng nhập | Present in the desktop table at 1440 and 1920 px; both action buttons fit at 1440 px. |
| Separate Authenticator and Email badges | Green verified badges and amber pending badges; unknown data stays gray rather than displaying a false status. |
| Readable Vietnamese | Inspected `implemented-1440.png` and `implemented-390.png`; labels have correct diacritics and are not clipped. |
| Small-screen access | Mobile cards show identity, role/status, both security badges and last login; account detail also includes security badges. |
| Accurate states | Authenticator uses verified TOTP factors. Email uses successful OTP proof for the current login email; Auth provisioning confirmation alone does not mark OTP verified. |

The approved image is a cropped account panel. The implemented desktop screenshots show the full existing settings screen, including its pre-existing heading and summary metrics. Existing alphabetical account sorting is retained.

## Verification

- `ui-checks.json`: actual PWA SettingsTab using a synthetic RPC fixture at widths 1920, 1440, 390 and 320; search, refresh, mobile detail, unknown states, and document overflow checks pass.
- `implemented-1440.png`, `implemented-1920.png`, `implemented-390.png`, `implemented-320.png`: implementation captures. Mobile captures scroll the inner content to show the account cards.
- Both Electron and PWA production builds/typechecks passed.
- Public PWA bundle scan passed: no elevated JWTs or private-key markers.
- Six client directory regression tests passed for both code copies.
- Database migration was verified before committing and again after deployment using rollback-only synthetic users, factors and sessions. Checks include anonymous/unknown/inactive/revoked denial, staff self scope, fixed safe projection, unverified factor exclusion, OTP persistence across session cleanup, email change invalidation and rejection of client proof forgery.

## Limits

UI captures use synthetic records; they do not constitute a live logged-in session against customer accounts. Existing OTP proof can only be backfilled where successful evidence remains in security session/challenge records. The new persistent account proof prevents future session cleanup from losing the directory status. Email badges describe account verification history, not whether every device is currently authorized; per-device login verification still applies.

Electron source and `out/` were built locally. This task does not publish a new installer.

## Read-request regression fix

The first deployment used the SDK's default POST RPC. The PostgREST pre-request hook classified that new route as sensitive, so a valid session with older MFA proof could not load the directory. The original SQL tests invoked the RPC directly and did not reproduce this hook classification.

- Added `management_user_directory` to the existing read-RPC classification in the hook. Valid session and role checks remain mandatory; no MFA or permission guard was removed.
- Both clients now explicitly send GET for this stable directory read; POST remains compatible with already-running clients.
- Extended rollback tests to run the pre-request hook with aged MFA and POST/GET directory requests, while still rejecting sensitive writes and revoked sessions.
- `docs/security/qa/user-directory-read-http.json` confirms actual Auth/PostgREST HTTP behavior using a disposable staff identity; no customer account changes or emails. GET/POST reads succeed with aged authorized MFA, while sensitive requests, anonymous directory calls and revoked sessions are denied.
- Error rendering shows unknown counts instead of zero and does not present a load failure as an empty directory. The UI retry test verifies that refresh recovers after a read failure.
