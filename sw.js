const CACHE_NAME = 'nvdc-cache-v5'; // 🔥 NAIKIN VERSION WAJIB

const assets = [
  '/',
  '/index.html',
  '/style.css',
  '/scan.js',
  '/fake.js',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// INSTALL
self.addEventListener('install', e => {
  self.skipWaiting(); // langsung aktif

  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching assets...');
      return cache.addAll(assets);
    })
  );
});

// ACTIVATE
self.addEventListener('activate', e => {
  self.clients.claim(); // langsung kontrol page

  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    })
  );
});

// FETCH (🔥 FIX DISINI)
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cachedRes => {

      const fetchPromise = fetch(e.request).then(networkRes => {

        // ❗ clone SEKALI aja
        const cloned = networkRes.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, cloned);
        });

        return networkRes;
      }).catch(() => cachedRes);

      return cachedRes || fetchPromise;
    })
  );
});

