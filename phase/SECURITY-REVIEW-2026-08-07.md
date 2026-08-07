# Security Review - 2026-08-07

## Scope

Reviewed the Electron main/preload/renderer boundary, SePay token flow, QR settings, Supabase RLS/grants, auth helper functions, CSP, and production build output for project `k-map-house`.

## Fixed and verified

- SePay token moved from `app_settings` to `app_secrets`; legacy token value removed.
- Renderer no longer receives the SePay token and cannot provide an arbitrary token to the SePay client call.
- Sensitive SePay and Supabase admin IPC calls now require a current Supabase access token; admin operations additionally verify an active `admin` profile in main process.
- Removed all `anon_all` policies.
- Replaced the 12 broad `authenticated_all` policies with explicit CRUD policies requiring an active authenticated profile.
- `app_settings` remains readable for QR rendering, but writes require an active admin.
- Public execute permission revoked from auth SECURITY DEFINER helper functions.
- All application windows explicitly use `sandbox: true`, `nodeIntegration: false`, and `contextIsolation: true`; the preload no longer depends on `@electron-toolkit/preload` and exposes only the required version data plus whitelisted IPC methods.
- Production CSP no longer permits `unsafe-eval`.
- `npm run typecheck:web`, `npm run typecheck:node`, and `npx electron-vite build` pass.
- `npm audit` and `npm audit --omit=dev` both report 0 vulnerabilities after updating Electron, `adm-zip`, build tooling, and the `brace-expansion` override.
- Local Electron smoke test after the preload fix reaches `did-finish-load` without `preload-error`.
- Update IPC no longer accepts an arbitrary download URL from the renderer; update downloads are restricted to HTTPS GitHub hosts and validated against a release checksum before installation.
- External links opened from Electron are restricted to `https:` URLs.

## Remaining external action

- Enable Supabase Auth leaked-password protection in the dashboard. Attempted on 2026-08-07, but Supabase rejected the save because HaveIBeenPwned.org leaked-password protection is available only on Pro plans and above; the security advisor still reports `auth_leaked_password_protection` as WARN.
- Rotate the SePay API token after the new build is deployed. The active Electron path no longer reads or sends a Supabase service-role key.
- CSS still uses `unsafe-inline`; remove it after converting remaining inline styles to classes or nonces.
- `asar: false` remains because the current ZIP updater writes into the unpacked application directory; enabling ASAR requires redesigning that updater path first.
- The data model is single-property/shared-user; per-user row isolation requires an owner/property boundary and is not safe to infer from room IDs alone.
- `electron-builder --dir` completes; it emits non-blocking warnings because the config lists optional Electron files that are not present in the current Electron package layout.
- Supabase Edge Function `admin-sepay-bridge` is deployed with JWT verification enabled. It performs the admin/SePay operations server-side and rejects requests without an Authorization header.

## Evidence

- Supabase counts after migration: legacy token rows `0`, `anon_all` policies `0`, configured secret rows `1`.
- Security advisor residuals: intentional RLS-no-policy info for secret storage and leaked-password protection warning; no public SECURITY DEFINER execute warnings after revocation.
