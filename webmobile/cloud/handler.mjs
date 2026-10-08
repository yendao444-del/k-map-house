import { assessReading, demoMeterContexts } from '../src/meter-policy.mjs'
import { createDemoPaymentStore } from '../server/demo-payments.mjs'
import { readCloudMeter } from './online-reader.mjs'
import { paymentBankFromEnv, invoicePropertyFromEnv } from '../server/payment-recipient.mjs'
import { authService } from './auth.mjs'

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (reason, status = 400) => Object.assign(new Error(reason), { status })

export function cloudHandler(env, rpc, reader = readCloudMeter, authentication = authService(env, rpc)) {
  return async request => {
    if (!env.WEBMOBILE_GATEWAY_SECRET || request.headers.get('authorization') !== `Bearer ${env.WEBMOBILE_GATEWAY_SECRET}`) return reply(403, { ok: false, reason: 'Không cho phép truy cập.' })
    const endpoint = request.headers.get('x-webmobile-endpoint')
    if (endpoint === 'health' && request.method === 'GET') return reply(200, { ok: true, mode: 'demo', backend: 'online', ocrConfigured: !!env.METER_CLOUD_API_KEY, provider: env.METER_CLOUD_PROVIDER || null, authRequired: env.WEBMOBILE_AUTH_REQUIRED === 'true', realPayments: false, realTenantData: true, realTenantAccounts: true })
    if (!['meter-ocr', 'demo-payments', 'auth'].includes(endpoint) || (endpoint !== 'auth' && request.method !== 'POST')) return reply(405, { ok: false, reason: 'Yêu cầu không hợp lệ.' })
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
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { ok: false, reason: 'Yêu cầu không hợp lệ.' })
    const id = request.headers.get('x-webmobile-session'), ip = request.headers.get('x-webmobile-ip')
    if (!uuid.test(id || '') || !/^[a-f0-9]{64}$/.test(ip || '')) return reply(403, { ok: false, reason: 'Phiên thử không hợp lệ.' })
    let state, lease
    try {
      const text = await request.text()
      if (text.length > (endpoint === 'meter-ocr' ? 4_100_000 : 8192)) return reply(413, { ok: false, reason: 'Yêu cầu quá lớn.' })
      const data = JSON.parse(text)
      let profile
      if (env.WEBMOBILE_AUTH_REQUIRED === 'true') {
        profile = await authentication.session(request.headers.get('x-webmobile-auth-session'))
        if (profile.mode === 'tenant') throw fail('Chức năng điện nước và thanh toán thật đang được kết nối. Không dùng hóa đơn demo cho tài khoản thật.', 403)
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
