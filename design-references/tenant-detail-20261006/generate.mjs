import fs from 'node:fs/promises'
import path from 'node:path'

const direction = process.argv[2]
const concepts = {
  dossier: `INFORMATION-FIRST DOSSIER. A calm premium white modal with a compact identity header: emerald initial avatar, name at 22px, close button and a neutral 'Chưa ở' status chip. Then an elegant information section 'Thông tin khách thuê', with a carefully aligned 2-column label/value grid for phone and CCCD, and full-width rows for email and date created. Values 14px, muted labels 12px. Hairline divider rather than a card around the whole section. Next 'Ảnh giấy tờ' with the provided combined identity photo fully contained, about 170px tall, on a subtle pale neutral mat, and a small unobtrusive expand icon. Then both original history sections as compact full-width flat list sections with section icon/title and a gentle one-line empty message beneath, no oversized empty-state cards. The two histories must both be fully readable above the footer. Footer keeps a clear green 'Cập nhật hồ sơ' primary button aligned right and a quiet neutral 'Chưa ở' chip at left. Spacious but compact dossier, no stacked card boxes.`,
  documents: `DOCUMENT-FIRST WITH COMPACT HISTORY ACCORDIONS. Compact white header with the person's name, phone subtitle and neutral 'Chưa ở' status chip. Lead with 'Giấy tờ định danh' and show the attached combined two-sided photo in a well-proportioned 210px-high image area, fully visible without distortion. Label just below it 'CCCD / CMND' with the exact source number, using a clean aligned data row. Under the image place phone, email and creation date as three polished horizontal rows, fine separators, no redundant card containers. Then show 'Lịch sử tiền cọc' and 'Lịch sử hợp đồng' as two compact accordion-style rows: refined line icons, title, small '0' count and chevron. Show the first one expanded with its honest empty-state message in one compact paragraph, and the contract row collapsed. These are only a reorganization of existing histories, no new product features. Footer contains the exact green primary action 'Cập nhật hồ sơ'. Use intentional white space, emerald typography accents and simple precise separators.`,
  tabs: `TABBED PROFILE SHEET. A distinguished deep forest-green header (#064a31), about 95px tall, containing a translucent emerald initial avatar with white 'Đ', white person name at 23px, a very subtle light neutral 'Chưa ở' chip, and white close icon. Immediately below on white surface a refined navigation strip with three tabs: 'Hồ sơ' (active, emerald underline), 'Tiền cọc' with small '0', and 'Hợp đồng' with small '0'. This replaces the long stacked histories and is the key structural change. In the active profile view show 'Thông tin cá nhân', then generous label/value rows: phone, CCCD / CMND, email and creation date. Below, section 'Ảnh giấy tờ' with the actual combined two-sided identity photo clearly visible at 195px high, preserving the photo crop and content. Add a subtle expand affordance in its corner. Do not show empty history cards in the active profile tab: the two zero-count tabs provide access to those existing sections. Bottom pinned white footer with 'Chưa ở' at left and exact primary action 'Cập nhật hồ sơ' at right. Tasteful modern desktop modal, not a phone or a mobile app.`
}
if (!concepts[direction]) throw new Error('Unknown design direction')
const base = process.env.NINEROUTER_URL
if (!base) throw new Error('NINEROUTER_URL is not configured')
const headers = { 'Content-Type': 'application/json' }
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`
const source = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-29f56f1b-5933-4b9f-9852-c862ea39915e.png'
const image = 'data:image/png;base64,' + (await fs.readFile(source)).toString('base64')
const prompt = `Use case: ui-mockup. Create a realistic, production-quality redesign of the tenant VIEW/DETAIL modal of the Vietnamese An Khang Home room-rental desktop application.
AUTHORITATIVE REFERENCE: The single attached screenshot is the sole product source of truth. It is a portrait screenshot of a desktop modal, not a mobile screen. Use the attached image itself for the existing customer's document-photo content, data and product context.
Target dimensions: 563 x 838 px, matching the reference aspect ratio. Show ONE complete modal, with a subtly blurred/dimmed neutral desktop backdrop, small outer margins, complete header and complete footer. All contents fit inside the modal. Do not let the sticky footer cover content.
Current local date anchor: 6 October 2026. Preserve the source creation date 5/10/2026 rather than rewriting it as today.
Preserve these exact data values and state: name 'Đỗ Kim Ngân', initial 'Đ', phone '0866664995', CCCD '034300002743', email 'zicky.iluv@gmail.com', creation date '5/10/2026', status 'Chưa ở'. The tenant has zero deposit receipt records and zero contract records. Preserve the user-supplied combined photo of the front/back identity document as real photographed paper/card content; do not invent a different document, face, identity number, or unrelated photo.
Exact requested change: improve the layout, hierarchy and finish of this viewing modal, to make customer contact details, identity documents, and deposit/contract histories easier to read and navigate. Retain existing feature scope: inspect tenant profile, view identity photo, view two histories, close modal, and the one primary action 'Cập nhật hồ sơ'. Fields are read-only in this view.
Product design system: Inter or closely matched contemporary sans-serif, deep green #064a31, emerald #00ab60, ink #15231d, muted slate #718079, restrained mint #edf9f1, pale neutral border #e5eee8, white surfaces, 8-12px control radius, outer modal radius 16px, very subtle short shadows. Purple in source avatar may become brand-consistent emerald. Avoid decorative effects. Body text around 14-15px and section headings 14-16px, legible Vietnamese with full diacritics.
Layout direction: ${concepts[direction]}
Relevant exact empty-state messages when visible: 'Chưa có phiếu thu tiền cọc nào.' and 'Chưa có dữ liệu hợp đồng.' These denote no records, not unpaid debt. Don't infer any room allocation, outstanding amount, income, debt, verification result, or contract dates.
Use spacing and typography first, simple dividers second, gentle tint only when useful. Avoid cards inside cards, giant empty panels, excessive shadows, repeated badges, unnecessary metrics, truncating contact information, purple styling, orange finance styling from another screen, new send/call/upload/approve features, buttons implying nonexistent data, fake QR codes, device frames, mobile status bar, unreadable or clipped Vietnamese, a collage or multiple alternatives in one image, presentation captions or numbered option labels. Output a single polished UI demo image.`
const outDir = path.resolve('design-references/tenant-detail-20261006')
await fs.mkdir(outDir, { recursive: true })
await fs.writeFile(path.join(outDir, `${direction}-prompt.txt`), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(20000) })
    if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
    const catalog = await catalogResponse.json()
    const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
    if (!catalog.data?.some(m => m.id === model)) throw new Error('Selected image model absent from current catalog')
    console.log(`${direction}: generating ${model}, attempt ${attempt}`)
    const response = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers, signal: AbortSignal.timeout(240000),
      body: JSON.stringify({ model, prompt, image, size: '563x838', n: 1, response_format: 'b64_json' })
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
    const destination = path.join(outDir, `${direction}.png`)
    await fs.writeFile(destination, Buffer.from(b64, 'base64'))
    console.log(destination)
    break
  } catch (error) {
    console.error(`${direction} attempt ${attempt}: ${error.message}`)
    if (attempt === 3 || /HTTP 40[13]|absent from current catalog/.test(error.message)) {
      process.exitCode = 1
      break
    }
  }
}
