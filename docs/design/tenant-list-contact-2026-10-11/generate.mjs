import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const directions = {
  identity: `Identity-first table. Keep the source table design and filter bar. Columns KHÁCH THUÊ & PHÒNG (250px), GIẤY TỜ ĐỊNH DANH (300px), LIÊN HỆ (300px), HỢP ĐỒNG (230px), ĐẶT CỌC (220px), trailing menu. The identity column shows TWO photographic miniature document images SIDE BY SIDE with tiny readable captions Mặt trước and Mặt sau, a short status Đủ 2 ảnh with green check and a masked number below. The missing-document row shows a clear orange document icon and Chưa có CCCD, no pretend photograph. The partial-document row shows one front photograph and a restrained missing-back state labeled Thiếu mặt sau. Phone and email are two aligned readable lines with outline icons; show full synthetic email rather than truncated ellipses. Missing contact is explicit orange Chưa có SĐT or Chưa có email. Keep native source-product calm table with 5 complete generously spaced rows. This concept puts identity photos in a dedicated column.` ,
  matrix: `Contact-completeness matrix list. Preserve source emerald/white tenant management identity, upper filters and amber attention strip. Replace the current many-column arrangement with a visually clear single grouped list, NOT individual floating cards. Columns KHÁCH THUÊ & PHÒNG (245px), CCCD / CMND (360px), SỐ ĐIỆN THOẠI (225px), EMAIL (290px), ĐẶT CỌC (190px), trailing menu. Five complete horizontal rows separated by light hairlines. The CCCD block has TWO separate landscape thumbnail photographs marked Trước and Sau to the left, and status Đủ 2 ảnh / Thiếu mặt sau / Chưa có CCCD and masked number to their right. The phone and email each have a small restrained check marker if present and pale orange missing text if absent. Use a single mint-tinted column header for scanability, not repeated colored card boxes. Deposit is compact amount and existing paid/unpaid source status. A subtle per-row under-name completeness hint may say Cần bổ sung 2 mục but don't duplicate lots of badges. Primary purpose is scanning identity, phone, email in three clearly aligned columns, not contract or activity data.` ,
  balanced: `Balanced two-line tenant list. Keep the original source's overall table format but consolidate key tenant identity and contacts at the left. Columns KHÁCH THUÊ & HỒ SƠ (560px), LIÊN HỆ (300px), HỢP ĐỒNG (260px), ĐẶT CỌC (220px), trailing menu. Five complete rows, each 95px tall. Within the first column, retain initial avatar, synthetic name, room and occupancy at left; at right show TWO separate realistic landscape identity thumbnail photographs about 65x40px, each clearly captioned Trước / Sau, with slim status Đủ ảnh CCCD beneath. Missing identity uses a restrained orange document symbol and Chưa có CCCD, partial identity shows only the existing front thumbnail and Thiếu mặt sau. Masked identity number under name where it exists. Contact two lines: full readable synthetic phone and full email, outline call and envelope icons, no ellipses. Missing fields show clear orange labels. Keep existing contract and deposit semantics. Group name+identity so a manager knows exactly whose documents are shown; maintain clean column alignment and the roomy emerald desktop management style.`
}

const direction = process.argv[2]
if (direction === 'all') {
  let remaining = 3
  let failed = false
  for (const key of Object.keys(directions)) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), key], { stdio: 'inherit', windowsHide: true })
    child.on('error', error => { console.error(error.message); failed = true })
    child.on('close', code => { if (code !== 0) failed = true; if (--remaining === 0) process.exit(failed ? 1 : 0) })
  }
} else {
  if (!directions[direction]) throw new Error('Unknown direction')
  const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
  if (!base) throw new Error('NINEROUTER_URL missing')
  const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
  const source = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-97cd8706-57b3-436b-9a05-edd685ef70d2.png'
  const reference = 'data:image/png;base64,' + (await readFile(source)).toString('base64')
  const prompt = `Create realistic production-quality Vietnamese desktop UI design for AN KHANG HOME tenant management. ONE authoritative attached reference is the user's current tenant-list screenshot, 1419x718. It is authoritative for the screen hierarchy, emerald/white rental-management visual language, filter bar, amber task strip, roomy rows, mint room badges, native outline icons, initial avatars, pale neutral borders, muted navy typography, pagination, active contract and deposit information. Preserve this familiar brand and hierarchy, not actual customer data. EXACT CHANGE: make each tenant's identity-card presence AND uploaded images immediately visible outside the detail modal; also make their telephone and email immediately legible, with clear missing states. Do not redesign a tenant edit modal. Design one cohesive tenant LIST screen only.
TARGET canvas 1419x718, same landscape aspect ratio as source. App content only, no browser chrome or added sidebar. ${directions[direction]}
Top filter labels Tất cả 30, Đang ở 25, Chưa ở 0, Đã rời đi 5, Cần xử lý 4; subtle right filters Tất cả phòng and Hồ sơ. Amber strip 4 hồ sơ cần bổ sung with link Xem danh sách. Footer Hiển thị 5 / 30 khách thuê and compact pagination. Dates anchor 11 October 2026, plausible contract dates 1/10/2026 or 1/9/2026. Use readable correctly accented Vietnamese Inter-like type, 14-16px body, source hierarchy, purposeful whitespace, gentle emerald #00856b accents, dark navy names, muted slate secondary text, pale orange incompleteness and green completeness. No oversized primary buttons. Everything fits cleanly; no clipped rows or labels. Focused operational screen, not a feature inventory or presentation board.
Use only synthetic mock people: Nguyễn An, Trần Bình, Lê Chi, Phạm Dũng, Võ Hà; rooms 101, 102, 103, 104, 105. Mock phone 0900000001 and consecutive endings; email an@example.com, binh@example.com, chi@example.com, dung@example.com, ha@example.com. Mask mock ID numbers as 079•••••0001. Make the first row complete (number, BOTH front and back photographs, phone, email), second missing CCCD but has contacts, third number + front photograph ONLY and no email, fourth has both photographs but no telephone, fifth complete. Do not equate identity presence with actual authentication or verified citizenship: labels Đủ 2 ảnh / Chưa có CCCD / Thiếu mặt sau, not Đã xác minh. Thumbnail imagery must visually resemble photographed Vietnamese identity-card front and back (landscape document, front portrait, patterned reverse), with fictional portrait and intentionally illegible small document details; separate sides, not a combined sheet. This is illustrative fake imagery only, no real ID or QR encoded personal data. User must instantly distinguish actual image presence vs missing image. Main contact values readable at this frame size. Column spacing and alignment take priority over decoration; lightweight row separators, not cards inside cards.
Avoid: copying real customer names, emails, phones or ID data from the reference; verified badges, QR codes with data, single combined front/back photo, hidden thumbnails inside modal, giant avatars, dashboard metrics, new sidebar/navigation, room grid, dense piles of badges, gradient/glass/gold/purple/dark styling, excessive shadows, floating cards per row, clipped Vietnamese text, ellipsized email, browser/OS chrome, watermark, numbered concept labels, multiple screens/collage. Output one finished UI image only.`
  await writeFile(new URL(`./${direction}-prompt.txt`, import.meta.url), prompt)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const catalogResponse = await fetch(base + '/v1/models/image', { headers, signal: AbortSignal.timeout(20000) })
      if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
      const catalog = await catalogResponse.json()
      const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
      if (!catalog.data?.some(item => item.id === model)) throw new Error('Model absent from current catalog')
      console.log(`${direction}: generating ${model}, attempt ${attempt}`)
      const response = await fetch(base + '/v1/images/generations', {
        method: 'POST', headers, signal: AbortSignal.timeout(240000),
        body: JSON.stringify({ model, prompt, images: [reference], size: '1419x718', n: 1, quality: 'high', image_detail: 'high', output_format: 'png', response_format: 'b64_json' })
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${raw.slice(0, 180)}`)
      let result
      try { result = JSON.parse(raw) } catch {
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try { const event = JSON.parse(line.slice(6)); if (event.data?.[0]?.b64_json || event.b64_json) result = event } catch {}
        }
      }
      const b64 = result?.data?.[0]?.b64_json || result?.b64_json
      if (!b64) throw new Error('Provider returned no image bytes')
      await writeFile(new URL(`./${direction}.png`, import.meta.url), Buffer.from(b64, 'base64'))
      console.log(`${direction}: saved`)
      break
    } catch (error) {
      console.error(`${direction} attempt ${attempt}: ${error.message}`)
      if (attempt === 3 || /HTTP 40[13]|absent from current catalog/.test(error.message)) { process.exitCode = 1; break }
    }
  }
}
