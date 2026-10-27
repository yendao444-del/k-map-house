# Security Phase 01 - Profile, Trusted Access, and MFA

Date: 2026-10-09
Status: **mandatory MFA enabled for all active management admins/staff on 2026-10-10, per the user’s instruction.** Profile visual direction modern-3 is approved and implemented in Electron/PWA. Backend enforcement, recovery, trusted sessions, email step-up, and pre-request protection are deployed and verified with disposable accounts. Password policy settings requiring a paid Supabase Auth configuration remain documented as a platform limitation.

## Goal

Create a clear, premium account profile and security surface before enabling Google Authenticator. The screen must make identity, password protection, trusted devices, recovery codes, and recent security activity understandable without exposing secrets.

## Scope

### Profile surface

- Identity header with avatar, display name, role, and account identifier.
- Profile information section for safe editable fields.
- Security section with password change, MFA setup, trusted devices, recovery codes, and recent activity.
- Clear sign-out-all-sessions action with confirmation.
- Responsive behavior for the existing desktop popup and smaller screens.

### MFA policy

- Phase 1: require TOTP via Google Authenticator for admin and staff accounts.
- Phase 2: offer TOTP to tenant accounts, then enforce it only after recovery and support flows are proven.
- A familiar IP is only one risk signal. Trusted access must use a signed, revocable device/session token with an expiry, not an IP allowlist.
- New device or high-risk sign-in requires password + TOTP + one-time email verification.
- Sensitive actions always require recent AAL2 verification, even on a trusted device.
- SMS is not the primary second factor.

### Recovery

- Generate 8-10 single-use recovery codes when MFA is enabled.
- Store only hashed recovery codes.
- Show codes once and require explicit acknowledgement that they were saved.
- Re-enrollment or support reset requires identity verification and an audit event.
- Never send TOTP secrets or recovery codes by email.

## Backend requirements

- Use Supabase TOTP MFA enrollment, challenge, and verification.
- Enforce `AAL2` in backend authorization and sensitive RPCs; frontend checks alone are insufficient.
- Record MFA enrollment, disable, recovery-code use, trusted-device creation/revocation, and failed challenges in an audit log.
- Rate-limit password, email OTP, TOTP, and recovery-code attempts independently.
- Keep login errors generic and do not reveal whether an email or username exists.

## Password and session hardening

- Raise admin/staff minimum password length to 12 characters while allowing long passphrases.
- Enable breached-password checks when the Supabase plan supports it.
- Do not force periodic password changes without evidence of compromise.
- Configure inactivity timeout and maximum session lifetime for admin/staff.
- Persist a verified management session locally across browser restarts, with a server-enforced 6-hour idle and absolute lifetime; expired sessions are signed out automatically.

## Delivery order

1. Approve the profile/security visual direction. **Done: modern-3 approved.**
2. Implement the profile and security UI with mock MFA states. **Done: profile editor, password reauthentication surface, honest MFA-not-enabled state, activity empty state and sign-out wiring shipped in the app code.**
3. Add the MFA data model, recovery-code hashing, audit events, and risk/session service. **Done.**
4. Integrate Supabase TOTP enrollment and AAL2 enforcement for admin/staff. **Done; enrollment and mandatory enforcement are enabled. Unprepared accounts may sign in only to complete setup.**
5. Verify recovery, new-device step-up, trusted-device revocation, and sign-out-all sessions in a disposable environment. **Done; see `../docs/security/qa/mfa-complete-flow-2026-10-10.json`.**
6. Roll out to production behind an admin/staff feature flag, then expand to tenants. **Management rollout done on 2026-10-10. Tenant portal expansion remains a separate phase.**

## Acceptance criteria

- A user can understand and complete TOTP enrollment without support.
- A session with only AAL1 cannot call sensitive admin actions.
- New-device login cannot bypass email + TOTP step-up.
- Lost phone recovery does not disclose the TOTP secret.
- Every MFA state change is auditable and revocable.
- Production verification uses disposable accounts and changes no customer data.

## Mandatory enrollment rollout — 2026-10-10

The user explicitly requested forced enrollment before any business operations. This supersedes the earlier wait-for-owner rollout guard. Current and future active roles `admin` and `user` must verify TOTP, complete required email step-up and acknowledge saved recovery codes before the management session is authorized. Unenrolled users can access setup, recovery and sign-out only. The tenant portal has a separate authentication system and is outside this management rollout; the scope clarification remains unanswered.

- Production flags: `enrollment_enabled=true`, `enforce_management=true`. Migration: `20261010110000_security_mandatory_enrollment.sql`. The guard requires enrollment availability and the configured business pre-request hook; ready-account counts now measure enrollment progress rather than preventing forced setup.
- Existing sessions are denied by the backend immediately when the flag changes. Desktop/PWA revalidate on foreground and poll security status every 15 seconds while visible, removing private screens and query caches when step-up is required. Older installed desktop builds retain backend protection and receive the setup screen on sign-in/restart; the updated desktop code is built locally, not packaged/distributed by this change.
- Restrictive RLS and PostgREST block management table reads/writes, storage and business RPC. Five privileged Edge functions now validate the caller’s security session before service-role operations: `admin-pwa-sepay`, `admin-sepay-bridge`, `send-email-notification`, `tenant-web-admin`, `contract-confirmation`. Market lookups already use caller-scoped profile reads. Automated service jobs and public contract-link workflows retain their separate authorization.
- QR verification follows the server’s next state, including recovery resumption, rather than forcing an already-completed email step again.
- Builds passed for desktop and PWA; 132 PWA tests, 18 shared MFA tests, 4 privileged Edge tests and 24 contract/tenant-admin tests passed. Transaction rollback tests cover mandatory enrollment for Admin/staff, pre-rollout existing sessions, setup availability and rejection of disabling enrollment while enforcement is active.
- Both disposable Admin/staff flows passed against real production Auth/DB and deployed endpoints: password-only rejection, AAL2 without email rejection, acknowledged-code access, trusted-device TOTP, device revocation, recovery reenrollment and sign-out-all. Email delivery in these complete-flow tests was intercepted for disposable mailboxes; they do not claim actual delivery to the owner.
- Browser verification: staff login opens mandatory setup; reload remains gated; QR creation works; business navigation is absent; sign-out returns to login. Screenshot: `../docs/security/qa/mfa-mandatory-setup-2026-10-10.png`.
- Evidence: `mfa-mandatory-admin-2026-10-10.json`, `mfa-mandatory-user-2026-10-10.json`, rollout/Edge deployment reports and final acceptance in `../docs/security/qa/`. Disposable accounts and temporary credentials were removed; customer business data was not modified. Owner enrollment remains a personal action and is not claimed by automated tests.

## 2026-10-10 — approved security UI rollout

The approved visual direction is **security option 2** (`docs/design/security-wide/rows.png`) with **mandatory MFA popup option 2** (`docs/design/security-wide/warning-rows.png`). The security surface now uses a wide row-based layout with Bảo mật, Thiết bị, and Hoạt động tabs. Mandatory setup uses a three-step horizontal flow: Google Authenticator, email verification, and recovery-code acknowledgement. Recovery bundles include a `.txt` download action from the in-memory one-time bundle; downloading does not acknowledge the bundle, and the user must still check the saved-code confirmation.

## Session persistence update — 2026-10-10
- Verified management sessions persist in local browser storage across reload/restart and retain the server-issued deadline.
- Backend settings are deployed at `idle_seconds=21600` and `lifetime_seconds=21600`; existing sessions beyond six hours were capped and the live count over six hours is zero.
- Desktop/PWA force local sign-out at the deadline, clear private query data, and do not extend the deadline during reload.
- Removed the separate “Tổng quan bảo mật” navigation button; security controls remain available through the profile tabs.

## Google Authenticator management + security overview reads — 2026-10-12

- Implemented approved option 2: status, change Authenticator, replacement recovery codes and lost-device recovery entry.
- Replacement requires a fresh code from the existing verified factor; new factor is registered to this user/session and verified before old factors are atomically retired. Normal replacement never uses the lost-device reset route.
- A once-visible recovery bundle stays mounted until explicit save acknowledgement. Tokens, QR secrets and recovery codes are not written to browser storage by this flow.
- Devices, active sessions and activity are readable throughout an authorized six-hour login; only mutations request another Authenticator code. The dedicated read RPC preserves account ownership, AAL2, session expiry, IP/browser identity, email requirements and recovery acknowledgement.
- UI keeps the requested action pending and executes it after successful OTP. Incorrect OTP or cancel does not mutate anything.
- Database rollback invariants, deployed Auth/Edge disposable-account verification, 157 PWA tests, PWA build and renderer typecheck passed. Existing login lifetime is unchanged.
- Deployment: `bbc49613-c21b-43e3-b6a7-0bf722805f3b`, build `b8aebeba3a469e85`. Profile asset SHA256 independently matched production. Evidence: `docs/security/qa/totp-replacement-auth-e2e.json`, `adminpwa/qa/security-profile/authenticator-production-verification.json` and root `design-qa.md`.
