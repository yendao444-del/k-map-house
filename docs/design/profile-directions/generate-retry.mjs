import { readFile, writeFile } from 'node:fs/promises'
const variant = Number(process.argv[2])
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base || ![1, 2, 3].includes(variant)) throw new Error('Missing gateway or variant')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: 'Bearer ' + process.env.NINEROUTER_KEY } : {}) }
const image = 'data:image/png;base64,' + (await readFile('C:/Users/Admin/AppData/Local/Temp/codex-clipboard-d15b0909-bae3-4c84-9b96-835c9f7dc5ef.png')).toString('base64')
const direction = {
  1: 'Identity first. A tall compact popup, centered avatar and name in a refined navy upper section, then warm white lower surface with two generous horizontal navigation rows Ho so and Bao mat, ending in quiet red sign out. A small honest status line says Chua bat xac thuc 2 buoc. Elegant restraint, balanced breathing room.',
  2: 'Account settings panel. Wider compact panel with left aligned avatar/name header, two clean tabs Ho so and Bao mat. Bao mat selected. Show a focused Google Authenticator section with status Chua bat and primary Bat xac thuc 2 buoc button. A secondary password change row and small device management link. No overwhelming feature inventory.',
  3: 'Navy editorial profile popup. Compact horizontal avatar/name identity header, fine divider, generously spaced grouped action list Ho so ca nhan, Bao mat tai khoan, Phien dang nhap. One warm ivory security callout with a small shield, Chua bat xac thuc 2 buoc and a Thiet lap button. Sign out separated at bottom. Use a slim emerald accent, subtle depth, distinct from centered identity card.'
}[variant]
const prompt = `Create a realistic premium production UI design for the AN KHANG HOME desktop rental management account/profile panel. The attached screenshot is the ONE AUTHORITATIVE reference. Preserve the existing illustrated female avatar, display name Dao Binh Yen (render Vietnamese correctly as Đào Bình Yên), admin identity, navy/white/emerald product palette and compact avatar-popup context. Requested change: redesign its visual hierarchy, typography, spacing and profile/security entry points to look premium and prepare for future Google Authenticator enrollment. ${direction} Render all actual interface labels in correct Vietnamese with accents. Target canvas 1024x1024, a single component at natural proportions centered with a quiet light neutral background; panel about 470-620px wide, text 18-24px at this output scale, no clipping. One design only per image, not a comparison board. Rounded corners 20px, restrained shadow, detailed subtle navy gradients, clean readable typography. Current date 2026-10-09 if needed; omit dates. This is a proposed design, MFA is not enabled yet: never show enabled/verified device/security claims. Avoid fake security scores, fake charts, purple, neon/glass clutter, card-inside-card grids, large empty header, English UI labels, QR secrets, password values, multiple screens, phones, browser chrome, Windows chrome, watermarks and promotional captions.`
await writeFile(new URL(`./retry-${variant}-prompt.txt`, import.meta.url), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalog = await fetch(base + '/v1/models/image', { headers, signal: AbortSignal.timeout(15000) })
    if (!catalog.ok) throw new Error('Catalog HTTP ' + catalog.status)
    const models = await catalog.json()
    const model = 'cx/gpt-5.5-image'
    if (!models.data?.some(m => m.id === model)) throw new Error('Required image model unavailable')
    console.log(`Variant ${variant}, attempt ${attempt}, model ${model}`)
    const response = await fetch(base + '/v1/images/generations', { method: 'POST', headers, body: JSON.stringify({ model, prompt, images: [image], n: 1, size: '1024x1024', quality: 'high', response_format: 'b64_json', output_format: 'png', image_detail: 'high' }), signal: AbortSignal.timeout(240000) })
    const raw = await response.text()
    if (!response.ok) throw new Error('Generation HTTP ' + response.status + ': ' + raw.slice(0, 250))
    const result = JSON.parse(raw)
    const b64 = result.data?.[0]?.b64_json
    if (!b64) throw new Error('Provider returned no base64 image')
    const output = new URL(`./premium-navy-${variant}.png`, import.meta.url)
    await writeFile(output, Buffer.from(b64, 'base64'))
    console.log('SAVED ' + output.pathname)
    process.exit(0)
  } catch (error) {
    console.log(String(error.message))
    if (attempt === 3) process.exit(1)
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}
