import fs from 'node:fs/promises'
import path from 'node:path'

const base = process.env.NINEROUTER_URL
if (!base) throw new Error('Missing NINEROUTER_URL')
const headers = { 'Content-Type': 'application/json' }
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`
const source = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-38a18aa9-0ae1-4f51-b3fd-5cae6689ce7c.png'
const image = 'data:image/png;base64,' + (await fs.readFile(source)).toString('base64')
const dir = path.resolve('design-references/investment-funding-confirmation')
const prompt = `Create one realistic production-quality desktop finance UI image. Exact target canvas 820 x 845 pixels, same framing and aspect ratio as the attached screenshot. Current date 20 October 2026. Preserve reference dates and monetary values.
AUTHORITATIVE REFERENCE: the attached current Electron application screenshot is the sole source of truth for the product design and context. This is a precise redesign of ONLY the white Windows confirmation dialog in the center. The underlying application and gold-purchase form must remain in the same positions, with the same navy surfaces, emerald brand accents, sans-serif typography, values and hierarchy. Keep the underlying form visible but dimmed behind the new confirmation overlay.
EXACT REQUESTED CHANGE: replace the white operating-system dialog, including its DBY HOME title bar and stock OK/Cancel buttons, with a bespoke premium in-app confirmation modal. Place it centered above the gold-purchase form, approximately 548 px wide and 470 px tall. Use dark navy #101c2c surface, subtle blue-slate 1px edge, 20 px rounded corners, controlled soft shadow. Header uses a small mint wallet/transfer outline icon in a restrained tinted square, title 'Xác nhận chuyển vốn' in crisp warm-white 22px semibold and a small close X at upper right. Subtitle 'Bổ sung phần thiếu từ Ví phòng trọ để mua vàng.' in muted slate, 14px. No Windows chrome.
Content is a single composed surface with precise aligned rows and quiet separators, no cards nested inside cards. First two rows: 'Tổng tiền mua' aligned left with '13.330.000 đ' aligned right; 'Ví đầu tư hiện có' with '0 đ'. Then a more prominent amount group labeled 'Cần chuyển từ Ví phòng trọ', with '13.330.000 đ' in 30px emerald tabular numerals, and an understated source line with thin bank icon 'Nguồn tiền: Ngân hàng'. Below a simple separator, show 'Ví phòng trọ sau giao dịch' and '20.084.682 đ'. A small clear line 'Chỉ chuyển phần thiếu. Giao dịch được ghi vào lịch sử.' Keep all Vietnamese fully accented, readable and unclipped. Body 14px minimum. Generous but compact vertical rhythm with 24px padding.
Footer buttons on one row, 46px tall: secondary 'Hủy' dark slate outlined, about 100px wide; primary 'Xác nhận chuyển & mua' about 330px wide, emerald green matching the existing app's premium Electron controls, white semibold label and thin right-arrow icon. Add subtle diagonal translucent geometric facets inside the emerald button, clipped to its 10px rounded rectangle, at low 8-12% opacity; this should feel consistent with premium green product actions, never noisy. Footer separation subtle. Primary button must dominate. This is a money-movement confirmation and must feel clear and deliberate.
PRESERVE: all background form geometry, gold product Vàng MH 9999 · Mỹ Hạnh, dark Electron theme, the 13.330.000 đ purchase and transfer amount, existing underlying green action, original full-frame screenshot composition. Only replace the confirmation overlay and dim the background naturally.
AVOID: white system dialogs, browser alert styling, Windows title bars, OK/Cancel English labels, bright neon glow, gold decoration, dramatic gradients, glass transparency on modal, tiny text, busy cards, extra toggles or checkboxes, new navigation, changed money amounts, clipped or misspelled Vietnamese, multiple alternatives, device bezel, explanatory annotations, screenshots rendered via HTML/CSS. Output one complete edited screenshot.`
await fs.mkdir(dir, { recursive: true })
await fs.writeFile(path.join(dir, 'prompt.txt'), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(30000) })
    if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
    const catalog = await catalogResponse.json()
    const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
    if (!catalog.data?.some(m => m.id === model)) throw new Error('Selected image model unavailable')
    console.log(`Generating ${model}, attempt ${attempt}`)
    const response = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers, signal: AbortSignal.timeout(240000),
      body: JSON.stringify({ model, prompt, image, size: '820x845', n: 1, response_format: 'b64_json' })
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${raw.slice(0, 500)}`)
    let result
    try { result = JSON.parse(raw) } catch {
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try { const event = JSON.parse(line.slice(6)); if (event.data?.[0]?.b64_json || event.b64_json) result = event } catch {}
      }
    }
    const b64 = result?.data?.[0]?.b64_json || result?.b64_json
    if (!b64) throw new Error('Provider returned no image bytes')
    const dest = path.join(dir, 'premium-confirmation.png')
    await fs.writeFile(dest, Buffer.from(b64, 'base64'))
    console.log(dest)
    break
  } catch (error) {
    console.error(`Attempt ${attempt}: ${error.message}`)
    if (attempt === 3) process.exitCode = 1
  }
}
