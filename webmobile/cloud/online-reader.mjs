import { meterPrompt, parseMeterResult } from '../server/meter-recognition.mjs'
import jpeg from 'jpeg-js'

export function validateCloudPhoto(image) {
  if (typeof image !== 'string' || image.length > 4_000_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('invalid_image')
  const data = Uint8Array.from(atob(image.slice(image.indexOf(',') + 1)), c => c.charCodeAt(0))
  let decoded
  try { decoded = jpeg.decode(data, { useTArray: true, maxResolutionInMP: 7, maxMemoryUsageInMB: 128 }) } catch { throw new Error('invalid_image') }
  if (decoded.width < 240 || decoded.height < 180 || decoded.width > 2560 || decoded.height > 2560) throw new Error('image_too_small')
  let count = 0, sum = 0, squares = 0
  for (let i = 0; i < decoded.data.length; i += 4 * 16) {
    const value = decoded.data[i] * .299 + decoded.data[i + 1] * .587 + decoded.data[i + 2] * .114
    sum += value; squares += value * value; count++
  }
  if (Math.sqrt(Math.max(0, squares / count - (sum / count) ** 2)) < 3) throw new Error('image_blank')
  return data
}

export async function readCloudMeter(image, meter, env, fetcher = fetch) {
  validateCloudPhoto(image)
  if (!env.METER_CLOUD_API_KEY) throw new Error('provider_unavailable')
  const started = performance.now()
  const controller = new AbortController()
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
  async function pass(verification) {
    let endpoint, headers, body
    // Cloud reads keep all uploaded image edges; no automatic target guessing.
    const prompt = meterPrompt(meter, verification).replace('Image 1 is the uploaded meter photograph, image 2 is a slightly higher-contrast view of THE SAME photograph with identical edges, not a different meter.', 'There is one uploaded photograph. Read its original digits without inventing sharpening details.')
    if (env.METER_CLOUD_PROVIDER === 'gemini') {
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.METER_CLOUD_MODEL)}:generateContent`
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': env.METER_CLOUD_API_KEY }
      body = { contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: image.slice(image.indexOf(',') + 1) } }] }], generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json', ...(env.METER_CLOUD_MODEL.startsWith('gemini-2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }
    } else {
      const base = new URL(env.METER_CLOUD_BASE_URL)
      if (base.protocol !== 'https:' || /^(localhost|127\.|0\.|10\.|192\.168\.|\[|169\.254\.)/.test(base.hostname)) throw new Error('provider_unavailable')
      endpoint = `${base.href.replace(/\/$/, '')}/chat/completions`
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${env.METER_CLOUD_API_KEY}` }
      body = { model: env.METER_CLOUD_MODEL, temperature: 0, max_tokens: 350, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image, detail: 'high' } }] }] }
    }
    const response = await fetcher(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (!response.ok) throw new Error(response.status === 429 ? 'provider_quota' : response.status === 503 ? 'provider_busy' : response.status === 404 ? 'model_unavailable' : [401, 403].includes(response.status) ? 'provider_auth' : 'provider_failed')
    const result = await response.json()
    const text = env.METER_CLOUD_PROVIDER === 'gemini' ? result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('') : result.choices?.[0]?.message?.content
    return parseMeterResult(text, meter)
  }
  try {
    const [a, b] = await Promise.all([pass(false), pass(true)])
    if (!a.ok) return a
    if (!b.ok) return b
    if (a.digits !== b.digits) return { ok: false, reason: 'Hai lần đọc chưa thống nhất từng chữ số. Hãy chụp lại dãy số rõ hơn.' }
    return { ...a, source: 'ai-ocr', needsConfirmation: true, elapsedMs: Math.round(performance.now() - started) }
  } finally { controller.abort() }
}
