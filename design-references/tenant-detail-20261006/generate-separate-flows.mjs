import fs from 'node:fs/promises'
import path from 'node:path'

const base = process.env.NINEROUTER_URL
if (!base) throw new Error('NINEROUTER_URL is not configured')
const headers = { 'Content-Type': 'application/json' }
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`
const outDir = path.resolve('design-references/tenant-detail-20261006')
const sources = [
  'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-98816cd2-55d2-485e-aff7-699ac0b6c834.png',
  path.join(outDir, 'documents-split.png'),
]
const images = await Promise.all(sources.map(async file => 'data:image/png;base64,' + (await fs.readFile(file)).toString('base64')))
const prompt = `Use case: ui-mockup. One focused refinement of the existing Vietnamese An Khang Home tenant profile workflow, NOT three design alternatives. Target dimensions 1440x1024 desktop UI design board. Current date anchor 6 October 2026; preserve source creation date 5/10/2026.
AUTHORITATIVE REFERENCE: Image 1 is the latest user-provided screenshot of the existing edit modal. Preserve its white surfaces, Inter typography, spacing, mint/slate input fills, rounded corners, emerald primary action, exact field values and real photograph content. Image 2 is intentionally supplied because it is the user's previously approved view-modal design from this SAME workflow; use it ONLY to preserve that approved viewing layout (two document frames, rows and history accordions), not as an authority for synthesized identity details.
EXACT REQUESTED CHANGE: separate VIEW and EDIT into two independent entry points from the tenant list. No combined 'Xem / Sửa hồ sơ' action, no edit mode inside the view modal. Do not redesign unrelated screens.
Composition: a single cohesive workflow storyboard on a pale neutral background. At the top-left show a small realistic tenant row 'Đỗ Kim Ngân' with an open compact overflow menu. The menu has two separate actions with familiar eye and pencil icons, exact labels 'Xem hồ sơ' and 'Sửa hồ sơ'. Below it show two complete independent desktop modals side by side, each with a short external heading above it indicating the corresponding entry point. These are two states of ONE approved interaction direction, not two competing visual concepts. Both modal headers, bodies and footers must fit, Vietnamese text readable, nothing clipped. Natural proportions; no stretched UI.
LEFT MODAL: read-only 'Xem hồ sơ'. Preserve Image 2's emerald initial avatar 'Đ', person name 'Đỗ Kim Ngân', phone subtitle '0866664995', CCCD '034300002743', mint status 'Chưa ở', close X. Section 'Giấy tờ định danh' has two separate equal frames 'Mặt trước' and 'Mặt sau', each using the corresponding half of the photographed identity image from authoritative Image 1, with independent enlarge icons. Below show read-only aligned rows 'CCCD / CMND' value '034300002743', 'Điện thoại' value '0866664995', 'Email' value 'zicky.iluv@gmail.com', 'Ngày tạo' value '5/10/2026'. Deposit accordion 'Lịch sử tiền cọc' count 0 expanded with 'Chưa có phiếu thu tiền cọc nào.'; 'Lịch sử hợp đồng' count 0 collapsed. Viewing footer contains status 'Chưa ở' at left and ONLY a quiet outlined 'Đóng' button at right. Absolutely NO update/edit/save/upload buttons and NO form inputs in the viewing modal.
RIGHT MODAL: independent 'Sửa hồ sơ'. Preserve authoritative Image 1's existing form exactly apart from this title: fields 'Họ và tên *' with 'Đỗ Kim Ngân'; two columns 'Số điện thoại' '0866664995', 'Địa chỉ Email' 'zicky.iluv@gmail.com'; section 'Định danh cá nhân (CCCD/CMND)' with input '034300002743', its existing combined-photo upload area and 'Đã cập nhật ảnh' state; 'Ghi chú & Lưu ý' textarea. Footer ONLY outlined 'Hủy' and emerald 'Lưu thay đổi'. Close X. No deposit or contract history, no read-only view sections, no links switching between the modals. Keep this form focused on data editing.
Style: source-product Inter-like body text 14-15px, headings 20-23px, slate labels, clean white/mint/emerald palette, restrained border/shadow, native Font Awesome-like icons. Preserve exact Vietnamese diacritics and data values. Photo identity pixels are reference content, not a new asset to fabricate.
Avoid: combined view/edit action, edit CTA inside view, tabs between view and edit, fabricated records, altered customer values, generated different identity card/face, extra feature panels, unrelated repository assets, stale clipboard references, new navigation routes, excessive gradients/shadows, dark/gold/purple styling, tiny or clipped text, mobile/device chrome, numbered alternative labels. Output only one high-quality workflow demo image.`
await fs.writeFile(path.join(outDir, 'separate-flows-prompt.txt'), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(20000) })
    if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
    const catalog = await catalogResponse.json()
    const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-image-2.5'
    if (!catalog.data?.some(item => item.id === model)) throw new Error('Selected image model absent from current catalog')
    console.log(`separate-flows: generating ${model}, attempt ${attempt}`)
    const response = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers, signal: AbortSignal.timeout(240000),
      body: JSON.stringify({ model, prompt, images, size: '1440x1024', n: 1, response_format: 'b64_json' }),
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
    const destination = path.join(outDir, 'separate-flows.png')
    await fs.writeFile(destination, Buffer.from(b64, 'base64'))
    console.log(destination)
    break
  } catch (error) {
    console.error(`separate-flows attempt ${attempt}: ${error.message}`)
    if (attempt === 3 || /HTTP 40[13]|absent from current catalog/.test(error.message)) { process.exitCode = 1; break }
  }
}
