import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const endpoint = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!endpoint) throw new Error('NINEROUTER_URL is not configured.')

const headers = {
  'Content-Type': 'application/json',
  ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {})
}
const model = 'cx/gpt-5.5-image'
const referencePath = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-d0336f9a-12ce-431d-97fc-526ed9c57d3e.png'
const output = new URL('./compact-proposal.png', import.meta.url)
const reference = `data:image/png;base64,${(await readFile(referencePath)).toString('base64')}`

const prompt = `The attached screenshot is the AUTHORITATIVE current AN KHANG HOME desktop account-security modal. Preserve its exact Vietnamese content, white/navy/emerald visual language, horizontal tabs, thin dividers, line icons, background context, and the same four rows. Requested change only: make the entire modal modestly smaller and more balanced in the desktop application. Target a 1020px wide modal rather than the oversized current width, with about 30px inner horizontal padding, 32px title, 16px subtitle, 15px tabs, 18px row titles, 14px row supporting copy, 32px outline icons, and rows around 104px tall. Keep it comfortably centered with more of the blurred management dashboard visible around it. Retain clean, readable Vietnamese labels: Bao mat tai khoan, Google Authenticator, Thiet bi tin cay, Phien dang nhap, Hoat dong gan day. Preserve correct accents in the final UI. The goal is a compact calm dialog that feels proportional to the existing account menu, not a dense or tiny dialog. Avoid: redesigning information architecture, changing functionality, extra cards, scrolling, browser or OS chrome, clipped copy, new logos, decorative art, gradients, purple, fake security data, incorrect Vietnamese, or any real personal data. Output one realistic production-ready 1536x1024 desktop UI image only.`

await mkdir(fileURLToPath(new URL('./', import.meta.url)), { recursive: true })
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const catalogResponse = await fetch(`${endpoint}/v1/models/image`, { headers, signal: AbortSignal.timeout(15000) })
  const catalog = await catalogResponse.json()
  if (!catalogResponse.ok || !catalog.data?.some(item => item.id === model)) throw new Error(`${model} is unavailable.`)
  try {
    const response = await fetch(`${endpoint}/v1/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        prompt,
        images: [reference],
        n: 1,
        size: '1536x1024',
        quality: 'high',
        response_format: 'b64_json',
        output_format: 'png',
        image_detail: 'high'
      }),
      signal: AbortSignal.timeout(240000)
    })
    if (!response.ok) throw new Error(`Image generation HTTP ${response.status}`)
    const result = await response.json()
    if (!result.data?.[0]?.b64_json) throw new Error('Image response did not contain a PNG.')
    await writeFile(output, Buffer.from(result.data[0].b64_json, 'base64'))
    console.log(fileURLToPath(output))
    break
  } catch (error) {
    if (attempt === 3) throw error
  }
}
