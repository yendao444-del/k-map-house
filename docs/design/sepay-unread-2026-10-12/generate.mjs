import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const directions = {
  tint: `Preserve the original one-column transaction cards. At the section header show a small blue pill '2 chưa xem'. First two cards are unseen: clear but restrained emerald-tinted background #e9f8f1, firmer emerald border, dark navy bold tenant and amount, tiny BLUE dot and label 'Chưa xem' beside the room badge, and a small text action 'Đã xem' at the far right of the bottom line. Third card is already seen: almost-white mint background, light border, normal-weight readable slate text, tiny gray check and label 'Đã xem'. Keep the paid status green 'Đã chuyển khoản' badge on ALL three cards, distinct from the blue unread badge. Use tint and typography as the dominant distinction. No unrelated controls.`,
  groups: `Reorganize ONLY the transaction history area into two calm groups in the existing same-width single column: first group heading 'CHƯA XEM' with small blue count '2', two clearly emphasized mint transaction cards with dark bold typography and blue dot; then thin divider and heading 'ĐÃ XEM' with muted check, followed by one near-white muted but fully readable card. Unseen card has the subtle text action 'Đã xem' in its bottom right. Retain the independent green 'Đã chuyển khoản' status on all three. Grouping and light divider are the dominant distinction. No extra filters or dashboard metrics.`,
  rail: `Keep the transaction cards in chronological order in one column. At history section header show small blue dot and text '2 giao dịch chưa xem'. First two unseen cards each have a restrained 3px deep emerald accent rail at the left, gentle emerald tint, dark bold names and amounts, and a tiny blue 'Mới' pill aligned at the top right immediately beside the timestamp. A subtle outlined eye icon with text 'Đã xem' is placed at each unseen card bottom right. The third seen card has no accent rail, near-white neutral surface, medium slate text and small gray check 'Đã xem' at the top right. All three still have independent green paid status 'Đã chuyển khoản'. Accent rail and top-right unread marker are the dominant distinction. Do not darken the whole card or lower the opacity of its text.`
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
  const source = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-3136d26a-c7ec-4e6c-91d8-14e3fbe8de5e.png'
  const reference = 'data:image/png;base64,' + (await readFile(source)).toString('base64')
  const prompt = `Use case: ui-mockup. Create ONE realistic production-quality Vietnamese UI image demonstrating unread versus read SePay bank transactions in AN KHANG HOME rental management.
AUTHORITATIVE REFERENCE: the ONE attached image is the user's CURRENT SePay dialog, 938x850. Preserve its centered white modal, rounded corners, softly dimmed blurred app behind it, light blue header, blue sync icon, title 'Đồng bộ lịch sử SePay', subtitle 'Tự động đối chiếu ngân hàng với hóa đơn', small close x, source typography, blue search area, compact green bank-paid badges, transaction card information hierarchy, and fixed white footer with 'Nghe thử' and 'Đóng băng'. Keep the familiar source UI, not a wholesale redesign.
EXACT CHANGE: help the manager immediately identify newly arrived bank transactions they have NOT looked at, with stronger background and font emphasis; already-viewed transactions have a lighter subdued background while all text stays comfortably readable. Read/unread is ONLY an attention status, NOT a payment or reconciliation status. Show an independent paid 'Đã chuyển khoản' badge in all examples. Do not equate seeing a transaction with receiving, posting or matching money.
TARGET canvas 938x850, same natural aspect ratio as reference, one full modal visible and complete footer. To make the comparison visible in this one screen, ONLY condense the huge empty-state area to a modest inline check and one-line 'Không có giao dịch chờ xử lý' near the top. Keep the search field beneath with label 'TÌM GIAO DỊCH SEPAY', placeholder 'Tìm mã giao dịch, phòng hoặc khách thuê…', caption 'Đang hiển thị 3 giao dịch gần nhất'. History section title 'GIAO DỊCH SEPAY GẦN NHẤT'. Fit THREE complete compact cards, two unread followed by one read. Each card includes room badge, fake name, fake phone, bold amount, compact status row, transfer reference, invoice month, bank and masked account, and two-line date + precise HH:mm:ss top-right. Do not crowd or clip the bottom card. Use spacing and hierarchy before borders; shadows only on the overall modal as in source.
DESIGN DIRECTION: ${directions[key]}
MOCK DATA only: card 1 'Phòng 151', 'Nguyễn An', '0900000001', '3.551.000 đ', date '12/10/2026', time '13:34:40', paid; card 2 'Phòng 361', 'Trần Bình', '0900000002', '2.350.000 đ', date '12/10/2026', time '11:08:12', paid; card 3 'Phòng 162', 'Lê Chi', '0900000003', '2.800.000 đ', date '11/10/2026', time '16:25:03', paid and seen. Reference 'DEMO-P151-1012', analogous for others. Bank BIDV, masked account '•••• 2931'. Invoice 'Thu tiền tháng 10/2026'. Keep transferred status succinct and independent; do not include long duplicated confirmation sentences. Anchor date today 12 October 2026 Vietnam UTC+7. All Vietnamese diacritics must be correct, crisp Inter-like type, balanced navy/slate hierarchy, original blue and mint palette, body readable, no clipped text. Use dark type for new and medium slate for seen; lighter background does NOT mean illegible opacity.
Avoid: real personal names, phones or bank accounts from attached reference; redesigning other modules; red unread states suggesting payment error; treating all new transactions as unpaid; huge solid green cards, low-contrast washed-out text, excessive badges, new navbar or sidebar, charts, metrics, gradients, glass effects, gold/purple theme, giant buttons, browser/OS chrome, explanatory arrows, collage, numbered concept labels, watermark, multiple screens. Output one finished UI image only.`
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
        body: JSON.stringify({ model, prompt, images: [reference], size: '938x850', n: 1, quality: 'high', image_detail: 'high', output_format: 'png', response_format: 'b64_json' })
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
      await writeFile(new URL(`./${key}-generation.json`, import.meta.url), JSON.stringify({ model, generatedAt: new Date().toISOString(), source, purpose: 'Unread/read SePay visual demo only; no application changes.' }, null, 2))
      console.log(`${key}: saved`)
      break
    } catch (error) {
      console.error(`${key} attempt ${attempt}: ${error.message}`)
      if (attempt === 3 || /HTTP 40[13]|absent from current catalog/.test(error.message)) { process.exitCode = 1; break }
    }
  }
}
