import { readFile, writeFile } from 'node:fs/promises'
const variant = Number(process.argv[2])
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base || ![1, 2, 3].includes(variant)) throw new Error('Missing gateway or variant')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: 'Bearer ' + process.env.NINEROUTER_KEY } : {}) }
const image = 'data:image/png;base64,' + (await readFile('C:/Users/Admin/AppData/Local/Temp/codex-clipboard-d15b0909-bae3-4c84-9b96-835c9f7dc5ef.png')).toString('base64')
const direction = {
  1: 'Modern command palette: a floating profile popover with a slim navy identity rail on the left and a clean white content area on the right. Use strong 2026 product typography, asymmetric alignment, one compact profile row, one compact security row with a green “Bật 2FA” status, and a quiet sign-out footer. No stacked giant cards.',
  2: 'Modern app sheet: a wide rounded profile panel with a dark navy top strip, avatar overlapping the boundary, horizontal segmented navigation “Tổng quan / Bảo mật”, and a clean list of account controls. Use thin dividers, small labels, active green underline, generous whitespace, and one amber security notice for Google Authenticator. Contemporary SaaS product design, no card grid.',
  3: 'Modern editorial account center: a near-full-height narrow panel with a dark navy gradient header, avatar and identity aligned horizontally, then a simple grouped list with monochrome line icons and one vivid emerald security CTA. Use a premium fintech-inspired layout, high contrast typography, subtle background texture and almost no shadows. Make the security state and next action obvious.'
}[variant]
const prompt = `Redesign the attached screenshot into a modern 2026 desktop account profile UI for AN KHANG HOME, a Vietnamese rental-management app. The attached screenshot is the authoritative reference for brand, avatar, identity and current product context, but the requested result must feel materially more modern and redesigned rather than a polished copy. Preserve the illustrated female avatar and show the Vietnamese name Đào Bình Yên with admin role. ${direction} Use correct Vietnamese labels with accents. Target 1024x1024, one single UI screen, natural component proportions, no device frame or browser chrome. Keep navy, warm white, emerald green and a controlled amber accent. Show Google Authenticator as not yet enabled; do not invent verified security claims. Clean contemporary typography, precise spacing, intentional asymmetry, realistic production interface. Avoid purple, glassmorphism, neon, generic dashboard grids, excessive cards, fake metrics, English labels, clipped text, QR secrets, passwords, multiple concepts in one image, watermarks and promotional captions.`
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalog = await fetch(base + '/v1/models/image', { headers, signal: AbortSignal.timeout(15000) })
    const models = await catalog.json()
    const model = 'cx/gpt-5.5-image'
    if (!catalog.ok || !models.data?.some(item => item.id === model)) throw new Error('Required image model unavailable')
    const response = await fetch(base + '/v1/images/generations', { method: 'POST', headers, body: JSON.stringify({ model, prompt, images: [image], n: 1, size: '1024x1024', quality: 'high', response_format: 'b64_json', output_format: 'png', image_detail: 'high' }), signal: AbortSignal.timeout(240000) })
    const raw = await response.text()
    if (!response.ok) throw new Error('Generation HTTP ' + response.status + ': ' + raw.slice(0, 220))
    const b64 = JSON.parse(raw).data?.[0]?.b64_json
    if (!b64) throw new Error('Provider returned no image')
    await writeFile(new URL(`./modern-${variant}.png`, import.meta.url), Buffer.from(b64, 'base64'))
    console.log(`SAVED modern-${variant}.png`)
    process.exit(0)
  } catch (error) {
    console.log(`variant ${variant} attempt ${attempt}: ${error.message}`)
    if (attempt === 3) process.exit(1)
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}
