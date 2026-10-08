# Local OCR QA — 06/10/2026

## Environment

- Local website: `http://127.0.0.1:5188/?screen=capture`
- Local gateway: 9Router through Vite `/api/meter-ocr`; provider credentials stayed server-side in ignored `.env.local`.
- Viewport checked: 390 × 844; `document.documentElement.scrollWidth === innerWidth`.
- Source photos were read from `C:\Users\Admin\Downloads\dien nuoc`; they were not copied into `public` or deployed.

## Evidence

| Check | Result |
| --- | --- |
| Electric photo, two-pass AI read | Accepted proposal `12692 kWh`; CTA stayed disabled while reading. |
| Electric confirmation | Moved to water only after explicit user confirmation. |
| Water photo | AI returned `00287 m³` in the verified run; UI displayed leading zeros and unit, then required explicit confirmation. |
| Wrong meter | Electric photo uploaded in water step was rejected: “Ảnh chưa xác định đúng công tơ nước”. CTA remained disabled. |
| Old/new mismatch | Server policy rejects a new value below the previous reading; an implausible or large spike goes to review and receives no confirmation token. |
| Manual bypass attempt | Manual edit is not shown for an unreadable/failed image; it only appears after an AI-readable image and is rechecked server-side. |
| Invalid manual input | `287.5` was rejected with a clear integer-only message and disabled CTA. |
| Manual input | `287` completed the flow and completion card labelled it “Bạn tự nhập · đã xác nhận”. |
| Retake during OCR | Aborted the request, returned to capture, and did not leave a stale result. |
| Completion | Shows both readings and their source; no invoice/SePay/database write is performed. |

Screenshots (private, ignored):

- `qa/private/ocr-electric-12692.png`
- `qa/private/ocr-water-00287.png`
- `qa/private/ocr-wrong-meter-blocked.png`
- `qa/private/ocr-manual-complete.png`

## Interpretation

Two agreeing AI passes are a consistency check, not proof. The final user confirmation remains mandatory. A blurry or ambiguous photo can be rejected, and provider behavior can vary with the same borderline image; the safe behavior is to retake or use the explicitly labelled manual branch.

## Technical verification

- `npm run build`: TypeScript, production bundle and private-configuration scan passed.
- `node --test server/meter-reader.test.mjs`: 2 tests passed, covering malformed/unclear/wrong-type data and disagreement between reads.
- Prototype TypeScript and protected runtime check passed; source synchronized with keyboard-aware manual input.
- Server policy/API tests cover swapped meters, old/new regressions, spikes, forged/expired tokens, origin rejection and manual recheck.

## Strict policy follow-up

- Live supplied electric photo was rejected as unclear or inconsistent in the checked runs. The confirm button stayed disabled, with no manual fallback. Evidence: `qa/private/strict-ocr-rejected.png`.
- An isolated server on port 5192 used synthetic OCR responses, with a prominent “KIỂM THỬ MÔ PHỎNG OCR” banner. This verifies policy/interaction, not AI accuracy. No real images were uploaded to that test provider.
- UI manual correction to `287` at the electricity step was blocked against sample old `12600`; `13000` was blocked as a spike. Restoring `12692` passed the actual local confirmation API and moved to water.
- Synthetic UI evidence: `qa/private/policy-synthetic-regression.png`, `qa/private/policy-synthetic-spike.png`.
- Demo thresholds and old readings must be replaced with authenticated backend values before real billing. Correct meter type and plausible delta cannot establish that a photo belongs to the correct room; registered meter identity and a real review workflow remain pending.

## Speed and legibility update

Measured before changing the reader: electricity accepted in 11,508 ms; water rejected in 5,838 ms. Evidence saved as `qa/private/benchmark-baseline.json`.

The optimized reader preserves more source resolution, generates a central detail on the server from the same photograph, and requests two independent reads concurrently at low reasoning effort. Full-device context remains available for meter-type validation. Unclear digits, wrong type/unit and disagreement still fail closed. Provider timeout is 15 seconds; client network guard is 22 seconds and timeouts are distinguished from blurry-photo rejection.

| Run | Electric | Water |
| --- | --- | --- |
| optimized-1 | 12692, accepted, 3,350 ms | 00287, accepted, 4,609 ms |
| optimized-2 | 12692, accepted, 3,794 ms | 00287, accepted, 4,530 ms |
| optimized-3 | rejected: disagreement, 3,521 ms | 00287, accepted, 3,277 ms |

Results are a small sample, not an accuracy guarantee. Browser upload verified real electric and water recognition, old/sample comparison and confirmation gate. Mobile screenshot: `qa/private/ocr-optimized-water.png` (390 × 844, no horizontal overflow). No synthesized digits or reference values are supplied to the AI.

Browser confirmation then completed both actual uploads: `qa/private/ocr-optimized-complete.png`, with electricity `12692 kWh` and water `287 m³`, both labelled AI read/user confirmed. A real electric photo deliberately sent to the water reader remained rejected in 4,087 ms (`benchmark-wrong-meter.json`).

10 tests passed after the change, including actual-image decoding, strict parsing, overlapping requests, disagreement, provider timeout cancellation, policy and confirmation-token validation. Build, private-config scan and prototype runtime/typecheck passed.
- Configuration loaded directly from `.env.local` connected to the gateway (HTTP 200), and the configured model exists in its catalog. Launch does not depend on inherited Codex gateway environment variables.
- Private QA screenshots and `.env.local` verified as Git ignored.
