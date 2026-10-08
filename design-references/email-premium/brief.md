# Premium notification email direction — 2026-10-06

Authoritative source: `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-b73f4ad2-5597-4392-81dc-53f66e501c13.png`.

Scope: upgrade the email templates inside the existing Gmail test preview. Preserve the modal controls and the sample-only testing behavior. Do not add new live sends, account changes or debt writes.

## Required changes

- Clear, premium typography, alignment and restrained spacing.
- Status must be expressed through a heading, icon and color together.
- Successful payment: emerald/mint.
- Unmatched or ambiguous SePay transfer: red/light red, explicitly requires reconciliation.
- Overdue or long-unpaid debt: amber/light amber. Highlight the outstanding amount once.
- Information/invoice/service updates: blue/light blue.
- Contract/checkout reminders: distinct violet or blue; use dates instead of payment-success language.
- Negative or suppressed test scenarios retain their actual meaning; never imply a successful payment where none was recorded.

## Compact long-unpaid template

Show a short title, greeting, one outstanding amount, room, duration unpaid and one concise action instruction. Omit the itemized utility table, duplicate outstanding-balance panels and internal implementation/support messages from the email body. Those diagnostics may remain outside the email in the test result.

## Image generation

Three independent design directions show the same three representative states: successful payment, unmatched transfer, and long-unpaid debt. Each image represents one cohesive visual family. The latest screenshot is the only attached reference. Local 9Router generation checks the live image catalog before every request and uses `cx/gpt-5.5-image`.

No application code changes before the user selects a visual direction. After selection, implement all notification types consistently and compare the result against the selected image in `design-qa.md`.
