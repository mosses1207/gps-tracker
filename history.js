// Deklarasi global
let isTrackingActive = false; 

// 1. FUNGSI UTAMA BERANGKAT
async function handleBerangkat() {
    const btnBerangkat = document.getElementById('btnBerangkat');
    const btnSampai = document.getElementById('btnSampai');

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
    
    isAutoCenter = true;
    map.flyTo([currentPos.lat, currentPos.lng], 18);

    logKeLayar("🚀 Perjalanan DIMULAI!");
}

// 2. FUNGSI NYATET PERJALANAN (Update Cache)
function catatPerjalanan(lat, lng, speed) {
    let sessionData = localStorage.getItem('active_session');
    if (!sessionData) return;

    let session = JSON.parse(sessionData);
    session.last_update = { lat, lng, spd: speed };

    const history = session.path_history;
    const lastPoint = history[history.length - 1];

    // Filter jarak 30 meter
    const dist = calculateDistanceperjalanan(lastPoint.lat, lastPoint.lng, lat, lng);

    if (dist > 0.03) { 
        history.push({ lat, lng, spd: speed });
        console.log(`📍 Titik dicatat (${history.length} pts)`);
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
    if (sessionData) {
        const session = JSON.parse(sessionData);
        isTrackingActive = true; 
        
        document.getElementById('btnBerangkat').style.display = 'none';
        document.getElementById('btnSampai').style.display = 'block';
        
        if(document.getElementById('no_sjkb')) document.getElementById('no_sjkb').value = session.no_sjkb;
        if(document.getElementById('tujuan_dealer')) document.getElementById('tujuan_dealer').value = session.tujuan;

        if(document.getElementById('lt_input')) {
            const berangkat = new Date(session.waktu_berangkat);
            const target = new Date(session.target_sampai);
            const durasiMenit = Math.round((target - berangkat) / 60000);
            document.getElementById('lt_input').value = durasiMenit;
        }

        if(document.getElementById('target-text')) {
            const jamTarget = new Date(session.target_sampai).toLocaleTimeString('id-ID', {
                hour: '2-digit', minute: '2-digit'
            });
            document.getElementById('target-text').innerText = jamTarget;
        }

        if (session.rute_dipilih && typeof decodePolyline === 'function') {
            if (currentPolyline) map.removeLayer(currentPolyline);
            const coordinates = decodePolyline(session.rute_dipilih);
            currentPolyline = L.polyline(coordinates, { color: '#2563eb', weight: 5 }).addTo(map);
            
            // Opsional: Pasang lagi marker finish-nya di titik terakhir polyline
            const finishPoint = coordinates[coordinates.length - 1];
            L.marker(finishPoint, { icon: iconFinish }).addTo(map);
            
            map.fitBounds(currentPolyline.getBounds());
        }
        console.log("🔄 Session Restored");
    }
})();
