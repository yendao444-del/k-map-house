const role = 'webmobile_demo_tenant'
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const fail = (reason, status = 401) => Object.assign(new Error(reason), { status })
const profiles = {
  existing: { kind: 'existing', name: 'Nguyễn Minh Anh', room: '101', contractId: 'demo-current-101', start: '01/07/2026' },
  new: { kind: 'new', name: 'Trần Hoài Nam', room: '102', contractId: 'demo-current-102', start: '01/10/2026' }
}
export function authService(env, rpc, fetcher = fetch) {
  async function api(route, options = {}, token = env.SUPABASE_SERVICE_ROLE_KEY) {
    const response = await fetcher(`${env.SUPABASE_URL}${route}`, {
      ...options, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(route.startsWith('/rest/') && env.CONTRACT_DB_SCHEMA ? { 'Accept-Profile': env.CONTRACT_DB_SCHEMA, 'Content-Profile': env.CONTRACT_DB_SCHEMA } : {}), ...options.headers },
      signal: AbortSignal.timeout(10000)
    })
    const data = await response.json().catch(() => null)
    return { response, data }
  }
  const post = data => ({ method: 'POST', body: JSON.stringify(data) })
  async function account(user) {
    if (!user?.id || user.role !== 'anon' || ![role, 'webmobile_tenant'].includes(user.app_metadata?.portal_role)) throw fail('Tài khoản này chưa được cấp quyền website người thuê.', 403)
    if (user.app_metadata.portal_role === 'webmobile_tenant') {
      const binding = await api(`/rest/v1/tenant_web_accounts?auth_user_id=eq.${encodeURIComponent(user.id)}&select=tenant_id,email,status,session_version`)
      if (!binding.response.ok) throw fail('Chưa kiểm tra được quyền tài khoản.', 503)
      const row = binding.data?.[0]
      if (!row || row.status === 'locked') throw fail('Tài khoản chưa được cấp hoặc đã bị khóa. Vui lòng liên hệ chủ nhà.', 403)
      const tenant = await api(`/rest/v1/tenants?id=eq.${encodeURIComponent(row.tenant_id)}&select=id,full_name,is_active`)
      if (!tenant.response.ok) throw fail('Chưa tải được thông tin khách thuê.', 503)
      if (!tenant.data?.[0]?.is_active) throw fail('Tài khoản khách thuê đã ngừng hoạt động.', 403)
      const contracts = await api(`/rest/v1/contracts?tenant_id=eq.${encodeURIComponent(row.tenant_id)}&status=eq.active&select=id,room_id,move_in_date,base_rent&order=created_at.desc&limit=2`)
      if (!contracts.response.ok) throw fail('Chưa tải được hợp đồng.', 503)
      if (contracts.data.length > 1) throw fail('Hồ sơ có nhiều hợp đồng đang hoạt động. Vui lòng liên hệ chủ nhà.', 409)
      const contract = contracts.data[0]
      let room
      if (contract) {
        const rooms = await api(`/rest/v1/rooms?id=eq.${encodeURIComponent(contract.room_id)}&select=name,floor,area`)
        if (!rooms.response.ok || !rooms.data?.[0]) throw fail('Chưa tải được thông tin phòng.', 503)
        room = rooms.data[0]
      }
      return { mode: 'tenant', kind: 'existing', accountVersion: row.session_version, name: tenant.data[0].full_name, tenantId: row.tenant_id, email: row.email, userId: user.id,
        room: room?.name || '', floor: room?.floor ?? null, area: room?.area ?? null, rent: contract?.base_rent ?? null,
        contractId: contract?.id || '', start: contract?.move_in_date || '' }
    }
    const { response, data } = await api(`/rest/v1/webmobile_demo_accounts?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=tenant_kind,contract_id`)
    if (!response.ok) throw fail('Chưa kiểm tra được quyền tài khoản.', 503)
    const profile = profiles[data?.[0]?.tenant_kind]
    if (!profile || profile.contractId !== data[0].contract_id) throw fail('Tài khoản chưa được gắn với phòng demo.', 403)
    return { ...profile, mode: 'demo', email: user.email, userId: user.id }
  }
  async function save(id, user, tokens, profile) {
    if (profile.mode === 'tenant') {
      const { response } = await api('/rest/v1/rpc/webmobile_save_tenant_session', post({ p_id: id, p_user: user.id, p_version: profile.accountVersion, p_access: tokens.access_token, p_refresh: tokens.refresh_token, p_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString() }))
      if (!response.ok) throw fail('Tài khoản đã thay đổi. Vui lòng đăng nhập lại.', 401)
      return
    }
    const { response } = await api('/rest/v1/webmobile_auth_sessions?on_conflict=id', { ...post({
      id, user_id: user.id, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    }), headers: { Prefer: 'resolution=merge-duplicates' } })
    if (!response.ok) throw fail('Chưa lưu được phiên đăng nhập.', 503)
  }
  async function session(id) {
    if (!uuid.test(id || '')) throw fail('Bạn cần đăng nhập để tiếp tục.')
    const { response, data } = await api(`/rest/v1/webmobile_auth_sessions?id=eq.${id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*`)
    if (!response.ok) throw fail('Chưa kiểm tra được phiên đăng nhập.', 503)
    const row = data?.[0]
    if (!row) throw fail('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    let token = row.access_token
    if (new Date(row.token_expires_at).getTime() < Date.now() + 60000) {
      const lease = crypto.randomUUID()
      if (!await rpc('webmobile_auth_refresh_claim', { p_id: id, p_lease: lease })) throw fail('Đang làm mới phiên. Hãy thử lại sau ít giây.', 409)
      const refreshed = await api('/auth/v1/token?grant_type=refresh_token', post({ refresh_token: row.refresh_token }))
      if (!refreshed.response.ok || !refreshed.data?.access_token) {
        await remove(id); throw fail('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
      }
      const update = await api(`/rest/v1/webmobile_auth_sessions?id=eq.${id}&refresh_lease=eq.${lease}`, { method: 'PATCH', body: JSON.stringify({
        access_token: refreshed.data.access_token, refresh_token: refreshed.data.refresh_token,
        token_expires_at: new Date(Date.now() + refreshed.data.expires_in * 1000).toISOString(), refresh_lease: null, refresh_locked_until: null
      }) })
      if (!update.response.ok) throw fail('Chưa làm mới được phiên đăng nhập.', 503)
      token = refreshed.data.access_token
    }
    const user = await api('/auth/v1/user', {}, token)
    if (!user.response.ok) { await remove(id); throw fail('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.') }
    const profile = await account(user.data)
    if (profile.userId !== row.user_id) throw fail('Phiên đăng nhập không hợp lệ.')
    if (profile.mode === 'tenant' && profile.accountVersion !== row.account_version) throw fail('Phiên đăng nhập đã được thu hồi. Vui lòng đăng nhập lại.')
    return profile
  }
  async function remove(id) {
    if (!uuid.test(id || '')) return
    const { response } = await api(`/rest/v1/webmobile_auth_sessions?id=eq.${id}`, { method: 'DELETE' })
    if (!response.ok) throw fail('Chưa đăng xuất được. Hãy thử lại.', 503)
  }
  async function login(data, ip, oldSession) {
    if (!await rpc('webmobile_auth_rate', { p_ip: ip })) throw fail('Bạn thử đăng nhập quá nhiều lần. Hãy chờ một phút.', 429)
    if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()) || data.email.length > 254 || typeof data.password !== 'string' || data.password.length < 1 || data.password.length > 256) throw fail('Nhập email và mật khẩu hợp lệ.', 400)
    const signed = await api('/auth/v1/token?grant_type=password', post({ email: data.email.trim().toLowerCase(), password: data.password }))
    if (!signed.response.ok || !signed.data?.access_token) throw fail(signed.response.status === 429 ? 'Bạn thử quá nhiều lần. Hãy chờ một phút.' : 'Email hoặc mật khẩu không đúng.', signed.response.status === 429 ? 429 : signed.response.status >= 500 ? 503 : 401)
    const profile = await account(signed.data.user)
    const id = crypto.randomUUID()
    await save(id, signed.data.user, signed.data, profile)
    if (oldSession) await remove(oldSession)
    return { id, profile }
  }
  return { login, session, logout: remove }
}
