import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'

const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base) throw new Error('NINEROUTER_URL unavailable')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
const referencePath = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-df05039b-bd42-4ee9-949b-06e59bb28a0f.png'
await mkdir(new URL('./', import.meta.url), { recursive: true })
await copyFile(referencePath, new URL('./reference.png', import.meta.url))
const reference = `data:image/png;base64,${(await readFile(referencePath)).toString('base64')}`
const prompt = `Create ONE realistic production-quality Vietnamese desktop UI demo for AN KHANG HOME. AUTHORITATIVE REFERENCE: the single attached 1038x655 screenshot is the user's current account security modal. Preserve the white rounded wide modal, navy titles, muted slate copy, emerald selected tab underline, exact header layout AN KHANG HOME / Hồ sơ cá nhân / close X, main heading Bảo mật tài khoản, subtitle, four horizontal tabs Bảo mật, Thiết bị, Hoạt động, Đổi mật khẩu, generous margins, and compact clean typography. EXACT REQUESTED CHANGE: add a small secondary outlined button Đổi Google Authenticator beside the existing Xác minh lại Google Authenticator button. Below these buttons, show the expanded inline change flow (not another popup). Thin divider then title Đổi Google Authenticator and concise three-step progress: 1 Xác minh hiện tại (active emerald), 2 Thiết lập mới, 3 Hoàn tất. Show the FIRST step only: heading Xác minh Authenticator hiện tại; short sentence Nhập mã 6 số từ ứng dụng Google Authenticator đang dùng.; six clean empty code input slots; emerald primary button Xác minh và tiếp tục and quiet Hủy button. Below the form a single subtle shield icon with text Authenticator cũ vẫn hoạt động cho đến khi xác nhận mã mới. The later steps will allow scanning a new QR code then saving fresh recovery codes, but do not display those steps' forms in this image. Fit the content comfortably into the current modal without increasing it excessively. Match reference aspect ratio, target canvas 1038x655 or nearest supported landscape 1536x1024, no stretched elements. Date anchor 12/10/2026 Asia/Bangkok; no dates are needed. All Vietnamese labels must be correctly accented, readable and unclipped. AVOID: redesigning header or tabs, extra navigation, English labels, giant buttons, oversized modal, nested cards, gradients, purple, illustrations, multiple screenshots or collage, QR at the first step, any real TOTP code/secret/email/account data, browser or OS chrome, warning banners, red destructive buttons, technical backend copy, watermarks. Output only this single app UI visual demo.`
await writeFile(new URL('./prompt.txt', import.meta.url), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(20000) })
    if (!catalogResponse.ok || !(await catalogResponse.json()).data?.some(item => item.id === model)) throw new Error('Selected image model unavailable')
    console.log(`Generating Authenticator change demo; attempt ${attempt}`)
    const response = await fetch(`${base}/v1/images/generations`, { method: 'POST', headers, body: JSON.stringify({ model, prompt, images: [reference], n: 1, size: '1536x1024', response_format: 'b64_json', output_format: 'png', image_detail: 'high' }), signal: AbortSignal.timeout(240000) })
    if (!response.ok) throw new Error(`Image generation HTTP ${response.status}`)
    const raw = await response.text()
    let result
    try { result = JSON.parse(raw) } catch {
      for (const line of raw.split('\n')) if (line.startsWith('data:')) {
        try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) result = event } catch { /* Ignore SSE keepalives. */ }
      }
    }
    const bytes = result?.data?.[0]?.b64_json || result?.b64_json
    if (!bytes) throw new Error('Provider returned no image')
    await writeFile(new URL('./demo.png', import.meta.url), Buffer.from(bytes, 'base64'))
    await writeFile(new URL('./generation.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), model, authoritativeReference: referencePath, output: 'demo.png', status: 'Awaiting user approval; application unchanged' }, null, 2) + '\n')
    console.log('Saved docs/design/authenticator-rotation/demo.png')
    process.exit(0)
  } catch (error) {
    console.log(error.message)
    if (attempt === 3) process.exit(1)
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}
