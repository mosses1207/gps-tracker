const CACHE_NAME = 'nvdc-cache-v4'; // Naikkan versi
const assets = [
  '/',
  '/index.html',
  '/style.css',
  '/scan.js',
  '/fake.js',
  '/manifest.json', // Tambahkan manifest agar PWA valid
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js', // WAJIB ADA
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install Service Worker
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching assets...');
      return cache.addAll(assets);
    })
  );
});

// Activate & Cleanup Old Cache
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// Fetch Strategy: Stale-While-Revalidate
// Ini lebih bagus buat PWA: Pakai cache yang ada, tapi tetep update di background
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cachedRes => {
      const fetchPromise = fetch(e.request).then(networkRes => {
        // Simpan hasil fetch baru ke cache buat penggunaan berikutnya
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkRes.clone()));
        return networkRes;
      }).catch(() => cachedRes); // Kalau offline parah, balik ke cache

      return cachedRes || fetchPromise;
    })
  );
});
