const fs = require('node:fs')
const path = require('node:path')

const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
const reference = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-0d1ae8e7-ba41-41db-b2b1-46d22e13febe.png'
const output = path.join(__dirname, 'mobile-room-actions-demo.png')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
const prompt = `Create one realistic production-quality Vietnamese mobile PWA UI demo, 390 x 844 pixels, for AN KHANG HOME. Current date 08/10/2026. AUTHORITATIVE REFERENCE: attached desktop room action menu screenshot. It is the source of truth for exact Vietnamese action labels, business warning, icon meanings, action colors and disabled state. Preserve the white menu surface, emerald app identity, blue financial action, teal room management, slate neutral actions, amber notice, red termination and faint disabled cancellation. Preserve the existing application style, not a new visual direction.

EXACT REQUESTED CHANGE: adapt this desktop room menu into an accessible mobile bottom sheet opened from the room list BEFORE entering room details. Behind the lightly dimmed sheet, show only a small synthetic room list header 'Danh sách phòng' and a partial room row, no tenant identities or real personal data. The rounded white sheet occupies the lower approximately 720 pixels with 20px horizontal padding, a small drag handle, title 'Phòng 151', small green 'Đang ở' label, and a top-right close icon. Under the header reproduce a readable soft amber warning: 'Hóa đơn tháng 10 chưa thu.' bold, then 'Cần thu tiền trước khi lập kỳ tiếp theo.' on the next line. The menu must show ALL these EXACT action rows IN THIS ORDER, one wide row each, with 44-48px minimum comfortable touch targets, 14-16px readable Vietnamese text, a compact icon on the left and a subtle right chevron: 'Thu tiền hóa đơn còn nợ' blue, 'Quản lý phòng' teal, 'Cài đặt dịch vụ' slate, 'Chuyển đổi phòng' slate, 'Thiết lập tài sản' slate, 'Báo trả phòng' orange, 'Trả phòng' red, 'Hủy hợp đồng' disabled pale red with no active chevron. Use subtle dividers, not many cards. After the disabled action show a small gray explanation 'Đã có thanh toán: dùng Trả phòng để tất toán.' Bottom: full-width quiet 'Đóng menu' button. All content comfortably fits the image without clipping. This is an ACTION MENU, not the room information detail form. 'Quản lý phòng' is the explicit route to the existing details screen. Maintain clear hierarchy and restrained production polish.

Avoid: device frames, phone body, notch, OS status bar, browser chrome, browser address bar, home indicator, dark mode, new navigation features, random actions, tenant names, phone numbers, real customer information, charts, financial totals invented as facts, new brand palette, neon gradients, crowded two-column text labels, showing room details first, changing or removing business warning, making disabled cancellation look active, annotations, arrows outside the app, multiple concepts in one image, clipped or unreadable Vietnamese.`

async function run() {
  if (!base) throw new Error('NINEROUTER_URL is missing')
  const image = `data:image/png;base64,${fs.readFileSync(reference).toString('base64')}`
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(30000) })
      if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
      const catalog = await catalogResponse.json()
      if (!catalog.data?.some(entry => entry.id === model)) throw new Error(`Model ${model} unavailable`)
      console.log(`Generating mobile menu demo, attempt ${attempt}, model ${model}`)
      const response = await fetch(`${base}/v1/images/generations`, { method: 'POST', headers, body: JSON.stringify({ model, prompt, image, n: 1, response_format: 'b64_json' }), signal: AbortSignal.timeout(300000) })
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
      fs.writeFileSync(path.join(__dirname, 'mobile-room-actions-demo.json'), JSON.stringify({ model, reference, prompt, output, generatedAt: new Date().toISOString() }, null, 2))
      console.log(output)
      return
    } catch (error) {
      console.error(error.message)
      if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error
    }
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
