# Design QA — Ví tiền

## Source visual truth

- Reference: `C:\Users\Admin\AppData\Local\Temp\codex-clipboard-b0a5c86a-15ed-41c2-945e-4f32f55a1a2e.png`
- Source dimensions: 1477 × 932 px, desktop app screenshot with browser/desktop chrome visible.
- Intended source language: Vietnamese, An Khang Home green product shell, rounded white cards, compact financial tables.

## Implementation evidence

- Implementation: `tmp-product-design/wallet-demo.html`
- Rendered URL: `http://localhost:4173/wallet-demo.html`
- Browser: Codex In-app Browser, desktop viewport approximately 1265 × 710 CSS px, density 1.
- Evidence: browser-rendered full-view and scrolled lower-section captures taken during this turn.
- State: Ví tiền selected; 20.215.732 đ visible; two wallets shown; reconciliation at 0 đ; allocation and recent activity populated.

## Comparison

### Full-view evidence

- Header uses the same deep green shell, compact icon navigation, logo treatment, white secondary navigation, and active green pill as the reference.
- The new page intentionally replaces the Thu/Chi split table with a wallet-first hierarchy: total available money, reconciliation, wallet cards, allocation, and recent wallet movement.
- Green and mint semantic colors carry over from the reference while adding warm orange for cash and profit allocation.

### Focused regions

- Header/subnav: spacing and active-state treatment match the reference language while introducing `Ví tiền` and `Hũ tài chính` as adjacent financial modules.
- Balance hero: uses the same strong green information band as the reference but adds visibility, reconciliation date, and a `Khớp sổ sách` status.
- Wallet cards: clearly separate `Vietcombank · Sepay` from `Tiền mặt tại quỹ`, preserving the distinction between where money is held and how it is allocated.
- Lower panels: allocation bar and recent movement list maintain the reference's dense, readable card rhythm.

## Required fidelity surfaces

- Fonts/typography: `Be Vietnam Pro` for Vietnamese UI copy and `Space Grotesk` for balances/display numbers; hierarchy and compact labels are consistent with the source.
- Spacing/layout rhythm: 16 px cards, 13–15 px grid gaps, 30 px page gutter, and compact section rhythm are preserved; the page collapses to one column below 1040 px.
- Colors/tokens: deep teal header, emerald action color, pale mint surfaces, neutral border, red outflow, and warm cash/profit accents are tokenized in CSS variables.
- Image/asset fidelity: existing An Khang Home navbar logo is reused from `LOGO/web/logo_navbar.png`; UI icons use Lucide rather than hand-drawn SVG or placeholders.
- Copy/content: Vietnamese labels explicitly distinguish `Ví tiền`, `Sổ giao dịch`, and `Hũ tài chính`; the 20.215.732 đ example is carried through the hero, allocation, and wallet totals.

## Interaction checks

- `Thêm ví`: opens a modal with name, asset type, and opening balance fields; save shows a confirmation toast.
- `Chuyển tiền`: opens a dedicated transfer modal and states that total assets do not change.
- Eye control: hides and restores the balance.
- Wallet cards: selectable active state.
- Responsive behavior: the narrow browser view keeps the hierarchy usable with horizontal navigation overflow and stacked content cards.
- No blocking browser/runtime error observed in the rendered page; the only console warning was an unrelated Codex app telemetry warning.

## Comparison history

- Pass 1: implemented wallet-first layout and interactions; no P0/P1/P2 visual mismatch found against the existing product shell.
- Pass 2: fixed modal switching so `Thêm ví` always restores its own form after `Chuyển tiền`; re-checked add-wallet, transfer, balance visibility, and lower-panel states.

## Findings

- No actionable P0, P1, or P2 findings remain.
- P3 follow-up: replace demo balances and allocation percentages with live data once the account/wallet model is wired to Sepay and the transaction ledger.

## Implementation checklist

- [x] Reuse existing product shell and logo.
- [x] Show money location separately from financial-hũ allocation.
- [x] Include Sepay bank account and cash wallet examples.
- [x] Add reconciliation state and recent wallet movement.
- [x] Verify core modal and visibility interactions.

**final result: passed**
