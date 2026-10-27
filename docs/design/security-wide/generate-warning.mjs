import { readFile, writeFile } from 'node:fs/promises'
const direction = process.argv[2]
const directions = {
  overview: 'A calm compact centered white dialog about 580px wide, with a small emerald outline shield above a left-aligned headline. Follow with one short sentence explaining the requirement, then three compact numbered instruction rows without cards: Cai Google Authenticator; Xac minh email; Luu ma khoi phuc. A single large emerald Bat dau thiet lap button, and a subtle Dang xuat text action below. A small amber mandatory notice is a label, not a loud warning block. Google Account-like clean spacing and approachable typography.',
  navigation: 'A wide approximately 940px dialog with two clean regions. Left 35 percent is restrained navy with a large tasteful dimensional shield-and-key illustration, small AN KHANG HOME brand, and a short sentence Bao ve tai khoan cua ban. Right white region contains the headline, explanation, three simple setup instruction rows, one emerald Bat dau thiet lap button and a subtle Dang xuat text link. No small nested cards. The navy identity region is visually distinct, while the right side resembles a clean account onboarding form.',
  rows: 'A wide approximately 820px white dialog, almost editorial in its simplicity. A small outlined shield and compact AN KHANG HOME wordmark in the top row. Large left-aligned headline and a short explanation below. A horizontal three-step preview with thin connectors: Authenticator, Email, Ma khoi phuc; the first is active emerald and the later steps are muted. A short note states the user must complete setup before accessing the app. Bottom action row has Dang xuat as a quiet text button on the left and Bat dau thiet lap as a clear emerald button on the right. Flat white surface, thin dividers and generous whitespace, inspired by Facebook Accounts Center simplicity.'
}
if (!directions[direction]) throw new Error('Unknown direction')
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base) throw new Error('Missing image gateway')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: 'Bearer ' + process.env.NINEROUTER_KEY } : {}) }
const reference = 'data:image/png;base64,' + (await readFile(new URL('../../security/qa/mfa-mandatory-setup-2026-10-10.png', import.meta.url))).toString('base64')
const prompt = `Create a realistic, production-quality Vietnamese desktop mandatory two-factor enrollment popup for AN KHANG HOME rental-management app. ONE attached authoritative reference is the ACTUAL current mandatory enrollment screen. Preserve its brand, Vietnamese language, mandatory setup meaning, Google Authenticator method, available sign-out escape and white/navy/emerald color language. Requested change: replace the tall confusing login-sized setup panel with a clean, clear popup that is approachable like Google Account or Facebook Accounts Center. ${directions[direction]}
Canvas 1536x1024 landscape. Exactly ONE complete desktop popup on the existing dark softly blurred building/login background from the reference, at natural proportions. Everything fits in the frame with generous margins, no clipping. Date anchor 2026-10-10, omit dates because this introductory popup does not need them. Correct accented Vietnamese interface labels. Main headline MUST read Thiết lập xác minh 2 bước. Explanation: Bạn cần thiết lập Google Authenticator để tiếp tục sử dụng hệ thống. Primary action MUST read Bắt đầu thiết lập. Only secondary action is Đăng xuất. Label Thiết lập bắt buộc can appear subtly. Describe the three real steps with correct accents: Cài Google Authenticator, Xác minh email, Lưu mã khôi phục. Body 16-18px at this output scale, headings 30-36px, Inter-like typography, navy #102038, muted #66748a, emerald #008f62. This is an introductory warning/setup entry screen BEFORE QR generation. Do not show fields, secret, QR code or OTP at this stage. Use spacing, typographic hierarchy, simple dividers and clean outline icons. The user may sign out but cannot bypass setup or access business screens. No dismiss X, Huy, Bo qua, De sau, Tiep tuc vao he thong or any action that appears to skip mandatory enrollment.
Avoid: Google/Facebook logos, fake security scores, ominous red alarms, giant warning triangles, stacked nested cards, repeating large gray buttons, giant AN KHANG HOME title, duplicated headings, busy backgrounds, browser or OS chrome, QR/secrets/passwords/emails, English interface text, clipped labels, tiny text, phone bezel, collage, multiple concepts in one image, promotional caption or watermark. Produce only the redesigned popup UI image.`
await writeFile(new URL(`./warning-${direction}-prompt.txt`, import.meta.url), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalog = await fetch(base + '/v1/models/image', { headers, signal: AbortSignal.timeout(15000) })
    const models = await catalog.json()
    const model = 'cx/gpt-5.5-image'
    if (!catalog.ok || !models.data?.some(item => item.id === model)) throw new Error('Required image model unavailable')
    console.log(`${direction}: warning popup generation, attempt ${attempt}`)
    const response = await fetch(base + '/v1/images/generations', { method: 'POST', headers, body: JSON.stringify({ model, prompt, images: [reference], n: 1, size: '1536x1024', quality: 'high', response_format: 'b64_json', output_format: 'png', image_detail: 'high' }), signal: AbortSignal.timeout(240000) })
    if (!response.ok) throw new Error('Image generation HTTP ' + response.status)
    const result = await response.json()
    if (!result.data?.[0]?.b64_json) throw new Error('Provider returned no image')
    await writeFile(new URL(`./warning-${direction}.png`, import.meta.url), Buffer.from(result.data[0].b64_json, 'base64'))
    console.log(`${direction}: warning popup image saved`)
    process.exit(0)
  } catch (error) {
    console.log(`${direction}: ${error.message}`)
    if (attempt === 3) process.exit(1)
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}
