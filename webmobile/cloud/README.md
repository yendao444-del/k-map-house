# Backend demo online

Pages serves the current website and `/api/*` gateway. Supabase `webmobile-demo` handles OCR review/confirmation and demo invoices. No production tenant, contract, invoice or SePay table is changed. Camera images are processed transiently, never saved in the demo database.

OCR configuration stays in the ignored `webmobile/.env`; gateway credentials stay in `.env.production.local`, Supabase secrets and Pages secret bindings. Do not paste keys into chat or put them in `VITE_*`. The gateway secret is a random server credential, never delivered to the browser. A Secure/HttpOnly cookie scopes each demo session. Database RPCs/tables are service-role only, with atomic session leases and daily OCR quotas (200 total, 120 per hashed IP, 20 per session).

Deployment:

1. `node --use-system-ca scripts/deploy-cloud-backend.mjs`
2. `npm run deploy`
3. Verify `https://phongtroankhang.com/api/health` and the rendered website.

The owner has supplied the AI key. Direct Gemini tests and public-domain tests succeeded with `gemini-3.1-flash-lite`, including water `00287`. `gemini-2.5-flash` generation is unavailable to new users; 3.8/3.5 Flash returned overload. A renewed `SUPABASE_ACCESS_TOKEN` was validated and used to deploy the backend secret/function. Public health now reports OCR configured; evidence for real image → confirmation → demo invoice → simulated payment is in `qa/public-cloud-ocr-flow.json`. Settings: `METER_CLOUD_API_KEY`, `METER_CLOUD_PROVIDER`, `METER_CLOUD_MODEL` in `webmobile/.env`. An OpenAI-compatible provider requires `METER_CLOUD_PROVIDER=openai`, an HTTPS `/v1` base URL and a vision model.

Two cloud readings must agree character by character. Strict type/framing/quality validation and old/new policies remain; same-model agreement is not a guarantee of accuracy. Cloud uses the original uploaded photo in each pass, retaining its edges; it does not apply the local Sharp contrast transform. Human confirmation remains required. Physical phone camera and real AI accuracy need separate verification.

This remains a DEMO. Production tenant login, active-contract authorization, real invoice persistence, emails and SePay webhooks are separate phases. Demo state expires after 24 hours. No new paid service or plan is purchased.


### Electron payment recipient — 07/10/2026

Deployment reads only bank/property fields from `app_settings` and sets server variables `WEBMOBILE_PAYMENT_*` and `WEBMOBILE_PROPERTY_*`. These settings are a deployment snapshot; redeploy backend after changing Electron bank settings. Invoice data and settlement remain demo, but the returned SePay QR is a real BIDV/account QR with exact amount/reference. Demo labels warn against sending actual money. No actual SePay webhook is enabled. Older demo QR snapshots migrate on the next authorized payment API request.
