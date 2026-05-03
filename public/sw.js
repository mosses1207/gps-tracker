const CACHE_NAME = 'nvdc-cache-v9';

const assets = [
  '/',
  '/index.html',
  '/manifest.json'
  '/style.css'
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

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Handle navigation (biar SPA aman)
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
          const url = new URL(e.request.url);

          if (
            networkRes &&
            networkRes.status === 200 &&
            url.origin === location.origin
          ) {
            const cloned = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(e.request, cloned);
            });
          }

          return networkRes;
        })
        .catch(() => cachedRes || caches.match('/index.html'));

      return cachedRes || fetchPromise;
    })
  );
});