# Profile option 3 design QA

Source visual truth: [docs/design/profile-directions/modern-3.png](G:/PHONG%20TRO/app/docs/design/profile-directions/modern-3.png), the user-approved modern option 3.

Implementation evidence: [docs/design/profile-qa/account-desktop-final.jpg](G:/PHONG%20TRO/app/docs/design/profile-qa/account-desktop-final.jpg), [docs/design/profile-qa/profile-desktop.jpg](G:/PHONG%20TRO/app/docs/design/profile-qa/profile-desktop.jpg), [docs/design/profile-qa/account-mobile-390.jpg](G:/PHONG%20TRO/app/docs/design/profile-qa/account-mobile-390.jpg), [docs/design/profile-qa/account-mobile-320.jpg](G:/PHONG%20TRO/app/docs/design/profile-qa/account-mobile-320.jpg), and [docs/design/profile-qa/comparison-desktop.jpg](G:/PHONG%20TRO/app/docs/design/profile-qa/comparison-desktop.jpg).

Viewport and state: desktop browser 1280×720 CSS px, device scale factor 1, account menu open; modal form, security tab, activity tab, and 390/320 px responsive states were also captured. The source is a 1254×1254 square concept and the implementation is a 460 px wide application popover, so the comparison normalizes the source artwork into a 460×631 review canvas without claiming identical surrounding page chrome.

## Evidence review

- Information architecture and copy follow the approved order: identity header, personal profile, account management, green login-security row, activity, and red sign-out.
- The generated header artwork is a raster asset derived from the selected direction; the supplied user avatar is used at runtime. Lucide provides the line icons instead of custom SVG/CSS drawings.
- Typography uses the existing Inter Vietnamese faces, with a clear heading/body hierarchy and no clipped Vietnamese labels.
- Spacing and layout remain usable at desktop, 390 px and 320 px. The menu scrolls within its bounded surface when the viewport is shorter than the content; no horizontal overflow was observed.
- Colors preserve navy, warm white, emerald security emphasis and red sign-out. Focus rings remain visible for keyboard users.
- Interaction checks passed in the isolated local fixture: open/close menu, profile editor, name/avatar save against local sample data, security guidance, activity empty state, Escape close, tab arrow navigation and responsive rendering. No real account, password or session was used by the fixture.

## Comparison history

Initial pass found the desktop menu's lower sign-out row partially below the 720 px viewport because of excess row spacing. The account rows and header rhythm were tightened. A second pass at 390 px and 320 px confirmed bounded width, readable wrapping and scrollable vertical content. No actionable P0, P1 or P2 findings remain.

## Open questions

- Google Authenticator, recovery, trusted-device signals and backend AAL2 enforcement are now implemented. Mandatory management enrollment was enabled on 2026-10-10; see `phase/SECURITY-PHASE-01-PROFILE-AND-MFA.md`.

## Follow-up polish

- When MFA backend work begins, replace the honest “chưa triển khai” guidance with the real enrollment state and recovery flow, keeping the current visual hierarchy.
- Activity history can show audited device events after the backend audit log exists.

final result: passed

## Mandatory security gate — 2026-10-10

The approved modern-3 profile direction remains the visual source of truth; this change adds mandatory security logic to the existing setup surface. Browser evidence at `docs/security/qa/mfa-mandatory-setup-2026-10-10.png` shows readable Vietnamese setup instructions and QR/sign-out actions within the existing login shell. Staff login and reload cannot reach the business UI before setup. QR creation was checked without saving or publishing the secret/QR in evidence. No new visual direction was introduced.

# Security option 2 and mandatory MFA popup option 2 — 2026-10-10

Source visual truth:
- `docs/design/security-wide/rows.png` — approved wide security settings direction.
- `docs/design/security-wide/warning-rows.png` — approved mandatory setup popup direction.

Implementation:
- `src/renderer/src/components/ProfileModal.tsx`, `SecurityProfilePanel.tsx`, and `account-profile.css`.
- `src/renderer/src/components/SecurityAccessPanel.tsx` and `lib/recovery-download.ts`.
- The same components and styles are mirrored under `adminpwa/src/renderer/src/`.

Viewport and state: local browser preview at 484×748 CSS px for responsive verification, plus desktop production build. The preview visibly rendered the security rows (Bảo mật, Thiết bị, Hoạt động) and the mandatory popup with three horizontal steps. The popup uses the approved wide hierarchy: brand/status, title, stepper, required notice, sign-out, and primary setup action.

Recovery-code verification: the one-time bundle remains in memory; `Tải mã khôi phục (.txt)` creates a UTF-8 text download from that bundle without issuing another bundle or acknowledging it. The acknowledgement checkbox remains required before `Đã lưu, hoàn tất` becomes available. Browser download permission was denied in the preview, so the download event itself could not be captured there; the production bundle contains the control and helper, and typecheck/build/tests passed.

Checks:
- Desktop `npm run build`: passed.
- PWA `npm run build`: passed, including public bundle scan.
- PWA `npm test`: 132 passed, 0 failed.
- Production `https://app.phongtroankhang.com`: HTTP 200; deployed entry `/assets/index-CAtv4qhL.js`; production CSS includes `account-security-dialog`, `account-mfa-wizard`, and `account-download`.

Findings: no actionable P0/P1/P2 visual or interaction findings remain for the approved desktop and responsive states.

Final result: passed

# Security modal compact proportions - 2026-10-10

Source visual truth: `docs/design/security-wide/compact-proposal.png`, the user-approved compact security-modal direction.

Implementation: the mirrored `account-profile.css` files under `src/renderer/src/components/` and `adminpwa/src/renderer/src/components/` now use a 1020 px modal, 30 px desktop gutters, a 32 px title, 16 px subtitle, 15 px tabs, 32 px icons, 18 px row titles, 14 px supporting copy, and 104 px setting rows (92 px activity row).

Comparison and verification:

- At 1536x1024, the local fixture rendered a 1020x652 px dialog with four rows measuring 104, 104, 104 and 92 px. Dialog and tab scroll widths matched their client widths.
- At 1024x768, the dialog correctly contracted to 984 px inside the backdrop; the compact tablet grid kept every action label on one line and did not overflow.
- At 390x844, the dialog and password form had no horizontal overflow. The four-tab strip remains horizontally swipeable, with its scrollbar visually hidden so the additional password tab does not make the compact mobile layout noisy.

The approved image predates the later fourth password tab. That tab follows the same 15 px tab rhythm and was checked separately at desktop and mobile widths. No visual or interaction regression found.

Final result: passed

# Fixed security shell and password email verification - 2026-10-10

Source visual truth: the approved compact wide-security direction above. This is a behavioral refinement of that approved layout; no new visual direction was introduced.

Implementation evidence:

- `docs/design/profile-qa/security-fixed-1280-overview.png`
- `docs/design/profile-qa/security-fixed-1280-otp.png`
- `docs/design/profile-qa/security-fixed-390-overview.png`
- `docs/design/profile-qa/security-fixed-390-password.png`

Verification used the isolated profile fixture with sample data only. At 1280x720, the Bảo mật overview and Đổi mật khẩu states each measured 1020x650 px at the identical x/y position. The fixed dialog preserves its header and tab strip while its content becomes the scroll area; it reserves the scrollbar gutter so a longer tab cannot shift the columns. At 390x844, both states measured 366x820 px at the identical x/y position, with no horizontal document overflow.

The password form now presents `Gửi mã xác minh` after the current/new password fields. The fixture then shows a six-digit OTP field, retry/cancel actions, and automatic completion once all six digits are entered. The live implementation delegates nonce issuance and password mutation to Supabase Auth; the fixture only simulates these states and never sends email or changes an account.

Production release: Cloudflare Pages deployment `18e780bf-269e-4c1b-9a59-499a6cba4989` is active. The domain serves `/assets/index-BRQHURAF.js` and the matching stylesheet with the email-OTP labels, Auth reauthentication call, nonce payload, fixed dialog height, and stable scrollbar gutter. TLS, service worker, manifest and security headers were rechecked successfully.

Final result: passed

# Tenant edit OCR — Electron target correction — 2026-10-11

## Findings and correction

- [P1] Implementation was applied to the wrong runtime. The previous change affected `adminpwa/`, while the user's supplied screenshot `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-cee16d39-fc8a-415a-8ca4-b981a373a365.png` (697 × 884 px) matches the old narrow inline `TenantEditModal` in `src/renderer/src/components/TenantsTab.tsx`. This was a target mismatch, not evidence of a cache problem.
- The Electron inline edit form is now replaced with `TenantFormModal initialTenant={...}`. The shared OCR form, stored-image preview hook and safe draft/payload helpers have been mirrored into Electron. Error handling and existing `updateTenant`/query invalidation remain wired to the real edit action. Native OCR/clipboard adapters are unchanged.

## Visual truth and state

- Approved source: `C:/Users/Admin/.codex/visualizations/2026/09/22/01a0c6f6-7c6a-7db1-9b7d-ff16718b7143/tenant-edit-ocr-2026-10-10/tenant-edit-ocr-1.png`, 1487 × 1058 px, phương án 1.
- Intended view: Electron, Quản lý cho thuê > Khách thuê > Sửa hồ sơ; wide two-column dialog at desktop size, two front/back CCCD slots and separate update-identity action.
- Latest Electron implementation screenshot: unavailable. Native computer control is disabled in this session; the enabled in-app browser does not expose Electron's window. The old screenshot cannot be reused as post-fix evidence.
- Viewport/density normalization, combined full comparison and focused comparison: pending actual Electron capture. No pixel-fidelity acceptance is claimed for this runtime yet.

## Required fidelity surfaces — pending rendered confirmation

- Typography: existing Inter and Vietnamese font assets retained; form uses the same approved heading/label hierarchy as PWA.
- Spacing/layout: 1040px desktop modal, two-column content and fixed footer; component-scoped narrow-window reflow added to Electron CSS. Native rendered proportions still need capture.
- Colors/tokens: existing emerald, mint, white and rose semantic tokens retained.
- Images/assets: original identity image remains unchanged for contact-only edits; split preview is display-only. No generated replacement is written to real profiles.
- Copy/content: separate front/back labels, `Cập nhật ảnh CCCD`, OCR/manual-review note and `Lưu thay đổi` are implemented. Stored and recognized states are not conflated.

## Verification and remaining checklist

- Electron `npm run build` passed, including node/web typechecks and renderer build.
- `scripts/tenant-profile-ui.test.cjs`: 5/5 passed; proves Electron edit uses the OCR form, no legacy narrow modal remains in the edit wrapper, and the three core files match the PWA copies.
- `adminpwa/tests/tenant-profile-draft.test.mjs`: 6/6 passed for contact-only preservation, replacement metadata and late-OCR/manual-edit safeguards.
- Open Electron > Khách thuê, close any already-open legacy edit dialog, and reopen Sửa hồ sơ. Capture the new native modal at the approved viewport, inspect full/focused comparisons and test image zoom/replacement using a disposable test profile. Do not mutate a real tenant to satisfy QA.
- No production deployment or installed Electron release was made by this correction. Source and local build only.

final result: blocked

# PWA mandatory update release — 2026-10-11

Approved visual: `design-demos/pwa-update-required-target.png`.
Detailed comparison, iteration history and interaction evidence: `docs/design/pwa-update-qa/design-qa.md`.
Desktop evidence: `docs/design/pwa-update-qa/desktop-final.png` (1586 × 992, density 1); mobile: `docs/design/pwa-update-qa/mobile-final.png` (390 × 844) and `mobile-320.png` (320 × 568).
Combined comparison: `docs/design/pwa-update-qa/desktop-comparison.png`; focused comparisons: `trigger-comparison.png` and `lock-comparison.png` in that directory. Source and desktop capture have identical dimensions/state. The fixture uses sample background data; the production room table has not been redesigned.

Compared typography, spacing, colors, assets and Vietnamese copy. Initial excessive blur, undersized lock/body copy and mobile icon-only action were corrected and recaptured. No actionable P0/P1/P2 findings remain in the scoped update component. Mobile keeps the short visible label “Cập nhật”. Existing icons/brand assets are retained; Lucide's outline lock is an acceptable icon adaptation.

Verified click/Enter update, error/retry, Tab/Escape trapping, background inertness and unlock. 152 tests passed, including 9 new update-runtime tests; TypeScript/build/public-bundle checks passed. The fixture simulates update outcomes, while worker/runtime tests cover actual event handling. Production login rendered successfully with no browser error logs. UI verification did not log in or mutate customer records.

Production release: `aea3aadf-03bd-4277-a96f-158c0a1496aa`, build `5559d77d3f58eaac`. Remote JS/CSS hashes match local dist, service worker matches, and DEV fixture strings are absent. Verification evidence: `adminpwa/qa/pwa-update-production-verification.json`. First rollout: an already-open tab on the older bundle must load this release once to acquire the new gate; subsequent available updates require acceptance before normal app interaction resumes. The frontend gate is not a replacement for backend authorization.

final result: passed

# Tenant list — approved direction 1 + image zoom

## Source and scope

- Approved visual truth: `G:/PHONG TRO/app/docs/design/tenant-list-contact-2026-10-11/identity.png` (1763 × 892 pixels), the first image displayed in the latest ideation set. The user approved direction 1 and requested clickable image enlargement.
- Implementation: the existing `TenantsTab` in Electron and PWA, with mirrored `TenantIdentityListCell` and `TenantContactCell`. No new production route, backend schema, tenant records, OCR payloads, deposit calculations, or access permissions were changed.
- Browser verification: `http://127.0.0.1:4178/?qa=tenant&view=list`, DEV-only fictional data. The fixture's mutation cache rejects every mutation before its database function; no real tenant was edited.
- This acceptance covers the browser-rendered desktop/mobile list and the shared source implementation. The installed native Electron window was not captured; its source build and shared-component parity were verified. No packaged Electron release or online deployment was made.

## Evidence and normalization

All evidence paths below are under `G:/PHONG TRO/app/docs/design/tenant-list-contact-2026-10-11/qa/`.

- Full browser capture: `desktop.jpg`, 1419 × 830 pixels, CSS viewport 1419 × 830, devicePixelRatio 1.
- Matched content capture: `content.jpg`, 1419 × 718, clipping the existing page title/header at y=112 so the comparison begins at the tenant status filters like the approved image.
- Source normalized proportionally to 1419 × 718: `reference-normalized.png`. No density or aspect-ratio distortion.
- Full comparison input: `comparison.png`, source above / implementation below. Both images were opened together and inspected.
- Focused comparison: `comparison-detail.png`, source left / implementation right, covering identity thumbnails, completeness labels, masked numbers, and contact details. Both were inspected together at readable size.
- Additional states: `zoom-fit.jpg`, `tenant-list-zoom.jpg`, `mobile-390.jpg`, `mobile-320.jpg`, `mobile-zoom.jpg`, `tablet.jpg`.
- Data state: five fictional tenants, active contracts, complete and missing identity/contact states. The generated mock's counts, inconsistent deposit examples and dates were not copied as business logic. The implementation derives real counts and amounts from existing data. Mock dates remain anchored to the approved 11 October reference.

## Comparison history and fixes

1. Initial desktop inspection found [P2] excessive 134.9px row heights and room labels wrapping into multiple lines. Cause: identity metadata below the thumbnails and unbalanced table widths. Fixed by placing status/number beside the photographs, using a fixed eight-column grid and keeping the room badge intact. Post-fix rows measure approximately 85–89.5px; five rows and the footer fit.
2. Next inspection found [P2] the rightmost action partly outside the scroller because its column could not hold its padding plus 32px button. Fixed action/date cell widths and gutters. Post-fix at 1419px: table scroller clientWidth=1370 and scrollWidth=1370; every action and date is visible.
3. A capture taken during loading/HMR (`comparison-initial.png`) had premature incomplete summary states. The image hook now initializes loading from source presence, and final capture explicitly waits for loaded identity states. Final capture shows three tenants needing attention, with partial or broken documents counted and no complete row incorrectly flagged.
4. Mobile narrow-width resilience: identity blocks wrap below 768px and footer actions wrap rather than overflowing. Desktop table is unmounted on mobile, avoiding duplicate image decoding and duplicate viewers. At 390px and 320px the document width equals viewport width.

## Required fidelity surfaces

- Fonts/typography: retained the app's Inter/Vietnamese font assets and existing heading hierarchy. Contact body text is 14px, names remain bold and readable, thumbnail captions/status metadata 10–11px. Email values wrap instead of being ellipsized; short phone values remain tabular. Date and room labels no longer split unnecessarily. Accepted compact metadata differences from the generated mock.
- Spacing/layout rhythm: same filter → amber attention strip → grouped white table → fixed footer hierarchy. A dedicated identity column sits between tenant/room and contact, matching direction 1. Two separate landscape photographs with status beside them preserve the reference's scanability. Native page title and existing controls were retained outside the matched crop.
- Colors/tokens: retained emerald/mint/white/slate brand tokens. Complete document state is green; missing number, missing side, missing image or unavailable image uses amber plus explicit text/icon, never color alone. The amber missing-state tone is slightly darker than the generated orange, improving contrast.
- Image quality/asset fidelity: production thumbnails use each tenant's actual stored identity image via the existing display-only split hook, not generated demo cards. `object-contain` prevents identity details being cropped from thumbnails. Clicking each side opens its full image; no original image or metadata is rewritten. QA uses same-context fictional document assets. Font Awesome icons and existing initial avatars are retained.
- Copy/content: explicit `Đủ 2 ảnh`, `Thiếu mặt sau`, `Thiếu ảnh CCCD`, `Có 2 ảnh · thiếu số`, `Chưa có CCCD`, `Không tải được ảnh`, `Chưa có SĐT`, `Chưa có email`. Having a number alone is not treated as a complete identity document. No authenticity/verification claim is made. Attention summary counts unique tenants, not duplicate missing fields.

## Interaction verification

- Desktop: click front and back separately; fit view; zoom to 150%/200%; close with Escape and restore the original photo button's focus.
- Mobile: click front, zoom through 300%; further zoom is disabled at the bound; reset to fit and close. Missing image buttons are disabled.
- Viewer uses a body portal, accessible dialog label, focus trap, backdrop/X/Escape dismissal, bounded 100–300% zoom, and scrollable enlarged content. Fit view displays the full document within a 60dvh image limit.
- Filter missing profiles returns the three incomplete tenants; reset restores all five. Email search `ha@example.com` returns Võ Hà only.
- Existing overflow menu still exposes separate `Xem hồ sơ` and `Sửa hồ sơ` actions. Call, Zalo and email destinations remain correctly wired; no calls or messages were sent during verification.
- Tablet 1024 × 768: 1320px table is contained in its own 975px horizontal scroller; body width remains 1024px.
- Mobile 390 × 844 and 320 × 740: body widths 390 and 320 respectively, no desktop table mounted, photo tap targets at least 44px high.
- Console errors checked after final reload: none. Two earlier Vite HMR errors occurred while a JSX patch was incomplete; typechecks, reload and final interaction tests confirmed those were resolved.

## Build and regression checks

- Electron `npm run build`: passed, including node/web typechecks.
- PWA `npm run build`: passed, including public bundle/private-key scan and shell-cache checks.
- PWA `npm test`: 153 passed, zero failures.
- `node --test scripts/tenant-list-ui.test.cjs scripts/tenant-profile-ui.test.cjs`: 18 passed, zero failures. Includes six rendered identity completeness/error cases, masking, mirrored components, zoom/keyboard safeguards, contact links/no truncation and a verified QA mutation barrier.
- PWA typecheck after the fixture mutation barrier: passed.

## Findings and follow-up

No actionable P0/P1/P2 differences remain in the verified list scope. Accepted deviations are dynamic record counts/amounts/dates, retained page title, existing Zalo shortcut, real stored document subjects and compact metadata. This is not pixel-identical fabrication of the generated mock's inconsistent records.

P3: the existing “Hoạt động gần nhất” header and longer status descriptions wrap at this viewport; they remain readable and aligned. Native installed Electron visual verification and production publication remain release follow-up items, not claimed completed.

## Implementation checklist

- [x] Dedicated identity column and visible front/back photos.
- [x] Honest completeness states and visible phone/email missing states.
- [x] Independent clickable zoom, fit/reset/close and keyboard support.
- [x] Responsive list and bounded table scrolling.
- [x] Source/implementation full and focused comparison.
- [x] Regression tests, both builds, and read-only fixture.
- [ ] Publish to the real domain / package the installed Electron update when requested.

final result: passed

## Profile → 2FA, 2026-10-12

Scoped QA: docs/design/profile-2fa/design-qa.md.
Source: docs/design/profile-2fa/demo.png (1585 × 992).
Implementation: docs/design/profile-2fa/implemented-desktop.jpg (1585 × 992; 1020 × 650 dialog).
Combined full/focused evidence: docs/design/profile-2fa/comparison.png and comparison-methods.png.
Responsive evidence: implemented-390.jpg, implemented-320.jpg and email-otp-390.jpg in the same directory.
The first desktop capture clipped the footer. Reduced desktop row height/section padding; final dialog has no internal content overflow. Typography, spacing, colors, library icons and capability-aware copy were visually compared. SMS intentionally remains unavailable while the provider is disabled.
Gmail correct/incorrect OTP, delivery failure/retry, unknown status/retry, cache invalidation, profile → 2FA navigation and small-screen bounds were checked with synthetic data. Electron/PWA builds passed; 12 client and 8 gateway regressions passed. Production build 616d7e05e3fb9c95 bundles verified by SHA-256. No installed Electron release or real mailbox delivery claimed.

final result: passed

# Authenticator option 2 + read-only security tabs QA — 2026-10-12

Source visual truth: [docs/design/authenticator-management/actions/demo.png](G:/PHONG%20TRO/app/docs/design/authenticator-management/actions/demo.png), the user-approved option 2.

Implementation evidence: [adminpwa/qa/security-profile/authenticator-option2-final.jpg](G:/PHONG%20TRO/app/adminpwa/qa/security-profile/authenticator-option2-final.jpg), [adminpwa/qa/security-profile/authenticator-option2-desktop.jpg](G:/PHONG%20TRO/app/adminpwa/qa/security-profile/authenticator-option2-desktop.jpg), [adminpwa/qa/security-profile/authenticator-mobile-390.jpg](G:/PHONG%20TRO/app/adminpwa/qa/security-profile/authenticator-mobile-390.jpg), [adminpwa/qa/security-profile/authenticator-mobile-320.jpg](G:/PHONG%20TRO/app/adminpwa/qa/security-profile/authenticator-mobile-320.jpg), [adminpwa/qa/security-profile/devices-without-stepup.jpg](G:/PHONG%20TRO/app/adminpwa/qa/security-profile/devices-without-stepup.jpg), and [adminpwa/qa/security-profile/activity-without-stepup.jpg](G:/PHONG%20TRO/app/adminpwa/qa/security-profile/activity-without-stepup.jpg).

Viewport and state: source 1536×1024 px at 1×; final desktop browser 1536×1024 CSS px at device scale 1, management overview open; mobile captures at 390×844 and 320×740 CSS px. The full-view comparison uses equal 1536×1024 source/implementation dimensions; the combined canvas downsamples each to 768×512. The established compact modal scale is retained from the earlier user request, so typography and controls are smaller than the generated demo, while hierarchy and order remain unchanged. Focused comparison is recorded in [adminpwa/qa/security-profile/authenticator-focus-comparison.jpg](G:/PHONG%20TRO/app/adminpwa/qa/security-profile/authenticator-focus-comparison.jpg).

## Evidence review

- Option 2 hierarchy is preserved: “Đã bật” beside Google Authenticator, emerald “Đổi Google Authenticator”, outlined recovery action, short explanation, divider and “Mất điện thoại?” recovery link. No extra overview OTP button or recent-verification badge is shown.
- Authenticator replacement is functional: current code → new QR/secret → new code → one-time recovery bundle → acknowledgement. The old factor is retained until the new factor is verified; the current six-hour session survives and unrelated sessions/devices are revoked.
- Device and activity tabs now read through a dedicated server function when the signed-in session is already authorized. Fresh OTP is requested only by a mutation: remember device, revoke device, or revoke all sessions. Browser fixture evidence shows an incorrect code does not mutate and a correct code completes the requested action.
- Typography uses the existing Inter Vietnamese face and the navy/emerald account tokens. Layout remains bounded with no horizontal overflow at 390 px and 320 px; action buttons stack on narrow screens and recovery codes remain readable in a scrollable surface.
- No application console errors were observed during fixture interaction. Downloading recovery codes was verified as a browser download and the final acknowledgement returned a visible success status.

## Comparison history

The initial visual pass found the recovery link inherited muted gray instead of emerald. Its color was corrected; the full-view and focused combined images confirm the fix. Separately, Devices/Activity initially remained behind a fresh-MFA gate. The read path was separated from mutation authorization, the overview was rendered from the existing authorized session, and each mutation was wrapped with a step-up challenge. A second pass checked 390/320 px layouts and the replacement/recovery states. No actionable P0, P1 or P2 findings remain.

## Security evidence

- `node scripts/test-totp-replacement-database.mjs` passed with transaction rollback and disposable fixtures.
- `node scripts/verify-totp-replacement-auth.mjs` passed against deployed Auth/DB/Edge with a disposable account; it verified cancellation, atomic retirement, current-session continuity, saved recovery codes and read-only overview outside the fresh-MFA window.
- `adminpwa/tests/mfa-gateway.test.mjs` and the complete PWA suite passed: 157 tests.
- PWA typecheck, production build and public-bundle scan passed. Production deployment: `bbc49613-c21b-43e3-b6a7-0bf722805f3b`, build `b8aebeba3a469e85`, at `https://app.phongtroankhang.com`.

final result: passed


## Security profile responsive annotation, 2026-10-12

Source: C:/Users/Admin/AppData/Local/Temp/codex-clipboard-db378bcf-66de-4314-9f55-baae0697932f.png (1058 × 706).
Same-state implementation: docs/design/profile-2fa/responsive-password-desktop.jpg.
Combined comparison: docs/design/profile-2fa/responsive-comparison.png.
Detailed report: docs/design/profile-2fa/responsive-design-qa.md.
All four tabs checked at 1058×706, 1366×768, 390×844, 320×740 and 375×667. Password-submit button is visible without scrolling. Mobile tabs all fit horizontally; primary actions precede long record lists. Authenticator/Gmail OTP checked at 320×740. Long lists retain scrolling and logout confirmation. No actionable P0/P1/P2 findings remain. Electron/PWA builds passed, including typechecks and public bundle scan.

final result: passed

## SePay unread/read grouping, 2026-10-12

Approved visual: `docs/design/sepay-unread-2026-10-12/groups.png` (second displayed demo).
Implementation: `docs/design/sepay-unread-2026-10-12/implementation-desktop.png`.
Full and focused combined evidence: `docs/design/sepay-unread-2026-10-12/comparison-full.png`, `docs/design/sepay-unread-2026-10-12/comparison-groups.png`.
Detailed report: `docs/design/sepay-unread-2026-10-12/design-qa.md`.
Desktop 938×850; mobile 390×844 and 320×740; synthetic actual-modal fixture, no real money operations. Unread/viewed groups, explicit per-transaction viewing action, local account-scoped markers, reopen/reload, search across all fetched records, pagination and independent payment warnings verified. 29 tests and both builds passed. No actionable P0/P1/P2 visual findings remain; native Electron rendering and live financial mutation were not exercised. No deployment performed.

final result: passed


## Electron admin login — 2026-10-13

Approved target: clipboard-de806dc0-4a8c-445d-bb8b-93fc6b9edd72.png.
Applied the approved admin PWA login presentation to src/renderer/src/components/LoginScreen.tsx, preserving Electron main wrapper, titlebar drag region, existing authentication handlers, MFA, recovery and policy dialogs.
Horizontal AK/brand header, admin eyebrow, left-aligned heading, right-aligned forgot-password, 416px panel and plain legal divider now match the approved presentation. Removed previous marketing banner and orphan alternative-login separator.
Validation: npm run build passed (node and renderer typechecks; Electron main, preload and renderer builds).
Prior browser visual evidence for the same markup: adminpwa/qa/login-refined/comparison.png. Native Electron visual capture was not obtained in this turn; prior PWA capture is not a native Electron verification.
final result: blocked (native Electron visual comparison pending; implementation and build completed)

## Mỹ Hạnh gold-price widget — 2026-10-19

Approved source: `G:/PHONG TRO/app/tmp-product-design/gold-myhanh-original-layout-20261019.png` (1015×1550).
Implementation: `G:/PHONG TRO/app/docs/design/gold-myhanh-20261019/final-desktop.jpg` (1432×1149; in-app browser CSS viewport 1440×1100, DPR 1, scrollbar excluded).
Full comparison: `docs/design/gold-myhanh-20261019/final-comparison.png`; focused evidence: `final-hero-comparison.png` and `final-table-comparison.png` in the same folder. Source panel crop 966×1524 was proportionally normalized to 713px wide for the rendered left-panel comparison.

Same state: dark theme, Mỹ Hạnh default, MH9999 selected, actual source quotes/timestamp. Mỹ Hạnh is the focal hero, seven products are selectable below, branded prices remain secondary. Native Inter fonts, spacing hierarchy, navy/emerald/amber tokens, existing library icons and Vietnamese copy were checked. Preview-only badge intentionally omitted. No raster assets were required.

Initial comparison found inherited uppercase/small row labels and wrong selected-row header color. These were fixed with scoped rules and recaptured. Responsive review then found squeezed numeric columns at 320px; bounded table scrolling and a swipe hint resolved it. Final 320/390px captures show no page-level horizontal overflow or clipped table cells. Subtle generated-image texture/font-weight differences remain acceptable P3 polish.

Selection, refresh, rapid brand changes, SJC history, Mỹ Hạnh history-empty state, source error/staleness and purchase/sale suggestions were exercised through actual production components in a read-only browser harness. Final clean-browser console returned no warnings/errors. Buy suggests 13,550,000đ/chỉ; sell 13,250,000đ/chỉ; two-unit total is 27,100,000đ. No financial transactions were saved. Live source is explicitly attributed to the third-party aggregator, not claimed as an official Mỹ Hạnh API.

Build passed including node/web TypeScript and all Electron bundles; 30 price/history/funding/wallet tests passed. Native Electron window, installer/release and real ledger writes were not exercised. Detailed comparison history and evidence: [Mỹ Hạnh QA](docs/design/gold-myhanh-20261019/design-qa.md).

final result: passed

## Mỹ Hạnh history and compact-layout correction — 2026-10-19

Preserves the approved widget's navy/emerald/amber palette, Mỹ Hạnh primary focus, seven products and branded reference table. Per the user's new correction, the quote/chart panels now form a balanced top row; both price tables are below. At 1150×900 the top panels both measure 379.94px and the complete widget measures 752.94px. Responsive checks at 390px and 320px show no page-level horizontal overflow. Evidence and detailed comparison: [Compact gold QA](docs/design/gold-history-compact-20261019/design-qa.md).

History is now fetched through a typed, trusted Electron IPC instead of returning a hardcoded empty array. The actual upstream Mỹ Hạnh history endpoint still returns zero records. Real daily observations are stored locally with bounded validation/atomic replacement and plotted honestly, including the one-point state; no past dates or substitute SJC series are invented. Collection refreshes every five minutes only while the widget is mounted. Product selection updates the matching chart. Existing SJC history, source errors, file persistence and corruption preservation were checked.

39 tests and production build passed. Actual components verified in an isolated read-only browser harness; native Electron rendering, installer packaging and financial mutations were not exercised. Restart an app using the updated build for the new main/preload bridge.

final result: layout/integration passed; older Mỹ Hạnh history unavailable from upstream, not claimed completed

### Follow-up: remove lower price tables

Per clipboard-c24960b8-d568-497d-9775-fab6ab9e5dab.png, removed both the Mỹ Hạnh product table and branded reference table. Only the primary quote and history chart remain; the grid has no reserved lower row. Source selection and backend data/trading behavior are retained. Updated evidence: `docs/design/gold-history-compact-20261019/without-lower-tables-1150.jpg`.

### Mỹ Hạnh only — 2026-10-20

Per the next user request, removed the remaining SJC/PNJ/Bảo Tín source selectors. Current price and chart now use only MH9999; the widget fetches Mỹ Hạnh directly without requesting the branded feed. Existing assets, trades, wallet behavior and shared legacy APIs were preserved. Actual-component browser check confirms zero other-brand text, zero source selectors and zero lower tables. 34 regression tests and production build passed. Evidence/report: `docs/design/gold-myhanh-only-20261020/design-qa.md`. The separate historical-data/error-handling work remains deferred.

### Correction: Mỹ Hạnh-only trade forms — 2026-10-20

The earlier tracker-only change missed the trade form shown in clipboard-5c1f5f9e-6fe0-4da9-9169-dc595d89bf82.png. Removed SJC/PNJ/Bảo Tín cards from both buy/sell forms; fixed product is MH9999 and modal requests only Mỹ Hạnh quotes. Corrected MH holding action routing; legacy records retain their identity without conversion or deletion. Both real production forms verified in isolated browser fixture, including buy/sell quote direction, totals and sale stock cap. No financial mutation. 35 targeted tests and production build passed. Screenshots and scoped report: `docs/design/gold-myhanh-only-20261020/design-qa.md`. Native Electron/installer deployment not verified or performed.

## Premium Mỹ Hạnh trade modal — approved option 1 — 2026-10-20

Source visual truth: `G:/PHONG TRO/app/tmp-product-design/gold-trade-premium-refined-20261020.png` (first displayed option, 1230×1278). Actual component capture: `docs/design/gold-trade-premium-20261020/desktop-final.png` (800×832, CSS800×832, DPR1). Source normalized to800×832 and opened with the implementation in `comparison-final.png`; focused price/total/action comparison: `comparison-price-footer.png`. Same dark buy state: MH9999,1chỉ,13.550.000đ. Detailed fidelity checks, findings, history and limitations: `docs/design/gold-trade-premium-20261020/design-qa.md`.

Applied the continuous navy/emerald composition to the existing GoldTradeModal. User-requested “Mua vàng” copy and Enter hint intentionally differ from the generated source. Normal-state wallet/balance/shortage blocks removed; explicit submit retains existing funding checks and approved top-up confirmation pipeline. Sale remains red and stock-limited. Legacy assets and financial storage logic preserved.

Initial P2 total/button typography and short-desktop scrolling were fixed and recaptured; final1280×720 body has no overflow. 390×844 and320×640 retain visible footer controls without page-level horizontal overflow. Standard existing ring icon and flatter navy treatment remain P3 polish. Fonts, spacing, tokens, icons and Vietnamese copy inspected in combined full/focused evidence.

Actual production component browser tests used fictional quote/balance data and in-memory save simulations only. Enter, presets, editable price, sale cap, deferred insufficiency, focus trap/restoration and duplicate-save guard checked. Console errors/warnings: none. All60 targeted tests and final production build passed. No actual financial writes, native Electron verification, installer packaging or deployment performed.

final result: passed

## Compact gold workspace — approved option 2 — 2026-10-20

Source visual truth: `G:/PHONG TRO/app/docs/design/gold-compact-2026-10-20/split.png` (second displayed option, 1711×919). Actual implementation: `docs/design/gold-compact-2026-10-20/qa/desktop-final.png` (1711×919 pixels, CSS1711×919, DPR1). Matched dark MH9999 empty-holdings state with deterministic fixture quotes. Combined source/implementation evidence: `qa/comparison-final.png`; focused evidence: `qa/quotes-final.png`, `qa/tabs-final.png` within that design folder. Unchanged top56px header excluded because fixture labels its safe data. Detailed fidelity review, comparison history and limits: [Option 2 QA](docs/design/gold-compact-2026-10-20/design-qa.md).

Compact page header/actions, prices left and wider chart right, one lower holdings/history tab panel. Initial P2 excess panel height and tiny responsive chart labels were fixed and recaptured. Final lower panel is fully visible at919px; 1024/390/320px checks have no page-level horizontal overflow. Fonts, spacing, navy/emerald/amber tokens, existing logo/library icons and Vietnamese copy checked in full/focused combined evidence. Subtle generated texture/font-rendering differences accepted as P3.

Actual production components verified in isolated read-only fixture: mouse/keyboard tabs, header history focus/scroll, quote refresh/filters, buy/sell forms, populated details, original transaction editing and closed-position history. Error/stale/single-point states inspected. No real financial writes. Final console errors/warnings: none. 37 tests and final production build passed after the last cleanup. Native Electron window, installer packaging, authenticated live-account integration, PWA mirroring and deployment not exercised/performed.

final result: passed


## Investment funding confirmation — approved image — 2026-10-21

Source visual truth: `design-references/investment-funding-confirmation/premium-confirmation.png` (1235x1274), normalized to820x845. Actual in-app browser capture: `docs/design/investment-funding-confirmation/desktop-final.jpg` (820x845 CSS/DPR1). Full and focused combined evidence: `comparison-final.png`, `comparison-detail.png` in that folder. Detailed fidelity findings, iterations, responsive checks and limits: [Confirmation QA](docs/design/investment-funding-confirmation/design-qa.md).

Replaced the investment purchase native dialog with a reusable async confirmation, dark navy surface, explicit transfer/source/remaining balance and existing faceted emerald action. Initial P2 excess dialog size/backdrop strength corrected and recaptured. Final full/focused comparison passed. Inter/Vietnamese typography, layout, tokens, existing library icons, financial copy and visible footer controls checked. Minor icon/font/green-finish differences are P3 and follow the existing Electron components. Latest background gold form/date intentionally preserved.

51 financial/history/cloud tests and Electron/PWA typechecks passed. Eight purchase form fixtures passed custom confirmation/cancellation and exact-shortfall checks. Escape, close, backdrop, unmount, focus trap and inert restoration checked. 390x844 and320x568 have no horizontal overflow and retain visible actions. No production financial writes; native Electron window and installer packaging not exercised.

final result: passed
