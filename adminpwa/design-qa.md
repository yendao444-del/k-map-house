# PWA mobile design QA

## Scope

This report records the latest visual comparison for the approved Phase 02 room-list direction and the responsive pass for the remaining PWA modules. It is **not** an acceptance report for every authenticated workflow; write operations and account-specific states still need a test-schema/device pass.

- Source visual truth: `../tmp-product-design/rooms-mobile-20261008/electron-like-revision.png`
- Implementation screenshot: `qa/rooms-390-after-mobile-shell.png`
- Full comparison: `qa/rooms-comparison-latest2.png`
- Focused comparison: `qa/rooms-focused-latest2.png`
- Viewport: 390 × 844 CSS px, device scale 1
- Source pixels: 853 × 1844, normalized to 390 × 844 before comparison
- Implementation pixels: 390 × 844
- State: DEV-only `?qa=rooms` harness, source-like fixture; no Auth session or backend writes

## Evidence

The combined comparison places the approved source on the left and the rendered PWA room list on the right at the same normalized size. The focused comparison covers the room rows and payment states where the design decision is most specific.

Primary interactions checked in the harness: room search, status filters, reset filters, empty/filter state, bottom navigation menu, Escape-to-close menu, and room action affordance. Fresh reload after the latest mobile-shell changes visibly rendered the room list. Historical Vite HMR output contained an earlier reload warning; no new runtime error was observed after the page recovered and rendered.

## Comparison history

1. Initial room capture found a taller header and a clipped final filter at 390 px. The mobile spacing and filter overflow were corrected.
2. Revised capture found icon-family drift. Existing Font Awesome/source icon assets were used for the room and navigation marks.
3. Latest capture (`latest2`) shows the continuous list, Electron-like hierarchy, emerald identity, red unpaid state, green paid state and bottom navigation aligned with the approved direction. No actionable P0/P1/P2 visual difference remains in this scoped room screen.

## Required fidelity surfaces

- Fonts and typography: Inter is loaded from the project assets; headings, amounts and status labels retain the approved weight hierarchy and wrap at 320–430 px.
- Spacing and layout: header, search, filters, continuous rows and bottom navigation were checked at 320, 390 and 430 px; 320 px uses horizontal filter scrolling without clipping the page.
- Colors and tokens: emerald brand, white surfaces, red unpaid and green paid states map to the Electron-derived tokens.
- Image quality and assets: the supplied AN KHANG HOME logo and source icon family are used; no placeholder artwork is part of the room list.
- Copy and content: room names, amounts and periods are fixture values for visual QA only; production uses backend period/amount data and does not hardcode October.

## Remaining blockers for complete PWA handoff

### Responsive sweep — 2026-10-09

- Added module-scoped mobile presentation rules for Hóa đơn, Khách thuê, Ví, Báo cáo, Đầu tư, Tài sản, Hợp đồng and Cài đặt. Desktop tables remain available at larger widths; on phones, headers/actions reflow, controls keep touch-sized targets, settings/assets sidebars become horizontal scrollers, and wide tables are contained in their own horizontal scroll areas instead of widening the page. Broad grid-column overrides were removed to avoid changing date pickers and nested financial cards.
- The room-details finance action now receives the same outstanding-invoice label used by the desktop workflow. A room with an unpaid current invoice (for example the supplied Phòng 161 state) shows `Thu tiền hóa đơn còn nợ` and continues through the existing payment guard.
- Production smoke evidence: `https://app.phongtroankhang.com` served the current local entry `/assets/index-BdLWdx_F.js`, build `feab0f702d6df8c4`, manifest and service worker with valid TLS, HTTPS redirect and security headers (`qa/production-domain-verification.json`, verified 2026-10-09T02:02:24Z). The unauthenticated 390 × 844 login screen rendered with document/body scroll width equal to the viewport; no credentials or financial action were submitted. Current production tab is held for user login; authenticated module captures are pending.
- Local invoice harness evidence at 390 × 844 rendered the mobile cards without horizontal overflow (`innerWidth=390`, `scrollWidth=390`, first cards right edge 378). This is visual/layout evidence only; it does not replace authenticated module captures.

### Invoice card regression verification (not a new approved visual direction)

- Actual shared `MobileInvoiceCard` rendered with synthetic fixtures in the DEV-only invoice harness at 320/390/430 × 844 CSS px, scale 1.
- Screenshots: `qa/invoices-card-320.png`, `qa/invoices-card-390.png`, `qa/invoices-card-430.png`. The 320 and 390 captures were opened for visual inspection.
- Corrected a P1 functional issue: negative/refund balances were previously mislabeled collected. Pending refund now shows 500,000 VND; partial signed refund shows 300,000 VND; merged/cancelled cards have no collection button. Pure tests cover these states and admin/debt guards.
- Long fixture tenant labels wrap, page scroll width matches each viewport, primary actions measure 44 CSS px. Expanded deposit breakdown and refund callback were checked in-browser without recording any payment.
- Menu button now calls the real existing invoice menu in `InvoicesTab`; harness menu/payment callbacks are notices only. This does not verify the integrated menu, PaymentModal or backend. No independent approved invoice mock exists, so no pixel-fidelity acceptance is claimed for invoices.
- Browser logs contain only the historical Vite HMR warning already noted above; no additional error was returned by this inspection. Full clean-session/mobile integration testing remains required.

- Live existing-account authentication and recovery callback are not end-to-end verified; the production Supabase redirect configuration itself is verified in `qa/auth-redirect-production.json`.
- Tenant, invoice, contract, asset, finance, report, investment and settings screens need mobile browser captures and workflow checks against the shared backend/test schema.
- Investment cloud RPCs and the isolated read-only NAV proxy are now deployed (see evidence below). Tenant contract email delivery is still not integrated; remaining bridge adapters must not be represented as complete.
- Production install/update/offline behavior, security headers, RLS regression and rollback are not yet accepted.

**final result: blocked**

The Phase 02 room-list visual comparison is ready, but the complete mobile PWA goal remains in progress until the blockers above have evidence.

## Historical verification — Phase 03 before final production checks (2026-10-09)

The record below describes the earlier build and temporary verification blocker. It is superseded by the final scoped acceptance section below, not the current Phase 03 status.

This section is the acceptance record for the user-approved **Kết quả kinh doanh** and **Giao dịch** direction only. It does not accept the unrelated Công nợ, Cài đặt, Đầu tư, Cọc or other PWA modules.

- Source visual truth: `qa/business-report-mobile-demo.png` and `qa/transactions-mobile-demo.png` (853 × 1844 source pixels, normalized to 390 × 844 CSS px, device scale 1).
- Production implementation: `https://app.phongtroankhang.com/` serves `/assets/index-CnQKWd_G.js` after the latest scoped deployment. Primary captures `qa/pnl-390-production.jpg` and `qa/transactions-390-production.jpg` belong to the **earlier** `/assets/index-BkUPW4lX.js` build, not the latest revision. Initial full combined comparisons: `qa/pnl-comparison-initial.png`, `qa/transactions-comparison-initial.png`; initial focused comparisons: `qa/pnl-focused-initial.png`, `qa/transactions-focused-initial.png`. Post-fix production captures and comparisons are still pending; files ending `comparison-production` currently contain the initial comparison and are not post-fix proof.
- Initial-build responsive evidence: 320/390/430/768/900/1280 production captures; document scroll width matched the viewport at every checked width and the desktop path remained active at 1280px. The revised spacing and repositioned period control still need fresh captures at those widths.
- State: authenticated existing management session, real read-only records. Synthetic state harness `?qa=finance` was DEV-only and used only for loading, error, empty, negative-profit, zero-category, long-list/load-more and role-guard checks; it made no backend calls or writes.

### Comparison history

1. Initial comparison found density drift in the mobile summary and an out-of-order period control for Giao dịch. The summary spacing/typography was tightened and the existing period control was mounted once in the mobile transaction flow.
2. The revised implementation was rebuilt and redeployed. DEV fixture screenshots confirm readable loading/error/negative-profit states, and browser interactions confirm staff/admin presentation and 24→48→50 pagination. Post-fix production comparison has **not** been performed: after the PWA update interaction the old browser tab timed out; fresh production tabs render the room list and accept search input but menu clicks and Enter/Space do not visibly open navigation. A definitive browser-vs-application cause is not established. No hidden-state browser mutation or auth bypass was used to force the target screens.

### Required fidelity surfaces

- Fonts/typography: Inter project font and existing Font Awesome icon family; initial-build headings, totals and row labels were inspected at 320–430px. Revised typography was visually inspected in the 390px fixture, not yet in production.
- Spacing/layout: initial summary cards, filter controls, chronological rows, details and bottom navigation were checked at phone/tablet boundaries. The comparison found P2 hero-height/period-order drift; source fixes are applied but fresh integrated visual evidence remains required. Keyboard-visible focus was observed in the fixture.
- Colors/tokens: emerald income/profit, red expense/loss, amber non-operating and white surfaces map to the approved direction.
- Image/assets: source logo and existing icon assets are preserved; no CSS-art or placeholder image replaces an approved asset.
- Copy/content: real Vietnamese category names and backend amounts are rendered; demo amounts are never hardcoded into production.
- States/interactions on the initial production build: period selection and restore, search for room 221, empty search, type/category filters, detail expansion, add/edit cancellation and delete confirmation cancellation. The old invoice action opened the general invoice list, so it was changed to pass the exact `invoiceId` and reuse `InvoiceDetailModal`; **the revised linked-invoice interaction is not yet browser-verified**. Fixture browser checks: uppercase-Đ note searched without accents, staff notice versus admin actions, loading/error text, negative profit, zero-row drill callback and 24→48→50 pagination. SSR tests cover error/loading/empty and role/link guards. P&L group/chart expansion, latest period placement, exact invoice modal and Escape on integrated finance forms remain pending. No real financial mutation was submitted.
- Console: no errors from the finance harness; production verification recorded only the pre-existing compatibility warning for an optional `rooms.electric_price` column.

### Deployment evidence

- `qa/production-domain-verification.json` confirms DNS, TLS, HTTP→HTTPS, manifest, service worker and security headers for `app.phongtroankhang.com`, with entry `/assets/index-CnQKWd_G.js`.
- `qa/pages-preview-deployment.json` records the scoped Cloudflare Pages project `ankhanghome-admin-pwa`; root/pay/www, Electron and tenant portal were not changed.

### Remaining blocking checklist

1. Resolve or clear the unresponsive production browser navigation. User was asked whether a PWA confirmation dialog remains pending; no reply yet.
2. Capture the latest build at the same source viewport/state, regenerate combined full/focused comparisons and responsive evidence, then inspect them.
3. Verify group/chart expansion, latest period placement, exact linked-invoice details and integrated Escape handling without financial writes.

**final result: blocked**

Implementation, 121/121 tests and deployment succeeded, but post-fix integrated visual/workflow acceptance is pending. Do not treat the scoped phase or whole PWA as fully accepted.

## Final scoped acceptance — Phase 03 (2026-10-09)

- Approved references: `qa/business-report-mobile-demo.png` and `qa/transactions-mobile-demo.png`; acceptance covers only **Kết quả kinh doanh** and **Giao dịch**, not the whole PWA.
- Final production entry: `/assets/index-ArixS-fy.js` at `https://app.phongtroankhang.com/`. Domain/DNS/TLS, HTTPS redirect, manifest, service worker and security headers passed in `qa/production-domain-verification.json`.
- Final screenshots: `qa/pnl-390-final-production.jpg`, `qa/transactions-390-final-production.jpg`, `qa/transaction-linked-invoice-final-production.jpg`, `qa/transaction-linked-invoice-320-final-production.jpg`, `qa/pnl-drill-latest-production.jpg`, and `qa/pnl-expanded-latest-production.jpg`.
- Visual comparisons: `qa/pnl-comparison-latest-production.png`, `qa/transactions-comparison-latest-production.png`, `qa/pnl-focused-latest-production.png`, and `qa/transactions-focused-latest-production.png`. These supersede the initial comparisons and retain the approved Inter typography, emerald/red semantic colors, logo/icon assets and Vietnamese content hierarchy; production amounts are backend records, not demo values.
- Responsive checks: 320/390/430/768/900/1280px; document width matched viewport, desktop presentation preserved. Narrow-screen evidence includes `qa/pnl-responsive-320-latest.png`, `qa/transactions-responsive-320-latest.png`, `qa/pnl-responsive-768-latest.png`, and `qa/transactions-responsive-768-latest.png`.
- Production interactions passed: period switched to previous month and restored, P&L groups A/D expanded, chart disclosure, drill-down open/close, transaction search for room 221, exact linked invoice open, invoice preview at 320/390px, zoom/fit toggle, Escape close, and add-transaction open/cancel. No real financial mutation was submitted.
- DEV-only fixture checks cover loading/error/empty, negative profit, zero categories, role guards, search normalization for Đ/đ and 24→48→50 pagination. Tests passed **129/129** and build passed.
- Follow-up limitation: wallet choices initially displayed `Chưa tải được số dư` when opening the add form. Settled wallet loading and transaction submission are not accepted by this visual/read-only pass; no write was used to test them. The pre-existing optional `rooms.electric_price` compatibility warning remains a separate issue.

**final result: passed — scoped P&L/Giao dịch mobile presentation and read-only interactions**

The earlier navigation blocker is cleared by the final production checks. Whole-PWA acceptance and other modules remain separate; form submission/wallet loading are not claimed complete.

## Backend continuation — not a new visual acceptance

## Invoice export + assets responsive pass — 2026-10-09

- Source visual truths: `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-8be7fe40-f327-40e8-816b-c1952715c144.png` (invoice output) and `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-0f0018ea-905c-4f96-a57c-ce5a7ffda133.png` (assets header).
- Implementation screenshots: `qa/invoice-picker-390.png`, `qa/invoice-export-rendered-390.png`, `qa/assets-header-390.png`, `qa/assets-header-768.png`.
- Viewports: 390 × 844 and tablet portrait capture; DEV-only fixtures, no Auth session, payment, handover, or backend write.
- Invoice source crop showed a right-edge clipping defect. The rendered export now uses a fixed 768px paper width, explicit capture dimensions, and zero capture margin; the captured output visibly contains the complete rightmost amount column and QR block.
- Mobile invoice toolbar now removes Excel from the primary row; SePay is under the overflow menu. Export opens a picker requiring an explicit room and exact invoice selection. The picker was exercised with two invoices in the same room; no default/first invoice was chosen.
- Assets header now reflows image, identity/status, summary and actions into readable rows at 320/390/430px and a separate tablet rule at 768px. Captures show no one-character vertical wrapping and page width equals viewport in the mobile harness.
- Required fidelity surfaces: Inter typography and existing emerald/semantic colors retained; spacing uses existing card/radius tokens; supplied room image and invoice logo are preserved; Vietnamese labels are explicit and readable; icons remain the existing Font Awesome family. Primary controls are 40–44px or larger and picker has Escape/click-away/focus handling.
- Functional tests: `tests/invoice-export.test.mjs` (10/10) plus full PWA tests (104/104) and typecheck/build pass. This is not yet production authenticated visual acceptance; the final result remains blocked until fresh domain captures verify the integrated screens.

- 97/97 local tests, successful typecheck/build (latest shell `feab0f702d6df8c4`), public private-key/JWT scan passed; production Auth redirect callback is recorded in `qa/auth-redirect-production.json`.
- `qa/investment-storage-verification.json`: 29 actual database rollback-only assertions; ledger row counts/fingerprint unchanged. Covers CAS, dedupe, atomic funding, roles, duplicate identifiers, explicit admin import and receipt protection. This does not prove HTTP login or mobile import interactions.
- `qa/market-proxy-deployment.json`: isolated function version 1 ACTIVE, unauthorized requests rejected and upstream NAV parser returns all four real fund quotes. Successful authorized HTTP edge invocation remains unverified.
- Investment buy/sell/delete whole-portfolio invariants, actual import UI, remaining authenticated screens and production-preview headers/device behavior are still release gates.
- `qa/hosting-readonly-audit.json`: Spaceship purchase; Cloudflare authoritative nameservers. The scoped `app` Pages record is active; root/pay/www untouched.
- `qa/pages-preview-verification.json`: dedicated Pages preview is online at `ankhanghome-admin-pwa.pages.dev`; manifest, service worker, CSP, X-Frame-Options and nosniff verified.
- `qa/pages-preview-deployment.json` and `qa/production-domain-verification.json`: `app.phongtroankhang.com` is active and serving the current PWA entry over verified TLS; the scoped `app CNAME` is live. Root/pay/www remain unchanged.
- `qa/sepay-backend-deployment.json` and `qa/sepay-security-verification.json`: isolated server-side SePay verification deployed; direct browser-style `source=sepay` write rejected in rollback-only production test, no financial rows changed.
- `qa/bank-reconciliation-rollback.json`: 22/22 isolated rollback-only payment assertions passed, including partial/exact/replay/overpayment/wrong-target/settlement and service-only access.
- `qa/management-rls-guard-verification.json`: active management roles read, unknown/anonymous denied after restrictive RLS guard.
- `qa/npm-audit-production.json`: no production dependency vulnerability reported.
- No visual changes were introduced by this backend continuation; the approved room reference and scoped image comparison above remain unchanged. Full result stays blocked; the persistent implementation goal remains active.

## Latest scoped finance verification — 2026-10-09 15:28 UTC

- The approved mobile P&L/Giao dịch presentation remains the current production design. Final source/implementation comparisons and the authenticated read-only interaction evidence are recorded above.
- A small UX correction was deployed: the add-transaction wallet selector now distinguishes `Đang tải số dư…` from `Chưa tải được số dư`; an actual query failure is shown separately and the save path still performs a fresh server-side balance validation.
- Local regression suite now passes **131/131**, including rendering the actual voucher component with isolated query results for loading, failure, ready/zero and negative/reconciliation balances. All backend/mutation functions throw in that test. Typecheck, production build, PWA shell generation, public-bundle scan and Cloudflare Pages deployment pass. `qa/production-domain-verification.json` and `qa/production-finance-asset-verification.json` confirm the production entry `/assets/index-Y3wtIzzo.js`, finance chunk, mobile viewport metadata and wallet-state copy are live with valid DNS/TLS, manifest, service worker and security headers.
- On the authenticated production tab before the copy-only follow-up deployment, opening Giao dịch and the add form showed the wallet values after the initial loading state (`Tiền mặt · 0 đ`, `Tài khoản ngân hàng · 11.894.676 đ`). The form was closed without submitting a transaction. The only console warning remains the pre-existing optional `rooms.electric_price` compatibility fallback.
- The production tab is currently unauthenticated after reload (390px page and document width match). The approved finance screenshots remain the authoritative visual comparison; the copy-only follow-up is additionally covered by the actual component render test and public finance-chunk verification. No login, credential handling or financial mutation was needed for this static/mobile presentation correction.

**final result: passed**

The approved P&L/Giao dịch mobile design and read-only workflows passed. The whole PWA and unrelated modules remain outside this scoped acceptance.

## Final authenticated acceptance — 2026-10-10 02:30 UTC

This supersedes the temporary login gap in the wallet follow-up above. Both the live document and public production response identify `/assets/index-Y3wtIzzo.js`.

- Source visual truth: `qa/business-report-mobile-demo.png`, `qa/transactions-mobile-demo.png` (853 × 1844 pixels, normalized to 390 × 844).
- Current authenticated implementation: `qa/pnl-390-acceptance-production.png`, `qa/transactions-390-acceptance-production.png` (390 × 844 pixels, CSS viewport 390 × 844, device scale 1).
- Combined full comparisons: `qa/pnl-comparison-acceptance.png`, `qa/transactions-comparison-acceptance.png`. Focused comparisons: `qa/pnl-focused-acceptance.png`, `qa/transactions-focused-acceptance.png`. Reference left, production right; all four were opened and inspected.
- State differences: production uses real values/categories and a 34px pending PWA-update notice absent from the synthetic source. That intentional notice shifts content down but does not hide primary actions. The existing period control displays `Tháng này`; the demo shows a concrete date. Live ledger entries are individual expandable cards, with all real categories retained and secondary chart/groups below the fold. These preserve the selected mobile direction, not strict demo-data pixel identity.
- Typography: project Inter and numeric weight hierarchy remain readable; Vietnamese labels wrap safely, totals stay visible. Spacing/layout: full-width mobile cards/rows and stacked form fit the 390px page; document scroll width is 390px, form width 370px. Colors: emerald income/profit, red expense/loss and amber outside-business semantics preserved. Assets: existing AN KHANG logo/avatar and Font Awesome icon family preserved. Copy/content: backend amounts, explicit wallet loading and real Vietnamese category names; no hardcoded demo finances.
- Earlier actionable differences (summary density, period placement, wrong general invoice navigation and narrow invoice preview) were fixed and covered by the final comparisons/interactions above. Current full/focused inspection found no actionable P0/P1/P2 mismatch.
- Wallet follow-up: opening the real add form visibly showed `Đang tải số dư…`, then `Tiền mặt · 0 đ` / `Tài khoản ngân hàng · 11.894.676 đ`. Income toggle changed categories/room target and receive-wallet placeholder correctly; cancel returned to Giao dịch. Screenshots: `qa/transaction-form-wallet-ready-production.png`, `qa/transaction-form-income-production.png`. No confirmation/save, payment, edit or delete was submitted.
- Tests rerun: 131/131 passed. Browser warnings: only the pre-existing optional `rooms.electric_price` fallback; no finance runtime error observed. Responsive and read-only interaction evidence at 320–1280px is retained above.

**final result: passed**

Implementation checklist complete for the original approved Kết quả kinh doanh/Giao dịch mobile request. Whole-PWA module acceptance and live financial writes are not claimed by this report.

## Tenant edit OCR redesign — phương án 1 — 2026-10-11

- Source visual truth: `C:/Users/Admin/.codex/visualizations/2026/09/22/01a0c6f6-7c6a-7db1-9b7d-ff16718b7143/tenant-edit-ocr-2026-10-10/tenant-edit-ocr-1.png` (1487 × 1058 px; approved phương án 1).
- Implementation: `http://127.0.0.1:4178/?qa=tenant` DEV-only visual harness. Browser-rendered evidence was captured in Codex In-app Browser at 1365 × 900 and the responsive mobile viewport (484 × 768 screenshot; CSS layout reflowed to one column). The local preview remains available for inspection.
- State: fictional tenant and generated demo CCCD strip only; no Auth session, backend mutation, real identity upload, email or financial action.

### Comparison evidence

- Full desktop view: implementation keeps the approved wide modal, emerald identity panel, two separate CCCD cards, status chip, contact form and bottom action rail. The implementation adds an explicit `Cập nhật ảnh CCCD` affordance so replacement is discoverable without changing the selected visual direction.
- Focused regions: CCCD front/back cards preserve separate labels, image zoom buttons and `Thay ảnh`; the contact panel keeps the OCR note and review gate. Mobile capture shows the cards stacked within a scrollable modal and footer buttons remain visible.
- Primary interactions checked: edit opens the shared OCR form; contact-only phone/note edits save while retaining the old identity image; `Cập nhật ảnh CCCD` clears the temporary replacement draft and exposes both upload slots; image click opens a focusable zoom dialog and Escape/close restores focus; old profile without an identity number remains editable for contact-only changes.
- Upload interaction could not be automated because the browser denied file-upload permission for the local tab. This is an environment restriction, not an application error; the OCR adapter and replacement guard tests were run separately.

### Required fidelity surfaces

- Fonts/typography: existing Inter/Vietnamese project font and heading hierarchy are retained; labels and helper copy wrap without clipping at the mobile viewport.
- Spacing/layout: desktop uses the source-like two-column split and 1040px maximum width; mobile switches to one column, safe modal margins and a fixed footer while the content scrolls independently.
- Colors/tokens: emerald surfaces, mint identity cards, white inputs and semantic rose error state map to the existing Electron-derived brand tokens.
- Image quality/assets: front/back demo crops are derived from the approved visual only for the DEV harness; production continues to use stored identity images and local QR/OCR processing. No CSS-art or placeholder identity illustration was introduced.
- Copy/content: Vietnamese labels explicitly distinguish `Giấy tờ đã lưu`, `Cập nhật ảnh CCCD`, `Giữ nguyên giấy tờ hiện tại khi lưu` and the manual-review checkbox.

### Safeguards and regression evidence

- `tests/tenant-profile-draft.test.mjs`: 6/6 passed. It covers preservation of old image/metadata on contact-only edits, verified metadata on replacement, per-field OCR protection against late results, removal/reset behavior and shared add/edit replacement guards.
- `npm run typecheck`: passed.
- `npm run build`: passed, including PWA shell generation and public-bundle scan.
- No P0/P1/P2 visual findings remain in the scoped tenant-edit screen. The only open QA limitation is browser file-upload permission, so a real-device OCR read still needs a manual smoke check after deployment.

final result: passed

# Mandatory PWA update gate - 2026-10-11

Source visual truth: `../design-demos/pwa-update-required-target.png` (approved demo showing the compact top-right update control and locked application surface).

Implementation evidence:

- `../docs/design/pwa-update-qa/desktop-final.png` — 1586 × 992 desktop capture, update-required state.
- `../docs/design/pwa-update-qa/mobile-final.png` — 390 × 844 mobile capture, update-required state.
- `../docs/design/pwa-update-qa/error.png` — retryable update-error state.
- `../docs/design/pwa-update-qa/desktop-comparison.png` — normalized source/implementation comparison.

The implementation keeps one compact emerald `Cập nhật phiên bản mới` control in the top-right header area. While a waiting service worker is available, the app surface is dimmed, mouse and keyboard interaction is blocked, focus stays on the update control, and the control is the only active action. Mobile reduces the label to `Cập nhật` while retaining the accessible full label and tooltip. A failed worker handoff leaves the gate open with a retryable error; a successful controller handoff reloads once. First install, offline polling, foreground checks, periodic checks and cross-tab activation were covered by the PWA update tests.

Required fidelity surfaces:

- Fonts/typography: existing Inter/Vietnamese type scale retained; compact header label stays readable on desktop and mobile.
- Spacing/layout: trigger aligns to the header's right control group; gate uses the approved centered lock treatment without changing table geometry.
- Colors/tokens: navy scrim and emerald action follow the approved An Khang Home palette with accessible contrast.
- Image quality/assets: approved visual uses the existing app surface and icon-library symbols; no custom CSS art or replacement brand asset was introduced.
- Copy/content: `Cập nhật phiên bản mới`, `Bản cập nhật bắt buộc`, and retry feedback are Vietnamese and unclipped.

Primary interactions tested: click update, retry after a failed update, Enter activation, Tab/Escape focus trapping, blocked background actions, and unlock after successful update. Browser console error log was empty during the fixture run.

Validation:

- `node --test tests/pwa-update.test.mjs`: 9/9 passed.
- `npm test`: 143/143 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed, including PWA shell generation and public-bundle scan.

Final result: passed

# PWA mandatory update release — 2026-10-11

Approved visual: `../design-demos/pwa-update-required-target.png`.
Detailed comparison, iteration history and interaction evidence: `../docs/design/pwa-update-qa/design-qa.md`.
Desktop evidence: `../docs/design/pwa-update-qa/desktop-final.png` (1586 × 992, density 1); mobile: `../docs/design/pwa-update-qa/mobile-final.png` (390 × 844) and `mobile-320.png` (320 × 568).
Combined comparison: `../docs/design/pwa-update-qa/desktop-comparison.png`; focused comparisons: `trigger-comparison.png` and `lock-comparison.png` in that directory. Source and desktop capture have identical dimensions/state. The fixture uses sample background data; the production room table has not been redesigned.

Compared typography, spacing, colors, assets and Vietnamese copy. Initial excessive blur, undersized lock/body copy and mobile icon-only action were corrected and recaptured. No actionable P0/P1/P2 findings remain in the scoped update component. Mobile keeps the short visible label “Cập nhật”. Existing icons/brand assets are retained; Lucide's outline lock is an acceptable icon adaptation.

Verified click/Enter update, error/retry, Tab/Escape trapping, background inertness and unlock. 152 tests passed, including 9 new update-runtime tests; TypeScript/build/public-bundle checks passed. The fixture simulates update outcomes, while worker/runtime tests cover actual event handling. Production login rendered successfully with no browser error logs. UI verification did not log in or mutate customer records.

Production release: `aea3aadf-03bd-4277-a96f-158c0a1496aa`, build `5559d77d3f58eaac`. Remote JS/CSS hashes match local dist, service worker matches, and DEV fixture strings are absent. Verification evidence: `qa/pwa-update-production-verification.json`. First rollout: an already-open tab on the older bundle must load this release once to acquire the new gate; subsequent available updates require acceptance before normal app interaction resumes. The frontend gate is not a replacement for backend authorization.

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


## Admin login approved design — 2026-10-12

Scope: adminpwa login screen only. Approved reference: clipboard-de806dc0-4a8c-445d-bb8b-93fc6b9edd72.png.
Comparison: qa/login-refined/comparison.png (reference left, implementation right, normalized to 533×638).
Responsive evidence: qa/login-refined/533.png and 320.png.

Initial finding: panel too tall and wide relative to the approved image. Fixed panel width to 416px, reduced logo/header spacing and form gaps, and recaptured the comparison.
Final visual check: horizontal brand header, admin eyebrow, left-aligned sign-in heading, two labeled fields, right-aligned forgot-password, green CTA, plain footer divider and legal links match the approved hierarchy. No banner or orphan alternative-login separator. No horizontal overflow at 320px.
Interaction checks in the local browser: password visibility toggles both ways; forgot-password dialog opens and closes; terms dialog opens and closes. Authentication handlers, MFA and recovery callbacks preserved; no real login or reset email sent.
Build: typecheck, Vite/PWA build and public bundle scan passed.
P3 notes: existing animated building backdrop retained rather than generating another image; supplied logo and live app version used; minor font/spacing differences from the raster demo remain.
final result: passed
