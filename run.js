
// --- Fungsi Penunjang: Screen Wake Lock ---
let wakeLock = null;

async function requestWakeLock() {
    try {
        // Cek apakah browser mendukung API ini
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            
            logKeLayar("💡 Screen Wake Lock Aktif (Layar Anti-Mati)");

            // Kalau tab dipindah atau layar sempat mati manual, minta lagi saat balik
            wakeLock.addEventListener('release', () => {
                logKeLayar("⚠️ Wake Lock dilepas");
            });

        } else {
            logKeLayar("❌ Browser tidak mendukung Wake Lock API");
        }
    } catch (err) {
        logKeLayar(`‼️ Wake Lock Error: ${err.name}, ${err.message}`);
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
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});
