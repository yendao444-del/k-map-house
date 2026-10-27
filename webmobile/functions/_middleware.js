export async function onRequest({ request, next }) {
  const url = new URL(request.url)
  // Temporary redirect: the main domain can later serve the brand home website.
  if (['phongtroankhang.com', 'www.phongtroankhang.com'].includes(url.hostname)) {
    url.hostname = 'pay.phongtroankhang.com'
    url.protocol = 'https:'
    return new Response(null, { status: request.method === 'GET' || request.method === 'HEAD' ? 302 : 307, headers: { Location: url.href, 'Cache-Control': 'no-store' } })
  }
  const upstream = await next()
  const response = new Response(upstream.body, upstream)
  // Pages _headers only covers static assets; apply transport protection to
  // dynamic Auth/payment responses as well.
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}
