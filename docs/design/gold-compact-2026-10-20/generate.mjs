import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const directions = {
  ribbon: `Concept name: Unified market ribbon. Put the page title and buy/sell/history controls on ONE compact header row. Below, present market quotes in a single horizontal editorial band: gold product and source at left, shop buy price in emerald at middle left, shop sell price in amber at middle right, spread at right. No individual bordered price cards. Separate with subtle vertical rules only. Place the restrained history chart directly below that same market surface, approximately 210px tall, with its time-range controls on its header. Beneath a simple divider put two balanced SIDE-BY-SIDE short empty sections: 'Vàng đang nắm giữ' on left, 'Giao dịch gần đây' on right. Each empty section is only about 120px high, no fake table headers. The main content is concise and finishes comfortably within the viewport. Use a broad calm horizontal rhythm, beautiful numerical alignment, small line icons.`,
  split: `Concept name: Trading workspace. Put the page title and buy/sell/history controls on ONE compact header row. Main workspace is asymmetric TWO columns: narrow left quote column about 340px wide, broad right price-history chart. Quote column is open typography on the base surface, gold product then buy/sell stacked numbers separated by subtle rules, spread as small footer; chart is a single low-contrast navy surface 300px high, time filters in its heading. Under that workspace, use one clean full-width tabbed data section: active 'Vàng đang nắm giữ (0)' and inactive 'Giao dịch gần đây (0)'. Show a compact active empty-state row, not a tall empty table; text 'Chưa có vàng đang nắm giữ' with supporting 'Ghi nhận giao dịch mua để bắt đầu theo dõi.' Tabs make both existing functions accessible while reducing duplicate empty panels. This direction must visually differ from a horizontal quote strip. Do not add a duplicated add/buy button inside the empty area.`,
  portfolio: `Concept name: Portfolio first. Header title 'Vàng' with compact Mua vàng primary, Bán vàng secondary, and Lịch sử giao dịch (0) text action on the right. Immediately beneath, show a slim full-width inline quote ribbon of product, buy price, sell price, spread and small refresh, with no large panel. Main area is a two-thirds / one-third arrangement focused on OWNED assets: a broad left section 'Vàng đang nắm giữ' with a very restrained compact empty state, a narrow right section 'Giao dịch gần đây' with an equally short empty state. Both use simple separators, not nested cards; no invented balances. BELOW both sections place an expanded slim disclosure labelled 'Lịch sử giá · Vàng MH 9999' with a small chevron, time controls, and a shallow 160px high authentic chart. This keeps the market history secondary and able to collapse later without removing it. Clear visual priority is portfolio, not market chart. Keep all three content areas visible and top-aligned, total content around 650px high, normal breathing room below.`
}

const key = process.argv[2]
if (key === 'all') {
  let remaining = Object.keys(directions).length
  let failed = false
  for (const direction of Object.keys(directions)) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), direction], { stdio: 'inherit', windowsHide: true })
    child.on('error', error => { console.error(error.message); failed = true })
    child.on('close', code => { if (code !== 0) failed = true; if (--remaining === 0) process.exit(failed ? 1 : 0) })
  }
} else {
  if (!directions[key]) throw new Error('Unknown direction')
  const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
  if (!base) throw new Error('NINEROUTER_URL unavailable')
  const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
  const source = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-c9cb1f0a-3f84-47ff-b00f-61c215d47d7d.png'
  const reference = 'data:image/png;base64,' + (await readFile(source)).toString('base64')
  const prompt = `Use case: ui-mockup. Create ONE realistic production-quality Vietnamese desktop UI redesign image for the Gold investment module of AN KHANG HOME. Output a standalone complete app screenshot, not a design presentation.
AUTHORITATIVE REFERENCE: the ONE attached current product screenshot, 1911x1026. Preserve the existing AN KHANG HOME branding and top app navigation, its 212px left investment sidebar and selected 'Vàng' item, familiar dark navy/emerald identity, app window shape, Vietnamese language, and existing business functions. Only redesign the content to the right of the sidebar below the top navigation. This is the same app, not a new product. Read the actual reference visually.
EXACT REQUESTED CHANGE: make this module significantly more compact, orderly, legible, less boxed-in, with fewer nested frames and much shorter zero-data states. Reduce wasted vertical space so market quotes, price history, holdings and recent activity are understandable on ONE screen. Use typography, alignment, grouping and restrained rules first. Do not put cards inside cards. One clear primary action 'Mua vàng', secondary 'Bán vàng', access to 'Lịch sử giao dịch (0)', source refresh, and existing chart period controls remain available. Consolidate the duplicate '+ Thêm' action into 'Mua vàng' instead of repeating it. Do not show an unusable 'Xem chi tiết' button for an empty holding list.
TARGET DIMENSIONS: 1911x1026 landscape desktop frame, same natural proportions as attached. No stretch or distortion. Main content gets about 1500px width with sensible side padding, about 16-24px gutters. Body text around 14-16px, restrained 24-28px headings, quote numbers around 28-32px; labels sharp and readable with correct Vietnamese accents. No oversized controls; comfortable 36-40px button heights. Match existing Inter-like sans font. Existing actual tokens: background #0b111b, navy panels #111a28, raised #162235, muted #8fa1b5, text #e7eef7, subtle border #26364a, emerald #21d38a. Use amber #f4b95f only for gold/ask-price accents. Very subtle original green-tinted background glow is acceptable, no heavy gradients.
DESIGN DIRECTION: ${directions[key]}
DATA AND ACCURACY: title 'Vàng'. Market section 'Giá vàng Mỹ Hạnh'; product 'Vàng MH 9999 · Mỹ Hạnh Hà Đông'; source 'Tuấn Quảng Đông'; update '19:01 · 20/10/2026'; unit caption '1 lượng = 10 chỉ'. Shop BUY label 'Tiệm mua vào', value '13.250.000 đ/chỉ', supporting '132.500.000 đ/lượng'. Shop SELL label 'Tiệm bán ra', value '13.550.000 đ/chỉ', supporting '135.500.000 đ/lượng'. Spread label 'Chênh lệch mua – bán', value '300.000 đ/chỉ'. Do not confuse shop buy/sell prices with user's action. Chart title 'Lịch sử giá · Vàng MH 9999', period control '30 ngày', '90 ngày', '1 năm'. Only TWO actual price observations are known: 19/10/2026 and 20/10/2026, SAME buy and sell values at both points. Show honest sparse straight lines with endpoint dots, buy emerald and sell amber, faint grid and readable axes; don't fabricate fluctuations or a year of data. Small chart note 'Chỉ hiển thị dữ liệu đã ghi nhận trên máy'. No invented trend percentages. Holdings count zero, transactions count zero. Show actual empty states 'Chưa có vàng đang nắm giữ' and 'Chưa có giao dịch'. No fake assets, transactions, account balances or P&L. The data date anchor is TODAY 20 October 2026 Vietnam UTC+7, preserve the update time exactly.
LAYOUT QUALITY: visually intentional and polished but understated. Spacious enough to scan, compact enough that all essential sections fit without a scrollbar cutting off lower content. Normal blank page space below the content is fine; do not stretch empty states to fill the page. Keep top app shell faithful and navigation readable. No tiny microtext. No huge repeated frames. Clear alignment and crisp contrast.
Avoid: new feature inventory, unrelated metrics or summary cards, fabricated portfolio holdings or historical data, excessive nested boxes, repeated buy buttons, giant empty tables, gold bar illustrations, decorative 3D assets, flashy neon, glassmorphism, purple or light theme, giant headlines, illegible muted text, clipped labels, app shell redesign, phone/device mockups, browser address bar, annotations, callout arrows, design comparison collages, multiple screens, concept titles/numbers, watermark. Output ONE finished UI image only.`
  await writeFile(new URL(`./${key}-prompt.txt`, import.meta.url), prompt)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const catalogResponse = await fetch(base + '/v1/models/image', { headers, signal: AbortSignal.timeout(20000) })
      if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
      const catalog = await catalogResponse.json()
      const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
      if (!catalog.data?.some(item => item.id === model)) throw new Error('Selected model absent from current catalog')
      console.log(`${key}: generating ${model}, attempt ${attempt}`)
      const response = await fetch(base + '/v1/images/generations', {
        method: 'POST', headers, signal: AbortSignal.timeout(240000),
        body: JSON.stringify({ model, prompt, images: [reference], size: '1911x1026', n: 1, quality: 'high', image_detail: 'high', output_format: 'png', response_format: 'b64_json' })
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(`Generation HTTP ${response.status}: ${raw.slice(0, 160)}`)
      let result
      try { result = JSON.parse(raw) } catch {
        for (const line of raw.split('\n')) if (line.startsWith('data:')) {
          try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) result = event } catch { /* SSE keepalive. */ }
        }
      }
      const b64 = result?.data?.[0]?.b64_json || result?.b64_json
      if (!b64) throw new Error('Provider returned no image bytes')
      await writeFile(new URL(`./${key}.png`, import.meta.url), Buffer.from(b64, 'base64'))
      await writeFile(new URL(`./${key}-generation.json`, import.meta.url), JSON.stringify({ model, generatedAt: new Date().toISOString(), source, purpose: 'Compact Gold module visual demo only; no application changes.' }, null, 2))
      console.log(`${key}: saved`)
      break
    } catch (error) {
      console.error(`${key} attempt ${attempt}: ${error.message}`)
      if (attempt === 3 || /HTTP 40[013]|absent from current catalog|not supported when using/.test(error.message)) { process.exitCode = 1; break }
    }
  }
}
