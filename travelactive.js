import { supabase, hasInternet, showOfflineScreen } from './loginModule.js';
import { decryptData } from './aes.js';
import { currentCoords } from './gpsModule';
import { db } from './dbModule.js';
import { update_element } from './PreparationModule.js';
import { recenterMap } from './map.js';
import { getRoute } from './osrmService.js';
import { drawruteistravel } from './map.js';

export async function checkTravelActive() {
    const online = await hasInternet();

    if (!online) {
        // TODO: offline session handler
        return;
    }

    const uid = getSessionUID();
    if (!uid) return;

    try {
        await checkActiveTravelSession(uid);
    } catch (error) {
        console.error('Error checking travel active:', error);
        showOfflineScreen("Gangguan jaringan, pastikan anda berada di area terbuka atau signal yang bagus");
    }
}

function getSessionUID() {
    const rawData = localStorage.getItem('user_session');
    if (!rawData) {
        console.warn("Data session kosong di localStorage");
        location.reload();
        return null;
    }

    const { uid } = JSON.parse(rawData);
    if (!uid) {
        console.warn("UID tidak ditemukan di dalam session");
        location.reload();
        return null;
    }

    return uid;
}

async function checkActiveTravelSession(uid) {
    console.log("check travel active");

    const { data: activeTravel } = await supabase
        .from('path_history')
        .select('idseason, status')
        .eq('user_id', uid)
        .in('status', ['active', 'Active'])
        .maybeSingle();
    if (activeTravel) {
        await resumeTravelSession(activeTravel.idseason);
        return; ``
    }

    console.log("travel session tidak ditemukan, check absen driver");
    await checkAbsenDriver(uid);
}

async function resumeTravelSession(idseason) {
    let travelSession = await db.travel_sessions.get(idseason);
    if (!travelSession) {
        console.warn(`[DB] Lokal kosong, mencoba ambil dari Supabase...`);
        const { data: existing } = await supabase
            .from('absen')
            .select('*')
            .eq('uid', uid)
            .ilike('status', 'order')
            .maybeSingle();
        if (existing) {
            await db.travel_sessions.bulkPut([existing]);
            travelSession = existing; 
        } else {
            console.error("Data tidak ditemukan di lokal maupun server.");
            return;
        }
    }
    const targetsampai = decryptData(travelSession.arrive_target);
    uiactivetravel(targetsampai);
}

async function checkAbsenDriver(uid) {
    const { data: existing } = await supabase
        .from('absen')
        .select('uid')
        .eq('uid', uid)
        .ilike('status', 'order')
        .limit(1)
        .maybeSingle();
    const containerabsen = document.getElementById('container_absen');
    if (!containerabsen) return;

    if (existing) {
        containerabsen.style.display = 'none';
        update_element();
    } else {
        containerabsen.style.display = 'flex';
        await renderProfile();
    }
}

async function uiactivetravel(targetsampai) {
    const mapcontainer = document.getElementById("map_container");
    if (mapcontainer) {
        mapcontainer.style.display = "flex";
    }
    const formatWaktu = {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    const formatter = new Intl.DateTimeFormat('id-ID', formatWaktu).format(targetsampai);
    const targetsampaiText = document.getElementById("target_sampai");
    const closeMapBtn = document.getElementById("close_map_btn");
    const trackBerangkat = document.getElementById("trackBerangkat");
    const trackSampai = document.getElementById("trackSampai");
    const btnberangkat = document.getElementsByClassName("mulaiperjalanan")[0];
    const pilihRute = document.getElementById("container-tombol-rute");
    window.appState.travelSession = true;
    if (window.appState.myMap) {
        window.appState.myMap.invalidateSize();
        window.appState.myMarker.setLatLng([currentCoords.latitude, currentCoords.longitude]);
        recenterMap();
    }
    const rawrute = await getRoute(true);
    if (rawrute) {
        await drawruteistravel(rawrute);
    }
    if (btnberangkat) {
        btnberangkat.style.display = "none";
    }
    if (closeMapBtn) {
        closeMapBtn.style.display = "none";
    }
    if (targetsampaiText) {
        targetsampaiText.textContent = formatter + " WIB";
    }
    if (trackBerangkat) {
        trackBerangkat.style.display = "none";
    }
    if (trackSampai) {
        trackSampai.style.display = "flex";
    }
    if (pilihRute) {
        pilihRute.style.display = "none";
    }
}

export async function renderProfile() {
    const rawData = localStorage.getItem('user_session');
    if (!rawData) return;
    const userData = JSON.parse(rawData);
    const photoEl = document.getElementById('user-photo');
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const isPhotoValid = userData.photo && !userData.photo.includes('/0');
    if (photoEl) {
        photoEl.src = isPhotoValid ? userData.photo : './account.png';
    }
    if (nameEl) nameEl.textContent = userData.name || 'User';
    if (emailEl) emailEl.textContent = userData.email || 'No Email';
}

export function initSlideButton(callback) {
    const slider = document.getElementById("slider");
    const slideButton = document.getElementById("slideButton");
    let isDragging = false;

    slider.addEventListener("mousedown", () => {
        if (slideButton.classList.contains('disabled')) return;
        isDragging = true;
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        let moveX = e.clientX - slideButton.getBoundingClientRect().left;
        const max = slideButton.offsetWidth - slider.offsetWidth - 5;

        if (moveX < 0) moveX = 0;
        if (moveX > max) moveX = max;

        slider.style.left = moveX + "px";

        if (moveX >= max) {
            isDragging = false;
            slider.style.left = max + "px";
            if (callback) callback();
        }
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        slider.style.left = "3px";
    });
}

export async function absen() {
    const slideButton = document.getElementById('slideButton');
    const slider = document.getElementById('slider');
    const resetSlider = () => {
        if (slideButton) slideButton.classList.remove('disabled');
        if (slider) slider.style.left = "3px";
    };
    try {
        if (slideButton) slideButton.classList.add('disabled');
        const container_absen = document.getElementById('container_absen');
        const rawdata = localStorage.getItem('user_session');
        if (!rawdata) {
            console.error('User session tidak ada');
            resetSlider();
            return;
        }
        const userData = JSON.parse(rawdata);
        console.log("user data", userData);

        const { data: existing } = await supabase
            .from('absen')
            .select('uid')
            .eq('uid', userData.uid)
            .ilike('status', 'order')
            .limit(1)
            .maybeSingle();
        if (existing) {
            alert("Sudah absen, ada order aktif!");
            resetSlider();
            return;
        }
        const { error } = await supabase
            .from('absen')
            .insert({
                uid: userData.uid,
                nama: userData.name,
                email: userData.email,
                status: 'Order',
            });
        if (error) {
            console.error(error);
            resetSlider();
            return;
        }
        console.log("Absen clicked");
        if (container_absen) {
            container_absen.style.display = 'none';
            resetSlider();
        }
        update_element();
    } catch (err) {
        console.error(err);
        resetSlider();
    }
}