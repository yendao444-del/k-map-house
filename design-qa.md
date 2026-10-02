# Design QA — Tài chính > Giao dịch (Phương án 1)

- Source visual truth: `G:\PHONG TRO\app\generated_demos\option_1.png`
- Source pixels: 1564 × 1000
- Intended viewport: 1400 × 900 desktop Electron window
- Target state: Tài chính → Giao dịch, full history, split Tiền vào / Tiền ra ledger
- Final result: blocked

## Implementation changes reviewed

- Split ledger keeps the approved two-column layout with a center balance rail.
- Each ledger now paginates at 24 rows instead of 8.
- Rows use compact 28px density and expose a dedicated Ví / Phòng column.
- Existing filters, edit/delete permissions, invoice navigation, totals, and pagination remain wired to the existing data.

## Verification

- `npm run typecheck:web` passed.
- `npm run build` passed.
- Browser capture of the authenticated transaction screen is blocked because the Electron app opens at its login screen and no credentials were supplied. No visual pass is claimed without that same-state capture.

## Remaining QA action

Open the app, authenticate, navigate to Tài chính → Giao dịch, and capture the 1400 × 900 state. Compare both ledger columns, the 24-row density, center balance rail, filters, and horizontal alignment against `generated_demos/option_1.png`; then update this report to `final result: passed` after resolving any P0/P1/P2 differences.
