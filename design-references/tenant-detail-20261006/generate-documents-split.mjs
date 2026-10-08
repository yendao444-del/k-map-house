import fs from 'node:fs/promises'
import path from 'node:path'

const base = process.env.NINEROUTER_URL
if (!base) throw new Error('NINEROUTER_URL is not configured')
const headers = { 'Content-Type': 'application/json' }
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`
const sourceImage = 'data:image/png;base64,' + (await fs.readFile('C:/Users/Admin/AppData/Local/Temp/codex-clipboard-29f56f1b-5933-4b9f-9852-c862ea39915e.png')).toString('base64')
const selectedDirection = 'data:image/png;base64,' + (await fs.readFile('design-references/tenant-detail-20261006/documents.png')).toString('base64')
const prompt = `Use case: ui-mockup, revise the user-selected documents-first concept for the Vietnamese An Khang Home tenant VIEW modal.
AUTHORITATIVE REFERENCE: Image 1 is the original user-provided screenshot and the sole source of truth for data and photographed document content. Image 2 is the user's explicitly selected option 2, provided intentionally to preserve its exact documents-first layout, header/footer, typography, accordion history and spacing. This generated secondary reference must guide only layout, not document identity or synthesized photo details.
Target dimensions: 563x838 px, same aspect ratio as source. One complete desktop modal with small outer margins on a dim neutral backdrop; all contents and footer readable, no clipping. Current local date: 6 October 2026; retain creation date 5/10/2026.
Preserve source values: 'Đỗ Kim Ngân', initial 'Đ', phone '0866664995', CCCD '034300002743', email 'zicky.iluv@gmail.com', date '5/10/2026', status 'Chưa ở'. Zero deposit receipt and contract records. Preserve existing white and emerald product style, 14-15px readable Inter-like body text, subtle mint/grey borders and restrained shadows.
EXACT CHANGE: Replace the single combined document-photo display from selected option 2 with TWO SEPARATE equally sized photograph tiles, side-by-side, under 'Giấy tờ định danh'. Above the left tile label 'Mặt trước'; above the right tile label 'Mặt sau'. Left displays ONLY the original photo's left half with front card; right displays ONLY original photo's right half with back card. Preserve each original photo's content, card, hands, wallet and floor, do not synthesize or alter document identity. Each tile about 185-195px tall, 10px rounded border, neutral mat, small independent expand icon at top-right. Distinct tiles separated by 12px gutter, never combine into one image; never stretch. Keep labels and card content clearly visible.
Below these tiles retain the selected option's aligned read-only rows: 'CCCD / CMND' 034300002743, 'Điện thoại' 0866664995, 'Email' zicky.iluv@gmail.com, 'Ngày tạo' 5/10/2026. Keep the two compact history accordions with count 0: 'Lịch sử tiền cọc' expanded with 'Chưa có phiếu thu tiền cọc nào.' and 'Lịch sử hợp đồng' collapsed. No invented records. Keep selected header with name and status, close X, and white footer with left 'Chưa ở' and right emerald 'Cập nhật hồ sơ' action.
Avoid: combined image, duplicated sides, regenerated card details, false verified badges, new tabs, new features, altered identity values, hiding footer, large empty-state panels, purple, glass or gold styling, strong shadows, tiny unreadable Vietnamese, altered data, fake debt or contract dates, captions, option labels, collage, device frame. Output one refined UI image, faithful to selected option 2 except for the split-photo section.`
const outDir = path.resolve('design-references/tenant-detail-20261006')
await fs.writeFile(path.join(outDir, 'documents-split-prompt.txt'), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(20000) })
    if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
    const catalog = await catalogResponse.json()
    const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-image-2.5'
    if (!catalog.data?.some(m => m.id === model)) throw new Error('Selected image model absent from current catalog')
    console.log(`documents-split: generating ${model}, attempt ${attempt}`)
    const response = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers, signal: AbortSignal.timeout(240000),
      body: JSON.stringify({ model, prompt, images: [sourceImage, selectedDirection], size: '563x838', n: 1, response_format: 'b64_json' })
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${raw.slice(0, 180)}`)
    let result
    try { result = JSON.parse(raw) } catch {
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.data?.[0]?.b64_json || event.b64_json) result = event
        } catch {}
      }
    }
    const b64 = result?.data?.[0]?.b64_json || result?.b64_json
    if (!b64) throw new Error('Gateway returned no image bytes')
    const destination = path.join(outDir, 'documents-split.png')
    await fs.writeFile(destination, Buffer.from(b64, 'base64'))
    console.log(destination)
    break
  } catch (error) {
    console.error(`documents-split attempt ${attempt}: ${error.message}`)
    if (attempt === 3 || /HTTP 40[13]|absent from current catalog/.test(error.message)) {
      process.exitCode = 1
      break
    }
  }
}
