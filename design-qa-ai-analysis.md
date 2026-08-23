# Design QA — Trung tâm Phân tích AI

- Source visual truth: `C:\Users\Admin\.codex\generated_images\01a03089-e9a7-7170-9335-40eb87ff7667\exec-967a0659-822d-4ff3-b928-9391d707ae89.png`
- Source pixels: 1440 × 1024
- Intended implementation viewport: 1440 × 1024 desktop
- Intended state: standalone `Phân tích AI` module, default 30-day opportunity view
- Implementation screenshot: unavailable; the local renderer requires application authentication

## Full-view comparison evidence

The selected opportunity-led reference was inspected. The module implementation moves `Phân tích AI` to the primary application navigation and follows the same major hierarchy: independent header, opportunity-first green hero with generated revenue-growth illustration, compact operating-status rail, market-data state, and a ranked operational-opportunity list. The local browser preview reached the login screen, so an authenticated rendered module capture could not be made.

## Focused-region comparison evidence

Blocked. The hero, market-source panel, and responsive opportunity rows require an authenticated application state to compare against the selected design.

## Findings

- [P1] Visual verification is blocked by authentication.
  - Location: standalone `Phân tích AI` application screen.
  - Evidence: source image is available; browser-rendered application only exposes the login screen.
  - Impact: exact desktop spacing, responsive behaviour, typography, image crop, modal composition, and interaction polish cannot be confirmed.
  - Fix: open an authenticated local app session, capture the 1440 × 1024 AI module, exercise the period selector, opportunity detail modal, and market-source modal, then compare and adjust.

## Implementation checklist

- Capture the authenticated standalone AI module at 1440 × 1024 and at a tablet-width breakpoint.
- Compare typography, spacing/layout rhythm, semantic emerald/violet tokens, hero-image crop, icons, and Vietnamese copy against the source visual.
- Test the period selector, all three opportunity rows, both hero/market source actions, close controls, and navigation back to rooms.
- Check the application console in the authenticated module state.

## Follow-up polish

- Add a real market-data connector only after a permitted source and data-quality rules are confirmed.

final result: blocked
