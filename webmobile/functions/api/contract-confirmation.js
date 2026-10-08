export async function onRequest({ request, env }) {
  const json = (status, error) => Response.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } })
  if (request.method !== 'POST') return json(405, 'Yêu cầu không hợp lệ.')
  const origin = new URL(request.url).origin
  if (request.headers.get('origin') && request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') return json(403, 'Không cho phép truy cập.')
  if (!env.CONTRACT_EDGE_URL || !env.CONTRACT_GATEWAY_SECRET) return json(503, 'Backend xác nhận chưa được cấu hình.')
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, 'Yêu cầu không hợp lệ.')
  try {
    let body = '', size = 0
    const reader = request.body?.getReader(), decoder = new TextDecoder()
    if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8192) { await reader.cancel(); return json(413, 'Yêu cầu quá lớn.') } body += decoder.decode(value, { stream: true }) }
    body += decoder.decode()
    let data
    try { data = JSON.parse(body) } catch { return json(400, 'Yêu cầu không hợp lệ.') }
    if (!['view','document_viewed','confirm','activate'].includes(data.action)) return json(400, 'Thao tác không hợp lệ.')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.CONTRACT_GATEWAY_SECRET}:${request.headers.get('cf-connecting-ip') || 'unknown'}`))
    const ip = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,'0')).join('')
    const result = await fetch(env.CONTRACT_EDGE_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.CONTRACT_GATEWAY_SECRET}`, 'Content-Type': 'application/json', 'x-contract-ip': ip }, body, signal: AbortSignal.timeout(25000) })
    return new Response(await result.text(), { status: result.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return json(503, 'Dịch vụ xác nhận chưa phản hồi. Hãy thử lại.') }
}
