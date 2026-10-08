import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const direction = process.argv[2];
const variants = {
  compact: 'COMPACT VERTICAL FORM. One elegant narrow modal, approximately 640px wide. Header with small mint person-add icon, title and short subtitle. Full-width name field, phone and email on one row. A plain small heading for identification, CCCD number full width and two modest side-by-side document upload slots labelled Mặt trước and Mặt sau. Notes textarea below. Keep everything visible in one screen, no section cards. Thin line dividers and spacing create groups. Footer buttons right aligned.',
  split: 'BALANCED TWO-COLUMN FORM. A wider modal approximately 860px wide. Below header divide the body into two aligned columns, separated only by whitespace and a quiet thin vertical line. Left column labelled Thông tin khách thuê contains full name, phone, email, with notes below. Right column labelled Giấy tờ tùy thân contains CCCCD number and two elegantly proportioned upload slots for Mặt trước and Mặt sau. Email explanation directly below its input. Bottom shared footer. Straightforward professional data entry, not a dashboard.',
  grouped: 'EDITORIAL GROUPED FORM. Modal approximately 700px wide. Header then three refined sections on the same white surface, separated by subtle horizontal rules. Small emerald section markers 01, 02, 03 beside headings Thông tin cá nhân, Thông tin liên hệ, Giấy tờ tùy thân. Name full width; contact phone and email two columns; CCCD number with two compact horizontal upload controls underneath. Optional Ghi chú textarea at end, quieter than the core fields. No wizard, no tabs, all editable in one view. Clear scan path, restrained emerald accents and careful baseline alignment.'
};
if (!variants[direction]) throw new Error('Unknown direction');
const base = (process.env.NINEROUTER_URL || '').replace(/\/$/, '');
if (!base) throw new Error('NINEROUTER_URL unavailable');
const headers = { 'Content-Type': 'application/json' };
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`;
const model = 'cx/gpt-5.5-image';
const root = path.dirname(fileURLToPath(import.meta.url));
const reference = path.join(root, 'source-tenant-modal.png');
const output = path.join(root, `tenant-profile-${direction}-20261005.png`);
const image = `data:image/png;base64,${(await fs.readFile(reference)).toString('base64')}`;
const prompt = `Create ONE realistic production-quality redesigned Electron desktop modal, not a mobile tenant portal. Target canvas 1024x1536 portrait, a natural component presentation with the complete modal comfortably centered and broad soft neutral surrounding backdrop. Preserve natural typography and UI proportions. Current date 05/10/2026, no dates need to appear.

AUTHORITATIVE REFERENCE: the attached user screenshot source-tenant-modal.png is the current Thêm khách thuê mới form in this project's Electron landlord application. Preserve its functional purpose, Vietnamese language, compact modal shell, close button, emerald brand, and the existing form field categories. EXACT REQUEST: make this tenant profile entry form more premium, clear and convenient to fill, as the first stage of a future flow: create tenant profile, then make contract from that profile, then verify email for web access. Only show this FIRST tenant profile stage now. Do not show contract details or perform verification in this form. Use the existing Electron tokens primary #00AB60, hover #009653, heading #15231D, muted #718079, canvas #F7FAF8, mint #EDF9F1, border #E5EEE8. Inter font, 14-16px body at natural UI scale, 8px control radii, 10px surface radii, generous purposeful whitespace, subtle elevation. Premium means disciplined hierarchy and alignment, not decoration.

DESIGN DIRECTION: ${variants[direction]}

VISIBLE CONTENT: Title Thêm khách thuê. Subtitle Hoàn thiện hồ sơ trước khi lập hợp đồng. Full name field labelled Họ và tên with required asterisk, placeholder Nhập họ tên đầy đủ. Phone field labelled Số điện thoại, placeholder 0912 345 678. Email field labelled Email, placeholder tenkhach@gmail.com. No mandatory asterisk for phone, email or identity because their requiredness has not yet been agreed. Small email helper Dùng để đăng nhập và nhận thông báo. Small subdued clarification Xác minh email sau khi lập hợp đồng. No verified status, no OTP button, no send invitation button. Identification heading Giấy tờ tùy thân, field label Số CCCD / CMND, placeholder Nhập số giấy tờ. Two upload targets clearly labelled Mặt trước and Mặt sau, simple upload line icons, subdued helper JPG, PNG · Tối đa 5 MB mỗi ảnh. No actual identity photos or real personal data. Optional notes field labelled Ghi chú (không bắt buộc), placeholder Biển số xe hoặc thông tin cần lưu ý. Footer secondary Hủy and ONE solid brand green primary button Tạo khách thuê, with discreet check icon. All Vietnamese must be spelled clearly, unclipped, realistic and readable. Each field has a visible label, not just placeholders.

Avoid: blue primary controls, cyan gradients, gold styling, dark theme, decorative illustrations, giant badges, cards inside cards, dense nested borders, tiny legal text, fabricated verified email state, mandatory email rule, room assignment, rent or deposit fields, password fields, billing or payment history, OTP/SMS actions, extra navigation, tabs or multi-step wizard, marketing content, OS chrome or phone frame, multiple screens in one image, clipped footer, old tenant data, internal technical identifiers. This is one coherent proposed form design only.`;

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
