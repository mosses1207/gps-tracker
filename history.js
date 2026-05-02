let isTrackingActive = false; 

async function handleBerangkat() {
    const btnBerangkat = document.getElementById('btnBerangkat');
    const btnSampai = document.getElementById('btnSampai');

    if (!window.currentPolylineString) {
        alert("⚠️ Pilih rutenya dulu, klik tombol Rute 1 atau Rute 2!");
        return;
    }
    
    if (!currentPos || currentPos.lat === 0) {
        alert("⚠️ Tunggu sampai GPS mendapatkan lokasi Anda!");
        return;
    }

    const noSJKB = document.getElementById('no_sjkb').value;
    const tujuan = document.getElementById('tujuan_dealer').value;

    if (!noSJKB || !tujuan) {
        alert("⚠️ Nomor SJKB atau Tujuan belum ada!");
        return;
    }

    const waktuBerangkat = new Date();
    const durasiMenit = window.deliveryData ? parseInt(window.deliveryData.durasi) : 0;
    const targetSampai = new Date(waktuBerangkat.getTime() + durasiMenit * 60000);
    if(document.getElementById('target-text')) {
        const opsi = { 
            day: '2-digit', 
            month: 'long', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false // Pakai format 24 jam
        };
        
        // Format ke: 03 Mei 2026 04:00
        const formatter = new Intl.DateTimeFormat('id-ID', opsi).format(targetSampai);
        
        // Tambahin "WIB" di belakangnya
        document.getElementById('target-text').innerText = `${formatter.replace('.', ':')} WIB`;
    }
    const travelSession = {
        no_sjkb: noSJKB,
        tujuan: tujuan,
        lat_awal: currentPos.lat,
        lng_awal: currentPos.lng,
        waktu_berangkat: waktuBerangkat.toISOString(),
        target_sampai: targetSampai.toISOString(),
        rute_dipilih: window.currentPolylineString, 
        path_history: [{ lat: currentPos.lat, lng: currentPos.lng, spd: 0 }],
        last_update: { lat: currentPos.lat, lng: currentPos.lng, spd: 0 }
    };

    localStorage.setItem('active_session', JSON.stringify(travelSession));
    isTrackingActive = true;

    btnBerangkat.style.display = 'none';
    btnSampai.style.display = 'block';
    if(document.getElementById('ruteSelectionArea')) {
        document.getElementById('ruteSelectionArea').style.display = 'none';
    }
    
    isAutoCenter = true;
    map.flyTo([currentPos.lat, currentPos.lng], 18);
    document.querySelector('.target').classList.remove('hidden');
    if (typeof requestWakeLock === 'function') requestWakeLock();
    
    logKeLayar("🚀 Perjalanan DIMULAI!");
    logKeLayar(`📋 SJKB: ${noSJKB}`);
    logKeLayar(`💾 Cache: Rute ${travelSession.rute_dipilih ? "✅ Tersimpan" : "❌ Kosong"}`);
}

// 2. FUNGSI NYATET PERJALANAN (Update Cache)
function catatPerjalanan(lat, lng, speed) {
    let sessionData = localStorage.getItem('active_session');
    if (!sessionData) return;

    let session = JSON.parse(sessionData);
    session.last_update = { lat, lng, spd: speed };

    const history = session.path_history;
    const lastPoint = history[history.length - 1];

    const dist = calculateDistanceperjalanan(lastPoint.lat, lastPoint.lng, lat, lng);

    if (dist > 0.03) { 
        history.push({ lat, lng, spd: speed });
        // Log cache tiap ada titik baru
        logKeLayar(`📍 Titik ke-${history.length} masuk cache (${(dist*1000).toFixed(0)}m)`);
    }

    localStorage.setItem('active_session', JSON.stringify(session));
}

// 3. HELPER JARAK
function calculateDistanceperjalanan(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// 4. AUTO-RESTORE (ANTI REFRESH)
(function checkActiveSession() {
    const sessionData = localStorage.getItem('active_session');
    const targetEl = document.querySelector('.target');
    if (sessionData) {
        const session = JSON.parse(sessionData);
        if (targetEl) targetEl.classList.remove('hidden');
        logKeLayar("🔄 Sesi aktif ditemukan...");
        logKeLayar(`🔹 SJKB: ${session.no_sjkb || '-'}`);
        logKeLayar(`🔹 Tujuan: ${session.tujuan || '-'}`);
        logKeLayar(`🔹 Waktu Berangkat: ${session.waktu_berangkat ? 'OK' : '❌'}`);
        logKeLayar(`🔹 Tujuan: ${session.target_sampai || '-'}`);
        logKeLayar(`🔹 Koordinat Awal: ${session.lat_awal}, ${session.lng_awal}`);
        logKeLayar(`🔹 History: ${session.path_history ? session.path_history.length : 0} titik`);
        logKeLayar(`🔹 Rute Terpilih: ${session.rute_dipilih ? '✅ Tersedia (Encoded)' : '❌ Kosong!'}`);
        logKeLayar(`-------------------------`);
        
        isTrackingActive = true; 
        if (typeof requestWakeLock === 'function') requestWakeLock();

        document.getElementById('btnBerangkat').style.display = 'none';
        document.getElementById('btnSampai').style.display = 'block';
        
        if(document.getElementById('no_sjkb')) document.getElementById('no_sjkb').value = session.no_sjkb;
        if(document.getElementById('tujuan_dealer')) document.getElementById('tujuan_dealer').value = session.tujuan;

        // Log detail isi cache pas restore
        logKeLayar(`📦 Cache Restore: ${session.path_history.length} titik tersimpan`);

        if(document.getElementById('lt_input')) {
            const berangkat = new Date(session.waktu_berangkat);
            const target = new Date(session.target_sampai);
            const durasiMenit = Math.round((target - berangkat) / 60000);
            document.getElementById('lt_input').value = durasiMenit;
        }

        if(document.getElementById('target-text') && session.target_sampai) {
            const targetDate = new Date(session.target_sampai);
            const opsi = { 
                day: '2-digit', month: 'long', year: 'numeric', 
                hour: '2-digit', minute: '2-digit', hour12: false 
            };
            const formatter = new Intl.DateTimeFormat('id-ID', opsi).format(targetDate);
            document.getElementById('target-text').innerText = `${formatter.replace('.', ':')} WIB`;
        }

        setTimeout(() => {
            if (session.rute_dipilih && typeof decodePolyline === 'function') {
                logKeLayar("🎨 Re-drawing rute...");
                try {
                    if (window.currentPolyline) map.removeLayer(window.currentPolyline);
                    const coordinates = decodePolyline(session.rute_dipilih);
                    window.currentPolyline = L.polyline(coordinates, { color: '#2563eb', weight: 5 }).addTo(map);
                    
                    const finishPoint = coordinates[coordinates.length - 1];
                    const iconFin = (typeof iconFinish !== 'undefined') ? iconFinish : new L.Icon.Default();
                    if (window.finishMarker) map.removeLayer(window.finishMarker);
                    window.finishMarker = L.marker(finishPoint, { icon: iconFin }).addTo(map);
                    if (currentPos && currentPos.lat !== 0) {
                        isAutoCenter = true; // Aktifkan auto center lagi
                        map.flyTo([currentPos.lat, currentPos.lng], 18);
                    } else {
                        map.fitBounds(window.currentPolyline.getBounds());
                    }
                    logKeLayar("✅ Rute dipulihkan ke peta");
                    isAutoCenter = true;
                    map.flyTo([currentPos.lat, currentPos.lng], 18);
                } catch (e) {
                    logKeLayar("❌ Gagal gambar rute dari cache");
                }
            } else {
                if (targetEl) targetEl.classList.remove('hidden');
                logKeLayar("⚠️ Rute_dipilih tidak ditemukan di cache");
            }
    }, 1500);
    } else { 
        if (targetEl) targetEl.classList.add('hidden');
    } 
})();

// 5. FUNGSI SAMPAI (Reset & Finish)
async function handleSampai() {
    if (!confirm("Apakah Anda sudah sampai di lokasi tujuan?")) return;

    logKeLayar("🏁 Mengakhiri perjalanan...");

    try {
        // Ambil data bentar buat log terakhir sebelum dihapus
        const sessionData = localStorage.getItem('active_session');
        const session = sessionData ? JSON.parse(sessionData) : {};

        // 1. Hapus Cache Session
        localStorage.removeItem('active_session');
        
        // 2. Matikan Status Tracking
        isTrackingActive = false;
        isAutoCenter = true;
        if (currentPos && currentPos.lat !== 0) {
            map.flyTo([currentPos.lat, currentPos.lng], 18);
        }
        // 3. RESET FORM UI
        if(document.getElementById('no_sjkb')) document.getElementById('no_sjkb').value = "";
        if(document.getElementById('tujuan_dealer')) document.getElementById('tujuan_dealer').value = "";
        if(document.getElementById('lt_input')) document.getElementById('lt_input').value = "";
        if(document.getElementById('target-text')) document.getElementById('target-text').innerText = "--:--";
        document.querySelector('.target').classList.add('hidden');
        // 4. Reset Variabel Global
        window.currentPolylineString = "";
        window.deliveryData = null;

        // 5. Kembalikan Tombol & Area Rute
        document.getElementById('btnBerangkat').style.display = 'block';
        document.getElementById('btnSampai').style.display = 'none';
        if (document.getElementById('ruteSelectionArea')) {
            document.getElementById('ruteSelectionArea').style.display = 'block';
            document.getElementById('ruteSelectionArea').innerHTML = ""; 
        }

        // 6. Bersihkan Map
        if (window.currentPolyline) map.removeLayer(window.currentPolyline);
        if (window.finishMarker) map.removeLayer(window.finishMarker);
        if (typeof releaseWakeLock === 'function') releaseWakeLock();
        // LOG AKHIR (Pake data yang tadi disimpan bentar)
        logKeLayar(`-------------------------`);
        logKeLayar(`✅ FINISH: ${session.no_sjkb || '-'}`);
        logKeLayar(`📍 Titik Terakhir: ${session.path_history ? session.path_history.length : 0} titik dicatat`);
        logKeLayar("✅ Cache dibersihkan & Form dikosongkan.");
        alert("🏁 Sampai Tujuan! Data perjalanan telah ditutup.");

    } catch (e) {
        logKeLayar("❌ Gagal mereset form: " + e.message);
    }
}
