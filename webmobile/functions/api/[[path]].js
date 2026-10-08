// Same-origin gateway. Provider keys and the Supabase service key stay on backend.
export async function onRequest({ request, env, params }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path
  const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  if (!['health', 'meter-ocr', 'demo-payments', 'auth'].includes(path)) return json(404, { ok: false, reason: 'Không tìm thấy API.' })
  if (request.method !== (path === 'health' ? 'GET' : 'POST')) return json(405, { ok: false, reason: 'Yêu cầu không hợp lệ.' })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return json(403, { ok: false, reason: 'Không cho phép truy cập.' })
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json(403, { ok: false, reason: 'Không cho phép truy cập.' })
  if (!env.WEBMOBILE_EDGE_URL || !env.WEBMOBILE_GATEWAY_SECRET) return json(503, { ok: false, reason: 'Backend online chưa được cấu hình.' })
  let session = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-webmobile-demo=([a-f0-9-]{36})(?:;|$)/i)?.[1]
  if (!session || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(session)) session = crypto.randomUUID()
  const authSession = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-webmobile-auth=([a-f0-9-]{36})(?:;|$)/i)?.[1] || ''
  const fingerprint = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.WEBMOBILE_GATEWAY_SECRET}:${request.headers.get('cf-connecting-ip') || 'unknown'}`))
  const ip = [...new Uint8Array(fingerprint)].map(x => x.toString(16).padStart(2, '0')).join('')
  try {
    let body
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, { ok: false, reason: 'Yêu cầu không hợp lệ.' })
      const limit = path === 'meter-ocr' ? 4_100_000 : 8192
      const reader = request.body?.getReader(), chunks = []; let size = 0
      if (reader) while (true) {
        const { done, value } = await reader.read(); if (done) break
        size += value.byteLength; if (size > limit) { await reader.cancel(); return json(413, { ok: false, reason: 'Yêu cầu quá lớn.' }) }
        chunks.push(value)
      }
      body = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
    }
    const result = await fetch(env.WEBMOBILE_EDGE_URL, { method: request.method, headers: { Authorization: `Bearer ${env.WEBMOBILE_GATEWAY_SECRET}`, 'Content-Type': 'application/json', 'x-webmobile-endpoint': path, 'x-webmobile-session': session, 'x-webmobile-ip': ip, 'x-webmobile-auth-session': authSession }, body, signal: AbortSignal.timeout(25000) })
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Set-Cookie': `__Host-webmobile-demo=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400` })
    if (path === 'auth') {
      const data = await result.json()
      const action = JSON.parse(new TextDecoder().decode(body)).action
      const id = data.sessionId
      delete data.sessionId
      if (result.ok && action === 'login' && /^[a-f0-9-]{36}$/i.test(id || '')) {
        headers.set('Set-Cookie', `__Host-webmobile-demo=${crypto.randomUUID()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`)
        headers.append('Set-Cookie', `__Host-webmobile-auth=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`)
      } else if ((result.ok && action === 'logout') || result.status === 401) {
        headers.append('Set-Cookie', '__Host-webmobile-auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
        headers.append('Set-Cookie', '__Host-webmobile-demo=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
      }
      return new Response(JSON.stringify(data), { status: result.status, headers })
    }
    return new Response(await result.text(), { status: result.status, headers })
  } catch { return json(503, { ok: false, reason: 'Backend online chưa phản hồi. Hãy thử lại sau.' }) }
}
