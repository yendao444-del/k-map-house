import { readFile, writeFile, copyFile } from 'node:fs/promises'

const referencePath = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-4ebaccc5-fbc2-4d18-9aa7-465aae9443d0.png'
await copyFile(referencePath, new URL('./reference.png', import.meta.url))
const reference = 'data:image/png;base64,' + (await readFile(referencePath)).toString('base64')
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base) throw new Error('Image gateway unavailable')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: 'Bearer ' + process.env.NINEROUTER_KEY } : {}) }
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
const prompt = `Create ONE realistic Vietnamese desktop UI demo for the AN KHANG HOME internal rental-management app. AUTHORITATIVE REFERENCE: the ONE attached screenshot is the actual SePay modal supplied by the user in the current turn. Preserve its white rounded modal, light blue header, blue sync icon, dark title, clean Inter-like Vietnamese typography, softly dimmed background, single column hierarchy and discreet upper-right close button. EXACT REQUESTED CHANGE: replace the red 2FA error panel with a calm inline current-password confirmation form, so an already signed-in user who completed 2FA can confirm a sensitive SePay write without navigating to another screen. This is confirmation of recording a bank receipt; simply reading SePay history should not need a password. Keep header title exactly 'Đồng bộ lịch sử SePay'; subtitle 'Xác nhận ghi nhận khoản thu'. In the body use small blue outlined shield icon beside heading 'Xác nhận bằng mật khẩu'. Body sentence: 'Nhập mật khẩu hiện tại để xác nhận thao tác này.' Show ONE field with label 'Mật khẩu hiện tại', 8 masked bullets, and a discreet eye icon. Helpful subdued caption: 'Bạn vẫn giữ nguyên phiên đăng nhập đã xác minh hai bước.' Footer has only quiet 'Hủy' and blue primary 'Xác nhận và tiếp tục'. Generous readable spacing, body 16-18px, modal about 670-740px wide in natural proportions. Extend modal vertically only as needed, do not stretch the reference. Canvas 1536x1024 landscape, entire modal visible with clear surrounding margins. Date anchor 11/10/2026 UTC+7; omit dates because this screen needs none. Use correct accented Vietnamese. AVOID: red error block, alarming warnings, OTP or Authenticator fields, email codes, QR codes, passwords in plaintext, real emails/accounts/transactions, invented amounts, Facebook logo, extra navigation or tabs, marketing art, nested cards, technical backend notes, Nghe thử or Đóng băng buttons, tiny unreadable text, clipped labels, browser/OS chrome, watermark, collage or multiple options in one image. Output only the app UI demo.`
await writeFile(new URL('./prompt.txt', import.meta.url), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalog = await fetch(base + '/v1/models/image', { headers, signal: AbortSignal.timeout(20000) })
    if (!catalog.ok || !(await catalog.json()).data?.some(item => item.id === model)) throw new Error('Selected image model unavailable')
    console.log('Generating password confirmation demo; attempt ' + attempt)
    const response = await fetch(base + '/v1/images/generations', { method: 'POST', headers, body: JSON.stringify({ model, prompt, images: [reference], n: 1, size: '1536x1024', response_format: 'b64_json', output_format: 'png', image_detail: 'high' }), signal: AbortSignal.timeout(240000) })
    if (!response.ok) throw new Error('Image generation HTTP ' + response.status)
    const raw = await response.text()
    let result
    try { result = JSON.parse(raw) } catch {
      for (const line of raw.split('\n')) if (line.startsWith('data:')) {
        try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) result = event } catch { /* Ignore SSE keepalive events. */ }
      }
    }
    const bytes = result?.data?.[0]?.b64_json || result?.b64_json
    if (!bytes) throw new Error('Provider returned no image')
    await writeFile(new URL('./demo.png', import.meta.url), Buffer.from(bytes, 'base64'))
    await writeFile(new URL('./generation.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), model, authoritativeReference: referencePath, output: 'demo.png', purpose: 'Reviewable password confirmation design; not implemented.' }, null, 2) + '\n')
    console.log('Saved docs/design/sepay-password-confirmation/demo.png')
    process.exit(0)
  } catch (error) {
    console.log(error.message)
    if (attempt === 3) process.exit(1)
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}
