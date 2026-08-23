# Design QA — Ví

- source visual truth path: `design-references/wallet-vietcombank-target.png`
- implementation screenshot path: unavailable
- viewport: intended desktop viewport `1440 × 1024`
- source pixels: `1487 × 1058` generated reference; normalized target CSS viewport `1440 × 1024`
- implementation pixels / density: unavailable because the in-app browser runtime could not start
- state: Ví selected, current month, populated ledger target

**Full-view comparison evidence**

- Source target was generated and saved successfully.
- The Electron/Vite implementation compiled successfully, but a browser-rendered screenshot could not be captured. The in-app browser runtime exited twice with `windows sandbox failed: helper_unknown_error: setup refresh had errors`.

**Focused region comparison evidence**

- Blocked. Header navigation, balance hero, ledger rows, central balance gauge, and forecast strip require a rendered capture before visual comparison.

**Findings**

- [P1] Browser-rendered visual evidence is unavailable.
  - Location: full Ví screen.
  - Evidence: source image exists, implementation screenshot does not.
  - Impact: typography, crop, density, spacing, and asset fidelity cannot be certified from code/build output alone.
  - Fix: restore the in-app browser runtime or obtain approval to use a local Playwright capture, then compare the two images at the same viewport.

**Required fidelity surfaces**

- Fonts and typography: blocked pending rendered capture.
- Spacing and layout rhythm: blocked pending rendered capture.
- Colors and visual tokens: implemented from the approved green target; visual confirmation blocked.
- Image quality and asset fidelity: generated hero asset is present in the production build; crop and sharpness confirmation blocked.
- Copy and content: verified in source code and TypeScript build; visual wrapping confirmation blocked.

**Primary interactions tested**

- Static/type verification confirms callbacks are wired for `Ghi thu / chi`, `Đối soát`, month selection, and ledger data queries.
- Browser interaction testing is blocked by the runtime failure.
- Browser console errors: not checked because no browser session could be started.

**Comparison history**

- Initial pass: blocked before visual comparison; no P0/P1/P2 visual fixes could be evidence-tested.

**Implementation checklist**

- Capture the implementation at `1440 × 1024` with Ví active.
- Test month selector, Ghi thu / chi, and Đối soát.
- Compare full screen plus focused header/hero/ledger crops against the source.
- Fix any P0/P1/P2 mismatches and repeat.

**Follow-up polish**

- Review the generated hero background crop at the actual window height.

final result: blocked

