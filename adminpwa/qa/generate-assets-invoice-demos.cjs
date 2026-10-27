const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}) }
const dir = __dirname
const assetSource = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-0f0018ea-905c-4f96-a57c-ce5a7ffda133.png'
const invoiceSource = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-64c53dd8-dae2-4ff0-96af-e27cad59f958.png'

async function cropReferences() {
  const assetRef = path.join(dir, 'ref-assets-room-header.png')
  const invoiceRef = path.join(dir, 'ref-invoice-header.png')
  await sharp(assetSource).extract({ left: 58, top: 34, width: 332, height: 548 }).png().toFile(assetRef)
  // Keep only the highlighted invoice header; remove tenant name, amounts, and other private fields.
  await sharp(invoiceSource).extract({ left: 104, top: 109, width: 284, height: 100 }).png().toFile(invoiceRef)
  return { assetRef, invoiceRef }
}

async function generate({ reference, output, prompt }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(30000) })
      if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
      const catalog = await catalogResponse.json()
      if (!catalog.data?.some(entry => entry.id === model)) throw new Error(`Model ${model} unavailable`)
      const image = `data:image/png;base64,${fs.readFileSync(reference).toString('base64')}`
      const response = await fetch(`${base}/v1/images/generations`, {
        method: 'POST', headers,
        body: JSON.stringify({ model, prompt, image, n: 1, response_format: 'b64_json' }),
        signal: AbortSignal.timeout(300000),
      })
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
      return { output, model, reference, generatedAt: new Date().toISOString() }
    } catch (error) {
      console.error(`${path.basename(output)} attempt ${attempt}: ${error.message}`)
      if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error
    }
  }
}

async function main() {
  if (!base) throw new Error('NINEROUTER_URL is missing')
  const { assetRef, invoiceRef } = await cropReferences()
  if (process.argv.includes('--crop-only')) { console.log(assetRef); console.log(invoiceRef); return }
  const jobs = [
    {
      reference: assetRef,
      output: path.join(dir, 'mobile-assets-header-demo.png'),
      prompt: `Create one faithful production-quality Vietnamese mobile PWA UI demo at 390 x 844 pixels. AUTHORITATIVE REFERENCE: the attached crop from the existing AN KHANG HOME room assets screen; preserve its emerald brand, white surfaces, room picker, bottom navigation, tabs, room photo, labels, icons, and overall visual language. EXACT REQUESTED CHANGE: fix the cramped room header at tablet/mobile widths by making the room identity a clear first row with the room photo on the left and room name/status on the right, then place summary and room actions in a readable full-width second section using a compact 2-column action grid or stacked rows; keep the assets list visible below. Ensure Vietnamese labels remain legible and no text wraps one character per line. Use synthetic room number 141 and generic counts only. Avoid: private tenant data, phone numbers, financial amounts, desktop fixed-width columns, tiny text, clipped labels, redesigning the whole app, new colors, gradients, browser chrome, device frame, annotations, arrows, or multiple concepts.`
    },
    {
      reference: invoiceRef,
      output: path.join(dir, 'mobile-invoice-actions-demo.png'),
      prompt: `Create one faithful production-quality Vietnamese mobile PWA UI demo at 390 x 844 pixels. AUTHORITATIVE REFERENCE: the attached crop from the existing AN KHANG HOME invoice header; preserve its emerald brand, white header, invoice icon, title hierarchy, and existing three actions. EXACT REQUESTED CHANGE: make the top invoice actions compact and balanced on mobile: keep the heading and short description in a readable left block, and place the actions in a single compact horizontal action row beneath or beside it with 40-44px touch targets, concise labels 'Đồng bộ', 'Xuất HĐ', 'Excel', recognizable icons, and no oversized vertical buttons. Keep the tab/filter area starting immediately below. Use synthetic content only; do not reproduce tenant names, phone numbers, dates, or money from the source crop. Avoid: private data, tall stacked buttons, unreadable text, cramped one-character wrapping, new navigation, gradients, browser chrome, device frame, annotations, arrows, or multiple concepts.`
    },
  ]
  // Start both independent generations before waiting for either result.
  const first = generate(jobs[0])
  const second = generate(jobs[1])
  const results = [await first, await second]
  fs.writeFileSync(path.join(dir, 'mobile-assets-invoice-demos.json'), JSON.stringify({ model, results }, null, 2))
  results.forEach(result => console.log(result.output))
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
