
// --- Fungsi Penunjang: Screen Wake Lock ---
let wakeLock = null;

// Di dalam run.js
async function requestWakeLock() {
    console.log("Fungsi WakeLock terpicu!"); 
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            logKeLayar("💡 Wake Lock Aktif");
            wakeLock.addEventListener('release', () => {
                logKeLayar("🔌 Wake Lock terlepas otomatis");
            })
        } catch (err) {
            logKeLayar(`❌ Gagal: ${err.message}`);
        }
    }
}

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
    // Cukup satu kondisi: kalau layar jadi 'visible', langsung gas minta lock lagi
    if (document.visibilityState === 'visible') {
        console.log("Supir balik ke aplikasi, mengaktifkan kembali Wake Lock...");
        await requestWakeLock();
    }
});

window.requestWakeLock = requestWakeLock;
window.releaseWakeLock = releaseWakeLock;
