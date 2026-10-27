# Mobile module audit — 2026-10-09

Authenticated production evidence captured at `https://app.phongtroankhang.com/` in the existing mobile viewport. No payment, export, edit, delete, or other financial mutation was submitted.

## Evidence

| Step | Module | Evidence | Result |
|---|---|---|---|
| 01 | Phòng | `01-rooms.jpg` | Continuous room list and unpaid/paid states readable. |
| 02 | Hóa đơn | `02-invoices.jpg` | Mobile cards readable; explicit room-export action visible. |
| 03 | Công nợ | `03-debt.jpg` | **Fail:** 680px table inside 454px mobile container; amount/reason clipped. |
| 04 | Giao dịch | `04-transactions.jpg` | **Fail:** two ledgers remain side by side; content and amounts clipped; add action wraps. |
| 05 | Tổng quan tài chính | `05-overview.jpg` | Primary summary readable; chart occupies most of first viewport. |
| 06 | Kết quả kinh doanh | `06-pnl.jpg` | Summary readable; detail table is 680px and clips on mobile. |
| 06b | P&L detail | `06b-pnl-detail.jpg` | **Fail:** horizontal scrollbar appears; D rows and amounts are partly offscreen. |
| 07 | Quản lý cọc | `07-deposits.jpg` | **Fail:** 680px room/deposit table inside 456px mobile container. |
| 08 | Điện / Nước | `08-utility.jpg` | **Fail:** provider/tower tables remain wide (809px) with horizontal scroll. |
| 09 | Hợp đồng | `09-contracts.jpg` | Cards reflow cleanly in the inspected viewport; no table overflow observed. |
| 10 | Tài sản | `10-assets.jpg` | Primary room/asset cards are readable at the inspected default viewport; the room rail is horizontally dense and the asset card grid continues below the fold. Forms and handover states were not submitted. |
| 11 | Khách thuê | `11-tenants.jpg`, `11a-tenant-view-390.jpg` | List cards are readable. Profile view keeps front/back document images separate and the 390px view is readable, but the Tiền cọc/Hợp đồng tabs wrap labels tightly. Edit, filter, and form validation were not submitted. |
| 12 | Ví | `12-wallet-390.jpg` | **Needs work:** four primary actions are compressed into narrow buttons; labels wrap and compete with the month picker. Main balance card is readable. |
| 13 | Đầu tư | `13-investments-390.jpg`, `13a-gold-390.jpg`, `13b-gold-holdings-390.jpg`, `13c-stock-390.jpg`, `13d-bonds-390.jpg`, `13e-savings-390.jpg` | **Fail:** investment navigation is a horizontal strip. Stock/bond tables and chart canvases retain desktop widths (720px); gold holdings retains a 780px table; savings hero/action area collapses into a narrow text column. No buy/sell/import action was submitted. |
| 14 | Giao dịch (390px) | `14-transactions-390.jpg`, `14a-period-picker-390.jpg` | **Fail:** two ledgers remain side by side. Date-range popover is 460px wide and rendered with its right edge at x=129 (left=-331), so the filter panel is mostly off-screen. Add form was opened only for read-only layout inspection and cancelled. |
| 15 | Cài đặt | `15-settings.jpg`, `15a-service-pricing-390.jpg`, `15b-service-table-390.jpg`, `15c-account-settings-390.jpg`, `15d-system-accounts-390.jpg`, `15e-tenant-accounts-390.jpg`, `15f-updates-390.jpg` | **Fail in submodules:** service-pricing table is 980px inside a 294px parent; tenant-account table is 700px inside a 302px parent. System-account and update screens are readable only partially because the settings tab rail remains wider than the viewport. No save, role change, account creation, delete, or update action was submitted. |
| 16 | Công nợ (390px) | `16-debt-390.jpg` | **Fail:** live table is 680px inside a 360px parent; amount, percentage, reason, and action columns are offscreen. Debt rows must remain separate from P&L rows. |

## Responsive acceptance for the next implementation pass

- Keep accounting semantics separate: Công nợ is a debt ledger; Kết quả kinh doanh is P&L; Giao dịch is cash flow; Quản lý cọc is deposit custody.
- On phones, every primary amount, label, status, and action must be visible without page-level horizontal scrolling.
- Preserve the existing filters, drill-down/detail actions, role guards, empty/loading/error states, invoice links, and safe non-mutating QA workflow.
- Desktop/tablet layouts must remain available at larger breakpoints.

## Additional 390px findings

- The viewport override was set to 390 × 844 for steps 11–16 and reset after capture. The default audit viewport was 484 × 757 for steps 01–11.
- Evidence confirms the issue is not one global table: the affected widths are 680px (debt), 720px (stock/bond charts/tables), 780px (gold holdings), 980px (service pricing), and 700px (tenant accounts), plus the 460px transaction date panel.
- Asset, tenant profile, wallet summary, settings general, and update status have readable primary content, but that does not prove their forms, filters, modal states, empty/error/loading states, or role guards are complete.
- All interactions in this audit were read-only. No payment, export, import, save, edit, role change, account creation, deletion, or update action was submitted.
