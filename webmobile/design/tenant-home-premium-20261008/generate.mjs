import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const direction = process.argv[2]
const directions = {
  'quiet-editorial': 'QUIET EDITORIAL: Keep a slender forest-green logo/header strip with hamburger left. On the plain off-white surface, use a small greeting and medium tenant name above a strong but restrained Phòng 999 heading. A polished compact two-column room facts block with hairline dividers rather than cards. Utilities form one refined grouped surface with Điện and Nước columns, clearly separating rate and move-in reading. Internet and cleaning occupy two neat rows. Inventory is a simple compact flat list with small outline icons, name and condition left, quantity right. Payment empty state is a narrow pale mint footer band. Warm, precise, calm, premium service design.',
  'room-summary': 'ROOM SUMMARY: Small white logo in a forest-green top header with left hamburger. Use one beautiful dark forest-green room summary area integrated directly under the header: greeting/name, Phòng 999, floor, monthly rent, start date, invoice day in a disciplined compact grid, white typography and bright green restrained highlights. All other sections sit on a pale neutral page surface, without nested cards. Utilities are a clean horizontal table with two rows Điện and Nước, columns Đơn giá and Khi nhận phòng. Internet and cleaning appear as understated aligned rows below. Inventory is a plain list, visible in full. Payment empty state last. Premium property service feel with a strong room overview, no decorative imagery.',
  'structured-ledger': 'STRUCTURED LEDGER: Low forest-green brand header, white logo and left menu. Greeting and name on one quiet line; Phòng 999 with Tầng 1 below. No floor area is available; absolutely never show 25 m² or any other area. Keep the logo header much shorter, approximately 64 logical pixels, and Phòng 999 only 28 logical pixels, not a giant heading. The room details must be one compact group with each label-value row approximately 36 logical pixels. One highly refined white ledger surface on the off-white background, using tiny mint outline section icons and hairline row separators. First room facts as a tight label/value definition list; then a clearly labelled Điện nước & dịch vụ area with a compact real table showing two utility rows and columns for rate and move-in reading; internet and cleaning as two tidy rows. Inventory follows directly with readable flat rows and quantities. Payment empty state is a light neutral one-line note. Premium through excellent typography, aligned number columns, balanced whitespace; no boxed dashboard tiles.'
}
if (!directions[direction]) throw new Error('Unknown direction')
const dir = path.dirname(fileURLToPath(import.meta.url))
const reference = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-ef22c0d1-e6aa-4134-81dd-12017adff6e4.png'
const output = path.join(dir, `${direction}-current.png`)
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base) throw new Error('NINEROUTER_URL is unavailable')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
const image = `data:image/png;base64,${(await readFile(reference)).toString('base64')}`
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
const prompt = `Create ONE realistic production-quality image demo of a redesigned Vietnamese MOBILE tenant website homepage for AN KHANG HOME. This is a mobile website, not Electron admin. Target logical viewport 390 x 844, portrait; deliver app content only, with one complete focused screen. Fit the required information cleanly in this viewport with readable 13-16px body typography at logical mobile scale, purposeful spacing and no clipping. Never stretch or squash UI. Do not include a device, OS or browser frame.

AUTHORITATIVE REFERENCE: the single attached codex-clipboard-ef22c0d1-e6aa-4134-81dd-12017adff6e4.png is the CURRENT implemented tenant homepage screenshot supplied by the user in this turn. Preserve its exact AN KHANG HOME AK logo shapes, wordmark, green branding, left hamburger menu, Vietnamese language, and all existing room/utility/inventory information. This is the current compact homepage, not a stale older screen. The large empty area below the app content and outer browser border in the reference are NOT required; remove that waste in the proposed mobile composition. Do not add missing room area.

EXACT REQUESTED CHANGE: make the existing homepage feel more premium and compact using better hierarchy, alignment, grouped information and restrained spacing. Show all room information, utility rates, move-in readings and assets DIRECTLY on the homepage. Do not hide details behind cards, links, dropdowns or another screen. Existing palette: forest #064A31, green #00AB60, ink #15231D, off-white #F7FAF8, mint #EDF9F1, line #E5EEE8, muted #68766F. Keep the logo faithful. Premium means disciplined UI, not gold, decoration or fancy illustrations. Prefer same-surface grouping and hairline dividers over many cards; no cards inside cards. One font: Inter or equivalent clean Vietnamese sans serif. Use small matching outline icons only.

CURRENT DATE ANCHOR 08/10/2026 UTC+7. Preserve the source start date 8/10/2026. REQUIRED VISIBLE CONTENT, clearly readable, no truncation: Xin chào; tenant name Đỗ Kim Ngân; Phòng 999; Tầng 1; Giá thuê 3.500.000đ/tháng; Ngày bắt đầu 8/10/2026; Ngày lập hóa đơn: ngày 5 hằng tháng. Utilities Điện: Đơn giá 3.200đ/kWh, Chỉ số khi nhận phòng 10 kWh. Nước: Đơn giá 35.000đ/m³, Chỉ số khi nhận phòng 10 m³. You may use a shorter column heading Khi nhận phòng for a table but make its meaning explicit. These are MOVE-IN readings, never current readings, monthly consumption or amounts payable. Internet 50.000đ/tháng, Vệ sinh 70.000đ/tháng. Tài sản trong phòng: Bóng đèn — Hoạt động tốt — SL 1; Thiết bị vệ sinh — Hoạt động tốt — SL 1. Include a discreet refresh control near the inventory heading. Thanh toán — Chưa có hóa đơn mới trên website. Preserve all Vietnamese accents exactly. Clear visually distinguished electric/water headings but no new colors beyond brand green. Keep BOTH inventory rows visible. Do not introduce any additional assets, area or facts.

VISUAL DIRECTION: ${directions[direction]}

Avoid: gold or blue palette, gradient effects, glass styling, large shadows, decorative graphics, room photos, marketing hero, metrics, charts, fake payment totals, QR codes, extra account data, old tenant history, fake verified badges, billing due CTA when no invoice exists, hidden assets, truncation, microtext, tall empty padding, many nested bordered cards, bottom tab bars, logout in header, new workflows, OS status bar, phone bezel, device mockups, numeric option labels, multiple concepts in one image, developer notes. This is an IMAGE DEMO awaiting approval, not a code implementation.`

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(20000) })
    if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
    const catalog = await catalogResponse.json()
    if (!catalog.data?.some(item => item.id === model)) throw new Error('Requested image model is unavailable')
    console.log(`${direction}: generating (attempt ${attempt})`)
    const response = await fetch(`${base}/v1/images/generations`, { method:'POST', headers, body:JSON.stringify({ model, prompt, image, n:1, size:'1024x1536', response_format:'b64_json' }), signal:AbortSignal.timeout(300000) })
    const raw = await response.text()
    if (!response.ok) throw new Error(`Generation HTTP ${response.status}`)
    let payload
    try { payload = JSON.parse(raw) } catch {
      for (const line of raw.split('\n')) if (line.startsWith('data:')) {
        try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) payload = event } catch {}
      }
    }
    const encoded = payload?.data?.[0]?.b64_json || payload?.b64_json
    if (!encoded) throw new Error('Provider returned no image bytes')
    await writeFile(output, Buffer.from(encoded,'base64'))
    await writeFile(output.replace('.png','.json'), JSON.stringify({ direction, model, reference, prompt, output, status:'proposal-not-approved' },null,2)+'\n')
    console.log(output)
    break
  } catch (cause) {
    console.error(`${direction}: attempt ${attempt}: ${cause.message}`)
    if (attempt === 3 || /401|403|unavailable/.test(cause.message)) throw cause
  }
}
