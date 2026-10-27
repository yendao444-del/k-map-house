import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const source = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-5d7fcca3-eb8e-4d01-9552-b234578cbc1b.png'
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base) throw new Error('NINEROUTER_URL missing')
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
const prompt = `Create one production-quality Vietnamese desktop web-app UI screenshot based on the attached authoritative reference. AUTHORITATIVE REFERENCE: the attached screenshot is the existing AN KHANG HOME “Bảo mật tài khoản” profile modal. Preserve the exact visual language: white rounded modal over a softly blurred app backdrop, AN KHANG HOME wordmark at top left, “Hồ sơ cá nhân” outlined button and close icon at top right, dark navy heading, muted gray subtitle, green active underline, thin dividers, generous horizontal rows, navy line icons, emerald and amber status pills, Vietnamese typography and spacing. EXACT REQUESTED CHANGE: this is the content of a new “2FA” section opened from the personal profile. Replace the current four-row content with a focused 2FA methods management screen while preserving the surrounding modal frame. Add a compact section title “Phương thức xác minh” and subtitle “Chọn các phương thức bạn muốn dùng để bảo vệ tài khoản.” Show exactly three clean rows: (1) “Google Authenticator” with subtitle “Mã xác minh từ ứng dụng Authenticator.”, green status pill “Đã bật”, right action “Quản lý” and chevron; (2) “Gmail” with subtitle “Nhận mã xác minh vào email đăng nhập.”, amber status pill “Chưa xác minh”, right action “Xác minh” and chevron; (3) “Số điện thoại” with subtitle “Dùng SMS để xác minh khi đăng nhập.”, muted status pill “Chưa thiết lập”, right action “Thêm số điện thoại” and chevron. Use shield, mail and phone line icons. Add a small unobtrusive bottom note “Bạn có thể dùng nhiều phương thức để khôi phục quyền truy cập.” Do not show OTP fields, QR codes, secrets, recovery codes, phone numbers, email addresses, passwords or real account data in this overview. Keep all labels exactly as written with correct Vietnamese diacritics, readable and unclipped. Output one 1051x658 landscape UI screenshot with no browser chrome, no device frame, no annotations, no extra tabs or invented navigation. AVOID: changing the existing brand, dark mode, card-inside-card layouts, dense settings dashboard, fake verification claims, modal overflow, tiny unreadable text, English labels, extra authentication methods, security secrets, QR codes, or marketing copy.`

const catalog = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(20000) })
if (!catalog.ok) throw new Error(`Catalog HTTP ${catalog.status}`)
const available = (await catalog.json()).data?.some(item => item.id === model)
if (!available) throw new Error(`Model unavailable: ${model}`)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    console.log(`Generating profile 2FA demo, attempt ${attempt}`)
    const response = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers, signal: AbortSignal.timeout(300000),
      body: JSON.stringify({ model, prompt, images: [`data:image/png;base64,${fs.readFileSync(source).toString('base64')}`], n: 1, size: '1536x1024', response_format: 'b64_json', output_format: 'png', image_detail: 'high' })
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(`Generation HTTP ${response.status}: ${raw.slice(0, 180)}`)
    let result
    try { result = JSON.parse(raw) } catch {
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data:')) continue
        try { const item = JSON.parse(line.slice(5)); if (item.data?.[0]?.b64_json || item.b64_json) result = item } catch {}
      }
    }
    const encoded = result?.data?.[0]?.b64_json || result?.b64_json
    if (!encoded) throw new Error('No b64_json image returned')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'demo.png'), Buffer.from(encoded, 'base64'))
    fs.writeFileSync(path.join(dir, 'generation.json'), JSON.stringify({ model, source, prompt, generatedAt: new Date().toISOString() }, null, 2))
    console.log(path.join(dir, 'demo.png'))
    break
  } catch (error) {
    console.error(`Attempt ${attempt}: ${error.message}`)
    if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}
