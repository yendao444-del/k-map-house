import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'

const direction = process.argv[2]
const directions = {
  rows: `Design direction: calm settings rows. Below the Google Authenticator heading place one compact green pill 'Đã bật'. Then create two horizontal settings rows on the same white surface, separated only by thin dividers: first row a small smartphone line icon, title 'Đổi Google Authenticator', supporting text 'Chuyển sang điện thoại mới hoặc thay khóa xác thực.', right-aligned compact outlined button 'Đổi Authenticator'; second row a small recovery-document line icon, title 'Mã khôi phục', supporting text 'Tạo bộ mã mới nếu bộ mã đã lưu bị mất hoặc bị lộ.', right-aligned outlined button 'Tạo mã mới'. Below the rows place the small subdued text link 'Mất điện thoại?' and a short caption 'Xác minh chỉ khi đổi Authenticator hoặc tạo mã mới.'. Align titles and actions consistently. This should look like premium Google settings, not a dashboard.`,
  actions: `Design direction: focused action strip. Under the Google Authenticator heading show a small green 'Đã bật' pill and a short paragraph 'Tài khoản của bạn đang được bảo vệ bằng xác minh 2 bước.'. Place two compact adjacent buttons on one horizontal line: emerald solid primary 'Đổi Google Authenticator', thin slate outlined secondary 'Tạo mã khôi phục mới'. Immediately below show short muted help 'Bạn sẽ xác minh mã hiện tại trước khi thực hiện thay đổi.' Use one thin horizontal divider beneath this action area, then a small link 'Mất điện thoại?' with supporting text 'Dùng mã khôi phục để thiết lập lại ứng dụng.'. Plenty of breathing room, restrained product settings design, no cards.`,
  columns: `Design direction: compact wide settings. Under Google Authenticator show a small 'Đã bật' green pill, then use two balanced columns aligned at the same baseline, separated by a discreet thin vertical line. Left column: small smartphone line icon, heading 'Thiết bị xác thực', short text 'Đổi điện thoại hoặc thay khóa Google Authenticator.', and a compact emerald primary button 'Đổi Google Authenticator'. Right column: small recovery document line icon, heading 'Mã khôi phục', short text 'Tạo bộ mã mới khi mất hoặc nghi ngờ mã cũ bị lộ.', compact outlined button 'Tạo mã khôi phục mới'. Under both columns on one shared baseline, small text link 'Mất điện thoại?' and small muted text 'Chỉ yêu cầu xác minh khi bạn thực hiện thay đổi.'. Keep both columns on the white base surface, no enclosing cards, no giant feature tiles.`
}
if (!directions[direction]) throw new Error('Choose a known direction')
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base) throw new Error('NINEROUTER_URL unavailable')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
const referencePath = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-6ca31d1c-2771-4237-8d28-e7738e0b88d3.png'
const dir = new URL(`./${direction}/`, import.meta.url)
await mkdir(dir, { recursive: true })
await copyFile(referencePath, new URL('reference.png', dir))
const reference = `data:image/png;base64,${(await readFile(referencePath)).toString('base64')}`
const prompt = `Create ONE realistic production-quality Vietnamese desktop web-app UI demo for AN KHANG HOME. AUTHORITATIVE REFERENCE: the ONE attached screenshot is the user's current account-security modal and is the source of truth for the brand, header, tab strip and container. Preserve the white rounded wide modal with approximately 1020px natural CSS width, navy text, slate supporting text, emerald underline, exact upper header 'AN KHANG HOME' / 'Hồ sơ cá nhân' / close X, heading 'Bảo mật tài khoản', subtitle 'Quản lý phương thức bảo mật, thiết bị tin cậy và phiên đăng nhập của bạn.', and all four existing tabs 'Bảo mật', 'Thiết bị', 'Hoạt động', 'Đổi mật khẩu'. Preserve compact scale: main title about 32px, body 14-16px, section heading 20px, buttons 38-42px high, restrained padding. Use a 1536x1024 canvas with the full reference modal and gently dimmed background visible; keep its proportions natural, do not stretch it or make it larger to fill the canvas. EXACT REQUESTED CHANGE: turn the empty Google Authenticator detail page into useful management, with account setup status 'Đã bật', an action to change Google Authenticator, an action to create a fresh recovery-code bundle, and a subdued 'Mất điện thoại?' link. Viewing this page never asks for an OTP; OTP verification appears later only after selecting a sensitive action. Remove the standalone 'Xác minh lại' action and the 'Đã xác minh gần đây' badge. ${directions[direction]} Current date anchor 12/10/2026 Asia/Bangkok; omit dates since no real enrollment date is supplied. Show this management overview only, before any action is clicked. All Vietnamese labels must be properly accented, readable and unclipped. Prioritize spacing and alignment over cards, borders and shadows. AVOID: changing the header, adding tabs or navigation, making modal or typography oversized, giant buttons, gradients, purple, illustrations, feature dashboards, nested cards, invented enrollment dates or phone models, inventing number of remaining codes, real account data, recovery-code values, QR codes, secret keys, OTP inputs at this overview step, disable-2FA controls (2FA is mandatory), preview of old QR, restore-old-code button, English labels, browser/OS chrome, watermarks, collages or multiple designs in one image. Output only this one app UI demo.`
await writeFile(new URL('prompt.txt', dir), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(20000) })
    if (!catalogResponse.ok || !(await catalogResponse.json()).data?.some(item => item.id === model)) throw new Error('Selected image model unavailable')
    console.log(`Generating ${direction}; attempt ${attempt}`)
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
    await writeFile(new URL('demo.png', dir), Buffer.from(bytes, 'base64'))
    await writeFile(new URL('generation.json', dir), JSON.stringify({ generatedAt: new Date().toISOString(), model, direction, authoritativeReference: referencePath, output: 'demo.png', status: 'Visual proposal only; no application changes.' }, null, 2) + '\n')
    console.log(`Saved docs/design/authenticator-management/${direction}/demo.png`)
    break
  } catch (error) {
    console.log(error.message)
    if (attempt === 3) { process.exitCode = 1; break }
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}
