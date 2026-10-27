# Security implementation review — 2026-10-11

Scope: internal management web/PWA, Electron renderer data access, and the production Supabase project. No customer rows, accounts, payments, emails, or roles were changed.

## Changes applied

- Removed the permissive `users_select_authenticated` policy in production.
- Kept self-profile access and restricted directory access to the existing active management role; notification code now uses the server-side `notification_recipients()` projection instead of selecting the whole `users` table.
- Added a database trigger that blocks non-admin direct REST updates to system identity fields and fields outside the personal profile allowlist. RLS still remains authoritative for role/status changes.
- Replaced user-directory and user-create/update `select('*')` projections with explicit profile columns. `password_hash` is no longer requested by these paths.
- Changed `room-images` to a private storage bucket. Room records retain object paths; the clients normalize paths and request one-hour signed URLs for display.
- Removed the room-list compatibility fallback that could request `select('*')`.

## Production evidence

- `users` has RLS enabled.
- `users_select_authenticated` is absent.
- `management_directory_read_guard` is restrictive; it allows a caller's own row or the active management directory helper, together with the MFA request guard.
- `guard_user_profile_update` is installed on `public.users`.
- `room-images` reports `public=false`.
- Anonymous REST/RPC probes were rejected by the pre-request guard. Anonymous execution of the directory helper remains revoked.
- Transaction-local database checks passed for staff role escalation and system-email mutation attempts; all fixture changes rolled back.

## Build and deployment evidence

- Root Electron app: `npm run typecheck:node`, `npm run typecheck:web`, and `npm run build` passed.
- Admin PWA: `npm run typecheck` and `npm run build` passed, including public bundle secret scan.
- Production Pages deployment: `b87fca31-3e6a-460d-b5ec-4db240958fb6`; live `version.json` build `118f30a537510b4f`.
- Live bundle contains `notification_recipients` and `createSignedUrls`; no source path uses `getPublicUrl`.

## Remaining limits

- The application is an internal management system, so an active staff account is intentionally able to receive the safe notification-recipient projection. It does not receive the full `users` row through that path.
- Broad `select('*')` remains in several authenticated business detail queries (`tenants`, contracts, invoices, and financial records). Those routes are protected by management RLS/MFA, but they should be reduced further if staff accounts are expected to have field-level minimization.
- Existing room image rows were not rewritten; the client accepts both legacy public URLs and stored object paths and converts them before signed URL creation.
- No authenticated attack was performed against a real employee account, so production behavior for an individual account still depends on its current MFA/session state.

## Account-list regression corrected — 2026-10-11

The first client change incorrectly reused the reduced notification-recipient RPC
for `getUsers()`, which is also used by the system account administration screen.
Missing username, role, status and login timestamps caused the client mapper to
display UUIDs, default user roles and absent login times. Database aggregates
confirmed two admin accounts and one user account, with existing usernames and
login timestamps for all three; this was a response-mapping regression.

`getUsers()` now selects the explicit `USER_PROFILE_SELECT` columns under the
existing scoped users RLS. The email observer uses its separate
`getNotificationRecipients()` function. No database records or access policies
were changed for this correction.

Four executable regression tests in `scripts/user-directory-regression.test.cjs`
pass for both clients, including admin identity, inactive accounts and login time
preservation, plus notification query isolation. Electron build and PWA build
pass. The corrected PWA was published to production; a subsequent live check
matched both version and entry bundle SHA-256 against the current local dist.
The Electron source/build correction has not been released as an installer.

## SePay sync error message corrected — 2026-10-11

The modal in the attached screenshot was a frontend classification bug. The
client treated every Supabase Edge Function non-2xx response as if
`send-email-notification` were missing. Production metadata and anonymous
probes confirmed that `admin-sepay-bridge`, `admin-pwa-sepay`, and
`send-email-notification` are deployed; unauthenticated calls correctly return
401.

Both Electron and PWA clients now preserve the server's JSON error and map
status codes explicitly: 401 means the session is expired/invalid, 403 asks
for MFA re-verification, 404 indicates a genuinely missing service, 429 is
rate limiting, and 5xx is a server/provider issue. The mapper never exposes a
server error body for 5xx responses.

Validation: six mapper regression tests pass, root Electron build passes, PWA
build passes, and the production PWA deployment `a9f4302c-48ac-40e9-8d19-fa4b21650765`
matches local build `1ebb1b2aa590da8c` and entry-bundle SHA-256
`82da553e1ab20f563b22417b63c3eb630210082517e80d1b3e9155686fdd2230`.
No authenticated sync was executed, so no bank transactions, customer rows,
or emails were changed.

## SePay read-session regression corrected — 2026-10-11

Production settings retain a six-hour login session and a five-minute recent
MFA window. A read-only inspection found authorized live sessions whose MFA
timestamps were older than that window. Both SePay handlers incorrectly
required `p_sensitive=true` for history/status reads. They also POSTed the
access-check RPC, so the database pre-request hook independently classified
the check itself as a sensitive operation.

The deployed handlers now use a GET access check with `p_sensitive=false` for
SePay history/status. All existing session authorization, AAL2, active admin,
email verification, recovery acknowledgement, expiry and revocation checks
remain enforced. Token changes, account administration and verified bank
reconciliation continue to pass `p_sensitive=true`. Guard outages are reported
as service failures rather than claiming the user has not completed 2FA.

Validation: 27 focused tests pass; a production read-only transaction verified
that authorized AAL2 sessions can pass the GET read guard beyond five minutes,
while sensitive writes, stale-MFA POST requests, AAL1 and unbound sessions stay
denied. Root Electron and PWA builds pass. Backend deployment is active:
`admin-sepay-bridge` version 20 and `admin-pwa-sepay` version 9. Anonymous HTTP
calls to both deployed functions remain 401. No RLS/role model, MFA settings,
business rows or real bank postings were changed. This backend correction
applies to both clients without a new Electron installer.

The user requested current-password confirmation within the sensitive-action
dialog instead of repeated Authenticator challenges. That password step-up
policy and UI are not implemented yet. A reviewable visual demo is being
prepared under the workspace's mandatory image approval gate; the implementation
must verify passwords server-side and retain the already verified session.
