import { readFile, writeFile } from 'node:fs/promises'
const direction = process.argv[2]
const directions = {
  overview: 'A wide account-security overview with a restrained header and horizontal tabs Ho so / Bao mat / Hoat dong, with Bao mat selected. On ONE spacious white surface: compact Google Authenticator status row at top, then a broad left region Thiet bi cua ban showing one laptop row with inline badge Thiet bi hien tai and Da ghi nho, concise expiry and a trailing three-dot action. A narrower right region Hoat dong gan day shows only three compact timeline rows and Xem tat ca. Thin vertical divider, no boxed cards. Put Dang xuat tat ca thiet bi as a quiet red text action at the bottom of the device section. This is the balanced wide overview concept.',
  navigation: 'An account center with a narrow 220px pale neutral left navigation rail and a large white main pane, like the clarity of Google Account settings. Left navigation: Bao mat, Thiet bi dang nhap (selected), Hoat dong gan day. Main pane title Thiet bi dang nhap, subtitle Quan ly cac thiet bi duoc phep truy cap tai khoan. One beautifully spaced compact laptop row: May tinh, badge Thiet bi hien tai, Chrome tren Windows, Da ghi nho den 09/11/2026, action Quan ly. Below a thin divider: short guidance about trusted devices, then a subtle outlined Ghi nho thiet bi nay action only as a disabled Da ghi nho state for this already trusted machine. A bottom inset-free summary says Google Authenticator with Da bat and a navigation chevron. A quiet red Dang xuat tat ca thiet bi text action below. No activity feed in this selected view; it has its own left-navigation destination. This is the focused devices concept, deliberately fewer visible elements.',
  rows: 'A minimal wide dialog using horizontal tabs Bao mat (selected), Thiet bi, Hoat dong. Title Bao mat tai khoan. Large comfortable spacing and three clean full-width settings rows separated only by hairlines: Google Authenticator / Da bat / Quan ly; Thiet bi tin cay / May tinh - thiet bi hien tai / Xem thiet bi; Phien dang nhap / 1 phien dang hoat dong / Quan ly phien. Each row has a restrained outline icon, label and short secondary sentence, a compact green status when relevant and a right-pointing chevron. Below the rows put a compact activity preview showing only Ghi nho thiet bi - Hom nay, 12:57 and Xem hoat dong in one line. Destructive sign-out-all belongs to Quan ly phien, not this overview. This is the progressive-disclosure concept, inspired by Facebook Accounts Center simplicity while preserving An Khang branding.'
}
if (!directions[direction]) throw new Error('Unknown direction')
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base) throw new Error('NINEROUTER_URL missing')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: 'Bearer ' + process.env.NINEROUTER_KEY } : {}) }
const referencePath = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-476f3aaa-d029-4add-9464-21a95fbc386e.png'
const image = 'data:image/png;base64,' + (await readFile(referencePath)).toString('base64')
const prompt = `Create a realistic, production-quality Vietnamese desktop account-security UI design for AN KHANG HOME. The ONE attached screenshot is the AUTHORITATIVE reference for the existing security settings, trusted computer, session, recent security events and product color language. It shows the CURRENT confusing narrow stacked layout, not the desired layout. Preserve those capabilities and correct status semantics, the product identity, white/navy/emerald palette. Requested change: redesign this into a calm WIDE account settings panel with the clarity and familiarity of Google Account or Facebook Accounts Center. Do not copy their logos or brand identity. ${directions[direction]}
Canvas 1536x1024 landscape, one single complete desktop screen. Center an approximately 1160px wide by 760px tall settings dialog in the existing gently dimmed rental-management app context. Allow generous white margins within the dialog, fully visible top title and close X, no viewport clipping or tall scrolling list. This is intentionally a contained settings panel because the source product uses a modal. Product brand AN KHANG HOME small in header; strong title and concise subtitle, never an enormous logo or illustration. Use existing Inter-like Vietnamese product typography, navy #102038 headings, muted #66748a secondary text, emerald #008f62 only for emphasis. Body 16-18px at this output resolution. Thin dividers, lightly rounded corners, clean outline icons, discreet shadow. Information hierarchy and rows take precedence over panels and cards. The title must be comfortably separated from navigation.
All actual interface labels must be correctly accented Vietnamese, including labels described without accents above. Date anchor 2026-10-10, use Hom nay rendered Hôm nay, 12:57 or 10/10/2026. Trusted-device expiry 09/11/2026 is grounded in the attached screenshot. This is realistic illustrative data, not an invented security assessment. Authenticator is enabled in the current implemented product; do not show a security score or assurance that the account is perfectly safe. No secrets, QR codes, user email, names of real users or passwords. One trusted computer and one current session only. Avoid: giant repeated full-width gray buttons, every event in its own card, nested cards, excessive badges, dense audit logs, seconds in every timestamp, admin metrics, fake security scores, decorative hero imagery, purple, neon, glassmorphism, Google/Facebook logos, English UI, cropped Vietnamese labels, browser/OS chrome, watermark, multiple screens or collage. Prefer spacing, alignment and dividers to boxes. Produce the redesigned UI image only.`
await writeFile(new URL(`./${direction}-prompt.txt`, import.meta.url), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalog = await fetch(base + '/v1/models/image', { headers, signal: AbortSignal.timeout(15000) })
    const models = await catalog.json()
    const model = 'cx/gpt-5.5-image'
    if (!catalog.ok || !models.data?.some(item => item.id === model)) throw new Error('Required image model unavailable')
    console.log(`${direction}: generating, attempt ${attempt}`)
    const response = await fetch(base + '/v1/images/generations', { method: 'POST', headers, body: JSON.stringify({ model, prompt, images: [image], n: 1, size: '1536x1024', quality: 'high', response_format: 'b64_json', output_format: 'png', image_detail: 'high' }), signal: AbortSignal.timeout(240000) })
    if (!response.ok) throw new Error('Image generation HTTP ' + response.status)
    const result = await response.json()
    if (!result.data?.[0]?.b64_json) throw new Error('Image response missing base64')
    await writeFile(new URL(`./${direction}.png`, import.meta.url), Buffer.from(result.data[0].b64_json, 'base64'))
    console.log(`${direction}: image saved`)
    process.exit(0)
  } catch (error) {
    console.log(`${direction}: ${error.message}`)
    if (attempt === 3) process.exit(1)
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}
