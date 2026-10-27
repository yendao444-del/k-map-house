import { assessReading, demoMeterContexts } from '../src/meter-policy.mjs'
import { createDemoPaymentStore } from '../server/demo-payments.mjs'
import { readCloudMeter } from './online-reader.mjs'
import { paymentBankFromEnv, invoicePropertyFromEnv } from '../server/payment-recipient.mjs'
import { authService } from './auth.mjs'
import { tenantPaymentRequest } from './tenant-payments.mjs'

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (reason, status = 400) => Object.assign(new Error(reason), { status })
// `data:image/jpeg;base64,` is 23 characters; this is the exact old 3,950,000-character ceiling.
const MAX_METER_JPEG_BYTES = 2_962_482
const meterUploadFields = new Set(['meter', 'contractId', 'image'])

function base64(bytes) {
  let text = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) text += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)))
  return btoa(text)
}

async function requestData(request, endpoint) {
  const contentType = request.headers.get('content-type') || ''
  if (endpoint === 'meter-ocr' && /^multipart\/form-data\s*;/i.test(contentType)) {
    const form = await request.formData()
    for (const [name] of form) if (!meterUploadFields.has(name)) throw fail('Ảnh hoặc loại công tơ không hợp lệ.')
    const meters = form.getAll('meter'), contractIds = form.getAll('contractId'), images = form.getAll('image')
    if (meters.length !== 1 || contractIds.length !== 1 || images.length !== 1) throw fail('Ảnh hoặc loại công tơ không hợp lệ.')
    const meter = meters[0], contractId = contractIds[0], image = images[0]
    if (!['electric', 'water'].includes(meter) || typeof contractId !== 'string' || !contractId || contractId !== contractId.trim() || contractId.length > 160 || /[\u0000-\u001f\u007f]/.test(contractId) || !image || typeof image === 'string' || String(image.type || '').toLowerCase() !== 'image/jpeg' || typeof image.arrayBuffer !== 'function') throw fail('Ảnh hoặc loại công tơ không hợp lệ.')
    if (!Number.isSafeInteger(image.size) || image.size < 4) throw fail('Ảnh hoặc loại công tơ không hợp lệ.')
    if (image.size > MAX_METER_JPEG_BYTES) throw fail('Ảnh quá lớn để đọc.', 413)
    const bytes = new Uint8Array(await image.arrayBuffer())
    // MIME metadata is client supplied, so also require JPEG's start marker.
    if (bytes.byteLength !== image.size || bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw fail('Ảnh hoặc loại công tơ không hợp lệ.')
    return { meter, contractId, image: `data:image/jpeg;base64,${base64(bytes)}` }
  }
  if (!contentType.startsWith('application/json')) throw fail('Yêu cầu không hợp lệ.', 415)
  const text = await request.text()
  if (text.length > (endpoint === 'meter-ocr' ? 4_100_000 : 8192)) throw fail('Yêu cầu quá lớn.', 413)
  return JSON.parse(text)
}

export function cloudHandler(env, rpc, reader = readCloudMeter, authentication = authService(env, rpc)) {
  return async request => {
    if (!env.WEBMOBILE_GATEWAY_SECRET || request.headers.get('authorization') !== `Bearer ${env.WEBMOBILE_GATEWAY_SECRET}`) return reply(403, { ok: false, reason: 'Không cho phép truy cập.' })
    const endpoint = request.headers.get('x-webmobile-endpoint')
    if (endpoint === 'health' && request.method === 'GET') return reply(200, {
      ok: true,
      mode: 'tenant',
      backend: 'online',
      ocrConfigured: !!env.METER_CLOUD_API_KEY,
      authRequired: env.WEBMOBILE_AUTH_REQUIRED === 'true'
    })
    if (!['meter-ocr', 'demo-payments', 'tenant-payments', 'auth'].includes(endpoint) || (endpoint !== 'auth' && request.method !== 'POST')) return reply(405, { ok: false, reason: 'Yêu cầu không hợp lệ.' })
    if (endpoint === 'auth') {
      try {
        const authId = request.headers.get('x-webmobile-auth-session')
        const data = await request.json()
        const ip = request.headers.get('x-webmobile-ip')
        if (!/^[a-f0-9]{64}$/.test(ip || '')) return reply(403, { ok: false, reason: 'Yêu cầu không hợp lệ.' })
        if (data.action === 'login') {
          const signed = await authentication.login(data, ip, authId)
          return reply(200, { ok: true, sessionId: signed.id, profile: signed.profile })
        }
        if (data.action === 'session') return reply(200, { ok: true, profile: await authentication.session(authId) })
        if (data.action === 'logout') { await authentication.logout(authId); return reply(200, { ok: true }) }
        return reply(400, { ok: false, reason: 'Thao tác tài khoản không hợp lệ.' })
      } catch (cause) { return reply(cause.status || 503, { ok: false, reason: cause.status ? cause.message : 'Chưa kết nối được dịch vụ đăng nhập. Hãy thử lại.' }) }
    }
    const id = request.headers.get('x-webmobile-session'), ip = request.headers.get('x-webmobile-ip')
    if (!uuid.test(id || '') || !/^[a-f0-9]{64}$/.test(ip || '')) return reply(403, { ok: false, reason: 'Phiên thử không hợp lệ.' })
    let state, lease
    try {
      let profile
      // Authorize the browser session before parsing or converting an image upload.
      if (env.WEBMOBILE_AUTH_REQUIRED === 'true' || endpoint === 'tenant-payments') {
        profile = await authentication.session(request.headers.get('x-webmobile-auth-session'))
      }
      const data = await requestData(request, endpoint)
      if (profile) {
        if (profile.mode === 'tenant') {
          if (endpoint === 'demo-payments') throw fail('Không dùng hóa đơn demo cho tài khoản thật.',403)
          return reply(200,await tenantPaymentRequest(profile,endpoint,data,env,rpc,reader,ip,id))
        }
        if(endpoint==='tenant-payments') throw fail('Tài khoản demo không được truy cập hóa đơn thật.',403)
        if ((endpoint === 'meter-ocr' || data.action === 'create') && data.contractId !== profile.contractId) throw fail('Bạn không có quyền truy cập phòng này.', 403)
        if (endpoint === 'demo-payments' && data.action === 'simulate') throw fail('Giao dịch thử chỉ dành cho kiểm thử nội bộ.', 403)
      }
      // No session/database/quota writes until a real cloud provider is configured.
      if (endpoint === 'meter-ocr' && data.mode !== 'check' && !env.METER_CLOUD_API_KEY) return reply(503, { ok: false, code: 'OCR_NOT_CONFIGURED', reason: 'Chức năng đọc số AI online chưa được cấu hình. Chủ nhà đang bổ sung API; ảnh chưa được xác nhận.' })
      lease = crypto.randomUUID()
      const claimed = await rpc('webmobile_demo_claim', { p_id: id, p_lease: lease })
      if (claimed.busy) return reply(409, { ok: false, reason: 'Phiên này đang xử lý. Hãy chờ vài giây rồi thử lại.' })
      state = claimed.state || {}
      if (profile && state.userId && state.userId !== profile.userId) throw fail('Phiên hóa đơn không thuộc tài khoản này.', 403)
      if (profile) state.userId = profile.userId
      state.photos ||= {}; state.confirmations ||= {}
      for (const entries of [state.photos, state.confirmations]) for (const [token, value] of Object.entries(entries)) if (value.expiresAt < Date.now()) delete entries[token]
      let result
      if (endpoint === 'meter-ocr') {
        const context = demoMeterContexts[data.contractId]?.[data.meter]
        if (!context) throw fail('Chưa xác định được công tơ của hợp đồng demo.')
        if (data.mode === 'check') {
          const photo = state.photos[data.reviewToken]
          if (!photo || photo.contractId !== data.contractId || photo.meter !== data.meter) throw fail('Ảnh chưa qua kiểm tra hoặc đã hết hạn. Hãy chụp lại.')
          const assessment = assessReading(data.reading, data.meter, context)
          const source = data.source === 'manual' || photo.reading !== data.reading ? 'manual' : 'ai-ocr'
          const confirmationToken = assessment.status === 'pass' ? crypto.randomUUID() : null
          if (confirmationToken) state.confirmations[confirmationToken] = { contractId: data.contractId, meter: data.meter, reading: data.reading, source, expiresAt: Date.now() + 3600000 }
          result = { ok: assessment.status === 'pass', assessment, reason: assessment.reason, source, confirmationToken }
        } else {
          if (!await rpc('webmobile_demo_quota', { p_ip: ip, p_session: id })) throw fail('Đã đạt giới hạn đọc ảnh demo hôm nay. Hãy thử lại sau.', 429)
          result = await reader(data.image, data.meter, env)
          if (result.ok) {
            const assessment = assessReading(result.reading, data.meter, context)
            const reviewToken = assessment.status === 'pass' ? crypto.randomUUID() : null
            if (reviewToken) state.photos[reviewToken] = { contractId: data.contractId, meter: data.meter, reading: result.reading, expiresAt: Date.now() + 600000 }
            result = { ...result, assessment, reviewToken }
          }
        }
      } else {
        const payments = createDemoPaymentStore({ confirmedReading: token => state.confirmations[token], snapshot: state.payments, paymentBank: paymentBankFromEnv(env), propertyInfo: invoicePropertyFromEnv(env) })
        await payments.ready()
        if (data.action === 'create') result = { ok: true, ...await payments.create(data) }
        else if (data.action === 'status') result = { ok: true, invoice: payments.status(data.id, data.accessToken) }
        else if (data.action === 'simulate') result = { ok: true, ...payments.simulate(data.id, data.accessToken, data.scenario) }
        else throw fail('Thao tác demo không hợp lệ.')
        state.payments = payments.snapshot()
      }
      if (!await rpc('webmobile_demo_release', { p_id: id, p_lease: lease, p_state: state })) { state = null; throw fail('Phiên đã thay đổi. Hãy thử lại.', 409) }
      state = null
      return reply(200, result)
    } catch (cause) {
      const reasons = { image_blank: 'Ảnh không có đủ chi tiết. Hãy chụp lại riêng một công tơ rõ số.', image_too_small: 'Ảnh không đủ độ phân giải để đọc. Hãy chụp lại gần hơn.', invalid_image: 'Ảnh không hợp lệ. Hãy chọn ảnh khác.', provider_failed: 'API AI online chưa phản hồi hợp lệ. Hãy thử lại sau.', provider_quota: 'API AI đã đạt giới hạn lượt đọc. Hãy thử lại sau.', provider_unavailable: 'Chức năng đọc số AI online chưa được cấu hình.', provider_busy: 'Dịch vụ AI đang quá tải. Hãy thử đọc lại sau ít giây.', model_unavailable: 'Model AI hiện tại không còn khả dụng. Chủ nhà cần cập nhật cấu hình.', provider_auth: 'API AI chưa xác thực được. Chủ nhà cần kiểm tra cấu hình khóa.' }
      const timeout = ['TimeoutError', 'AbortError'].includes(cause.name)
      return reply(cause.status || (timeout ? 504 : reasons[cause.message] ? 503 : 400), { ok: false, reason: reasons[cause.message] || (timeout ? 'AI phản hồi chậm. Hãy thử lại sau ít giây.' : cause.status ? cause.message : 'Chưa xử lý được yêu cầu. Hãy thử lại sau.') })
    } finally {
      if (state && lease) await rpc('webmobile_demo_release', { p_id: id, p_lease: lease, p_state: state }).catch(() => {})
    }
  }
}
