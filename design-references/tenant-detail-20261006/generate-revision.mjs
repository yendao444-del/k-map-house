import fs from 'node:fs/promises'
import path from 'node:path'

// Reusable local gateway runner: input image, prompt file, output, canvas size.
const [source, promptFile, outputFile, size, secondary] = process.argv.slice(2)
if (!source || !promptFile || !outputFile || !size) throw new Error('Expected source, prompt, output and size')
const base = process.env.NINEROUTER_URL
if (!base) throw new Error('NINEROUTER_URL is not configured')
const headers = { 'Content-Type': 'application/json' }
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`
const image = 'data:image/png;base64,' + (await fs.readFile(source)).toString('base64')
const images = secondary ? [image, 'data:image/png;base64,' + (await fs.readFile(secondary)).toString('base64')] : undefined
const prompt = await fs.readFile(promptFile, 'utf8')
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers, signal: AbortSignal.timeout(20000) })
    if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
    const catalog = await catalogResponse.json()
    const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || (secondary ? 'cx/gpt-image-2.5' : 'cx/gpt-5.5-image')
    if (!catalog.data?.some(item => item.id === model)) throw new Error('Selected image model absent from current catalog')
    console.log(`Generating ${model}, attempt ${attempt}`)
    const response = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers, signal: AbortSignal.timeout(240000),
      body: JSON.stringify({ model, prompt, ...(images ? { images } : { image }), size, n: 1, response_format: 'b64_json' }),
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${raw.slice(0, 180)}`)
    let result
    try { result = JSON.parse(raw) } catch {
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.data?.[0]?.b64_json || event.b64_json) result = event
        } catch {}
      }
    }
    const b64 = result?.data?.[0]?.b64_json || result?.b64_json
    if (!b64) throw new Error('Gateway returned no image bytes')
    await fs.writeFile(outputFile, Buffer.from(b64, 'base64'))
    console.log(path.resolve(outputFile))
    break
  } catch (error) {
    console.error(`Attempt ${attempt}: ${error.message}`)
    if (attempt === 3 || /HTTP 40[13]|absent from current catalog/.test(error.message)) { process.exitCode = 1; break }
  }
}
