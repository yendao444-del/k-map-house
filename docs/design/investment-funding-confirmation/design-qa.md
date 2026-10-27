# Investment funding confirmation — 2026-10-21

## Target and evidence

- Approved source: `design-references/investment-funding-confirmation/premium-confirmation.png` (1235 × 1274 pixels).
- Source normalized to 820 × 845 pixels: `reference-normalized.png`.
- Final browser capture: `desktop-final.jpg` (820 × 845 pixels, CSS viewport 820 × 845, DPR 1).
- Full comparison: `comparison-final.png` (source left, implementation right).
- Focused dialog comparison: `comparison-detail.png` (source left, implementation right, cropped at the dialog bounds).
- Additional captures: `mobile-390.jpg` (390 × 844) and `mobile-320.jpg` (320 × 568).
- State: dark gold purchase confirmation, purchase/shortfall 13,330,000 VND, investment balance zero, bank source, operating balance after transfer 20,084,682 VND.
- Captured and inspected using the Codex in-app browser against real production components in an isolated local fixture. The surrounding gold form is the latest existing app version; its newer layout and current date are intentionally preserved. Comparison scope is the confirmation popup.

## Findings and comparison history

- Initial P2: popup too wide/tall and background too obscured. Evidence: `desktop-initial.jpg`, `comparison-initial.png`. The initial state also showed two payment sources; that extra row was a fixture-state mismatch, not a design defect.
- Fixed maximum desktop width to 500px, tightened section spacing/header/footer, reduced backdrop opacity/blur, then captured the matching single-bank state.
- Final full and focused comparisons show no actionable P0/P1/P2 findings. All labels, both decisions and monetary values remain readable.

## Required fidelity surfaces

- **Typography:** existing Inter font files, Vietnamese coverage, 24px desktop heading, 30px green transfer value, tabular figures, readable supporting labels. Financial row weights and font rasterization differ slightly from the generated reference (P3).
- **Spacing/layout:** same compact icon/title, two summary rows, prominent shortfall, bank source, remaining balance and two footer actions. Final dialog is 500 × 441 CSS px; source normalized dialog approximately 500 × 430. The small height difference supports real text metrics. Popup is centered in the viewport. On narrow screens amounts stack and footer controls remain visible; 320px uses an internal body scroller.
- **Colors/tokens:** dark navy #101c2c, slate separators, mint amount and green primary action. Primary action reuses the app's existing `room-primary-faceted` finish. This existing finish is a little brighter than the generated mock, intentionally matching current Electron buttons.
- **Assets/icons:** existing Lucide library wallet, bank, cash, information, close and arrow icons. Source's wallet-arrow illustration is represented by the existing wallet icon (P3). No new raster assets or hand-drawn icons were needed.
- **Copy:** Vietnamese title, subtitle, transfer amount, source, remaining funds and confirmation labels follow the approved mock. Asset subtitle adapts for gold/other assets; a split source lists the exact debit for each account.

## Behavior/accessibility verification

- 51 targeted funding, rollback, history and cloud-concurrency tests passed.
- Electron and PWA typechecks passed.
- All eight actual purchase form fixtures (gold, stocks, bonds, savings on both platforms) pass cancellation/no-write, exact-shortfall and insufficient-funds checks with the custom dialog.
- Verified initial focus on Hủy, keyboard trapping, Escape, close button, backdrop cancellation, unmount cancellation and restoration of background interactivity. Decision resolves once; background is inert while confirmation is open.
- 390/320px captures have no page or dialog horizontal overflow; footer remains inside viewport, including the 320 × 568 case.
- Browser console errors/warnings checked. No application errors observed; no native confirmation dialog appears.
- All transactions were in-memory fixtures; no production asset purchase or money transfer performed. Native Electron window/installer packaging was not exercised.

## Implementation checklist

- [x] Replace the investment purchase's native Windows confirmation with the approved in-app dialog.
- [x] Wire the same async confirmation into existing Electron and PWA funding pipelines.
- [x] Preserve balance revalidation, rollback, version checks and financial history.
- [x] Compare normalized source and final rendered capture together.
- [x] Check desktop, mobile, keyboard and cancellation states.

final result: passed
