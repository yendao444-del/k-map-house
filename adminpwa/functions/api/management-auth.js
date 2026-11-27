export async function onRequest({ request, env }) {
  const origin = request.headers.get('origin') || ''
  const url = new URL(request.url)
  const allowedOrigin = !origin || origin === url.origin || origin === 'null' || ['http://localhost:4178','http://127.0.0.1:4178','http://localhost:5173','http://127.0.0.1:5173','http://localhost:4193','http://127.0.0.1:4193'].includes(origin)
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin', ...(origin && allowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type,x-management-session' }
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers })
  if (!allowedOrigin) return reply(403, { ok: false })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply(405, { ok: false })
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { ok: false })
  if (!env.ADMIN_PWA_AUTH_GATEWAY_SECRET || env.ADMIN_PWA_AUTH_EDGE_URL !== 'https://wtrycmiojsiliyjxsewz.supabase.co/functions/v1/admin-pwa-auth') return reply(503, { ok: false })
  // Cloudflare overwrites this header with the connecting client's address.
  // Never forward an IP/hash supplied in a JSON field or X-Forwarded-For.
  const address = request.headers.get('cf-connecting-ip')
  if (!address) return reply(503, { ok: false })
  try {
    const reader = request.body?.getReader()
    if (!reader) return reply(400, { ok: false })
    const chunks = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 4096) { await reader.cancel(); return reply(413, { ok: false }) }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    const body = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_PWA_AUTH_GATEWAY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address))
    const ip = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    // Familiar-network hash (IPv4 /24, IPv6 /48) so a trusted device on the
    // same home/office network is not asked for 2FA after a DHCP change.
    const network = networkPrefix(address)
    const networkHash = network ? Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`net:${network}`))), b => b.toString(16).padStart(2, '0')).join('') : ''
    const sessionToken = request.headers.get('x-management-session') || ''
    if (sessionToken.length > 4096) return reply(400, { ok: false })
    const result = await fetch(env.ADMIN_PWA_AUTH_EDGE_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.ADMIN_PWA_AUTH_GATEWAY_SECRET}`, 'Content-Type': 'application/json', 'x-management-ip': ip, ...(networkHash ? { 'x-management-network': networkHash } : {}), 'x-management-agent': request.headers.get('user-agent') || '', ...(sessionToken ? { 'x-management-session': sessionToken } : {}) }, body, signal: AbortSignal.timeout(25000) })
    const data = await result.json()
    return reply(result.status, data)
  } catch { return reply(503, { ok: false, error: 'Dịch vụ đăng nhập chưa phản hồi. Hãy thử lại.' }) }
}

function networkPrefix(address) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(address)
  if (v4) return `v4:${v4[1]}.${v4[2]}.${v4[3]}`
  if (!address.includes(':')) return ''
  const [head, tail = ''] = address.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = address.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left
  if (groups.length < 3 || groups.slice(0, 3).some(g => !/^[0-9a-f]{1,4}$/.test(g))) return ''
  return `v6:${groups.slice(0, 3).map(g => parseInt(g, 16).toString(16)).join(':')}`
}
