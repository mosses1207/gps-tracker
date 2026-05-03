const CACHE_NAME = 'nvdc-cache-v6'; // 🔥 Gue naikin ke v6 biar refresh total

// Daftar aset statis
const assets = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// INSTALL: Simpan aset inti ke cache
self.addEventListener('install', e => {
  self.skipWaiting(); 
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching essential assets...');
      // Menggunakan addAll untuk file yang pasti ada
      return cache.addAll(assets);
    })
  );
});

// ACTIVATE: Hapus cache versi lama
self.addEventListener('activate', e => {
  self.clients.claim();
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

// FETCH: Strategi Cache First, then Network Update
self.addEventListener('fetch', e => {
  // PENGAMAN: Hanya proses request GET dan protokol http/https
  // Ini penting agar tidak error saat ketemu request chrome-extension atau POST data
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then(cachedRes => {
      const fetchPromise = fetch(e.request).then(networkRes => {
        
        // Validasi respon sebelum disimpan ke cache
        if (!networkRes || networkRes.status !== 200) {
          return networkRes;
        }

        // Clone untuk disimpan ke cache
        const cloned = networkRes.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, cloned);
        });

        return networkRes;
      }).catch(() => {
        // Jika offline dan tidak ada di cache, biarkan gagal lewat
        return cachedRes;
      });

      // Kembalikan dari cache jika ada, jika tidak ambil dari network
      return cachedRes || fetchPromise;
    })
  );
});
