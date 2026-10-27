# SePay unread/read — approved direction 2

## Visual truth and evidence

- Approved image: `G:/PHONG TRO/app/docs/design/sepay-unread-2026-10-12/groups.png`, the second image displayed in the latest demo set.
- Actual implementation: `implementation-desktop.png`, captured from the production PWA `SePaySyncModal` and `SePayTransactionHistory`, bundled with fictional network fixtures only. Not a hand-drawn HTML mock.
- Browser preview: `http://127.0.0.1:4178/sepay-visual-qa.html`.
- Source pixels: 1317 × 1194. Implementation pixels and CSS viewport: 938 × 850 at density 1. Source was uniformly normalized to approximately 938 × 850; rounding is less than one pixel.
- Full-view combined comparison: `comparison-full.png`, source on the left, implementation on the right.
- Focused comparison: `comparison-groups.png`, aligned transaction groups at readable size.
- State: two unread transactions, one viewed transaction, no pending matches, details collapsed. A keyboard focus indicator is visible in the final capture because native disclosure keyboard interaction was tested.
- Mobile evidence: `implementation-mobile-390.png`, `implementation-mobile-390-seen.png`, `implementation-mobile-320.png`. Viewports 390 × 844 and 320 × 740, density 1. No horizontal document overflow at either width.

## Findings and comparison history

1. [P2, fixed] The original empty-state wrapper faded the entire history with `opacity-70` and its oversized illustration pushed history down. Removed inherited opacity, condensed the empty state into the approved inline check, retained a readable no-data state.
2. [P2, fixed] First rendered cards used too much vertical space; only the first unread card was visible. Evidence: `implementation-desktop-before-fit.png`. Combined status/reference into the identity header, reduced card/section spacing, placed the viewing action alongside bank details, and retained the original transaction content inside a native details disclosure. Increased the dialog to the approved approximately 712px width and 94dvh maximum height while keeping a fixed footer and independently scrollable body. Final combined evidence shows all three sample transactions and both group headings.
3. [P3, acceptable] Amounts use the existing inline identity flow rather than the mock's dedicated fixed amount column. This preserves flexible wrapping for real names and narrow mobile widths.
4. [P3, acceptable] The existing Font Awesome circle-check icon replaces the generated mock's clipboard-check symbol. Both communicate the same no-pending state; no bespoke icon art or rasterized UI is used.

No remaining actionable P0/P1/P2 visual differences in the tested states.

## Required fidelity surfaces

- Typography: existing Inter product fonts, bold unread identity/amounts, lighter but readable viewed labels, tabular timestamps. Vietnamese diacritics and wrapping are intact at tested widths. No global opacity reduction.
- Spacing/layout: same white modal/light-blue header, compact search block, vertically grouped unread then viewed entries, thin divider and fixed footer. Responsive body scroll is necessary on phones and longer lists; footer and close controls remain available.
- Colors/tokens: unread mint surface/emerald border with blue dot/count; viewed white surface/light slate border and calmer text; blue unread markers remain independent of green matched/paid status. Amber unresolved warnings are preserved after viewing.
- Assets/icons: existing product icon font and loading logo reused, no new raster assets needed. No generated design screenshot is embedded as the implementation.
- Copy/content: approved Vietnamese group names and “Đã xem” action. The generic latest-history title avoids falsely claiming that all 120 fetched transactions are shown. Precise date/time remains in Vietnam time. Full original transfer content, invoice code, remaining amount and diagnostic explanation remain accessible in details; unresolved warnings remain visible by default.

## Interaction and safety verification

- Clicking a fictional transaction's “Đã xem” moves it to the viewed group, changes the count and lighter styling, and preserves its payment status.
- Closing/reopening the actual dialog and reloading the page preserve viewing state.
- Opening the modal alone does not mark unseen rows viewed; automated SSR test confirms no marker write during render.
- Each account has a separate local storage key. Only opaque transaction identifiers are stored, not bank transactions, customer contacts or amounts. Device/browser-local state, not cross-device server synchronization. Corrupt/denied storage has a tested safe fallback and a visible persistence warning.
- Separate tabs merge marker writes and react to browser storage events. Tests verify merge/isolation behavior.
- Search without Vietnamese accents finds “Nguyễn An”. Search also finds a fictional transaction outside the first five visible rows. A 15-record fixture confirms full unread counts and functional “Xem thêm”.
- Unresolved warnings and the “Ghi vào sổ ngân hàng” action remain after the transaction is marked viewed. A pending-match fixture retains “Duyệt: Chốt phiếu” and also renders grouped history.
- Native details open/close with Enter and expose original transfer content, precise paid timestamp and remaining balance.
- The final clean browser tab reported no console errors. Initial fixture-only duplicate React runtime errors were fixed in the test bundler; they were not app source/runtime failures.
- No real bank receipt, payment mutation, customer data, email or production API was used for visual QA. No deployment performed.

## Automated verification

- 29 tests passed across read-state, transaction-time, SePay session policy and PWA SePay security.
- Electron and PWA typechecks/builds passed. PWA public bundle scan passed.
- Test fixture files are not referenced by the production entry point or included as PWA pages/assets.
- Native Electron window rendering was not visually checked; its mirrored component/read-state sources and build were verified. Live account/payment reconciliation was intentionally not exercised.

## Implementation checklist

- [x] Resolve exactly the second displayed image.
- [x] Group and distinguish unread/viewed transactions in both targets.
- [x] Preserve financial flow; viewing is not reconciliation.
- [x] Persist local account-scoped viewing markers and handle failed storage.
- [x] Verify filtering, pagination, reopen/reload, keyboard details, desktop and mobile.
- [x] Compare final implementation and approved image in full and focused combined evidence.
- [x] Preserve unrelated workspace edits; do not deploy.

final result: passed
