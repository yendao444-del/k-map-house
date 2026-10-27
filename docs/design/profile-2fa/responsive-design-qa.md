# Security profile responsive QA

## Source and scope

- Authoritative source: user screenshot `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-db378bcf-66de-4314-9f55-baae0697932f.png`, 1058 × 706 px.
- Requested change: reduce vertical scrolling in every security tab, including the clipped password-submit button in that screenshot.
- Preserve the approved white modal, Inter font, navy labels, green active tab, account field layout and server security controls.

## Evidence

- Same viewport/state implementation: `responsive-password-desktop.jpg`, 1058 × 706 CSS px, 1× density.
- Combined source/implementation: `responsive-comparison.png`. Source is left; implementation is right. Both are displayed at equal dimensions without density changes.
- Additional screenshots: `responsive-1058-*.jpg`, `responsive-390-*.jpg`, `responsive-320-*.jpg` in this directory.
- Measurement report: `responsive-checks.json`; long list and preserved logout-confirmation checks: `responsive-list-checks.json`.
- Full comparison clearly shows labels, all three inputs and complete submit button. A separate focused crop was unnecessary at these dimensions.

## Findings and fixes

1. Source clips the password-submit button below the 650 px modal.
   Fix: bound the modal by viewport height, reduce header/tab spacing and password-form gaps.
2. Mobile security rows previously placed status and action on separate lines.
   Fix: share the second row between status/action while retaining readable descriptions and 44 px action targets.
3. Mobile tabs could require a horizontal swipe.
   Fix: four-column grid at narrow widths, allowing labels to wrap and all tabs to remain visible.
4. Session-management controls were below potentially long lists.
   Fix: place navigation/logout and its existing confirmation before the records.

## Final measurements

Synthetic fixture with two devices, sessions and events; no real account changes.

| Viewport | Security | Devices | Activity | Password |
|---|---:|---:|---:|---:|
| 1058 × 706 | 0 px | 0 px | 0 px | 0 px |
| 1366 × 768 | 0 px | 0 px | 0 px | 0 px |
| 390 × 844 | 0 px | 0 px | 0 px | 0 px |
| 320 × 740 | 1 px rounding | 0 px | 0 px | 0 px |
| 375 × 667 | 0 px | 9 px | 0 px | 0 px |

Every checked viewport has no document horizontal overflow, no tab horizontal overflow, a bounded dialog and a visible password-submit button. Authenticator overview and Gmail OTP also fit at 320 × 740 without vertical scrolling.

Lists with 24 records still scroll inside the existing modal. Their navigation/logout controls are visible before the list; logout still requires confirmation, and cancel works.

## Required fidelity surfaces

- Typography: existing Inter/Vietnamese hierarchy retained; mobile field text is 16 px to avoid Safari input zoom.
- Spacing: compact viewport-aware header, tabs, method rows, password fields and record rows; no clipped primary controls.
- Colors: existing navy, emerald, pending amber and neutral states retained.
- Assets: existing library icons and product assets retained; no new placeholder assets.
- Copy: all existing security method/form text retained; no authentication or authorization semantics changed.

## Comparison history

Initial 320 px security content required 89 px scrolling; sharing the status/action line reduced it to 1 px rounding. Initial two-device list required 27 px; compact record spacing reduced it to 0 px. At 375 × 667 the device list initially required 84 px; short-viewport spacing reduced it to 9 px. Final snapshots and measurement report reflect the fixes.

## Remaining limits

Large record lists, browser zoom and the on-screen keyboard can still require scrolling. Content remains reachable; no fields or records are hidden to obtain the compact layout.

## Build and publication

Electron and PWA builds passed. PWA build `0ac3d83a12f2a4d9` is published at `https://app.phongtroankhang.com`; production JS/CSS hashes match the validated files. Evidence: `responsive-production-verification.json`. Electron has been built locally; no installer release is claimed.

final result: passed
