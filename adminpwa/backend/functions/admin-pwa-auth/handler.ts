type Config = { supabaseUrl: string; anonKey: string; serviceKey: string; gatewaySecret: string; resendApiKey?: string; mailFrom?: string }
const loginError = 'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản không được phép truy cập.'
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const securityActions = new Set(['status','password_status','password_confirm','password_change','totp_challenge','totp_verify','totp_replace_begin','totp_replace_register','totp_replace_cancel','totp_retire','email_send','email_verify','recovery_issue','recovery_ack','recovery_consume','recovery_reset','authorize','revoke_session','device_create','device_revoke','overview'])
const fields: Record<string, string[]> = {
  status: [], password_status: [], password_confirm: ['password'], password_change: ['password','new_password'], totp_challenge: ['factor_id'],
  totp_verify: ['factor_id','challenge_id','code'], totp_retire: ['old_factor_id','new_factor_id'], email_send: ['purpose'],
  totp_replace_begin: ['factor_id'], totp_replace_register: ['factor_id'], totp_replace_cancel: [],
  email_verify: ['purpose','challenge_id','code'], recovery_issue: [], recovery_ack: ['batch_id'],
  recovery_consume: ['code'], recovery_reset: [], authorize: [], revoke_session: ['all'],
  device_create: ['label'], device_revoke: ['device_id'], overview: []
}

async function boundedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4096) { await reader.cancel(); throw new Error('body-too-large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const combined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length }
  return new TextDecoder().decode(combined)
}

export function createManagementAuthHandler(config: Config, fetcher: typeof fetch = fetch) {
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
  const call = async (path: string, body?: unknown, token = config.serviceKey, authorizationToken = token, method?: string) => {
    const response = await fetcher(`${config.supabaseUrl}${path}`, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: { apikey: token, Authorization: `Bearer ${authorizationToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12000)
    })
    return { response, data: await response.json().catch(() => null) }
  }
  const sha256 = async (value: string): Promise<string> => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
  }
  const decodeJwt = (token: string): Record<string, unknown> | null => {
    try {
      const part = token.split('.')[1]
      if (!part) return null
      const json = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - part.length % 4) % 4))
      const value = JSON.parse(json)
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null
    } catch { return null }
  }
  const emailCodeHash = async (challengeId: string, code: string) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.gatewaySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`security-email:${challengeId}:${code}`))
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  }
  const security = async (request: Request, payload: Record<string, unknown>, ip: string, agentHash: string): Promise<Response> => {
    const accessToken = request.headers.get('x-management-session') || ''
    const claims = decodeJwt(accessToken)
    const sessionId = typeof claims?.session_id === 'string' ? claims.session_id : ''
    const subject = typeof claims?.sub === 'string' ? claims.sub : ''
    if (!accessToken || !uuid.test(sessionId) || !uuid.test(subject) || claims?.aud !== 'authenticated') return reply(401, { ok: false, error: 'Phiên đăng nhập không hợp lệ.' })
    const verified = await call('/auth/v1/user', undefined, config.anonKey, accessToken)
    if (!verified.response.ok || verified.data?.id !== subject) return reply(401, { ok: false, error: 'Phiên đăng nhập không hợp lệ.' })
    const action = String(payload.security_action || '')
    if (!securityActions.has(action)) return reply(400, { ok: false, error: 'Yêu cầu bảo mật không hợp lệ.' })
    const data = { ...(payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as Record<string, unknown> : {}) }
    if (Object.keys(data).some(key => !fields[action]?.includes(key)) || Object.values(data).some(value => typeof value !== 'string' && typeof value !== 'boolean')) return reply(400, { ok: false })
    const rpc = async (transition: string, transitionData: Record<string, unknown> = {}) => {
      const result = await call('/rest/v1/rpc/security_service', {
        p_action: transition, p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash, p_data: transitionData
      })
      if (!result.response.ok || !result.data) throw new Error('security-service-unavailable')
      return result.data
    }
    const rate = async (kind: string) => (await rpc('rate', { kind })).ok === true
    const devDeviceProof = async () => {
      const proof = await call('/rest/v1/rpc/security_dev_device_status', { p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash })
      return proof.response.ok && proof.data?.ok === true
    }
    if (action === 'status') {
      if (await devDeviceProof()) return reply(200, await rpc('status'))
      const emailLogin = await call('/rest/v1/rpc/security_email_login_status', { p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash })
      if (emailLogin.response.ok && emailLogin.data?.ok === true) return reply(200, await rpc('status'))
      // AAL1 is the normal state while the account is completing email
      // verification. TOTP replacement resume is only meaningful after the
      // session has reached AAL2; calling it for AAL1 made the whole status
      // check fail before the email challenge could be sent.
      if (claims?.aal === 'aal2') {
        const resumed = await call('/rest/v1/rpc/security_totp_replacement', { p_action: 'resume', p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash })
        // Resume is best effort here. The authoritative security status RPC
        // below still decides whether the session can proceed.
        if (resumed.response.ok && resumed.data?.ok === true) return reply(200, await rpc('status'))
      }
    }
    if (action === 'overview') {
      if (claims?.aal !== 'aal2') {
        const proof = await call('/rest/v1/rpc/security_email_login_status', { p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash })
        if ((!proof.response.ok || proof.data?.ok !== true) && !await devDeviceProof()) return reply(403, { ok: false, error: 'Phiên đăng nhập chưa hoàn tất xác minh hai bước.' })
      }
      const result = await call('/rest/v1/rpc/security_overview_read', { p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash })
      return reply(result.response.ok && result.data?.ok === true ? 200 : 403, result.data?.ok === true ? result.data : { ok: false, error: 'Không thể tải thông tin bảo mật của phiên này.' })
    }
    if (['password_status','password_confirm','password_change'].includes(action)) {
      if (claims?.aal !== 'aal2') {
        const proof = await call('/rest/v1/rpc/security_email_login_status', { p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash })
        if ((!proof.response.ok || proof.data?.ok !== true) && !await devDeviceProof()) return reply(403, { ok: false, error: 'Phiên đăng nhập chưa hoàn tất xác minh hai bước.' })
      }
      const stepup = async (operation: string) => {
        const result = await call('/rest/v1/rpc/security_password_stepup', {
          p_action: operation, p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash
        })
        if (!result.response.ok || !result.data) throw new Error('password-confirmation-unavailable')
        return result.data
      }
      if (action === 'password_status') {
        const state = await stepup('status')
        return reply(state.ok === true ? 200 : 403, state.ok === true ? state : { ok: false, error: 'Phiên bảo mật chưa hoàn tất hoặc đã hết hạn. Vui lòng đăng nhập lại.' })
      }
      if (typeof data.password !== 'string' || !data.password || data.password.length > 256
        || (action === 'password_change' && (typeof data.new_password !== 'string' || data.new_password.length < 12 || data.new_password.length > 256))) return reply(400, { ok: false, error: 'Nhập mật khẩu hiện tại và mật khẩu mới từ 12 ký tự.' })
      const prepared = await stepup('prepare')
      if (prepared.ok !== true) return reply(prepared.reason === 'rate' ? 429 : 403, { ok: false, error: prepared.reason === 'rate' ? 'Bạn thử mật khẩu quá nhiều lần. Vui lòng chờ 5 phút rồi thử lại.' : 'Phiên bảo mật chưa hoàn tất hoặc đã hết hạn. Vui lòng đăng nhập lại.' })
      // Auth verifies the caller's real login email, never an email/actor chosen
      // by the browser. The short-lived password-check session is revoked and
      // never replaces or reaches the caller's existing AAL2 session.
      if (typeof verified.data.email !== 'string') return reply(403, { ok: false, error: 'Không xác định được tài khoản đang thao tác.' })
      const signed = await call('/auth/v1/token?grant_type=password', { email: verified.data.email, password: data.password }, config.anonKey)
      if (!signed.response.ok) return reply(signed.response.status >= 500 ? 503 : signed.response.status === 429 ? 429 : 401, { ok: false, error: signed.response.status >= 500 ? 'Chưa kiểm tra được mật khẩu. Vui lòng thử lại sau.' : 'Mật khẩu hiện tại không đúng hoặc tạm thời chưa xác minh được.' })
      const temporary = typeof signed.data?.access_token === 'string' ? signed.data.access_token : ''
      const temporaryClaims = decodeJwt(temporary)
      if (!temporary || !uuid.test(String(temporaryClaims?.session_id)) || temporaryClaims?.session_id === sessionId) throw new Error('invalid-password-check-session')
      const revoked = await call('/auth/v1/logout?scope=local', {}, config.anonKey, temporary)
      if (!revoked.response.ok) throw new Error('password-check-session-cleanup-failed')
      if (signed.data?.user?.id !== subject || temporaryClaims?.sub !== subject) return reply(401, { ok: false, error: 'Mật khẩu hiện tại không đúng hoặc tạm thời chưa xác minh được.' })
      const confirmed = await stepup('confirm')
      if (confirmed.ok !== true) return reply(403, { ok: false, error: 'Phiên bảo mật đã thay đổi. Vui lòng đăng nhập lại.' })
      if (action === 'password_change') {
        // Keep GoTrue's password policy and preserve this exact AAL2 session.
        // The admin password endpoint would revoke even the caller's session.
        // Authorized management sessions live at most six hours, within
        // GoTrue's 24-hour recent-signin window for nonce-free password changes.
        const changed = await call('/auth/v1/user', { password: data.new_password, current_password: data.password }, config.anonKey, accessToken, 'PUT')
        if (!changed.response.ok) return reply(changed.response.status >= 500 ? 503 : 400, { ok: false, error: 'Chưa đổi được mật khẩu. Kiểm tra yêu cầu mật khẩu rồi thử lại.' })
      }
      return reply(200, { ok: true, recent_password: true })
    }
    if (action === 'totp_replace_begin') {
      if (typeof data.factor_id !== 'string' || !uuid.test(data.factor_id) || claims?.aal !== 'aal2') return reply(400, { ok: false })
      const result = await call('/rest/v1/rpc/security_totp_replacement', { p_action: 'begin', p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash, p_old: data.factor_id })
      return reply(result.response.ok && result.data?.ok === true ? 200 : 403, result.data || { ok: false })
    }
    if (action === 'totp_challenge' || action === 'totp_verify') {
      if (typeof data.factor_id !== 'string' || !uuid.test(data.factor_id) || (action !== 'totp_challenge' && (typeof data.challenge_id !== 'string' || !uuid.test(data.challenge_id) || typeof data.code !== 'string' || !/^\d{6}$/.test(data.code)))) return reply(400, { ok: false })
      if (!await rate('totp')) return reply(429, { ok: false, error: 'Bạn thử quá nhiều lần. Vui lòng chờ rồi thử lại.' })
      const operation = action !== 'totp_challenge' ? 'verify' : 'challenge'
      // GoTrue binds a challenge to its originating IP. Edge invocations may
      // use different egress IPs; create and verify together in this invocation.
      let challengeId = data.challenge_id
      if (operation === 'verify') {
        const fresh = await call(`/auth/v1/factors/${data.factor_id}/challenge`, {}, config.anonKey, accessToken)
        if (!fresh.response.ok || typeof fresh.data?.id !== 'string') return reply(503, { ok: false, error: 'Chưa tạo được phiên xác minh. Vui lòng thử lại.' })
        challengeId = fresh.data.id
      }
      const authResult = await call(`/auth/v1/factors/${data.factor_id}/${operation}`, operation === 'verify' ? { challenge_id: challengeId, code: data.code } : {}, config.anonKey, accessToken)
      if (!authResult.response.ok) {
        if (operation === 'verify') await rpc('mfa_event', { success: false })
        return reply(401, { ok: false, error: 'Mã xác minh không đúng hoặc đã hết hạn.' })
      }
      if (operation === 'verify') {
        const nextClaims = decodeJwt(authResult.data?.access_token || '')
        if (nextClaims?.sub !== subject || nextClaims?.session_id !== sessionId || nextClaims?.aal !== 'aal2') throw new Error('invalid-mfa-session')
        await rpc('mfa_event', { success: true })
        const rotation = await call('/rest/v1/rpc/security_totp_replacement', { p_action: 'verified', p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash, p_new: data.factor_id })
        if (!rotation.response.ok || rotation.data?.ok !== true) throw new Error('mfa-rotation-incomplete')
        return reply(200, { ok: true, session: { access_token: authResult.data.access_token, refresh_token: authResult.data.refresh_token } })
      }
      return reply(200, { ok: true, challenge_id: authResult.data?.id })
    }
    if (['totp_retire','totp_replace_register','totp_replace_cancel'].includes(action)) {
      if (action === 'totp_retire' && (typeof data.old_factor_id !== 'string' || !uuid.test(data.old_factor_id) || typeof data.new_factor_id !== 'string' || !uuid.test(data.new_factor_id) || data.old_factor_id === data.new_factor_id)) return reply(400, { ok: false })
      if (action === 'totp_replace_register' && (typeof data.factor_id !== 'string' || !uuid.test(data.factor_id))) return reply(400, { ok: false })
      if (claims?.aal !== 'aal2') return reply(403, { ok: false, error: 'Phiên đăng nhập chưa hoàn tất xác minh hai bước.' })
      if (action === 'totp_retire') {
        const finished = await call('/rest/v1/rpc/security_totp_replacement', { p_action: 'finish', p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash, p_old: data.old_factor_id, p_new: data.new_factor_id })
        return reply(finished.response.ok && finished.data?.ok === true ? 200 : 503, finished.data?.ok === true ? finished.data : { ok: false, error: 'Đổi Authenticator chưa được ghi nhận. Vui lòng kiểm tra lại.' })
      }
      const result = await call('/rest/v1/rpc/security_totp_replacement', { p_action: action === 'totp_replace_register' ? 'register' : 'cancel', p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash, ...(action === 'totp_replace_register' ? { p_new: data.factor_id } : {}) })
      return reply(result.response.ok && result.data?.ok === true ? 200 : 403, result.data?.ok === true ? result.data : { ok: false, error: 'Chưa thể hoàn tất thay đổi Authenticator. Hãy thử lại.' })
    }
    if (action === 'email_send') {
      if (!['signin','recovery','login'].includes(String(data.purpose))) return reply(400, { ok: false })
      if (!config.resendApiKey || !config.mailFrom || !verified.data.email || !verified.data.email_confirmed_at) return reply(503, { ok: false, error: 'Email xác minh tài khoản chưa sẵn sàng.' })
      if (!await rate('email_send')) return reply(429, { ok: false, error: 'Bạn gửi mã quá nhiều lần. Vui lòng chờ.' })
      const challengeId = crypto.randomUUID()
      // Six digits from uniform rejection sampling, never Math.random().
      const random = new Uint32Array(1)
      do { crypto.getRandomValues(random) } while (random[0] >= 4294000000)
      const code = String(random[0] % 1000000).padStart(6, '0')
      const codeHash = await emailCodeHash(challengeId, code)
      const created = data.purpose === 'login'
        ? (await call('/rest/v1/rpc/security_email_login_start', { p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash, p_challenge: challengeId, p_code_hash: codeHash })).data
        : await rpc('email_create', { purpose: data.purpose, challenge_id: challengeId, code_hash: codeHash })
      if (created?.ok !== true) return reply(created?.reason === 'wait' ? 429 : 403, { ok: false, error: created?.reason === 'wait' ? 'Vui lòng chờ một phút trước khi gửi lại mã.' : 'Tài khoản hoặc phiên này chưa đủ điều kiện xác minh bằng email. Hãy dùng Authenticator hoặc mã khôi phục.' })
      const delivered = await fetcher('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `management-security-${challengeId}` },
        body: JSON.stringify({ from: config.mailFrom, to: [verified.data.email], subject: '[AN KHANG HOME] Mã xác minh bảo mật', text: `Mã xác minh của bạn: ${code}\nMã hết hạn sau 5 phút. Không chia sẻ mã này với bất kỳ ai. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.` }),
        signal: AbortSignal.timeout(12000)
      }).catch(() => null)
      if (!delivered?.ok) { await rpc('email_failed', { challenge_id: challengeId }); return reply(503, { ok: false, error: 'Chưa gửi được email xác minh. Hãy thử lại sau.' }) }
      const accepted = await delivered.json().catch(() => null)
      if (!uuid.test(String(accepted?.id || ''))) {
        await rpc('email_failed', { challenge_id: challengeId })
        return reply(503, { ok: false, error: 'Chưa xác nhận được việc gửi email. Hãy thử lại sau.' })
      }
      const recorded = await call('/rest/v1/rpc/security_email_accepted', {
        p_challenge: challengeId, p_user: subject, p_session: sessionId, p_provider: accepted.id
      })
      if (!recorded.response.ok || recorded.data !== true) {
        await rpc('email_failed', { challenge_id: challengeId })
        return reply(503, { ok: false, error: 'Chưa hoàn tất phiên email xác minh. Hãy thử lại sau.' })
      }
      const email = String(verified.data.email), at = email.indexOf('@')
      return reply(200, { ok: true, challenge_id: challengeId, expires_in: 300, masked_email: email.slice(0, 1) + '***' + email.slice(at) })
    }
    if (action === 'email_verify') {
      if (!['signin','recovery','login'].includes(String(data.purpose)) || typeof data.challenge_id !== 'string' || !uuid.test(data.challenge_id) || typeof data.code !== 'string' || !/^\d{6}$/.test(data.code)) return reply(400, { ok: false })
      if (!await rate('email_verify')) return reply(429, { ok: false, error: 'Bạn thử quá nhiều lần. Vui lòng chờ.' })
      const codeHash = await emailCodeHash(data.challenge_id, data.code)
      const result = data.purpose === 'login'
        ? (await call('/rest/v1/rpc/security_email_login_verify', { p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash, p_challenge: data.challenge_id, p_code_hash: codeHash })).data
        : await rpc('email_verify', { purpose: data.purpose, challenge_id: data.challenge_id, code_hash: codeHash })
      return reply(result?.ok === true ? 200 : 401, { ok: result?.ok === true, ...(result?.ok !== true ? { error: 'Mã xác minh không đúng hoặc đã hết hạn.' } : {}) })
    }
    if (action === 'recovery_consume') {
      if (typeof data.code !== 'string' || !/^[A-Fa-f0-9-]{32,35}$/.test(data.code)) return reply(400, { ok: false })
      if (!await rate('recovery')) return reply(429, { ok: false, error: 'Bạn thử quá nhiều lần. Vui lòng chờ.' })
      const result = await rpc('recovery_consume', { code_hash: await sha256(data.code.toUpperCase().replace(/-/g, '')) })
      // Factor reset is deliberately a later transition: the durable DB record
      // already denies business access, even if Auth reset fails halfway through.
      return reply(result.ok === true ? 200 : 401, result.ok === true ? result : { ok: false, error: 'Không thể xác minh thông tin khôi phục.' })
    }
    if (action === 'recovery_reset') {
      const allowed = await call('/rest/v1/rpc/security_recovery_reset_allowed', { p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash })
      if (!allowed.response.ok || allowed.data !== true) return reply(403, { ok: false, error: 'Cần xác minh khôi phục trước khi đổi thiết bị xác thực.' })
      const factors = Array.isArray(verified.data.factors) ? verified.data.factors : []
      for (const factor of factors) {
        if (factor.factor_type !== 'totp' || !uuid.test(String(factor.id))) continue
        const removed = await call(`/auth/v1/admin/users/${subject}/factors/${factor.id}`, undefined, config.serviceKey, config.serviceKey, 'DELETE')
        if (!removed.response.ok) return reply(503, { ok: false, error: 'Chưa thể đặt lại thiết bị xác thực. Hãy thử lại.' })
      }
      return reply(200, { ok: true, state: 'enroll', access: 'reenrollment_only' })
    }
    if (action === 'device_create') {
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.gatewaySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${subject}:${nonce}`))
      const token = `${nonce}.${Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('')}`
      const created = await rpc('device_create', { token_hash: await sha256(token), label: typeof data.label === 'string' ? data.label : 'Thiết bị của tôi' })
      return reply(200, { ...created, device_token: created.ok === true ? token : undefined })
    }
    if (typeof data.device_token === 'string') { data.device_hash = await sha256(data.device_token); delete data.device_token }
    if (typeof data.challenge_id === 'string' && !uuid.test(data.challenge_id)) return reply(400, { ok: false })
    const result = await call('/rest/v1/rpc/security_service', {
      p_action: action, p_user: subject, p_session: sessionId, p_ip: ip, p_agent: agentHash, p_data: data
    })
    if (!result.response.ok) return reply(result.response.status >= 500 ? 503 : 403, { ok: false, error: 'Không thể xử lý trạng thái bảo mật.' })
    return reply(200, result.data && typeof result.data === 'object' ? result.data : { ok: false })
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply(405, { ok: false })
    // Only the Pages gateway knows this server secret and derives the IP hash.
    if (!config.gatewaySecret || request.headers.get('authorization') !== `Bearer ${config.gatewaySecret}`) return reply(403, { ok: false })
    const ip = request.headers.get('x-management-ip') || ''
    if (!/^[a-f0-9]{64}$/.test(ip)) return reply(403, { ok: false })
    try {
      let payload: Record<string, unknown>
      try { payload = JSON.parse(await boundedBody(request)) }
      catch (error) { return reply(error instanceof Error && error.message === 'body-too-large' ? 413 : 400, { ok: false, error: 'Yêu cầu không hợp lệ.' }) }
      if (!payload || Array.isArray(payload)) return reply(400, { ok: false })
      const { action } = payload
      const login = typeof payload.login === 'string' ? payload.login.trim().toLowerCase() : ''
      const password = typeof payload.password === 'string' ? payload.password : ''
      const securityRequested = action === 'security'
      if (securityRequested) {
        if (Object.keys(payload).some(k => !['action','security_action','data'].includes(k)) || typeof payload.security_action !== 'string' || !securityActions.has(payload.security_action) || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) return reply(400, { ok: false, error: 'Yêu cầu bảo mật không hợp lệ.' })
        return await security(request, payload, ip, await sha256(request.headers.get('x-management-agent') || ''))
      }
      if (!['login','recover'].includes(String(action)) || Object.keys(payload).some(k => !['action','login','password','device_token'].includes(k)) || !login || login.length > 128 || (action === 'login' && (!password || password.length > 256)) || (payload.device_token !== undefined && (action !== 'login' || typeof payload.device_token !== 'string' || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(payload.device_token))) || (action === 'recover' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) || payload.password !== undefined))) return reply(400, { ok: false, error: 'Yêu cầu không hợp lệ.' })
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.gatewaySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(login))
      const loginHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
      const rate = await call('/rest/v1/rpc/admin_pwa_auth_rate', { p_ip: ip, p_login: loginHash })
      if (!rate.response.ok) return reply(503, { ok: false, error: 'Dịch vụ đăng nhập chưa phản hồi. Hãy thử lại.' })
      if (rate.data !== true) return reply(429, { ok: false, error: 'Bạn thử quá nhiều lần. Vui lòng chờ một phút.' })
      if (action === 'recover') {
        // Auth recovery already returns a generic result for nonexistent emails.
        // The fixed callback cannot be replaced with an attacker-controlled URL.
        const result = await call('/auth/v1/recover?redirect_to=' + encodeURIComponent('https://app.phongtroankhang.com/?password-recovery=1'), { email: login }, config.anonKey)
        if (result.response.status >= 500) return reply(503, { ok: false, error: 'Dịch vụ email chưa phản hồi. Hãy thử lại.' })
        return reply(202, { ok: true })
      }
      const resolved = await call('/rest/v1/rpc/resolve_login_email', { login_name: login })
      if (!resolved.response.ok) return reply(503, { ok: false, error: 'Dịch vụ đăng nhập chưa phản hồi. Hãy thử lại.' })
      const email = typeof resolved.data === 'string' && resolved.data.includes('@') ? resolved.data : '__unknown_management_login__@invalid.example'
      const signed = await call('/auth/v1/token?grant_type=password', { email, password }, config.anonKey)
      if (signed.response.status === 429) return reply(429, { ok: false, error: 'Bạn thử quá nhiều lần. Vui lòng chờ một phút.' })
      if (signed.response.status >= 500) return reply(503, { ok: false, error: 'Dịch vụ đăng nhập chưa phản hồi. Hãy thử lại.' })
      if (!signed.response.ok || !uuid.test(signed.data?.user?.id || '')) return reply(401, { ok: false, error: loginError })
      const userId = signed.data.user.id
      const profile = await call(`/rest/v1/users?id=eq.${userId}&select=id,role,status`)
      const row = Array.isArray(profile.data) && profile.data.length === 1 ? profile.data[0] : null
      if (!profile.response.ok || row?.id !== userId || row.status !== 'active' || !['admin','user'].includes(row.role) || typeof resolved.data !== 'string') {
        // Do not leave a refreshable session for a user rejected by management.
        if (signed.data.access_token) await fetcher(`${config.supabaseUrl}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: config.anonKey, Authorization: `Bearer ${signed.data.access_token}` }, signal: AbortSignal.timeout(10000) }).catch(() => undefined)
        return reply(401, { ok: false, error: loginError })
      }
      if (typeof signed.data.access_token !== 'string' || typeof signed.data.refresh_token !== 'string') return reply(503, { ok: false })
      const claims = decodeJwt(signed.data.access_token)
      if (claims?.sub !== userId || typeof claims?.session_id !== 'string' || !uuid.test(claims.session_id)) return reply(503, { ok: false })
      // Only a successful password request through this rate-limited gateway
      // can register an application session. A public Auth token is insufficient.
      const registered = await call('/rest/v1/rpc/security_service', {
        p_action: 'register', p_user: userId, p_session: claims.session_id, p_ip: ip,
        p_agent: await sha256(request.headers.get('x-management-agent') || ''),
        p_data: typeof payload.device_token === 'string' ? { device_hash: await sha256(payload.device_token) } : {}
      })
      if (!registered.response.ok || registered.data?.ok !== true) {
        await call('/auth/v1/logout?scope=local', {}, config.anonKey, signed.data.access_token).catch(() => undefined)
        return reply(503, { ok: false, error: 'Chưa thiết lập được phiên bảo mật. Hãy thử lại.' })
      }
      // A device credential alone never logs in: the password, active role and
      // fresh registered Auth session have already been verified above.
      if (typeof payload.device_token === 'string' && (request.headers.get('x-management-agent') || '').includes('Electron/')) {
        await call('/rest/v1/rpc/security_dev_device_login', {
          p_user: userId, p_session: claims.session_id, p_ip: ip,
          p_agent: await sha256(request.headers.get('x-management-agent') || ''), p_token_hash: await sha256(payload.device_token)
        })
      }
      return reply(200, { ok: true, session: { access_token: signed.data.access_token, refresh_token: signed.data.refresh_token } })
    } catch { return reply(503, { ok: false, error: 'Dịch vụ đăng nhập chưa phản hồi. Hãy thử lại.' }) }
  }
}
