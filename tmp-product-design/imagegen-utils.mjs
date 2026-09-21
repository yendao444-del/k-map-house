import fs from 'node:fs/promises'

const singleReferenceModels = [
  'cx/gpt-5.5-image',
  'cx/gpt-image-2.5',
  'cx/gpt-image-2',
  'cx/gpt-image-2.5-sunburst'
]

const multiReferenceModels = [
  'cx/gpt-image-2.5',
  'cx/gpt-image-2',
  'cx/gpt-image-2.5-sunburst'
]

function headers() {
  const value = { 'Content-Type': 'application/json' }
  if (process.env.NINEROUTER_KEY) value.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`
  return value
}

async function catalog() {
  if (!process.env.NINEROUTER_URL) throw new Error('NINEROUTER_URL is not set')
  const response = await fetch(`${process.env.NINEROUTER_URL}/v1/models/image`, { headers: headers() })
  if (!response.ok) throw new Error(`Image model catalog failed: ${response.status} ${await response.text()}`)
  return (await response.json()).data ?? []
}

async function modelInfo(id) {
  const response = await fetch(`${process.env.NINEROUTER_URL}/v1/models/info?id=${encodeURIComponent(id)}`, {
    headers: headers()
  })
  return response.ok ? response.json() : null
}

export async function resolveImageModel(referenceCount) {
  const available = new Set((await catalog()).map((model) => model.id))
  const requested = process.env.PRODUCT_DESIGN_IMAGE_MODEL
  const candidates = requested
    ? [requested]
    : (referenceCount > 1 ? multiReferenceModels : singleReferenceModels)

  for (const id of candidates) {
    if (!available.has(id)) continue
    const info = await modelInfo(id)
    if (referenceCount > 1 && !info?.capabilities?.includes('multiImage')) continue
    return id
  }
  throw new Error(`No compatible image model is available for ${referenceCount} reference image(s)`)
}

export async function generateImage({ outputPath, prompt, referencePaths = [], size = '1440x1024' }) {
  const model = await resolveImageModel(referencePaths.length)
  const images = await Promise.all(referencePaths.map(async (referencePath) => {
    const bytes = await fs.readFile(referencePath)
    return `data:image/png;base64,${bytes.toString('base64')}`
  }))
  const body = {
    model,
    prompt: [
      'Treat the first attached image as the authoritative product reference. Preserve its real application shell, language, visual hierarchy, and density unless the request explicitly changes them. Generate one coherent desktop UI screen only. Keep Vietnamese text crisp, aligned, and readable; do not invent extra modules.',
      prompt,
      'Final quality check: no browser chrome, device frame, watermark, duplicated panels, clipped content, malformed Vietnamese, or unrelated branding.'
    ].join('\n\n'),
    size,
    quality: 'high',
    background: 'opaque',
    image_detail: 'high',
    output_format: 'png',
    response_format: 'b64_json'
  }
  if (images.length) body.images = images

  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${process.env.NINEROUTER_URL}/v1/images/generations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body)
    })
    if (response.ok) {
      const payload = await response.json()
      const item = payload.data?.[0]
      if (!item) throw new Error(`No image in response: ${JSON.stringify(payload).slice(0, 1200)}`)
      if (item.b64_json) {
        await fs.writeFile(outputPath, Buffer.from(item.b64_json, 'base64'))
      } else if (item.url) {
        const imageResponse = await fetch(item.url)
        await fs.writeFile(outputPath, Buffer.from(await imageResponse.arrayBuffer()))
      } else {
        throw new Error(`Unsupported image response: ${JSON.stringify(payload).slice(0, 1200)}`)
      }
      console.log(`${outputPath} (${model})`)
      return
    }
    lastError = `${response.status}: ${(await response.text()).slice(0, 1200)}`
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
  }
  throw new Error(`Image generation failed after 3 attempts: ${lastError}`)
}
