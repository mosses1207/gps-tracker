async function handleBerangkat() {
    const btnBerangkat = document.getElementById('btnBerangkat');
    const btnSampai = document.getElementById('btnSampai');

    // 1. VALIDASI: Pastikan GPS & Data input sudah siap
    if (!currentPos || currentPos.lat === 0) {
        alert("⚠️ Tunggu sampai GPS mendapatkan lokasi Anda!");
        return;
    }

    const noSJKB = document.getElementById('no_sjkb').value;
    const tujuan = document.getElementById('tujuan_dealer').value;

    if (!noSJKB || !tujuan) {
        alert("⚠️ Nomor SJKB atau Tujuan belum ada. Scan dulu atau isi manual!");
        return;
    }

    // 2. KALKULASI WAKTU
    const waktuBerangkat = new Date();
    const durasiMenit = window.deliveryData ? parseInt(window.deliveryData.durasi) : 0;
    // Target sampai = waktu sekarang + durasi (dalam milidetik)
    const targetSampai = new Date(waktuBerangkat.getTime() + durasiMenit * 60000);

    // 3. SUSUN DATA UNTUK CACHE (LocalStorage)
    const travelSession = {
        no_sjkb: noSJKB,
        tujuan: tujuan,
        lat_awal: currentPos.lat,
        lng_awal: currentPos.lng,
        waktu_berangkat: waktuBerangkat.toISOString(),
        target_sampai: targetSampai.toISOString(),
        rute_dipilih: window.deliveryData ? window.deliveryData.rute : "", // Encoded polyline awal
        // Point 6 & Speed: Inisialisasi history titik pertama
        path_history: [{
            lat: currentPos.lat,
            lng: currentPos.lng,
            spd: 0
        }],
        // Point 8: Update satu posisi terakhir
        last_update: { 
            lat: currentPos.lat, 
            lng: currentPos.lng, 
            spd: 0 
        }
    };

    // 4. SIMPAN KE CACHE
    localStorage.setItem('active_session', JSON.stringify(travelSession));
    isTrackingActive = true;

    // 5. UPDATE UI (Tukar Tombol & Map)
    btnBerangkat.style.display = 'none';
    btnSampai.style.display = 'block';
    
    // Map Fly To Posisi Supir (Zoom 18 biar detail)
    isAutoCenter = true;
    map.flyTo([currentPos.lat, currentPos.lng], 18, {
        animate: true,
        duration: 2
    });

    logKeLayar("🚀 Perjalanan DIMULAI!");
    logKeLayar(`📋 SJKB: ${noSJKB}`);
    logKeLayar(`🏁 Estimasi Sampai: ${targetSampai.toLocaleTimeString('id-ID')}`);
}

function catatPerjalanan(lat, lng, speed) {
    let sessionData = localStorage.getItem('active_session');
    if (!sessionData) return;

    let session = JSON.parse(sessionData);

    // POINT 8: Selalu update posisi terakhir (buat UI/Live Tracking)
    session.last_update = { lat, lng, spd: speed };

    // POINT 6: Update History (Array Panjang)
    const history = session.path_history;
    const lastPoint = history[history.length - 1];

    // HITUNG JARAK dari titik terakhir di history
    const dist = calculateDistanceperjalnan(lastPoint.lat, lastPoint.lng, lat, lng);

    // FILTER: Hanya masuk history kalau gerak > 0.03 KM (30 meter)
    // Biar array nggak bengkak dan JSON.stringify nggak berat
    if (dist > 0.03) { 
        history.push({ lat, lng, spd: speed });
        console.log(`📍 History +1 (Total: ${history.length} pts)`);
    }

    // Simpan balik
    localStorage.setItem('active_session', JSON.stringify(session));
}

function calculateDistanceperjalnan(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius bumi dalam KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Hasil dalam KM
}
