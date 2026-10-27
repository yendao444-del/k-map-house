# Mandatory PWA update — 2026-10-11

## Source and scope

Approved visual: `G:/PHONG TRO/app/design-demos/pwa-update-required-target.png`.

Scope is the small update button at the top right, mandatory-update badge and dimmed application surface with centered lock message. Existing application navigation and business data are preserved. The DEV-only fixture uses sample rows and cannot access Auth or customer data; its background is contextual and is not a replacement for the real room table.

## Evidence

- Approved source: 1586 × 992 pixels.
- Desktop implementation: `desktop-final.png`, 1586 × 992 CSS/pixel viewport, density 1.
- Mobile adaptation: `mobile-final.png`, 390 × 844, density 1.
- Narrow mobile: `mobile-320.png`, 320 × 568, density 1.
- Error state: `error.png`, 1586 × 992, density 1.
- Full comparison: `desktop-comparison.png`; source left, implementation right, equal pixel dimensions.
- Focused comparisons: `trigger-comparison.png` and `lock-comparison.png`; equal-size unscaled crops of the same viewport/state.

Captured through the Codex in-app browser at `http://127.0.0.1:4178/?qa=pwa-update`. The fixture renders the same `PwaUpdateStatus` component used by production.

## Comparison history

First desktop/mobile inspection: `desktop.png` and `mobile.png`.

- [P2] Scrim blur was too strong and hid the table more than the approved target. Reduced blur from 2px to .5px and adjusted navy opacity. Recaptured in `desktop-final.png`.
- [P2] Center lock treatment and supporting copy were smaller than the target. Set desktop lock circle to 100px and supporting copy to 16px; retained a 64px/14px mobile adaptation. Compared using `lock-comparison.png`.
- [P2] Mobile icon-only action was unclear. Added the short visible label `Cập nhật` alongside the icon. Confirmed at 390px and 320px in final mobile captures.

Final combined comparison has no actionable P0/P1/P2 findings in the update component. Differences in the sample background table are expected fixture content and do not represent production layout changes.

## Required fidelity surfaces

- Typography: project Inter with Vietnamese support; compact 12px header action, 21px desktop heading, 16px body; mobile 18px heading/14px body. Vietnamese labels are readable and unclipped.
- Spacing/layout: approximately 190 × 34px desktop action, 10px corner radius, badge beside the action, central 100px lock circle. Button sits before the existing right header controls. On mobile the action moves to the right edge and keeps a readable short label. No document overflow at 320px.
- Colors/tokens: pale mint action, emerald border/focus treatment, navy mandatory badge and scrim, white lock message. Focus ring is visible over the scrim.
- Assets: standard update/lock icons from the installed Lucide library; existing product assets remain unchanged. Outline lock differs from the generated filled lock and is an acceptable icon-library adaptation.
- Copy: the approved Vietnamese update label, mandatory badge and lock description are preserved. Error feedback is explicit and retryable.

## Interaction and runtime checks

- Background is inert, including existing and newly added application portals. Gate remains above all app modals.
- Initial focus is on update. Tab/Shift+Tab stay in the gate; Escape cannot dismiss it. Enter activates the update.
- UI fixture: click success unlocks app; failed update stays locked with error; retry via Enter succeeds; background action works only after success.
- Browser error console: empty during tested fixture states.
- Runtime tests: no activation on detection, waiting-worker readiness, first installation, exactly one reload after the accepted worker becomes controller, double-click coalescing, cross-tab activation, failed postMessage, activation timeout/retry, periodic/foreground/reconnect polling and offline network suppression.
- `npm test`: 152/152 passed, including 9 PWA runtime tests.
- `npm run build`: passed, including TypeScript and public bundle checks.

The browser fixture simulates update success/failure; actual service-worker transitions are covered with runtime and worker tests. No real production account or customer record was modified for UI verification. The gate protects normal application interaction; it is not a backend authorization mechanism. The first deployment delivers this behavior to existing installations; installations still running the earlier bundle acquire it when they next load the new bundle.

final result: passed

Production deployment: aea3aadf-03bd-4277-a96f-158c0a1496aa; build 5559d77d3f58eaac. Remote JS/CSS hashes and worker verified; production login browser console: no errors. Evidence: production-login.png and ../../../adminpwa/qa/pwa-update-production-verification.json.

