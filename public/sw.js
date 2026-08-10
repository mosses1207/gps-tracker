const CACHE_NAME = 'nvdc-cache-v24';
const assets = [
  '/',
  '/index.html',
  '/db.js',
  '/main.js',
  '/manifest.json',
  '/style.css',
  '/Toyota-Logo-Free.png'
];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const url of assets) {
        try {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res);
        } catch (err) {
          console.warn('Cache gagal:', url);
        }
      }
    })
  );
});
self.addEventListener('activate', e => {
  self.clients.claim();
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
});
// public/sw.js
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // WAJIB: jangan intercept request cross-origin (Helper Bridge 192.168.x.x).
  // Kalau di-proxy lewat fetch() milik SW sendiri, Chrome SELALU nolak
  // cert self-signed walau exception-nya udah di-accept manual di tab.
  // Biarin lewat langsung ke browser biar cert exception kepake.
  const reqUrl = new URL(e.request.url);
  if (reqUrl.origin !== location.origin) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cachedRes => {
      const fetchPromise = fetch(e.request)
        .then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const cloned = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, cloned));
          }
          return networkRes;
        })
        .catch(() => cachedRes || caches.match('/index.html'));
      return cachedRes || fetchPromise;
    })
  );
});