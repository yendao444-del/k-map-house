# Local development workstation

Enabled on 2026-10-20 at the owner's request for the existing `admin` account,
against the production database. This is a per-device login exception.

- Password login and active account/role checks remain mandatory.
- The workstation credential is random, stored only as Windows CurrentUser
  DPAPI ciphertext in ignored `.dev-auth/device.dpapi`, and hashed in the DB.
- Main-process IPC serves it only to the registered local loopback dev renderer,
  with a live dev server, on Windows, in an unpackaged application.
- The release renderer removes credential retrieval at build time. No browser
  flag, localhost Origin or `DEV` boolean can grant backend access.
- First successful password login binds the grant to the gateway-derived IP and
  Electron user agent. Changes require normal verification or operator renewal.
- The grant expires on 2026-11-19; normal sessions retain their six-hour limit.
- Current-password confirmation is still required for sensitive database writes.
- Recovery-code generation and Authenticator replacement retain native TOTP checks.
- Revoke `Local Windows development workstation` in the account's device list
  to invalidate access; deleting the local encrypted file prevents its reuse.

The development app was restarted with `electron-vite dev --watch`. Enter the
usual account password once to activate the workstation binding. No user password
was stored, reset or collected by the setup scripts.

Verification: `docs/security/qa/local-dev-device.json` and
`docs/security/qa/local-dev-device-live.json`. The live probe used a disposable
account, sent no emails and deleted the fixture account afterwards. Database
regressions run inside a rollback transaction; roles/settings remain unchanged.

Commands:

```powershell
node --test scripts/dev-device.test.cjs
node scripts/deploy-local-dev-device.mjs
node scripts/verify-local-dev-device-live.mjs
```

`deploy-local-dev-device.mjs --production --provision-admin` explicitly deploys
the migration/function and rotates this workstation's grant. It should only be
run when renewing that grant is intended. No PWA frontend deployment is needed.
