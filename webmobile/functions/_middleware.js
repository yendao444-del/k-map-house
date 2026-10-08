export async function onRequest({ request, next }) {
  const url = new URL(request.url)
  // Temporary redirect: the main domain can later serve the brand home website.
  if (['phongtroankhang.com', 'www.phongtroankhang.com'].includes(url.hostname)) {
    url.hostname = 'pay.phongtroankhang.com'
    url.protocol = 'https:'
    return new Response(null, { status: request.method === 'GET' || request.method === 'HEAD' ? 302 : 307, headers: { Location: url.href, 'Cache-Control': 'no-store' } })
  }
  return next()
}
