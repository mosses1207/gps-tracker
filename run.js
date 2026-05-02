
// --- Fungsi Penunjang: Screen Wake Lock ---
let wakeLock = null;

// Di dalam run.js
async function requestWakeLock() {
    console.log("Fungsi WakeLock terpicu!"); 
    if ('wakeLock' in navigator) {
        try {
            window.wakeLock = await navigator.wakeLock.request('screen');
            logKeLayar("💡 Wake Lock Aktif");
        } catch (err) {
            logKeLayar(`❌ Gagal: ${err.message}`);
        }
    }
}

// Tempel ke window biar bisa dipanggil dari file scan.js/mapgps.js
window.requestWakeLock = requestWakeLock;

// Fungsi untuk mematikan Wake Lock (biar hemat baterai kalau sudah sampai)
function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release()
            .then(() => {
                wakeLock = null;
                logKeLayar("🔋 Wake Lock dilepas (Hemat Baterai)");
            });
    }
}

// Pantau kalau user balik lagi ke tab aplikasi (Visibility Change)
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});
