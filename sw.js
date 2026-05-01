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
  const url = e.request.url;

  // ❌ JANGAN CACHE TESSERACT / WASM / CDN OCR
  if (
    url.includes('tesseract') ||
    url.includes('wasm') ||
    url.includes('cdn.jsdelivr.net')
  ) {
    return; // langsung network (biar OCR nggak stuck)
  }

  // ✅ cache biasa
  e.respondWith(
    caches.match(e.request).then(cachedRes => {
      const fetchPromise = fetch(e.request)
        .then(networkRes => {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, networkRes.clone());
          });
          return networkRes;
        })
        .catch(() => cachedRes);

      return cachedRes || fetchPromise;
    })
  );
});
