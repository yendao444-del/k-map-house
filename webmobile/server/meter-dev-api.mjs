import { readMeterImage } from './meter-reader.mjs'
import { assessReading, demoMeterContexts } from '../src/meter-policy.mjs'
import { randomUUID } from 'node:crypto'
import { createDemoPaymentStore, installDemoPaymentApi } from './demo-payments.mjs'
import { paymentBankFromEnv, invoicePropertyFromEnv } from './payment-recipient.mjs'

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
        if (!String(req.headers['content-type']).startsWith('application/json')) { send(415, { ok: false, reason: 'Định dạng ảnh không hợp lệ.' }); return }
        if (running >= 2) { send(429, { ok: false, reason: 'Hệ thống đang đọc ảnh khác. Hãy thử lại sau ít giây.' }); return }
        const baseUrl = env.METER_OCR_BASE_URL || env.NINEROUTER_URL
        running++
        const abort = new AbortController()
        res.on('close', () => { if (!res.writableEnded) abort.abort() })
        try {
          let body = '', bytes = 0
          for await (const chunk of req) {
            bytes += chunk.length
            if (bytes > 4_100_000) { send(413, { ok: false, reason: 'Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.' }); return }
            body += chunk.toString()
          }
          const data = JSON.parse(body)
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
          send(invalid ? 400 : timeout ? 504 : 503, { ok: false, reason: imageReason || (invalid ? 'Ảnh hoặc loại công tơ không hợp lệ.' : timeout ? 'Dịch vụ đọc số phản hồi chậm. Hãy thử lại sau ít giây.' : 'Chưa đọc được ảnh lúc này. Hãy thử lại hoặc chụp lại.') })
        } finally { running-- }
      })
    }
  }
}
