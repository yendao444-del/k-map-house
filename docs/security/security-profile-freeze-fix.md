# Security profile waiting-state investigation — 2026-10-12

## Confirmed findings

- The device/session OTP prompt disabled every security tab and the profile close button while waiting for user input. The shared disabled-button cursor was `wait`, including controls disabled for policy rather than loading.
- Desktop Supabase requests had no application timeout. Readiness and own-method RPC reads had no timeout on either client. SDK initialization/session reads could leave profile loading or action locks pending.
- Electron toolkit `optimizer.watchWindowShortcuts` deliberately prevents Ctrl+R in packaged builds. The profile focus handler only handles Escape/Tab and does not block reload.
- No async Supabase calls awaited within an auth-state callback were found. The installed SDK defaults to lockless coordination; an auth callback deadlock was not established.
- Existing desktop logs include authentication fetch failures. No full renderer freeze/crash was reproduced in this investigation. The fixes address confirmed waiting-state issues, not a claim that every possible process hang is resolved.

## Changes

- Auth/security Supabase network requests are aborted after 15 seconds, including a stalled response body. Upstream cancellation is preserved.
- SDK/read-only security calls get a 20-second deadline. Deadlines do not race mutations: a late SDK read cannot execute a queued action after failure.
- Initial-load failure displays an error and a retry control. Sensitive-action failure releases the local action lock.
- Waiting for OTP permits closing the profile or switching tabs; switching cancels the pending action and clears its code/challenge. A submitted action remains locked until its request settles.
- Busy/OTP security flows defer foreground/periodic UI revalidation so switching to the Authenticator app does not unmount the pending form. The separate absolute six-hour expiry remains in place.
- Disabled controls use `not-allowed`, not the loading cursor.
- Main-process Ctrl+R explicitly reloads the existing desktop renderer, including when the toolkit suppresses the default shortcut.
- Mandatory MFA and backend mutation policies remain enforced.

## Verification

- Nine new tests cover hung SDK reads, recovery on the next read, stalled response bodies, upstream abort, no security operation after a session-read timeout, and desktop reload handling.
- Full PWA suite: 166 tests passed. Both client typechecks passed; desktop main typecheck passed. PWA and desktop build artifacts generated.
- Browser DEV fixtures: `load-timeout` and `challenge-timeout` deliberately leave a factor read unresolved. Both release after 20 seconds; initial-load retry succeeds; action retry reaches OTP. Wrong OTP leaves the action unperformed; Cancel and tab switching work. No browser console errors in the final fixture check.
- Evidence: `adminpwa/qa/security-profile/timeout-unlocked.png` and `otp-tabs-unlocked.png`. These are fake-session fixtures, not customer account mutations.

## Production

- Website build: `7152d69da8fe09ce`.
- Cloudflare production deployment: `934288e7-d50a-4b75-a883-7bad157a2867`, status `success`.
- Remote `version.json` matches local build. Remote `ProfileModal-D4mI6u42.js` SHA256 matches local: `d4da93b24a6a500912d0cb0425ac9e4d90cc6cdfa4ea5c24e28763f65c9eafbd`.
- Verified deployment record: `adminpwa/qa/security-profile/freeze-production.json`.
- Desktop source/build is updated. An already installed desktop executable requires a new desktop release; publishing the PWA does not update that executable. No Windows installer was distributed in this task.
