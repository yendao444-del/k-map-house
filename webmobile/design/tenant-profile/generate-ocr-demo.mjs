import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const direction = process.argv[2];
const variants = {
  scanfirst: 'SCAN-FIRST. Keep a compact desktop modal around 760px wide. Header, then one prominent mint-tinted drop zone at the top labelled Dán ảnh hoặc kéo thả CCCD with buttons Chọn ảnh and Dán từ clipboard. Show a realistic but anonymized document thumbnail inside after upload, plus a green status line Đã đọc thông tin từ ảnh. Below it, show clean autofilled fields Họ và tên and Số CCCD / CMND as the primary data, then Số điện thoại and Email side by side, and an optional Ghi chú. Make the scan action clearly the fastest path, while all fields remain editable. No extra cards.',
  sidepanel: 'SIDE-PANEL. Use a wide premium modal around 920px. Left column is a calm scan panel titled Nhận diện CCCD with large dropzone, clipboard hint, small preview of an anonymized CCCD and status Đã đọc thông tin. Right column is a tidy form titled Thông tin khách thuê with autofilled Họ và tên, Số CCCD / CMND, Số điện thoại and Email, plus a concise OCR helper. Use whitespace and one quiet divider, not nested cards. Footer spans both columns.',
  inline: 'INLINE. Use a narrower modal around 700px. Header followed by a single horizontal upload strip with document icon, text Kéo ảnh CCCD vào đây hoặc bấm để chọn, compact button Chọn ảnh and a small completed status Đã đọc thông tin. Below, group the autofilled identity fields in one clean two-column grid: Họ và tên, Số CCCD / CMND, Số điện thoại, Email. Put optional notes at the bottom. The upload strip should feel integrated and quick, not like a separate page.'
};
if (!variants[direction]) throw new Error('Unknown direction');
const base = (process.env.NINEROUTER_URL || '').replace(/\/$/, '');
if (!base) throw new Error('NINEROUTER_URL unavailable');
const headers = { 'Content-Type': 'application/json' };
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`;
const model = 'cx/gpt-5.5-image';
const root = path.dirname(fileURLToPath(import.meta.url));
const reference = path.join(root, 'source-tenant-modal.png');
const output = path.join(root, `tenant-profile-ocr-${direction}-20261005.png`);
const image = `data:image/png;base64,${(await fs.readFile(reference)).toString('base64')}`;
const prompt = `Create ONE realistic production-quality redesigned Electron desktop modal, not a mobile app. Target canvas 1024x1536 portrait, natural component presentation with the complete modal centered on a soft blurred Electron app backdrop. Preserve Vietnamese language, compact modal purpose, close button, emerald brand and familiar form behavior from the attached screenshot. Current date 05/10/2026, no dates need to appear.

AUTHORITATIVE REFERENCE: attached source-tenant-modal.png is the current Thêm khách thuê mới form from this Electron landlord application. EXACT REQUEST: redesign the first stage of the tenant profile flow so the landlord can upload or paste a CCCD image directly in Electron; OCR reads the card and prefills the form. This is NOT a customer-facing flow. The landlord has the document image. After OCR, the landlord reviews and edits the extracted information, then saves the tenant profile. Do not show contracts, room assignment, rent, deposit, verification, passwords, OTP or invitation actions in this screen. Use current Electron tokens exactly: primary #00AB60, hover #009653, header/ink #064A31, text #15231D, muted #718079, canvas #F7FAF8, mint #EDF9F1, border #E5EEE8. Inter font, readable 14-16px body, 8px controls, 10px surfaces, subtle elevation, disciplined spacing.

DESIGN DIRECTION: ${variants[direction]}

VISIBLE CONTENT: Header title Thêm khách thuê, subtitle Tạo hồ sơ từ ảnh CCCD. Main action for input is clearly labelled Kéo thả hoặc dán ảnh CCCD. Include a small secondary button Chọn ảnh. Show OCR completed state with status Đã đọc thông tin, not a fake API progress spinner. Use anonymized, non-readable card preview only; no realistic personal identity data in the image. Autofilled editable fields: Họ và tên with value Nguyễn Văn An, Số CCCD / CMND with value 07920300••••, Số điện thoại with value 0912 345 678, Email with value tenkhach@gmail.com. Add a small helper near OCR status: Bạn có thể chỉnh sửa trước khi lưu. The email field may have helper Dùng để đăng nhập và nhận thông báo sau này, but do not mark it required and do not show verification. Optional field Ghi chú (không bắt buộc), placeholder Biển số xe hoặc thông tin cần lưu ý. Footer buttons Hủy and one green primary Lưu hồ sơ khách thuê. All labels must be clearly Vietnamese and unclipped.

Avoid: mobile layout, phone frame, blue or purple primary buttons, gold styling, dark theme, decorative illustrations, real readable identity documents, real customer PII beyond the intentionally synthetic example values, invented OCR confidence percentages, verification badges, email sending buttons, OTP/SMS, customer self-service, room or contract fields, billing data, nested cards, dense dashboards, tabs, wizards, extra navigation, tiny text, clipped footer, technical jargon, multiple screens or directions in one image. This is one cohesive Electron modal design only.`;

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers });
    if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`);
    const catalog = await catalogResponse.json();
    if (!catalog.data?.some(x => x.id === model)) throw new Error(`${model} unavailable`);
    const response = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers,
      body: JSON.stringify({ model, prompt, image, n: 1, size: '1024x1536', response_format: 'b64_json' }),
      signal: AbortSignal.timeout(300000)
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Generation HTTP ${response.status}: ${raw.slice(0, 200)}`);
    let payload;
    try { payload = JSON.parse(raw); } catch {
      for (const line of raw.split('\n')) if (line.startsWith('data:')) {
        try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) payload = event; } catch {}
      }
    }
    const bytes = payload?.data?.[0]?.b64_json || payload?.b64_json;
    if (!bytes) throw new Error('No image bytes returned');
    await fs.writeFile(output, Buffer.from(bytes, 'base64'));
    await fs.writeFile(`${output}.json`, JSON.stringify({ model, reference, prompt, output, status: 'proposal-not-approved' }, null, 2));
    console.log(output);
    break;
  } catch (error) {
    if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error;
    console.log(`Retry ${attempt}: ${error.message.slice(0, 180)}`);
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}
