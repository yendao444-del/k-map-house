const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
const dir = __dirname
async function generate({ reference, output, prompt }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(30000) })
      if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
      const catalog = await catalogResponse.json()
      if (!catalog.data?.some(entry => entry.id === model)) throw new Error(`Model ${model} unavailable`)
      const image = `data:image/png;base64,${fs.readFileSync(reference).toString('base64')}`
      const response = await fetch(`${base}/v1/images/generations`, {
        method: 'POST', headers,
        body: JSON.stringify({ model, prompt, image, n: 1, response_format: 'b64_json' }),
        signal: AbortSignal.timeout(300000),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(`Generation HTTP ${response.status}`)
      let payload
      try { payload = JSON.parse(raw) } catch {
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data:')) continue
          try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) payload = event } catch {}
        }
      }
      const encoded = payload?.data?.[0]?.b64_json || payload?.b64_json
      if (!encoded) throw new Error('Generation returned no b64_json image bytes')
      fs.writeFileSync(output, Buffer.from(encoded, 'base64'))
      return { output, model, reference, generatedAt: new Date().toISOString() }
    } catch (error) {
      console.error(`${path.basename(output)} attempt ${attempt}: ${error.message}`)
      if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error
    }
  }
}


async function main() {
  if (!base) throw new Error('NINEROUTER_URL missing')
  const reportRef = path.join(dir, 'ref-business-report-mobile.png')
  const transactionRef = path.join(dir, 'ref-transaction-mobile-header.png')
  await sharp('C:/Users/Admin/.codex/attachments/12dc8336-d251-427c-9d02-c538b31aa56d/image-1.png').extract({ left: 64, top: 53, width: 307, height: 603 }).png().toFile(reportRef)
  // Header-only crop: no customer financial amounts or transaction records are sent.
  await sharp('C:/Users/Admin/.codex/attachments/12dc8336-d251-427c-9d02-c538b31aa56d/image-2.png').extract({ left: 85, top: 53, width: 309, height: 189 }).png().toFile(transactionRef)
  if (process.argv.includes('--crop-only')) { console.log(reportRef); console.log(transactionRef); return }
  const shared = `Create one realistic production-quality mobile management PWA screen at 390 x 844 CSS pixels, app content only. Current date October 9, 2026. The attached screenshot crop is the AUTHORITATIVE existing AN KHANG HOME reference. Preserve emerald green identity, white/light canvas, Inter-like font, Vietnamese labels, source icons and bottom navigation labels 'Phòng', 'Hóa đơn', 'Tài chính', 'Thêm'. Preserve existing business meaning, not a new brand. Body text 14-16px; clear hierarchy, moderate compact spacing, comfortable 44px touch targets. All monetary values are synthetic demo values only. Avoid: device body, bezel, status bar, browser chrome, old update banner, ruler, dense desktop grids, horizontally clipped values, tiny type, irrelevant features, new charts merely to fill space, fake real-customer data, personal details, confusing revenue with profit or cash flow, excessive cards, marketing style, decorative illustrations, multiple concepts in one image.`
  const report = generate({ reference: reportRef, output: path.join(dir, 'business-report-mobile-demo.png'), prompt: shared + `
EXACT REQUESTED CHANGE: redesign the existing 'Kết quả kinh doanh' screen for a phone. Existing desktop table min-width hides money offscreen. Make all main amounts visible without horizontal scrolling. Top source app header (logo, bell, settings, avatar), short title 'Kết quả kinh doanh', date selector 'Tháng 10/2026'. Show concise profit summary 'Lợi nhuận thực' 12.000.000 đ, secondary rows 'Doanh thu thực thu' 30.000.000 đ and 'Chi phí vận hành' 18.000.000 đ. In 'Chi tiết theo khoản' show collapsible group headers with their amounts always visible: 'A. Doanh thu thực thu' +30.000.000 đ collapsed; 'B. Chi phí vận hành thực tế' 18.000.000 đ expanded. Label and amount can use two lines within each row to avoid cramped columns. A compact grouped list with divider rows 'Hóa đơn điện tổng' 8.000.000 đ; 'Hóa đơn nước tổng' 3.000.000 đ; 'Internet / wifi' 1.000.000 đ; 'Rác / vệ sinh' 1.000.000 đ; 'Bảo trì / sửa chữa' 2.000.000 đ; 'Lương / quản lý' 2.000.000 đ; 'Chi phí khác' 1.000.000 đ. Each amount is tappable for detail. If vertical space is insufficient, show first four items and natural vertical scrolling indication; never shrink labels to fit. Then visible compact profit total 'C. Lợi nhuận thực (A − B)' 12.000.000 đ and collapsed orange 'D. Khoản chi ngoài kinh doanh' 2.000.000 đ with clear small note 'Không tính vào lợi nhuận'. Do not subtract D from C. No big Export button on mobile, a subtle overflow icon is acceptable. Bottom nav 'Thêm' active. Output single focused screen, not a dashboard montage.` })
  const transactions = generate({ reference: transactionRef, output: path.join(dir, 'transactions-mobile-demo.png'), prompt: shared + `
EXACT REQUESTED CHANGE: redesign existing 'Giao Dịch' for phone usage. The source has huge add button and two simultaneous very narrow tables 'Tiền vào'/'Tiền ra', with dates but names and amounts offscreen. Make a single full-width chronological transaction list. Top source app header, title 'Giao dịch' and compact '+ Thêm' action (44px height, one line), no huge four-line button. A calm dark emerald cash-flow summary: 'Dòng tiền ròng trong kỳ' +12.000.000 đ, plus compact two supporting totals 'Tiền vào' 30.000.000 đ, 'Tiền ra' 18.000.000 đ. This is cash flow, not profit; use synthetic numbers only. Under it: date selector '01/10 – 09/10/2026', icon filter (opens bottom sheet), full-width search placeholder 'Tìm nội dung, phòng…'. Segmented selection 'Tất cả', 'Tiền vào', 'Tiền ra', first selected. List grouped by date 'Hôm nay · 09/10', with comfortable divider rows showing direction icon, readable title, secondary category/room/time, right-aligned signed amount; use synthetic examples: 'Thu tiền phòng 151' / 'Hóa đơn · 09:10' +3.000.000 đ green; 'Thanh toán điện tổng' / 'Chi vận hành · 08:40' −2.000.000 đ red; 'Thu tiền phòng 152' / 'Hóa đơn · 08:20' +2.500.000 đ green; 'Hôm qua · 08/10' with 'Bảo trì thiết bị' / 'Chi vận hành · 16:10' −500.000 đ. Tap row shows details and any linked invoice, not an immediate payment mutation. Preserve ability to filter transaction type and category through filter sheet, do not cram every dropdown into the main list. Keep bottom nav with 'Tài chính' active. Avoid desktop dual ledgers or a table requiring horizontal scrolling. ` })
  const resultReport = await report
  console.log(resultReport.output)
  const resultTransactions = await transactions
  console.log(resultTransactions.output)
  fs.writeFileSync(path.join(dir, 'finance-mobile-demos.json'), JSON.stringify({ model, generatedAt: new Date().toISOString(), report: resultReport, transactions: resultTransactions }, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })

