import { readMeterImage } from './meter-reader.mjs'
import { assessReading, demoMeterContexts } from '../src/meter-policy.mjs'
import { randomUUID } from 'node:crypto'
import { createDemoPaymentStore, installDemoPaymentApi } from './demo-payments.mjs'
import { paymentBankFromEnv, invoicePropertyFromEnv } from './payment-recipient.mjs'

// Match the browser's binary upload limit. The small envelope allowance covers
// FormData field names and its boundary without accepting a large extra body.
const MAX_METER_JPEG_BYTES = 2_962_482
const MAX_METER_MULTIPART_BYTES = MAX_METER_JPEG_BYTES + 65_536
const MAX_METER_JSON_BYTES = 4_100_000

function requestError(reason, status = 400) {
  return Object.assign(new Error(reason), { status })
}

async function readBody(req, limit) {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) throw requestError('Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.', 413)
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > limit) throw requestError('Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.', 413)
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

function validContractId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value)
}

function singleFormValue(form, name) {
  const values = form.getAll(name)
  return values.length === 1 ? values[0] : null
}

async function readMeterRequest(req) {
  const contentType = String(req.headers['content-type'] || '')
  if (/^multipart\/form-data\s*;/i.test(contentType)) {
    const raw = await readBody(req, MAX_METER_MULTIPART_BYTES)
    let form
    try {
      form = await new Request('http://localhost/api/meter-ocr', {
        method: 'POST', headers: { 'Content-Type': contentType }, body: raw
      }).formData()
    } catch {
      throw requestError('Ảnh hoặc loại công tơ không hợp lệ.')
    }
    const meter = singleFormValue(form, 'meter')
    const contractId = singleFormValue(form, 'contractId')
    const image = singleFormValue(form, 'image')
    if (!['electric', 'water'].includes(meter) || !validContractId(contractId) || !image || typeof image === 'string' || String(image.type || '').toLowerCase() !== 'image/jpeg' || typeof image.arrayBuffer !== 'function') throw requestError('Ảnh hoặc loại công tơ không hợp lệ.')
    if (!Number.isSafeInteger(image.size) || image.size < 4) throw requestError('Ảnh hoặc loại công tơ không hợp lệ.')
    if (image.size > MAX_METER_JPEG_BYTES) throw requestError('Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.', 413)
    const bytes = Buffer.from(await image.arrayBuffer())
    if (bytes.length !== image.size || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw requestError('Ảnh hoặc loại công tơ không hợp lệ.')
    return { meter, contractId, image: `data:image/jpeg;base64,${bytes.toString('base64')}` }
  }
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw requestError('Định dạng ảnh không hợp lệ.', 415)
  const raw = await readBody(req, MAX_METER_JSON_BYTES)
  let data
  try { data = JSON.parse(raw.toString('utf8') || '{}') } catch { throw requestError('Yêu cầu đọc ảnh không hợp lệ.') }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw requestError('Yêu cầu đọc ảnh không hợp lệ.')
  return data
}

export function meterDevApi(env) {
  let running = 0
  const approvedPhotos = new Map()
  const confirmations = new Map()
  const payments = createDemoPaymentStore({ confirmedReading: token => confirmations.get(token), paymentBank: paymentBankFromEnv(env), propertyInfo: invoicePropertyFromEnv(env) })
  return {
    name: 'meter-ocr-development-api',
    configureServer(server) {
      installDemoPaymentApi(server, payments)
      server.middlewares.use('/api/meter-ocr', async (req, res) => {
        const send = (status, body) => { if (!res.destroyed) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)) } }
        if (req.method !== 'POST') { send(405, { ok: false, reason: 'Yêu cầu đọc ảnh không hợp lệ.' }); return }
        const origin = req.headers.origin
        if (origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(origin)) { send(403, { ok: false, reason: 'Không cho phép truy cập.' }); return }
        if (running >= 2) { send(429, { ok: false, reason: 'Hệ thống đang đọc ảnh khác. Hãy thử lại sau ít giây.' }); return }
        const baseUrl = env.METER_OCR_BASE_URL || env.NINEROUTER_URL
        running++
        const abort = new AbortController()
        res.on('close', () => { if (!res.writableEnded) abort.abort() })
        try {
          const data = await readMeterRequest(req)
          const context = demoMeterContexts[data.contractId]?.[data.meter]
          if (!context) { send(400, { ok: false, reason: 'Chưa xác định được công tơ của hợp đồng hiện tại.' }); return }
          for (const [token, entry] of approvedPhotos) if (entry.expiresAt < Date.now()) approvedPhotos.delete(token)
          for (const [token, entry] of confirmations) if (entry.expiresAt < Date.now()) confirmations.delete(token)
          if (data.mode === 'check') {
            const entry = approvedPhotos.get(data.reviewToken)
            if (!entry || entry.contractId !== data.contractId || entry.meter !== data.meter) { send(400, { ok: false, reason: 'Ảnh chưa qua kiểm tra hoặc đã hết hạn. Hãy chụp lại.' }); return }
            const assessment = assessReading(data.reading, data.meter, context)
            const source = data.source === 'manual' || data.reading !== entry.reading ? 'manual' : 'ai-ocr'
            let confirmationToken = null
            if (assessment.status === 'pass') {
              if (confirmations.size >= 300) confirmations.delete(confirmations.keys().next().value)
              confirmationToken = randomUUID()
              confirmations.set(confirmationToken, { contractId: data.contractId, meter: data.meter, reading: data.reading, source, expiresAt: Date.now() + 60 * 60_000 })
            }
            send(200, { ok: assessment.status === 'pass', assessment, reason: assessment.reason, source, confirmationToken }); return
          }
          if (!baseUrl) { send(503, { ok: false, reason: 'Dịch vụ đọc ảnh chưa được cấu hình. Hãy thử lại sau.' }); return }
          const result = await readMeterImage(data.image, data.meter, { baseUrl, apiKey: env.METER_OCR_API_KEY || env.NINEROUTER_KEY, model: env.METER_OCR_MODEL || 'cx/gpt-6.1-sol', signal: abort.signal })
          if (!result.ok) { send(200, result); return }
          const assessment = assessReading(result.reading, data.meter, context)
          let reviewToken = null
          if (assessment.status === 'pass') {
            if (approvedPhotos.size >= 200) approvedPhotos.delete(approvedPhotos.keys().next().value)
            reviewToken = randomUUID()
            approvedPhotos.set(reviewToken, { meter: data.meter, contractId: data.contractId, reading: result.reading, expiresAt: Date.now() + 10 * 60_000 })
          }
          send(200, { ...result, assessment, reviewToken })
        } catch (error) {
          if (abort.signal.aborted) return
          const imageReason = error.message === 'image_too_small' ? 'Ảnh quá nhỏ để đọc. Hãy chụp gần bằng ảnh gốc có độ phân giải cao hơn.' : error.message === 'image_blank' ? 'Ảnh không có đủ chi tiết. Hãy chụp lại riêng một công tơ rõ số.' : null
          const invalid = !!imageReason || error instanceof SyntaxError || ['invalid_meter', 'invalid_image'].includes(error.message)
          const timeout = ['TimeoutError', 'AbortError'].includes(error.name)
          const status = Number.isInteger(error.status) ? error.status : invalid ? 400 : timeout ? 504 : 503
          send(status, { ok: false, reason: imageReason || (error.status ? error.message : invalid ? 'Ảnh hoặc loại công tơ không hợp lệ.' : timeout ? 'Dịch vụ đọc số phản hồi chậm. Hãy thử lại sau ít giây.' : 'Chưa đọc được ảnh lúc này. Hãy thử lại hoặc chụp lại.') })
        } finally { running-- }
      })
    }
  }
}
