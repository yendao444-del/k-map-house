const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const emailValid = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
const tokenValid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export async function hashContractToken(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('')
}
export const newContractToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('')

// Electron staff JWTs and public link tokens
// have separate actions; a link never grants staff or direct database access.
export function contractConfirmationHandler(env, renderDocument, fetcher = fetch) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' }
  const reply = (status, data) => Response.json(data, { status, headers: { ...cors, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  const ref = () => new URL(env.SUPABASE_URL).hostname.split('.')[0]
  function ready() {
    const site = new URL(env.CONTRACT_PUBLIC_URL)
    if (env.CONTRACT_ENVIRONMENT === 'production') {
      if (ref() !== 'wtrycmiojsiliyjxsewz' || env.CONTRACT_DB_SCHEMA !== 'public' || site.origin !== 'https://pay.phongtroankhang.com') throw fail('Cấu hình xác nhận hợp đồng production không hợp lệ.', 503)
    } else if (env.CONTRACT_ENVIRONMENT === 'test') {
      if (ref() !== env.CONTRACT_TEST_PROJECT_REF || ref() === 'wtrycmiojsiliyjxsewz' || site.protocol !== 'https:' || ['pay.phongtroankhang.com', 'phongtroankhang.com'].includes(site.hostname)) throw fail('Luồng xác nhận TEST chưa được cấu hình riêng.', 503)
    } else throw fail('Luồng xác nhận hợp đồng chưa được cấu hình.', 503)
  }
  async function api(route, options = {}, token = env.SUPABASE_SERVICE_ROLE_KEY) {
    const response = await fetcher(`${env.SUPABASE_URL}${route}`, { ...options, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(route.startsWith('/rest/') && env.CONTRACT_DB_SCHEMA ? { 'Accept-Profile': env.CONTRACT_DB_SCHEMA, 'Content-Profile': env.CONTRACT_DB_SCHEMA } : {}), ...options.headers }, signal: AbortSignal.timeout(15000) })
    return { response, data: await response.json().catch(() => null) }
  }
  const post = data => ({ method: 'POST', body: JSON.stringify(data) })
  async function rpc(name, data) {
    const result = await api(`/rest/v1/rpc/${name}`, post(data))
    if (!result.response.ok) throw fail(result.data?.message || 'Chưa xử lý được xác nhận hợp đồng.', 409)
    return result.data
  }
  async function admin(request) {
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!bearer) throw fail('Cần đăng nhập quản trị viên Electron.', 401)
    const caller = await api('/auth/v1/user', {}, bearer)
    if (!caller.response.ok || !caller.data?.id) throw fail('Phiên Electron đã hết hạn.', 401)
    const found = await api(`/rest/v1/users?id=eq.${caller.data.id}&select=role,status`)
    if (!found.response.ok || found.data?.[0]?.role !== 'admin' || found.data[0].status !== 'active') throw fail('Chỉ admin được gửi hợp đồng.', 403)
    return caller.data.id
  }
  return async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'Yêu cầu không hợp lệ.' })
    try {
      ready()
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw fail('Yêu cầu không hợp lệ.', 415)
      const text = await request.text()
      if (text.length > 8192) throw fail('Yêu cầu quá lớn.', 413)
      let data
      try { data = JSON.parse(text) } catch { throw fail('Yêu cầu không hợp lệ.') }
      if (['availability', 'create', 'delivery', 'status', 'history', 'amendment_start', 'cancel_check', 'cancel', 'cancel_notice', 'cancel_notices', 'contract_history'].includes(data.action)) {
        const actor = await admin(request)
        if (data.action === 'cancel_notices') return reply(200, { ok: true, contracts: await rpc('contract_cancellation_notice', { p_contract: '', p_actor: actor, p_action: 'list' }) })
        if (data.action === 'availability') return reply(200, { ok: true, ready: true, environment: env.CONTRACT_ENVIRONMENT, publicUrl: env.CONTRACT_PUBLIC_URL })
        if (['amendment_start', 'cancel_check', 'cancel', 'cancel_notice', 'contract_history'].includes(data.action)) {
          if (typeof data.contractId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(data.contractId)) throw fail('Hợp đồng không hợp lệ.')
          const args = { p_contract: data.contractId }
          if (data.action === 'contract_history') return reply(200, { ok: true, events: await rpc('contract_history', args) })
          if (data.action === 'cancel_check') return reply(200, { ok: true, check: await rpc('contract_cancellation_check', args) })
          if (data.action === 'cancel_notice') {
            if (!['claim','sent','failed','uncertain'].includes(data.noticeAction) || data.noticeAction !== 'claim' && !/^[a-f0-9-]{36}$/i.test(data.attemptId || '')) throw fail('Lượt gửi thông báo không hợp lệ.')
            const notice = await rpc('contract_cancellation_notice', { ...args, p_actor: actor, p_action: data.noticeAction, p_attempt: data.attemptId || null, p_message: String(data.messageId || '').slice(0,128), p_error: String(data.error || '').slice(0,1000) })
            return reply(200, { ok: true, notice })
          }
          if (typeof data.reason !== 'string' || data.reason.trim().length < 5 || data.reason.length > 1000) throw fail('Nhập lý do từ 5 đến 1000 ký tự.')
          if (data.action === 'amendment_start') return reply(200, { ok: true, draft: await rpc('contract_amendment_start', { ...args, p_actor: actor, p_reason: data.reason.trim() }) })
          if (!['wrong_tenant','wrong_room','wrong_email','duplicate','test_reset'].includes(data.kind) || data.kind !== 'test_reset' && (typeof data.referenceId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(data.referenceId))) throw fail('Chọn lý do và hồ sơ đối chiếu hợp lệ.')
          return reply(200, { ok: true, ...await rpc('contract_cancel', { ...args, p_actor: actor, p_reason: data.reason.trim(), p_kind: data.kind, p_reference: data.kind === 'test_reset' ? null : data.referenceId }) })
        }
        if (!/^[a-f0-9-]{36}$/i.test(data.draftId || '')) throw fail('Bản nháp không hợp lệ.')
        if (data.action === 'status') return reply(200, { ok: true, confirmation: await rpc('contract_confirmation_status', { p_draft: data.draftId }) })
        if (data.action === 'history') return reply(200, { ok: true, events: await rpc('contract_confirmation_history', { p_draft: data.draftId }) })
        if (data.action === 'delivery') {
          if (!/^[a-f0-9-]{36}$/i.test(data.confirmationId || '')) throw fail('Lượt gửi không hợp lệ.')
          return reply(200, { ok: true, confirmation: await rpc('contract_confirmation_delivery', { p_draft: data.draftId, p_id: data.confirmationId, p_message: String(data.messageId || '').slice(0,128), p_failed: data.failed === true }) })
        }
        const draft = await api(`/rest/v1/contract_drafts?id=eq.${data.draftId}&select=*`)
        if (!draft.response.ok || !draft.data?.[0]) throw fail('Không tìm thấy bản nháp.', 404)
        const row = draft.data[0], email = row.recipient_email?.trim().toLowerCase()
        if (!emailValid(email)) throw fail('Bổ sung email hợp lệ trong hồ sơ khách thuê.')
        if (await rpc('tenant_system_email_conflict', { p_email: email })) throw fail('Email này thuộc tài khoản hệ thống. Hãy dùng email riêng của người thuê.', 409)
        const allowed = String(env.CONTRACT_TEST_EMAIL_ALLOWLIST || '').split(',').map(x => x.trim().toLowerCase())
        if (env.CONTRACT_ENVIRONMENT === 'test' && !allowed.includes(email)) throw fail('Email này chưa được cho phép nhận hợp đồng TEST.', 403)
        if (data.revision !== row.revision) throw fail('Bản nháp đã thay đổi. Hãy mở lại hợp đồng.', 409)
        const token = newContractToken()
        const created = await rpc('contract_confirmation_create', { p_draft: row.id, p_revision: row.revision, p_hash: await hashContractToken(token), p_actor: actor, p_document: renderDocument(row.snapshot, row.created_at) })
        const link = new URL('/contract-confirmation', env.CONTRACT_PUBLIC_URL)
        // Fragment is never part of the HTTP request, access log or Referer.
        link.hash = `token=${token}`
        return reply(200, { ok: true, confirmation: created, email, url: link.href, room: row.snapshot.room.name, tenantName: row.snapshot.tenant.full_name })
      }
      // Browser requests only pass through the same-origin Pages gateway.
      if (!env.CONTRACT_GATEWAY_SECRET || request.headers.get('authorization') !== `Bearer ${env.CONTRACT_GATEWAY_SECRET}`) throw fail('Không cho phép truy cập.', 403)
      if (!tokenValid(data.token)) throw fail('Link không hợp lệ hoặc đã hết hạn.', 410)
      const ip = request.headers.get('x-contract-ip')
      if (!/^[a-f0-9]{64}$/.test(ip || '') || !await rpc('webmobile_auth_rate', { p_ip: `contract:${ip}` })) throw fail('Bạn thử quá nhiều lần. Vui lòng chờ một phút.', 429)
      const hash = await hashContractToken(data.token)
      if (data.visitId !== undefined && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.visitId)) throw fail('Phiên xem không hợp lệ.')
      if (data.action === 'view') return reply(200, { ok: true, contract: { ...await rpc('contract_confirmation_open', { p_hash: hash, p_visit: data.visitId || null }), environment: env.CONTRACT_ENVIRONMENT } })
      if (data.action === 'document_viewed') {
        if (!data.visitId) throw fail('Phiên xem không hợp lệ.')
        await rpc('contract_confirmation_document_view', { p_hash: hash, p_visit: data.visitId })
        return reply(200, { ok: true })
      }
      if (data.action === 'confirm') {
        if (data.accepted !== true) throw fail('Vui lòng xác nhận đã đọc và đồng ý thông tin hợp đồng.')
        // The atomic RPC rechecks the current draft revision, room and tenant.
        const confirmed = await rpc('contract_confirmation_accept', { p_hash: hash })
        return reply(200, { ok: true, ...confirmed })
      }
      if (data.action === 'activate') {
        if (typeof data.password !== 'string' || data.password.length < 10 || data.password.length > 128) throw fail('Mật khẩu cần từ 10 đến 128 ký tự.')
        const claim = await rpc('contract_account_claim', { p_hash: hash })
        // A deterministic Auth ID lets retry recover an interrupted provision.
        const existing = await api(`/auth/v1/admin/users/${claim.userId}`)
        if (existing.response.status === 404) {
          const created = await api('/auth/v1/admin/users', post({ id: claim.userId, email: claim.email, password: data.password, email_confirm: true, role: 'anon', app_metadata: { portal_role: 'webmobile_tenant', contract_confirmation_id: claim.id }, user_metadata: { full_name: claim.name, username: `portal_${claim.userId.replaceAll('-','')}` } }))
          if (!created.response.ok) {
            const code = created.data?.code || created.data?.error_code
            // Log only status/code, never the password, token or provider body.
            console.error('contract_auth_create_failed', JSON.stringify({ status: created.response.status, code: typeof code === 'string' && /^[a-z_]{1,80}$/.test(code) ? code : 'unknown' }))
            if (code === 'email_exists' || code === 'user_already_exists') throw fail('Email này đã có tài khoản đăng nhập khác. Vui lòng liên hệ chủ nhà.', 409)
            if (code === 'weak_password') throw fail('Mật khẩu chưa đáp ứng yêu cầu bảo mật. Hãy chọn mật khẩu khác.', 400)
            throw fail('Hệ thống chưa tạo được tài khoản khách thuê. Vui lòng chờ một phút rồi thử lại.', 503)
          }
          if (created.data?.id !== claim.userId) throw fail('Thông tin cấp tài khoản chưa khớp. Vui lòng liên hệ chủ nhà.', 503)
        } else {
          if (!existing.response.ok || existing.data?.app_metadata?.contract_confirmation_id !== claim.id) throw fail('Tài khoản không thuộc lượt xác nhận này.', 409)
          const updated = await api(`/auth/v1/admin/users/${claim.userId}`, { method: 'PUT', body: JSON.stringify({ password: data.password }) })
          if (!updated.response.ok) throw fail('Chưa lưu được mật khẩu. Hãy thử lại.', 503)
        }
        await rpc('contract_account_finish', { p_hash: hash, p_user: claim.userId, p_lease: claim.lease })
        return reply(200, { ok: true, email: claim.email })
      }
      throw fail('Thao tác không hợp lệ.')
    } catch (cause) { return reply(cause.status || 503, { ok: false, error: cause.status ? cause.message : 'Dịch vụ xác nhận chưa phản hồi. Hãy thử lại.' }) }
  }
}
