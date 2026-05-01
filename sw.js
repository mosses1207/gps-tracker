const CACHE_NAME = 'nvdc-cache-v5'; // 🔥 WAJIB ganti versi
const assets = [
  '/',
  '/index.html',
  '/style.css',
  '/scan.js',
  '/fake.js',
  '/manifest.json',

  // ❌ JANGAN CACHE TESSERACT FILES
  // biarin langsung dari network (penting buat WASM)

  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching assets...');
      return cache.addAll(assets);
    })
  );
});

// Activate
self.addEventListener('activate', e => {
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

// Fetch
self.addEventListener('fetch', e => {

  const url = e.request.url;

  // 🔥 BYPASS TESSERACT (INI KUNCI UTAMA)
  if (
    url.includes('tesseract') ||
    url.includes('.wasm')
  ) {
    return; // langsung network, jangan cache
  }

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
