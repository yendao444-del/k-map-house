# Contract confirmation email — approved option 1

Date: 07/10/2026. State: room 999, tenant Khách thuê thử nghiệm, move-in 07/10/2026, unsigned contract awaiting confirmation.

## Source and captures

- Source visual truth: `emerald-illustration.png`, 1024×1536, the first displayed option selected by the user.
- Requested change: replace generated logo with the existing Electron AK brand. Brand source: `src/renderer/src/assets/an_khang_home_logo_ngang.png`; same original navy/green AK identity as `an_khang_home_logo.png` used by Electron navigation. Original pixels are resized/composited, not regenerated.
- Browser-rendered implementation: `implementation-desktop.jpg`, 820×1300 pixels, CSS viewport 820×1300; `implementation-mobile.jpg`, 390×860 pixels, CSS viewport 390×844 plus full-page capture. Browser density 1.
- Full-view comparison: `design-comparison.png` (1224×930). Source email region (920×1384) proportionally normalized to 600×903; implemented desktop email region cropped to its 600 CSS px width. No stretching.
- Focused logo comparison: `logo-comparison.png`, original Electron brand normalized to the actual email logo slot beside the browser-rendered slot. Navy/green shapes and lettering are retained; only normal image downsampling/JPEG capture artifacts differ.
- Preview: http://127.0.0.1:5292/. Uses the exact production template and banner; link contains an explicitly inactive preview token.

## Findings and fixes

- Logo initially lacked contrast on emerald. Fixed by flattening the original supplied horizontal logo onto a small white backing before compositing. Final desktop/mobile captures show the original navy/green logo clearly. This is the user's requested brand substitution, rather than drift from the generated white mark.
- No remaining actionable P0/P1/P2 findings in the final full-view comparison. The illustration/headline, plain body, two ruled facts, centered green CTA, 72-hour note and closing retain the selected hierarchy.

## Required fidelity surfaces

- Typography: Arial/Helvetica email-safe fallbacks, 16px body, 18px desktop CTA/16px mobile CTA. Vietnamese accents and dates readable. Source display typography remains in the raster banner. Slight font-family differences from the ImageGen body are acceptable for email clients.
- Spacing/layout: one 600px maximum-width email, 40px desktop body sides/20px mobile sides; no nested cards. Mobile has no horizontal overflow (`scrollWidth = innerWidth = 390`). Footer and primary action fully readable.
- Colors: emerald #00ab60 primary, dark ink #15231d, mint artwork and thin pale gray-green dividers. Real logo preserves navy/green.
- Image quality: 1200×660 banner displayed at 600px maximum, proportional downsampling, original Electron logo preserved. Palette PNG is 289004 bytes. Browser confirms banner loaded. Artwork generated independently from the user-approved reference; no CSS drawings or fake logos.
- Copy/content: greeting, room and move-in date come from the saved draft. No fabricated date when absent. Contract-review link remains clickable live HTML and uses the backend URL/token unchanged. No payment request, signature claim or extra CTA. HTML-escaped dynamic data.

## Verification

- Main renderer uses the new template; Gmail MIME embeds the banner using Content-ID so the email does not depend on a public image host. Other notification icons still work.
- Typecheck passed; 18 Gmail/delivery checks passed including actual banner bytes, CID, HTML link preservation, Vietnamese copy and escaping. Electron TEST build passed and restarted.
- Browser CTA destination inspected; not followed because the preview token is inactive. Actual tenant confirmation flow is unchanged and was previously tested. No additional email sent for this design verification.
- No new Gmail Inbox rendering was captured for this template; live Gmail compatibility is supported by MIME validation and existing CID notification transport, not claimed as observed receipt.

## Follow-up polish

P3: logo is intentionally on a white backing to preserve the supplied colors. Minor glyph and raster-illustration differences from the generated mock remain acceptable.

final result: passed
