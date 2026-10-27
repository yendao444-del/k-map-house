# Profile → 2FA design QA

## Source and implementation

- Source visual truth: `docs/design/profile-2fa/demo.png` (1585 × 992 px, approved reference).
- Implementation: `docs/design/profile-2fa/implemented-desktop.jpg` (1585 × 992 CSS px browser capture; 1020 × 650 px dialog crop).
- Responsive implementation: `docs/design/profile-2fa/implemented-390.jpg` (390 × 844 CSS px) and `docs/design/profile-2fa/email-otp-390.jpg`.
- Combined comparisons: `docs/design/profile-2fa/comparison.png` and `docs/design/profile-2fa/comparison-methods.png`.
- The comparison uses the same 1020 × 650 dialog crop and scales the source dialog to the implementation dialog dimensions. No device pixel ratio normalization was needed for the browser capture.

## State and interactions checked

- Security overview with Authenticator enabled, Gmail unverified, SMS unavailable.
- Gmail send flow uses the signed-in email identity, a 60-second resend cooldown, six-digit validation, and server-bound challenge ID.
- Wrong OTP clears the field and shows an error without changing the badge.
- Correct OTP updates the Gmail badge and invalidates the `users` query cache.
- Authenticator management, device, activity and password tabs remain reachable.
- At 390 px width the dialog remains inside the viewport and `document.documentElement.scrollWidth === innerWidth`.
- Also checked at 320 × 740 px: bounded dialog, no document overflow, and profile → 2FA/password tab navigation works. Long security tabs remain horizontally scrollable on small screens.
- Read failures display “Chưa có dữ liệu”; retry restores the actual state. Email delivery errors remain retryable and never show verification success.
- Browser error logs were inspected. Earlier errors were limited to local fixture hot-reload recreating a React root; the final fresh page has no console errors.
- Synthetic fixture only; no real accounts, email addresses, OTPs or customer data were modified.

## Fidelity review

- Typography: existing Inter/Vietnamese font and weight hierarchy are preserved; heading and method labels match the approved hierarchy.
- Spacing and layout: method heading and three rows follow the approved wide dialog grid; compact media rules stack status and actions without clipping.
- Colors and tokens: navy text, emerald active state, amber pending state and neutral unavailable state use the existing account surface tokens.
- Icons and assets: existing lucide icon set and profile surface assets are reused; no placeholder or generated UI art was added.
- Copy: Gmail wording follows the approved concept. SMS is intentionally “Chưa hỗ trợ” because the production management configuration reports SMS disabled; the control is disabled rather than implying a verification that cannot complete.

## Comparison history

1. Initial implementation added method rows and Gmail OTP. The first 1100 px capture clipped the bottom note in the fixed-height dialog.
2. Reduced method-row desktop minimum height and heading padding. The final 1585 × 992 capture shows the full method section and note with no dialog overflow.

## Findings

- No actionable P0/P1/P2 visual differences remain. SMS copy is an intentional capability-state difference from the mock and is safer than a false “add phone” flow while the provider is disabled.
- Future P3: replace the SMS unavailable state with a configured provider flow after Twilio/SMS credentials and backend policy are provisioned.

## Build and deployment

- Electron local `npm run build`: passed; no installer release claimed.
- PWA `npm run build`: passed, including public secret scan and cache checks.
- Client regressions: 12/12 passed; gateway security regressions: 8/8 passed.
- Production build `616d7e05e3fb9c95` at `https://app.phongtroankhang.com` matches the validated bundles by SHA-256. The local QA fixture is not shipped.
- Live verification evidence: `docs/design/profile-2fa/production-verification.json`.

final result: passed
