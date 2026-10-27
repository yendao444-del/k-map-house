const CACHE = 'ankhang-management-shell-__BUILD_ID__'
const ASSETS = __ASSETS__
const allowed = new Set(ASSETS)
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)))
  // Do not skipWaiting during an invoice/contract edit. User accepts update.
})
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ankhang-management-shell-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]))
})
self.addEventListener('message', event => {
  if (event.data?.type === 'ACCEPT_UPDATE') self.skipWaiting()
})
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  // Auth, recovery tokens, REST, Edge functions and customer uploads are never
  // intercepted. Cross-origin and non-GET traffic always goes to the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || request.headers.has('authorization')) return
  if (request.mode === 'navigate' && url.pathname === '/') {
    // The offline document belongs to this build's precache. Never overwrite
    // it with a newer index while this worker still owns the older assets.
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE)
      return (await cache.match('/index.html')) || Response.error()
    }))
    return
  }
  if (!allowed.has(url.pathname) || url.pathname === '/index.html') return
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request)))
})
