import { prepareMeterViews } from './meter-image.mjs'
// Server-only image reader. Provider credentials never enter a VITE_* variable.
import { meterPrompt, parseMeterResult } from './meter-recognition.mjs'
export { meterPrompt, parseMeterResult } from './meter-recognition.mjs'

export async function readMeterImage(image, meter, options) {
  if (!['electric', 'water'].includes(meter)) throw new Error('invalid_meter')
  if (!options.baseUrl || !options.model) throw new Error('provider_unavailable')
  const started = performance.now()
  const views = await prepareMeterViews(image)
  const headers = { 'Content-Type': 'application/json' }
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`
  const controller = new AbortController()
  const signals = [controller.signal, AbortSignal.timeout(options.timeoutMs || 15000)]
  if (options.signal) signals.push(options.signal)
  const signal = AbortSignal.any(signals)
  async function pass(verification) {
    const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model: options.model, stream: false, reasoning_effort: 'low', max_tokens: 250, messages: [{ role: 'user', content: [{ type: 'text', text: meterPrompt(meter, verification) }, { type: 'image_url', image_url: { url: views.full, detail: 'high' } }, { type: 'image_url', image_url: { url: views.detail, detail: 'high' } }] }] }),
      signal
    })
    if (!response.ok) throw new Error('provider_failed')
    const data = await response.json()
    return parseMeterResult(data.choices?.[0]?.message?.content, meter)
  }
  try {
    const [first, second] = await Promise.all([pass(false), pass(true)])
    if (!first.ok) return first
    if (!second.ok) return second
    if (second.digits !== first.digits) return { ok: false, reason: 'Hai lần đọc chưa thống nhất từng chữ số. Hãy chụp lại dãy số rõ hơn.' }
    return { ...first, source: 'ai-ocr', needsConfirmation: true, elapsedMs: Math.round(performance.now() - started) }
  } finally { controller.abort() }
}
