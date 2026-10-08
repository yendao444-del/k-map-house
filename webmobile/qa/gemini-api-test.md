# Gemini API test — 06/10/2026

The owner supplied a key in `webmobile/.env` and identified Gemini as its provider. The originally unassigned value was normalized to `METER_CLOUD_API_KEY`; provider/model are now in the same ignored file. No key was printed or added to source/public assets.

## Actual provider results

- Gemini model catalog: HTTP 200, valid authentication. `gemini-2.5-flash` appears in the catalog but generation returned 404: unavailable to new accounts.
- `gemini-3.8-flash`: actual image requests returned 503 high demand, including a retry. `gemini-3.5-flash` also returned 503.
- `gemini-3.1-flash-lite`: both generation requests returned HTTP 200. Original electricity photo `10717` did not agree digit by digit, so it was rejected. This is not proof of a correct electricity reading.
- Original water photo: two real Gemini requests both returned `00287`, meter type water/unit m3/one meter/clear. Reader returned numeric 287, retaining displayed digits `00287`. Total about 6.6 seconds, visually consistent with the original photo. Evidence: `private/gemini-water-direct.json`.

## Deployment state

Source/configuration is ready for `gemini-3.1-flash-lite`. The earlier Supabase management credential returned HTTP 401. A renewed token was later supplied, validated with HTTP 200, and used to deploy the isolated function and its server-only Gemini secret.

The public backend now reports `ocrConfigured:true`. A real public-domain flow was verified with both meter photos: OCR, review confirmation, demo invoice, simulated SePay queue, and final paid receipt. This does not claim production payment or tenant data integration.

Build/typecheck and secret scan with actual private file values passed; 25 regression tests passed. RPC migration previously passed. Public evidence is in `public-cloud-ocr-flow.json`.
