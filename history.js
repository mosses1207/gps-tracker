window.isTrackingActive = false; 

async function handleBerangkat() {
    const btnBerangkat = document.getElementById('btnBerangkat');
    const btnSampai = document.getElementById('btnSampai');
    if (!window.currentPolylineString) {
        alert("⚠️ Pilih rutenya dulu");
        logKeLayar("⚠️ Polyline belum dipilih");
        return;
    }   
    if (!window.currentPos || window.currentPos.lat === 0) {
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
    const durasiMenit = window.deliveryData && !isNaN(parseInt(window.deliveryData.durasi, 10))
    ? parseInt(window.deliveryData.durasi, 10)
    : 0;
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
        const formatter = new Intl.DateTimeFormat('id-ID', opsi).format(targetSampai);
        document.getElementById('target-text').innerText = `${formatter.replace('.', ':')} WIB`;
    }
    const travelSession = {
        no_sjkb: noSJKB,
        tujuan: tujuan,
        lat_awal: window.currentPos.lat,
        lng_awal: window.currentPos.lng,
        waktu_berangkat: waktuBerangkat.toISOString(),
        target_sampai: targetSampai.toISOString(),
        rute_dipilih: window.currentPolylineString, 
        path_history: [{ lat: window.currentPos.lat, lng: window.currentPos.lng, spd: 0 }],
        last_update: { lat: window.currentPos.lat, lng: window.currentPos.lng, spd: 0 }
    };

    localStorage.setItem('active_session', JSON.stringify(travelSession));
    window.isTrackingActive = true;
    window.isAutoCenter = true;
    btnBerangkat.style.display = 'none';
    btnSampai.style.display = 'block';
    if(document.getElementById('ruteSelectionArea')) {
        document.getElementById('ruteSelectionArea').style.display = 'none';
    }
    if (typeof map !== "undefined" && map) {
    map.flyTo([window.currentPos.lat, window.currentPos.lng], 18);
    }
    const targetEl = document.querySelector('.target');
    if (targetEl) targetEl.classList.remove('hidden');
    if (typeof requestWakeLock === 'function') requestWakeLock();
    logKeLayar("🚀 Perjalanan DIMULAI!");
    logKeLayar(`📋 SJKB: ${noSJKB}`);
    logKeLayar(`💾 Cache: Rute ${travelSession.rute_dipilih ? "✅ Tersimpan" : "❌ Kosong"}`);
}

function catatPerjalanan(lat, lng, speed) {
    let sessionData = localStorage.getItem('active_session');
    if (!sessionData) return;
    let session = JSON.parse(sessionData);
    session.last_update = { lat, lng, spd: speed };
    const history = session.path_history;
    if (!Array.isArray(history) || history.length === 0) return;
    const lastPoint = history[history.length - 1];
    const dist = calculateDistanceperjalanan(lastPoint.lat, lastPoint.lng, lat, lng);
    if (dist > 0.05) { 
        history.push({ lat, lng, spd: speed });
        // Log cache tiap ada titik baru
        logKeLayar(`📍 Titik ke-${history.length} masuk cache (${(dist*1000).toFixed(0)}m)`);
    }
    localStorage.setItem('active_session', JSON.stringify(session));
}

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
        logKeLayar(`🔹 Target sampai: ${session.target_sampai || '-'}`);
        logKeLayar(`🔹 Koordinat Awal: ${session.lat_awal}, ${session.lng_awal}`);
        logKeLayar(`🔹 History: ${Array.isArray(session.path_history) ? session.path_history.length : 0} titik`);
        logKeLayar(`🔹 Rute Terpilih: ${session.rute_dipilih ? '✅ Tersedia (Encoded)' : '❌ Kosong!'}`);
        logKeLayar(`-------------------------`);
        window.isTrackingActive = true; 
        if (typeof requestWakeLock === 'function') requestWakeLock();
        document.getElementById('btnBerangkat').style.display = 'none';
        document.getElementById('btnSampai').style.display = 'block';
        if(document.getElementById('no_sjkb')) document.getElementById('no_sjkb').value = session.no_sjkb;
        if(document.getElementById('tujuan_dealer')) document.getElementById('tujuan_dealer').value = session.tujuan;
        const historyCount = Array.isArray(session.path_history) ? session.path_history.length : 0;
        logKeLayar(`📦 Cache Restore: ${historyCount} titik tersimpan`);
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
                    if (window.currentPolyline && map) {
                    map.removeLayer(window.currentPolyline);
                    }
                    const coordinates = decodePolyline(session.rute_dipilih);
                    if (typeof map !== "undefined" && map) {
                    window.currentPolyline = L.polyline(coordinates, { color: '#2563eb', weight: 5 }).addTo(map);
                    }
                    const finishPoint = coordinates[coordinates.length - 1];
                    const iconFin = (typeof iconFinish !== 'undefined') ? iconFinish : new L.Icon.Default();
                    if (typeof map !== "undefined" && map && window.finishMarker) {
                    map.removeLayer(window.finishMarker);
                    }
                    if (typeof map !== "undefined" && map) {
                        window.finishMarker = L.marker(finishPoint, { icon: iconFin }).addTo(map);
                    }
                    if (window.currentPos && window.currentPos.lat !== 0) {
                        if (typeof map !== "undefined" && map) {
                        map.flyTo([window.currentPos.lat, window.currentPos.lng], 18);
                        }
                    } else {
                        map.fitBounds(window.currentPolyline.getBounds());
                    }
                    logKeLayar("✅ Rute dipulihkan ke peta");
                    window.isAutoCenter = true;
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

async function handleSampai() {
    if (!confirm("Apakah Anda sudah sampai di lokasi tujuan?")) return;
    logKeLayar("🏁 Mengakhiri perjalanan...");
    try {
        const sessionData = localStorage.getItem('active_session');
        const session = sessionData ? JSON.parse(sessionData) : {};
        localStorage.removeItem('active_session');
        window.isTrackingActive = false;
        window.isAutoCenter = true;
        if (window.currentPos && window.currentPos.lat !== 0) {
            if (typeof map !== "undefined" && map) {
            map.flyTo([window.currentPos.lat, window.currentPos.lng], 18);
            }
        }
        if(document.getElementById('no_sjkb')) document.getElementById('no_sjkb').value = "";
        if(document.getElementById('tujuan_dealer')) document.getElementById('tujuan_dealer').value = "";
        if(document.getElementById('lt_input')) document.getElementById('lt_input').value = "";
        if(document.getElementById('target-text')) document.getElementById('target-text').innerText = "--:--";
        const targetEl = document.querySelector('.target');
        if (targetEl) targetEl.classList.add('hidden');
        window.currentPolylineString = "";
        const btn = document.getElementById('btnBerangkat');
        if (btn) btn.style.display = 'block';
        const btnSampai = document.getElementById('btnSampai');
        if (btnSampai) btnSampai.style.display = 'none';
        if (document.getElementById('ruteSelectionArea')) {
            document.getElementById('ruteSelectionArea').style.display = 'block';
            document.getElementById('ruteSelectionArea').innerHTML = ""; 
        }
        if (window.currentPolyline && map) {
            map.removeLayer(window.currentPolyline);
        }
        if (typeof map !== "undefined" && map && window.finishMarker) {
        map.removeLayer(window.finishMarker);
        }
        if (typeof releaseWakeLock === 'function') releaseWakeLock();
        window.deliveryData = null;
        window.currentPolyline = null;
        window.finishMarker = null;
        logKeLayar(`✅ FINISH: ${session.no_sjkb || '-'}`);
        logKeLayar(`📍 Titik Terakhir: ${Array.isArray(session.path_history) ? session.path_history.length : 0} titik dicatat`);
        logKeLayar("✅ Cache dibersihkan & Form dikosongkan.");
        alert("🏁 Sampai Tujuan! Data perjalanan telah ditutup.");
    } catch (e) {
        logKeLayar("❌ Gagal mereset form: " + e.message);
    }
}
