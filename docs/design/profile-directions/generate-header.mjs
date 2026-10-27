import { readFile, writeFile, copyFile } from 'node:fs/promises'

const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
if (!base) throw new Error('Missing image gateway')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
const reference = 'data:image/png;base64,' + (await readFile(new URL('./modern-3.png', import.meta.url))).toString('base64')
const prompt = `The attached approved modern-3 account UI screenshot is the sole authoritative reference. Extract and recreate ONLY its decorative dark navy/teal header background as a wide raster asset, approximately 2:1 aspect ratio. Preserve the approved deep midnight navy and muted teal palette, the fine elegant warm gold sweeping curves, and subtle architectural house motif toward the far right. Fill the entire output edge-to-edge with that background art, with the left 65 percent mostly quiet navy space so actual product identity can be overlaid later. Requested exact change: remove every UI element and expand the decorative background into a standalone wide header texture. Avoid all text, lettering, logos, watermarks, avatar, people, badges, buttons, interface panels, white borders, white margins, screenshots, browser chrome, illegible pseudo-text, neon, purple, heavy gradients, photoreal buildings and new ornament unrelated to the reference. One asset only.`
let completed = false
for (let attempt = 1; attempt <= 3 && !completed; attempt++) {
  try {
    const catalog = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(15000) })
    const models = await catalog.json()
    const model = 'cx/gpt-5.5-image'
    if (!catalog.ok || !models.data?.some(item => item.id === model)) throw new Error('Required image model unavailable')
    const response = await fetch(`${base}/v1/images/generations`, { method: 'POST', headers, body: JSON.stringify({ model, prompt, images: [reference], n: 1, size: '1536x1024', quality: 'high', response_format: 'b64_json', output_format: 'png', image_detail: 'high' }), signal: AbortSignal.timeout(240000) })
    const raw = await response.text()
    if (!response.ok) throw new Error(`Generation HTTP ${response.status}: ${raw.slice(0, 220)}`)
    const b64 = JSON.parse(raw).data?.[0]?.b64_json
    if (!b64) throw new Error('Provider returned no image')
    const target = new URL('./header-art.png', import.meta.url)
    await writeFile(target, Buffer.from(b64, 'base64'))
    await copyFile(target, 'src/renderer/src/assets/profile-header.png')
    await copyFile(target, 'adminpwa/src/renderer/src/assets/profile-header.png')
    completed = true
    console.log('SAVED header-art.png and both profile-header.png copies')
  } catch (error) {
    console.log(`header attempt ${attempt}: ${error.message}`)
    if (attempt === 3) process.exitCode = 1
    else await new Promise(resolve => setTimeout(resolve, 5000))
  }
}
