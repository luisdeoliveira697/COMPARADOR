// Service worker: permite instalar la app y abrirla aunque falle la conexión.
// Siempre intenta la red primero para tener la versión y las tasas más recientes.
const CACHE = 'comparador-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || /cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com\/firebasejs/.test(url.href);
  if (!cacheable) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, {ignoreSearch: url.pathname.endsWith('rates.json')})));
});
