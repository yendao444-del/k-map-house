import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const source = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-797bc6ca-dd14-4ee7-96bf-6e3dc65c741e.png'
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base) throw new Error('NINEROUTER_URL missing')
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
const prompt = `Create one faithful desktop UI visual demo based on the attached authoritative screenshot, which is the current Vietnamese An Khang Home system-account list. AUTHORITATIVE REFERENCE: only the attached screenshot. Preserve the white and pale mint interface, emerald accent, left settings sidebar, selected Tài khoản hệ thống, search toolbar, add account button, three rows, avatars, role chips, active status, last-login timestamps, action buttons, and pagination. EXACT REQUESTED CHANGE: add one compact BẢO MẬT column between TRẠNG THÁI and ĐĂNG NHẬP. In each row show two small stacked status badges with labels: Authenticator and Email. First illustrative row: green check Authenticator · Đã xác thực and green check Email · Đã xác minh. Second illustrative row: muted amber Authenticator · Chưa xác thực and green check Email · Đã xác minh. Third illustrative row: green check Authenticator · Đã xác thực and muted amber Email · Chưa xác minh. These are illustrative states, not real account evidence. Preserve natural proportions and clear legible Vietnamese diacritics. Make the account panel wide enough for all columns, preserve the source hierarchy; the security badges are subtle and compact. Use fictional names and emails in the demo: Nguyễn Minh An / minhan@example.com, Trần Hải Nam / hainam@example.com, Lê Thu Hà / thuha@example.com. Add a small unobtrusive note below the list: Trạng thái minh họa. Render one crisp flat application screenshot with no device mockup and no design annotations. AVOID: changed roles or permissions, new authentication prompts, secret codes, QR codes, recovery codes, new navigation sections, busy card layouts, giant icons, unreadable small text, clipped Vietnamese labels, clipped columns, browser chrome, photorealistic decoration, fake factual security claims. Output landscape 1536x1024; the compact account-list region should remain the main subject with sensible surrounding whitespace.`

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalog = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(20000) })
    if (!catalog.ok) throw new Error(`Catalog HTTP ${catalog.status}`)
    if (!(await catalog.json()).data?.some(x => x.id === model)) throw new Error(`Model unavailable: ${model}`)
    console.log(`Generating account security demo: attempt ${attempt}, model ${model}`)
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
    fs.writeFileSync(path.join(dir, 'demo.png'), Buffer.from(encoded, 'base64'))
    fs.writeFileSync(path.join(dir, 'generation.json'), JSON.stringify({ model, source, prompt, generatedAt: new Date().toISOString(), illustrative: true }, null, 2))
    console.log(path.join(dir, 'demo.png'))
    break
  } catch (error) {
    console.error(`Attempt ${attempt}: ${error.message}`)
    if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}
