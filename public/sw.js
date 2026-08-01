// Minimal offline app-shell cache. Supabase (cross-origin) requests are never cached,
// so data always comes from the network.
const CACHE = 'sessions-table-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/icon.svg', '/manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // let Supabase & other APIs hit the network

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(req) }
      catch { return (await caches.open(CACHE)).match('/') || Response.error() }
    })())
    return
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const cached = await cache.match(req)
    const network = fetch(req).then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone())
      return res
    }).catch(() => cached)
    return cached || network
  })())
})
