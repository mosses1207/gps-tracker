import { createClient } from '@supabase/supabase-js'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW Registered!', reg))
      .catch(err => console.error('SW Failed!', err));
  });
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const supabase = createClient(supabaseUrl, supabaseAnonKey)
const loaderSatpam = document.getElementById('loading-satpam');
const loadProgress = document.getElementById('load-progress');

function updateLoading(percent, text) {
  if (loadProgress) loadProgress.innerText = `${text} (${percent}%)`;
  if (percent >= 100) {
    setTimeout(() => {
      if (loaderSatpam) loaderSatpam.style.display = 'none';
    }, 800);
  }
}

window.pindahKeAdmin = (isAdmin) => {
  const areaGoogle = document.getElementById('area-google');
  const areaAdmin = document.getElementById('area-admin');
  const title = document.getElementById('title-login');
  if (isAdmin) {
    areaGoogle.style.display = 'none';
    areaAdmin.style.display = 'block';
    title.innerText = "Admin Login";
  } else {
    areaGoogle.style.display = 'block';
    areaAdmin.style.display = 'none';
    title.innerText = "Akses Sistem";
  }
}

window.prosesLoginAdmin = async () => {
  const email = document.getElementById('userAdmin').value;
  const password = document.getElementById('passAdmin').value;
  if (!email || !password) return alert("Isi email & password admin!");
  updateLoading(50, "Memverifikasi Admin...");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Gagal Login Admin: " + error.message);
    updateLoading(100, "Gagal Masuk");
  } else {
    // Sesi baru akan dihandle oleh initSystem setelah reload
    location.reload();
  }
}

async function handleCredentialResponse(response) {
  updateLoading(50, "Memverifikasi Token Google...");
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.credential,
  })
  if (error) {
    alert("Gagal Login Google: " + error.message);
    updateLoading(100, "Gagal Masuk");
  } else {
    updateLoading(100, "Login Berhasil!");
    location.reload(); 
  }
}

async function initSystem() {
  updateLoading(30, "Mengecek Hak Akses...");
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const user = session.user;
    console.log("User Aktif:", user.email);
    const userPhoto = user.user_metadata.avatar_url || user.user_metadata.picture || "";
    const userData = {
      email: user.email,
      uid: user.id,
      name: user.user_metadata.full_name || "User",
      photo: userPhoto,
      lastLogin: new Date().toISOString()
    };
    localStorage.setItem('user_session', JSON.stringify(userData));
    const imgProfile = document.getElementById('user-profile-img');
    if (imgProfile && userPhoto) {
      imgProfile.src = userPhoto;
      imgProfile.style.display = 'block';
    }
    document.getElementById('login-overlay').style.display = 'none';
    updateLoading(100, "Sistem Aktif");
    if (typeof initMap === "function") initMap();
    if (typeof startTracking === "function") startTracking();
  } else {
    localStorage.removeItem('user_session');
    updateLoading(60, "Menyiapkan Gerbang Login...");
    document.getElementById('login-overlay').style.display = 'flex';
    if (typeof google !== 'undefined' && google.accounts) {
      renderGoogleButton();
    } else {
      console.warn("Google SDK belum siap, mencoba memuat ulang...");
      setTimeout(() => {
        if (typeof google !== 'undefined' && google.accounts) {
          renderGoogleButton();
        } else {
          console.error("SDK Google gagal dimuat.");
          updateLoading(100, "Gagal memuat Google SDK");
        }
      }, 1500);
    }
  }
}

function renderGoogleButton() {
  google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleCredentialResponse
  });
  const googleBtnDiv = document.getElementById("google-login-btn");
  if (googleBtnDiv) {
    google.accounts.id.renderButton(
      googleBtnDiv,
      { theme: "outline", size: "large", width: "100%", text: "signin_with" }
    );
  }
  updateLoading(100, "Silakan Login");
}

window.logoutSistem = async () => {
  const yakin = confirm("Yakin mau keluar sistem?");
  if (yakin) {
    await supabase.auth.signOut();
    localStorage.removeItem('user_session'); // Hapus cache saat logout
    location.reload();
  }
}

let wakeLock = null;

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

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release()
            .then(() => {
                wakeLock = null;
                logKeLayar("🔋 Wake Lock dilepas (Hemat Baterai)");
            });
    }
}

document.addEventListener('visibilitychange', async () => {
    // Cukup satu kondisi: kalau layar jadi 'visible', langsung gas minta lock lagi
    if (document.visibilityState === 'visible') {
        console.log("Supir balik ke aplikasi, mengaktifkan kembali Wake Lock...");
        await requestWakeLock();
    }
});

window.requestWakeLock = requestWakeLock;
window.releaseWakeLock = releaseWakeLock;
window.map = null;
window.userMarker = null;
window.worker = null;
window.watchId = null;
window.currentPos = { lat: 0, lng: 0 };
window.isAutoCenter = true;
window.isCameraActive = false;
window.isFirstLocation = true;
window.isLocked = false;
window.isProcessing = false;
window.lastAddressLat = 0;
window.lastAddressLng = 0;
window.msg = "";
window.result = null;
window.currentPolyline = null;
window.startMarker = null;
window.endMarker = null;
window.logKeLayar = function(msg) {
    const logDiv = document.getElementById('debug-log');
    if (!logDiv) return;
    const entry = document.createElement('div');
    const waktu = new Date().toLocaleTimeString('id-ID', { hour12: false });
    entry.innerText = `> [${waktu}] ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

const startIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/5425/5425869.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});
const endIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/5425/5425869.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});
const geoOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
};

function initMap() {
    if (window.map) {
        logKeLayar("⚠️ Map sudah ada, skip init");
        return;
    }
    map = L.map('map', {
        zoomControl: false 
    }).setView([-6.2847, 107.1006], 15); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        useCache: true,        
        crossOrigin: true,
        cacheMaxAge: 2592000000, 
        useOnlyCache: false      
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    userMarker = L.circleMarker([0, 0], {
        radius: 10,
        fillColor: "#007bff",
        color: "#fff",
        weight: 3,
        opacity: 1,
        fillOpacity: 0.9
    }).addTo(map);
    map.on('movestart', (e) => {
        if (e.hard) return; 
        isAutoCenter = false;
        document.getElementById('gpsText').innerText = "Manual Mode (Auto-Off)";
    });
    logKeLayar("🗺️ Map Ready");
}

function initGPS() {
    if ("geolocation" in navigator) {
        logKeLayar("📡 Meminta akses GPS...");
        watchId = navigator.geolocation.watchPosition(
            updateLocationSuccess,
            updateLocationError,
            geoOptions
        );
    } else {
        logKeLayar("❌ Browser tidak support GPS");
    }
}

function updateMapDisplay(lat, lng) {
    if (!map || !userMarker) return;
    const newPos = [lat, lng];
    userMarker.setLatLng(newPos);
    if (isFirstLocation) {
        map.setView(newPos, 17);
        isFirstLocation = false;
        return;
    }
    if (isAutoCenter) {
        map.flyTo(newPos, map.getZoom(), {
            animate: true,
            duration: 1.5 
        });
    }
}

function isGpsValid(newLat, newLng, accuracy) {
    if (accuracy > 150) {
        logKeLayar(`⚠️ Sinyal Lemah: Akurasi buruk (${accuracy.toFixed(0)}m). Mencoba mencari sinyal...`);
        return false;
    }    
    let sessionData = localStorage.getItem('active_session');
    if (!sessionData) return true; // Titik pertama valid kalau akurasinya lolos < 100m
    let session = JSON.parse(sessionData);
    let lastPoint = session.last_update;
    const dist = window.calculateDistanceperjalanan(lastPoint.lat, lastPoint.lng, newLat, newLng);
    const now = new Date();
    const lastTime = new Date(session.last_update_time || session.waktu_berangkat);
    const timeDiff = (now - lastTime) / (1000 * 60 * 60);
    if (timeDiff > 0) {
        const speed = dist / timeDiff;
        if (speed > 150) {
            logKeLayar(`⚠️ GPS Loncat: Kecepatan ${speed.toFixed(1)} km/jam ditolak.`);
            return false;
        }
    }
    return true;
}

function updateLocationSuccess(position) {
    const { latitude, longitude, speed, accuracy } = position.coords; 
    if (!isGpsValid(latitude, longitude, accuracy)) {
        document.getElementById('gpsText').innerText = "⚠️ Sinyal GPS Lemah";
        document.getElementById('gpsText').style.color = "#eab308";
        return;
    }
    const speedKmH = speed ? Math.round(speed * 3.6) : 0;
    currentPos.lat = latitude;
    currentPos.lng = longitude;
    document.getElementById('lat').innerText = latitude.toFixed(6);
    document.getElementById('lng').innerText = longitude.toFixed(6);
    document.getElementById('spdDisplay').innerText = speedKmH;
    const gpsEl = document.getElementById('gpsText');
    if (gpsEl) { 
    gpsEl.innerText = isAutoCenter ? "📡 Live Tracking" : "📍 Manual Mode";
    gpsEl.style.color = "#22c55e";
    }
    if (isTrackingActive) {
        catatPerjalanan(latitude, longitude, speedKmH);
    }
    const checkLat = latitude.toFixed(3);
    const checkLng = longitude.toFixed(3);
    if (checkLat !== lastAddressLat || checkLng !== lastAddressLng) {
        updateStreetName(latitude, longitude); 
        lastAddressLat = checkLat;
        lastAddressLng = checkLng;
    }
    updateMapDisplay(latitude, longitude);
}

function recenterMap() {
    isAutoCenter = true;
    if (currentPos.lat !== 0) {
        map.flyTo([currentPos.lat, currentPos.lng], 17, {
            animate: true,
            duration: 1
        });
       const gpsEl = document.getElementById('gpsText');
            if (gpsEl) {
                gpsEl.innerText = "📡 Live Tracking";
                gpsEl.style.color = "#22c55e";
            }
            logKeLayar("🎯 Fokus ke Lokasi"); 
    }
}

function updateLocationError(error) {
    switch(error.code) {
        case error.PERMISSION_DENIED: msg = "Izin GPS ditolak supir."; break;
        case error.POSITION_UNAVAILABLE: msg = "Sinyal GPS hilang."; break;
        case error.TIMEOUT: msg = "GPS Timeout."; break;
        default: msg = "GPS Error.";
    }
    document.getElementById('gpsText').innerText = msg;
    document.getElementById('gpsText').style.color = "#ef4444";
    logKeLayar("⚠️ " + msg);
}

async function updateStreetName(lat, lng) {
    const streetElement = document.getElementById('street-name');
    const cacheKey = `addr_${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const cachedAddress = localStorage.getItem(cacheKey);  
    if (cachedAddress) {
        console.log("Ambil dari cache HP...");
        streetElement.innerText = cachedAddress;
        return;
    }
    try {
        if (localStorage.length > 500) {
            console.log("🧹 Membersihkan cache lama...");
            localStorage.clear(); 
        }
        console.log("Tanya ke internet (Nominatim)...");
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
        const response = await fetch(url, { 
        headers: { 
            'Accept-Language': 'id',
            'User-Agent': 'SatpamAsetApp/1.0' // WAJIB TAMBAH INI
            } 
        });
        const data = await response.json();
        const address = data.address;
        const street = address.road || address.residential || address.suburb || "Area tidak teridentifikasi";
        localStorage.setItem(cacheKey, street);
        streetElement.innerText = street;
    } catch (error) {
        console.error("Gagal ambil alamat:", error);
    }
}

function drawRouteOnMap(encodedPolyline) {
    if (!map) {
        logKeLayar("❌ Map belum siap");
        return;
    }
    if (!encodedPolyline || typeof encodedPolyline !== "string") {
        logKeLayar("❌ Polyline tidak valid");
        return;
    }
    isAutoCenter = false;
    if (currentPolyline) {
        map.removeLayer(currentPolyline);
    }
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    const coords = decodePolyline(encodedPolyline);
    if (!coords || coords.length === 0) {
        logKeLayar("❌ Gagal decode polyline");
        return;
    }
    currentPolyline = L.polyline(coords, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.8,
        lineJoin: 'round'
    }).addTo(map);
    const start = coords[0];
    const end = coords[coords.length - 1];
    startMarker = L.marker(start, { icon: startIcon }).addTo(map);
        startMarker.bindTooltip("Start", { permanent: false });
    endMarker = L.marker(end, { icon: endIcon }).addTo(map)
        .bindPopup("🏁 Tujuan");
        endMarker.bindTooltip("Tujuan", { permanent: false });
    map.fitBounds(currentPolyline.getBounds(), {
        padding: [20, 20]
    });
    logKeLayar("🗺️ Rute + Marker ditampilkan");
}

function decodePolyline(encoded) {
    let points = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
}

window.addEventListener('load', () => {
    initMap();
    initGPS();
});

window.initMap = initMap;
window.initGPS = initGPS;
window.recenterMap = recenterMap;
window.drawRouteOnMap = drawRouteOnMap;
window.isTrackingActive = false; 
window.calculateDistanceperjalanan = function(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

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
    const dist = window.calculateDistanceperjalanan(lastPoint.lat, lastPoint.lng, lat, lng);
    if (dist > 0.05) { 
        history.push({ lat, lng, spd: speed });
        logKeLayar(`📍 Titik ke-${history.length} masuk cache (${(dist*1000).toFixed(0)}m)`);
    }
    localStorage.setItem('active_session', JSON.stringify(session));
}

(function checkActiveSession() {
    const sessionData = localStorage.getItem('active_session');
    const targetEl = document.querySelector('.target');
    if (sessionData) {
        const session = JSON.parse(sessionData);
        if (targetEl) targetEl.classList.remove('hidden');
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

const debugLog = true;
const processingCanvas = document.createElement('canvas');
const processingContext = processingCanvas.getContext('2d');
const ALLOWED_LOCATIONS = [
    { name: "Lokasi 1", lat: -6.449595660933786, lng: 107.00540022618232 },
    { name: "Lokasi 2", lat: -6.314941380764999, lng: 107.08465396420782 },
    { name: "Lokasi 3", lat: -6.35781170272672, lng: 107.25441893645797 },
    { name: "Lokasi 4", lat: -6.13823075256515, lng: 106.88354566724894 }
];
const MAX_RADIUS_KM = 1;

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Jari-jari bumi dalam KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Hasilnya dalam KM
}

function isDriverInZone(userLat, userLng) {
    const nearbyLocation = ALLOWED_LOCATIONS.find(loc => {
        const distance = calculateDistance(userLat, userLng, loc.lat, loc.lng);
        return distance <= MAX_RADIUS_KM;
    });
    return nearbyLocation || null; // Balikin data lokasi kalau ketemu, atau null kalau jauh
}

document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loading-satpam');
    if (loader) {
        loader.style.setProperty('display', 'flex', 'important');
        logKeLayar("Sistem dimulai...");
    }

    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) {
        btnScan.addEventListener('click', (e) => {
            e.preventDefault();
            window.isLocked = false; // Reset lock setiap kali tombol scan ditekan
            logKeLayar("Membuka Kamera...");
            openScanner();
        });
    }
    initSatpam();
});

async function initSatpam() {
    const progressText = document.getElementById('load-progress');
    const loadingOverlay = document.getElementById('loading-satpam');
    try {
        logKeLayar("Menyiapkan Tesseract...");
        window.worker = await Tesseract.createWorker('eng');
        progressText.innerText = "OCR Siap";
        await window.worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-. ',
            tessedit_pageseg_mode: '3'
        });
        logKeLayar("Satpam Siap!");
        setTimeout(() => {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
        }, 1000);
    } catch (e) {
        logKeLayar("‼️ GAGAL INIT: " + e.message);
        progressText.innerText = "Error Sistem. Cek Koneksi.";
    }
}

async function openScanner() {
    if (window.isProcessing || window.isLocked || window.isCameraActive) {
        logKeLayar("⚠️ Sistem sedang sibuk, tunggu bentar Bang...");
        return;
    }
    requestWakeLock().catch(err => console.error("WakeLock Error:", err)); 
    logKeLayar("Mengecek GPS..."); // Cek apakah log ini muncul?
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    const btnScan = document.getElementById('btnScanAction');
    if (window.currentPos.lat === 0 || window.currentPos.lng === 0) {
        alert("⚠️ GPS belum siap atau koordinat belum terbaca.");
        return;
    }
    const zone = isDriverInZone(window.currentPos.lat, window.currentPos.lng);
    if (!zone) {
        logKeLayar("❌ Akses Ditolak: Anda di luar radius 1 KM");
        alert("Harap mulai perjalanan dari lokasi tempat anda bekerja.");
        return;
    }
    if (window.isCameraActive) {
        logKeLayar("⚠️ Kamera masih aktif");
        return;
    }
    btnScan.disabled = true;
    document.getElementById('scan-status').innerText = "🔍 Scanning...";
    logKeLayar(`✅ Lokasi Terverifikasi: ${zone.name}`);  
    window.isLocked = false;
    window.isProcessing = false;
    window.isCameraActive = true;
    if (!window.worker) {
        alert("Sistem belum siap.");
        const btnScan = document.getElementById('btnScanAction');
        if (btnScan) btnScan.disabled = false;
        return;
    }
    container.style.display = 'block';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        video.srcObject = stream;
        video.onloadeddata = null;
        video.onloadeddata = async () => {
            await video.play();
            logKeLayar("Mencari Target...");
            startValidasiProses();
        };
    } catch (err) {
    const btnScan = document.getElementById('btnScanAction');
    btnScan.disabled = false;
    window.isCameraActive = false;
    alert("Kamera Error: " + err.message);
    }
}

async function startValidasiProses() {
    if (!window.worker) {
        logKeLayar("⚠️ Worker belum siap");
        return;
    }
    const video = document.getElementById('video');
    if (window.isProcessing || !window.isCameraActive || window.isLocked) return;
    window.isProcessing = true;
    const scanBox = document.getElementById('scan-box');
    const rect = scanBox.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    if (!video.videoWidth || !video.videoHeight || !videoRect.width || video.readyState < 2 ) {
        window.isProcessing = false;
        setTimeout(() => requestAnimationFrame(startValidasiProses), 300);
        return;
    }
    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;
    const startX = (rect.left - videoRect.left) * scaleX;
    const startY = (rect.top - videoRect.top) * scaleY;
    const scanWidth = rect.width * scaleX;
    const scanHeight = rect.height * scaleY;
    processingCanvas.width = scanWidth;
    processingCanvas.height = scanHeight;
    processingContext.filter = 'grayscale(1) contrast(1.2)';
    processingContext.drawImage(
        video,
        startX, startY, scanWidth, scanHeight,
        0, 0, scanWidth, scanHeight
    );
    try {
        const result = await window.worker.recognize(processingCanvas);
        const rawText = result.data.text
            .toUpperCase()
            .replace(/O/g, '0')
            .replace(/\s+/g, ' ');
        logKeLayar("👁️ Anchor: " + rawText.substring(0, 30));
        const hasToyota = /TOYOTA|T0YOTA|TOY0TA|T0Y0TA/.test(rawText);
        const hasAstra  = /ASTRA/.test(rawText);
        const hasMotor  = /M0T0R|MOTOR|M0TOR|MOT0R/.test(rawText);
        if (hasToyota && hasAstra && hasMotor) {
            window.isLocked = true;
            showLoading("Mengambil gambar...");
            document.getElementById('scan-status').innerText = "🎯 MATCH! CAPTURING...";
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
setTimeout(() => {
    const fullCanvas = document.createElement('canvas');
    const MAX_WIDTH = 1280;   
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
    }
    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.filter = 'contrast(1.4) brightness(1.1)';
    fullCtx.drawImage(video, 0, 0, width, height);
    let finalBlob = fullCanvas.toDataURL('image/jpeg', 0.9); 
    let currentLength = finalBlob.length; 
    logKeLayar(`Cek awal: ${currentLength} karakter`);
    if (currentLength < 70000) {
        finalBlob = fullCanvas.toDataURL('image/png');
        logKeLayar("⚠️ Burik Terdeteksi! Force PNG (Detail Maksimal)");
    } 
    else if (currentLength > 300000) {
        finalBlob = fullCanvas.toDataURL('image/jpeg', 0.7);
        logKeLayar("⚡ Kegedean! Kompres ke JPEG 0.7");
    }
    else {
        logKeLayar("✅ Ukuran Ideal, kirim JPEG 0.9");
    }
    closeCamera();
    uploadKeGemini(finalBlob);
    logKeLayar("🚀 Final Payload: " + finalBlob.length + " karakter");   
}, 300);
        }
    } catch (err) {
        logKeLayar("OCR error: " + err.message);
    } finally {
        if (!window.isLocked && window.isCameraActive) {
            window.isProcessing = false;
            setTimeout(() => requestAnimationFrame(startValidasiProses), 800);
        }
    }
}

async function uploadKeGemini(base64Data) {
    showLoading(" membaca data...");
    logKeLayar("🚀 Mengirim ke Gemini via GAS...");
    document.getElementById('no_sjkb').value = "Loading...";
    document.getElementById('tujuan_dealer').value = "Loading...";
    const pureBase64 = base64Data.split(',')[1];
    const gasUrl = "https://script.google.com/macros/s/AKfycbzJqgr_NoIACivq5IWwPyFKVFKmYgaTBkFjNwymBA7mPRC0vVKn8UN9mVPZZERPjZzr/exec";
    try {
        const response = await fetch(gasUrl, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain", // 🔥 FIX DISINI
            },
            body: JSON.stringify({ image: pureBase64 })
        });
        const result = await response.json();
    if (result.success) {
        logKeLayar("✅ Data diterima dari GAS");
        document.getElementById('no_sjkb').value = result.no_sjkb || "-";
        document.getElementById('tujuan_dealer').value = result.tujuan || "-";
        window.deliveryData = await fetchSpreadsheetData(result.tujuan);
        if (window.deliveryData) {
            logKeLayar("🚚 Data siap dipakai");
            // 🔥 KIRIM DATA LANGSUNG KE FUNGSI
            updateRuteUI(window.deliveryData); 
        }
        } else {
        logKeLayar("❌ Gagal: " + result.error);
    }
        } catch (err) {
            logKeLayar("‼️ Fetch Error: " + err.message);
            console.error(err);
    }finally {
    setTimeout(() => {
        window.isProcessing = false;
        window.isLocked = false;
        window.isCameraActive = false;
        logKeLayar("✅ Selesai. Siap scan lagi.");
        hideLoading();
        }, 1500);
    }
}

function isiHasilScan(data) {
    const inputSJKB = document.getElementById('no_sjkb');
    const inputTujuan = document.getElementById('tujuan_dealer');
    if (inputSJKB) inputSJKB.value = data.no_sjkb || "";
    if (inputTujuan) inputTujuan.value = data.tujuan || "";
    logKeLayar("✅ Input terisi otomatis");
}

function closeCamera() {
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) btnScan.disabled = false;
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    window.isProcessing = false;
    window.isLocked = false;
    window.isCameraActive = false;
    container.style.display = 'none';
    logKeLayar("🔴 Kamera Mati Total.");
}

function showLoading(text = "Memproses...") {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');
    textEl.innerText = text;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
}

async function fetchSpreadsheetData(tujuanGemini) {
    if (!window.currentPos || !window.currentPos.lat || !window.currentPos.lng) {
        logKeLayar("⚠️ GPS belum tersedia");
        return null;
    }
    const zone = isDriverInZone(window.currentPos.lat, window.currentPos.lng);
    const lokasiSheet = zone ? zone.name.replace("Lokasi ", "") : "1";
    const tujuanClean = (tujuanGemini || "")
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, "")
        .trim();
    logKeLayar(`🚀 REQ | tujuan: ${tujuanClean} | lokasi: ${lokasiSheet}`);
    try {
        const response = await fetch("https://script.google.com/macros/s/AKfycbxwMg2ne9r7ViTTppPhV5qPrb-S35kQf_xEH_R7VZllP_uuTiwV6TM-p7vyw8gME1zn/exec", {
            method: "POST",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                tujuan: tujuanClean,
                lokasi: lokasiSheet
            })
        });
        logKeLayar(`📡 STATUS: ${response.status}`);
        const text = await response.text();
        const shortText = text.length > 100 ? text.substring(0, 500) + "..." : text;
        logKeLayar(`📦 RAW: ${shortText}`);
        let result; 
        try {
        result = JSON.parse(text);
        } catch (e) {
            logKeLayar("❌ JSON PARSE ERROR");
            return null;
        }
        if (result.success) {
            window.deliveryData = result.data;
            if (result.data.rute && result.data.rute.length > 0) {
                // Set rute pertama sebagai default secara otomatis
                window.currentPolylineString = result.data.rute[0].polyline;
                logKeLayar("💡 Rute 1 otomatis diset sebagai default");
            } else {
                window.currentPolylineString = ""; 
                logKeLayar("⚠️ Data rute kosong dari server!");
            }
            return result.data;
        } else {
            logKeLayar(`❌ GAS ERROR: ${result.error}`);
            return null;
        }
    } catch (err) {
        logKeLayar(`‼️ FETCH ERROR: ${err.message}`);
        return null;
    }
}

function updateRuteUI(data) {
    const container = document.getElementById('ruteButtons');
    const area = document.getElementById('ruteSelectionArea');
    if (!container || !area) {
        logKeLayar("❌ Element UI tidak ditemukan");
        return;
    }
    container.innerHTML = ''; 
    const targetData = data || window.deliveryData;
    if (!targetData) {
        logKeLayar("⚠️ Tidak ada data");
        return;
    }
    logKeLayar("CEK DATA: " + JSON.stringify(targetData));
    let polyList = targetData.polylines || targetData.rute;
    if (typeof polyList === "string") {
        polyList = [polyList];
    }
    if (Array.isArray(polyList) && polyList.length > 0) {
        logKeLayar(`✨ Ditemukan ${polyList.length} rute`);
        area.style.display = 'block'; 
        polyList.forEach((poly, index) => {
            const btn = document.createElement('button');
            btn.innerText = `Rute ${index + 1}`;
            btn.className = "btn-rute";
            const polyString = (typeof poly === 'object') ? poly.polyline : poly;
            btn.onclick = () => {
                document.querySelectorAll('.btn-rute').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.currentPolylineString = polyString; 
                logKeLayar(`📍 Rute dipilih (Size: ${polyString.length} chars)`);
                if (typeof window.drawRouteOnMap === "function") {
                    window.drawRouteOnMap(polyString);
                }
            };
            container.appendChild(btn);
        });
        container.firstChild.click();
    } else {
        logKeLayar("⚠️ Tidak ada polyline");
        area.style.display = 'none';
    }
}

window.openScanner = openScanner;
window.logKeLayar = logKeLayar;
window.closeCamera = closeCamera;
window.updateRuteUI = updateRuteUI;
window.fetchSpreadsheetData = fetchSpreadsheetData;
const google = {
  script: {
    run: {
      withSuccessHandler: function(callback) {
        this.callback = callback;
        return this;
      },
      withFailureHandler: function(failCallback) {
        this.failCallback = failCallback;
        return this;
      },
      getData: function() {
        console.log("Mock: Mengambil data...");
        setTimeout(() => {
          const fakeData = [
            ["SJKB-001", "Dealer Jakarta", "2026-04-30T10:00:00", "2026-04-30T11:00:00"],
            ["SJKB-002", "Dealer Bekasi", "2026-04-30T12:00:00", "-"]
          ];
          this.callback(fakeData);
        }, 1000);
      },
      ocrViaDrive: function(base64) {
        console.log("Mock: Menjalankan OCR...");
        setTimeout(() => {
          this.callback({
            no_sjkb: "SJKB-MOCK-123",
            tujuan: "DEALER TOYOTA CIBUBUR",
            lt: "45",
            confidence: "HIGH",
            rute_options: ["encoded_polyline_1", "encoded_polyline_2"]
          });
        }, 2000);
      },
      mulaiRecordSheet: function(no, tujuan, lat, lng, rute) {
        console.log("Mock: Memulai perjalanan...");
        setTimeout(() => {
          this.callback("Berhasil Record di Server (Fake)");
        }, 1500);
      },
      updateSampaiSheet: function(no, path, lat, lng, speed) {
        console.log("Mock: Menyimpan data sampai...");
        setTimeout(() => {
          this.callback();
        }, 1500);
      }
    }
  }
};
