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
- Hover states: `hover-front-2026-10-12.png` and `hover-back-2026-10-12.png`, captured at the default 1280 × 720 viewport from the live QA page. Browser-input drag to move the pointer produced a harmless text-selection highlight in these evidence captures.
- Larger hover state: `hover-large-520-2026-10-12.png`, showing the new 520px desktop preview with a 494px image area.
- Fullscreen viewer state: `fullscreen-fit-2026-10-12.png`, captured after opening the first-row document. It shows the image fitted to the full viewport and the detected `Ảnh ngang` label.
- Electron-safe close state: `fullscreen-close-fixed-2026-10-12.png`, captured after the viewer header/button was moved below the native 40px titlebar overlay.
- Data state: five fictional tenants, active contracts, complete and missing identity/contact states. The generated mock's counts, inconsistent deposit examples and dates were not copied as business logic. The implementation derives real counts and amounts from existing data. Mock dates remain anchored to the approved 11 October reference.
- Hover evidence: live desktop QA at 1280 × 720 confirmed the first-row CCCD thumbnail opens a substantially larger 520px preview with a 494px image area and matching side label. It remains fixed, viewport-bounded and does not change table height. Moving away dismisses it. Narrow and short viewport fallback positions are covered by regression tests. No tenant fixture data was changed.

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
- Desktop hover: on a pointer-capable device, hovering a loaded front/back thumbnail shows a large 520px quick preview with the correct side label; it uses the real stored image and never intercepts the click target. The layout moves beside the thumbnail when a 520px card cannot fit above/below, and clamps to the viewport. `matchMedia('(hover: hover)')` gates the behavior, so touch/mobile keeps the compact cards and tap-to-open viewer only.
- Fullscreen image viewer: the modal now occupies `100dvh` with no outer card margins. Natural image dimensions determine the orientation label (`Ảnh dọc`/`Ảnh ngang`) and proportional fit size, preserving the source aspect ratio. Wheel events are captured with `passive: false`, prevented from scrolling the page, and adjust zoom around the pointer from 100% to 300%; the existing buttons and Escape/focus behavior remain available.
- Viewer uses a body portal, accessible dialog label, focus trap, X/Escape dismissal, bounded 100–300% zoom, and scrollable enlarged content. Fit view uses the entire available image stage below the header and above the toolbar, fitting both natural dimensions without stretching. Fullscreen no longer has an outer dismissible backdrop.
- Filter missing profiles returns the three incomplete tenants; reset restores all five. Email search `ha@example.com` returns Võ Hà only.
- Existing overflow menu still exposes separate `Xem hồ sơ` and `Sửa hồ sơ` actions. Call, Zalo and email destinations remain correctly wired; no calls or messages were sent during verification.
- Tablet 1024 × 768: 1320px table is contained in its own 975px horizontal scroller; body width remains 1024px.
- Mobile 390 × 844 and 320 × 740: body widths 390 and 320 respectively, no desktop table mounted, photo tap targets at least 44px high.
- Console errors checked after final reload: none. Two earlier Vite HMR errors occurred while a JSX patch was incomplete; typechecks, reload and final interaction tests confirmed those were resolved.

## Build and regression checks

- Electron `npm run build`: passed, including node/web typechecks.
- PWA `npm run build`: passed, including public bundle/private-key scan and shell-cache checks.
- PWA `npm test`: 153 passed, zero failures.
- `node --test scripts/tenant-list-ui.test.cjs scripts/tenant-profile-ui.test.cjs`: 21 passed, zero failures after fullscreen/wheel zoom. Includes portrait/landscape fit and wheel-bound coverage, viewport-safe 520px layout coverage, rendered identity completeness/error cases, masking, mirrored components, zoom/keyboard safeguards, hover guard/dismissal coverage, contact links/no truncation and a verified QA mutation barrier.
- PWA typecheck after the fixture mutation barrier: passed.
- 12 October viewer follow-up: Electron and PWA builds and typechecks passed again. The current QA console has zero errors; the fullscreen viewer was visually checked, the header reported `Ảnh ngang`, and a wheel-up event changed the visible zoom indicator from 100% to 149% (`fullscreen-wheel-2026-10-12.png`). Wheel-down returned it to 100%; Escape closed the viewer and restored thumbnail focus. On Electron, the viewer begins below the 40px native titlebar overlay, and both the header `Đóng` button and bottom `Đóng` button were clicked successfully; blank stage click is also wired to close. Portrait proportional fitting is unit-tested, not claimed as a captured real portrait document. This browser check is not physical touchscreen hardware verification.

## Findings and follow-up

No actionable P0/P1/P2 differences remain in the verified list scope. Accepted deviations are dynamic record counts/amounts/dates, retained page title, existing Zalo shortcut, real stored document subjects and compact metadata. This is not pixel-identical fabrication of the generated mock's inconsistent records.

P3: the existing “Hoạt động gần nhất” header and longer status descriptions wrap at this viewport; they remain readable and aligned. Native installed Electron visual verification and production publication remain release follow-up items, not claimed completed.

## Implementation checklist

- [x] Dedicated identity column and visible front/back photos.
- [x] Honest completeness states and visible phone/email missing states.
- [x] Independent clickable zoom, fit/reset/close and keyboard support.
- [x] Desktop hover quick preview with viewport bounds; touch/mobile remains click-only.
- [x] Responsive list and bounded table scrolling.
- [x] Source/implementation full and focused comparison.
- [x] Regression tests, both builds, and read-only fixture.
- [ ] Publish to the real domain / package the installed Electron update when requested.

final result: passed
