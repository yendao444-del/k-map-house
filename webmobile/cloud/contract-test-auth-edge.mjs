import { authService } from './auth.mjs'
const env = Deno.env.toObject()
async function rpc(name, data) {
  const result = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', 'Accept-Profile': env.CONTRACT_DB_SCHEMA, 'Content-Profile': env.CONTRACT_DB_SCHEMA }, body: JSON.stringify(data) })
  if (!result.ok) throw new Error('state_unavailable')
  return result.json()
}
const auth = authService(env, rpc)
const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
Deno.serve(async request => {
  if (request.headers.get('authorization') !== `Bearer ${env.WEBMOBILE_GATEWAY_SECRET}`) return reply(403, { ok: false, reason: 'Không cho phép truy cập.' })
  const endpoint = request.headers.get('x-webmobile-endpoint')
  if (endpoint === 'health') return reply(200, { ok: true, backend: 'online', mode: 'contract-test', realPayments: false })
  if (endpoint !== 'auth') return reply(403, { ok: false, reason: 'Môi trường này chỉ thử hợp đồng và tài khoản. Điện nước và thanh toán chưa bật.' })
  try {
    const data = await request.json(), session = request.headers.get('x-webmobile-auth-session'), ip = request.headers.get('x-webmobile-ip')
    if (!/^[a-f0-9]{64}$/.test(ip || '')) return reply(403, { ok: false, reason: 'Yêu cầu không hợp lệ.' })
    if (data.action === 'login') { const result = await auth.login(data, ip, session); return reply(200, { ok: true, sessionId: result.id, profile: result.profile }) }
    if (data.action === 'session') return reply(200, { ok: true, profile: await auth.session(session) })
    if (data.action === 'logout') { await auth.logout(session); return reply(200, { ok: true }) }
    return reply(400, { ok: false, reason: 'Thao tác không hợp lệ.' })
  } catch (cause) { return reply(cause.status || 503, { ok: false, reason: cause.status ? cause.message : 'Chưa kết nối được tài khoản TEST.' }) }
})
