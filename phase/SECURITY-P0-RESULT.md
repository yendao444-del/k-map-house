# Security P0 Result - 2026-08-07

Implemented on Supabase project `k-map-house` and in the Electron app:

- Moved the SePay token from `app_settings` to RLS-protected `app_secrets`.
- Removed the legacy token from `app_settings`; renderer only receives masked status.
- Removed all `anon_all` policies from the 12 exposed business tables.
- Restricted `app_settings` writes to active admins while preserving authenticated reads for QR settings.
- Revoked public RPC execution for the two auth SECURITY DEFINER helper functions.
- SePay now uses narrow main-process IPC operations; renderer does not pass or receive the token.
- Auxiliary Electron windows explicitly use `sandbox: true`; the main window uses `sandbox: false` for the current external preload bundle, while retaining `nodeIntegration: false` and `contextIsolation: true`.
- Production CSP no longer permits `unsafe-eval`.

Verification:

- `app_secrets` rows: 1; configured token rows: 1.
- Legacy token rows in `app_settings`: 0.
- `anon_all` policies: 0.
- `npm run typecheck:web`: passed.
- `npm run typecheck:node`: passed.

Remaining follow-up:

- Replace broad `authenticated_all` policies with per-table least-privilege policies after mapping each workflow.
- Enable leaked-password protection in Supabase Auth settings.
- Rotate the SePay token and Supabase service-role key after deployment.
- Add authenticated authorization to the existing admin IPC handlers.
- Run a production packaged-build smoke test before release.
