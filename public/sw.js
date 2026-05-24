const CACHE_NAME = 'nvdc-cache-v24';
const TILE_CACHE_NAME = 'map-tiles-v1';
const TILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

const assets = [
  '/',
  '/aes.js',
  '/berangkat.js',
  '/dbModule.js',
  '/debug.js',
  '/gpsModule.js',
  '/istravel.js',
  '/loginModule.js',
  '/moduleQuery.js',
  '/osrmService.js',
  '/polyline.js',
  '/PreparationModule.js',
  '/sampai.js',
  '/swipeAction.js',
  '/travelactive.js',
  '/index.html',
  '/main.js',
  '/manifest.json', 
  '/index.css',
  '/Toyota-Logo-Free.png',
  '/account.png',
  '/destinasi.png',
  '/navigation.png',
  '/anchor-toyota.png'
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
          .filter(key => key !== CACHE_NAME && key !== TILE_CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open(TILE_CACHE_NAME).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) {
          const cachedDate = cached.headers.get('sw-cached-date');
          if (cachedDate) {
            const age = Date.now() - new Date(cachedDate).getTime();
            if (age < TILE_MAX_AGE_MS) return cached;
          } else {
            return cached;
          }
        }
        try {
          const response = await fetch(e.request);
          if (response.ok) {
            const headers = new Headers(response.headers);
            headers.append('sw-cached-date', new Date().toISOString());
            const cloned = new Response(await response.blob(), {
              status: response.status,
              statusText: response.statusText,
              headers
            });
            cache.put(e.request, cloned);
          }
          return response;
        } catch {
          // Offline dan tidak ada cache
          return cached || new Response('', { status: 408 });
        }
      })
    );
    return;
  }
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