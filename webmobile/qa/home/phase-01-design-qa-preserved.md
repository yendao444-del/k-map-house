# Design QA — Phase 01 hồ sơ khách thuê

final result: passed

## Nguồn và trạng thái

- Source visual: `design/tenant-profile/approved-ocr-option-2.png`.
- Rendered implementation: `qa/` local verification page using `TenantFormModal` at 1440 × 1024.
- State compared: two CCCD images loaded, QR read, extracted fields visible, phone/email filled, confirmation checkbox checked.

## Evidence comparison

- `qa/design-comparison.jpg`: approved modal cropped from 1024 × 1536 and actual desktop modal cropped from 1440 × 1024, displayed together at equal width.
- `qa/implementation-populated.jpg`: populated desktop capture.
- `qa/implementation-empty.jpg`: empty state.
- `qa/tenant-two-sides.png`: current empty state with separate Mặt trước/Mặt sau controls.
- Intentional differences: two real photo previews replace the mock's single illustration, explicit **Mặt trước** and **Mặt sau** upload buttons are added, clipboard actions remain available per side, and a review confirmation protects Vietnamese names.

## Findings and fixes

- Layout: two-column scan panel and editable tenant fields match the approved direction. The footer remains visible and the modal scrolls inside its body.
- Typography and tokens: Inter, existing Electron green tokens, restrained borders and mint scan surface are used.
- Interaction: file picker, two image previews, QR/OCR status, editable fields, confirmation checkbox and save validation were exercised.
- Privacy and correctness: no image is sent to an external OCR service; a save is blocked without both images and a valid QR result. Conflicting identity numbers are blocked.
- Responsive behavior: at a narrow viewport the form body scrolls without losing the footer controls; at desktop width the two-column hierarchy is preserved.

## Verification evidence

- `npm run typecheck` passed.
- `npm run build` passed.
- `node --test webmobile/identity-reader.test.mjs webmobile/tenant-save.test.cjs` passed (6 tests).
- `node webmobile/test-identity-backend.mjs` passed for original, resized and rotated back images; all returned the exact Vietnamese name and 12-digit identity number.
- Packaged Electron smoke test passed for both QR and OCR paths (`qa/packaged-runtime-results.json`).
- Browser QA loaded both real fixture images and displayed the exact fixture name with Vietnamese accents and 12-digit identity number, `Mặt sau · QR`, and an enabled save control only after review confirmation.

## Follow-up gate

Windows package built and package verification passed. Electron smoke loaded dependencies from the built `app.asar` and local OCR models from packaged resources; both QR and OCR returned the fixture's exact name and identity number. Actual compiled preload/main-handler IPC also passed in a sandboxed Electron window (`qa/ipc-runtime-results.json`). The installer was built, but was not installed during verification. Both photos are composed into the existing `identity_image_url` field. A later production schema check found the address/issue-date/issue-place columns missing: migration `20261005200000_tenant_identity_details.sql` has now added them as nullable fields and reloaded PostgREST schema. API schema verification and inserts into a temporary table with rollback passed; no real tenant was created/modified during verification. Build/typecheck and the six tests passed again after the fix. The existing installer predates this subsequent form fix.

Recognition evidence covers one supplied identity, with original/resized/rotated QR images and front OCR. It does not establish universal accuracy for every card or photo. Saving currently requires two distinct images, a valid QR result and review confirmation; an unreadable QR requires a clearer photo. OCR alone cannot prove that every Vietnamese accent is correct.
