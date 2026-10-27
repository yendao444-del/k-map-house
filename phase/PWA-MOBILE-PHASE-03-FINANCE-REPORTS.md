# Mobile Kết quả kinh doanh và Giao dịch

Date: 2026-10-09
Status: Completed for the approved Kết quả kinh doanh/Giao dịch mobile presentation and read-only interaction scope. User approved both displayed demos on 2026-10-09 with “Ok quá đẹp rồi”; implementation, deployment, responsive evidence and final regression checks passed. Other modules and financial form submission remain separate verification scopes.

## User request

Optimize the current Kết quả kinh doanh and Giao dịch screens for mobile, using Product Design `index`. Preserve the existing management workflows and accounting meaning.

## Current evidence

- User report screenshot: `C:/Users/Admin/.codex/attachments/12dc8336-d251-427c-9d02-c538b31aa56d/image-1.png`. Category names are visible, but the monetary columns sit offscreen.
- User transaction screenshot: `C:/Users/Admin/.codex/attachments/12dc8336-d251-427c-9d02-c538b31aa56d/image-2.png`. Three desktop ledger tracks compress the content; the add button wraps into multiple lines.
- `BusinessReport.tsx` renders the P&L table with a 680px minimum width. The generic mobile CSS also forces all report tables to that width, including drill-down tables.
- `CashFlowTab.tsx` renders two ledgers with a fixed 126px central summary track. Each ledger row itself has fixed 92/112/126px tracks.

## Live mobile audit — 2026-10-09

- Authenticated production inspection at `https://app.phongtroankhang.com/` was performed without submitting payments, edits, exports, or deletions. Evidence is saved under `adminpwa/qa/mobile-audit-20261009/`.
- `Công nợ` is a separate defect from `Kết quả kinh doanh`: the live DOM reports a 680px table inside a 454px container, so amount and reason columns are clipped on the phone. The growth chart is a secondary surface; the source already stacks it below the ledger before the desktop breakpoint. Chart placement is not the established mobile defect.
- `Giao dịch` still renders the two-ledger desktop composition on mobile. The live screenshot shows `Tiền vào` and `Tiền ra` side by side with truncated content and amounts; `+ Thêm giao dịch` wraps into multiple lines.
- `Quản lý cọc` also reports a 680px table inside a 456px container on the phone. It needs its own room/deposit list treatment; it must not inherit P&L semantics.
- `Ví`, `Đầu tư`, `Tổng quan tài chính`, `Kết quả kinh doanh`, `Quản lý cọc`, and `Điện / Nước` were opened through the mobile navigation. `Tổng quan tài chính` and `Ví` primary summaries are readable in the inspected viewport, while P&L detail, Công nợ, Quản lý cọc, Điện/Nước and Giao dịch contain wide table/list surfaces that need module-specific responsive paths.
- A new debt-specific visual demo was attempted with the required local image gateway and three independent retries per direction; the gateway returned HTTP 429/502. No failed generation was replaced with a code screenshot. Implementation remains gated until a visual direction is approved.

## Cross-module audit continuation — 2026-10-09

The authenticated PWA was checked again at 390 × 844 for the remaining finance/settings modules. New evidence is in `adminpwa/qa/mobile-audit-20261009/` and the full index is in its `README.md`.

- `Ví`: summary is readable, but the four header actions collapse into narrow multi-line buttons.
- `Đầu tư`: the shared category rail scrolls horizontally; stock/bond surfaces retain 720px desktop canvases, gold holdings retains a 780px table, and the savings hero/action grid collapses into a narrow text column.
- `Giao dịch`: the date-range popover is still 460px wide and positioned outside the 390px viewport; the add form was opened and cancelled without submission.
- `Công nợ`: the live table is 680px inside a 360px parent; primary amount, ratio, reason, and action columns are clipped.
- `Cài đặt`: service pricing is a 980px table inside a 294px parent; tenant accounts is a 700px table inside a 302px parent. Account/update submodules also retain a horizontally dense settings rail.
- `Khách thuê`: list and the separate front/back document view are readable at 390px; tab labels are dense, and edit/filter/forms remain unverified because no mutation was submitted.
- `Tài sản`: room and asset cards are readable in the inspected viewport; handover and adjustment forms remain unverified.

These findings are evidence for a later, module-by-module responsive implementation. The user subsequently approved the two displayed `Kết quả kinh doanh` and `Giao dịch` demos. Other modules retain separate design/verification scope and are not included in this approval.

## Approved visual direction

- P&L: visible profit/revenue/operating-cost summary, collapsible A/B/D categories and per-category amounts on full-width mobile rows. Tapping an amount preserves the existing drill-down. C remains A minus B. D remains excluded from profit.
- Transactions: one chronological full-width list; signed amounts and direction color visible alongside content. Keep invoice-linked receipts automatic and keep manual voucher handling unchanged.
- Preserve time range and transaction/category filters, placing secondary controls in a mobile filter sheet if approved. Keep a compact add action.
- No mobile-first export emphasis; no accounting mutation, data duplication, fake live totals, new permissions or backend changes implied.

## Implementation acceptance after approval

1. Separate mobile rendering paths in BusinessReport/CashFlowTab; retain desktop data and behavior.
2. Preserve all real categories and their empty/zero states, expansion and drilling, not only the illustrative demo rows.
3. Check 320/390/430px phones and tablet boundaries; primary amounts must not require horizontal page scrolling.
4. Check period selection, all/income/expense/category/search filters, sorting/grouping, linked invoice view, manual voucher detail and add/edit forms, loading/error/empty states and role guards. Do not submit real payments or edits for QA.
5. Compare approved image with rendered mobile evidence in design-qa.md; build/tests alone are not visual acceptance.
6. Deploy only the management PWA to app.phongtroankhang.com, verify its fresh build and integrated mobile rendering. Do not alter Electron, tenant portal, root domain, or Maps scope.

## Implementation / verification progress — 2026-10-09

- Implementation: `MobilePnl`, `MobileCashFlow`, scoped finance CSS, invoice-linked detail modal navigation, admin edit/delete guards, DEV-only fixture harness and regression tests.
- Verification completed: `npm run build`, `npm test` (129/129), final authenticated production screenshots at 320/390/430/768/900/1280px and full/focused source comparisons. Period change/restore, P&L groups/chart/drill-down, transaction search, exact linked-invoice modal, 320/390px invoice preview, zoom toggle, Escape and add-form open/cancel were checked without financial writes. DEV fixtures cover additional states, role guards and pagination.
- Deployment: Cloudflare Pages project `ankhanghome-admin-pwa`, final production entry `/assets/index-Y3wtIzzo.js` (supersedes `/assets/index-ArixS-fy.js`); `qa/production-domain-verification.json` is the authoritative domain/TLS/security evidence.
- Safety: no payment, edit, delete, export, credential or account mutation was submitted during QA. Synthetic QA fixtures are development-only and production harness routes are gated by `import.meta.env.DEV`.
- Out of scope: Công nợ and remaining finance/settings/investment/deposit modules retain their own design and implementation phases.
- Earlier navigation blocker: cleared by final production interaction checks. `adminpwa/design-qa.md` records the final scoped result as passed with final screenshots/comparisons; its earlier blocked record is historical, not current Phase 03 status.
- Wallet follow-up completed on 2026-10-10: authenticated production entry `/assets/index-Y3wtIzzo.js` visibly transitioned from `Đang tải số dư…` to real cash/bank balances. Income/expense toggle and cancel passed at 390px without overflow. Evidence: `qa/transaction-form-wallet-ready-production.png` and `qa/transaction-form-income-production.png`. Component-render tests cover loading/error/ready/negative states; full suite passes 131/131. No real transaction was submitted; submission is not part of this read-only acceptance. The optional `rooms.electric_price` warning remains separate.

## Demo data

Image generation receives sanitized crops only. All demo amounts are synthetic, not backend financial records. Source screenshots remain local evidence. Proposed demos: `adminpwa/qa/business-report-mobile-demo.png` and `adminpwa/qa/transactions-mobile-demo.png`. Model catalog was queried before each independent generation; both use `cx/gpt-5.5-image`. Each image contains one screen, not alternative screens combined. Dimensions are 853 × 1844 pixels (approximately the 390 × 844 mobile ratio); implementation must use responsive text wrapping rather than forcing the generated row widths at 320px.

The report demo omits the optional chart and some real expense rows for space; implementation must retain these features offscreen/expandable and include all real categories. Dates, amounts and records shown in the images are illustrative only. Design QA must separately verify accounting correctness and integrated forms, not infer functionality from the generated images.
