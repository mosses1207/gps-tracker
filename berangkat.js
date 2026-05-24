import { encryptData } from "./aes";
import { encodePolyline } from "./polyline";
import { currentCoords } from "./gpsModule";
import { db } from "./dbModule";
import { supabase, showOfflineScreen } from "./loginModule";
import { getSelectedRoute, drawruteistravel, gambarRuteKePeta } from './map';
import { getRoute } from './osrmService';

let isproses = false;

export async function handleDriverBerangkat() {
    if (isproses) return;
    isproses = true;

    const resetState = async () => {
        await getRoute(false);
        gambarRuteKePeta();
    };

    try {
        const ruteAktif = getSelectedRoute();
        if (!ruteAktif) {
            alert("Tidak ada rute yang dipilih, atau sedang memuat data...");
            await resetState();
            return;
        }
        console.log("Rute Aktif:", ruteAktif.coordinates);
        const rute = await drawruteistravel(ruteAktif.coordinates);
        if (!rute) {  // ← fix: tanda seru
            console.error("Gagal menggambar rute!");
            await resetState();
            return;
        }

        const rawsession = localStorage.getItem("user_session");
        if (!rawsession) {
            console.error("Session tidak ditemukan");
            await resetState();
            return;
        }

        const session = JSON.parse(rawsession);
        const ocr_results = await db.ocr_results.toArray();
        const Rawdatatravel = ocr_results[0]?.data;
        if (!Rawdatatravel) {
            alert("Data OCR belum tersedia!");
            await resetState();
            return;
        }

        console.log(Rawdatatravel);

        const emailSesi = session.email;
        const idseason = await generateUniqueId(emailSesi);
        const uid = session.uid;
        const { no_sjkb, leadtime, tujuan, estimated_lat, estimated_lng, pengemudi, vendor, moda, no_pol } = Rawdatatravel;
        const routemaster = await encodePolyline(ruteAktif.coordinates);
        const lat = currentCoords?.latitude || 0;
        const lang = currentCoords?.longitude || 0;
        const depart = new Date().getTime();
        const leadtimeMin = Number(leadtime) || 60;
        const targetsampai = depart + (leadtimeMin * 60 * 1000);

        const datatravel = {
            idseason,
            uid,
            sjkb: no_sjkb,
            leadtime,
            tujuan,
            lat,
            lang,
            lattujuan: estimated_lat,
            langtujuan: estimated_lng,
            driver: pengemudi,
            vendor,
            moda,
            nopol: no_pol,
            depart,
            targetsampai,
            routemaster,
            Status: "Active"
        };

        console.log("Data siap disimpan:", datatravel);

        const suksesUpdateAbsen = await updateabsen();
        if (!suksesUpdateAbsen) {
            await resetState();
            return;
        }

        const suksesSupabase = await simpansupabase(datatravel);
        if (!suksesSupabase) {
            await resetState();
            return;
        }

        const suksesDexie = await simpandexie(datatravel);
        if (!suksesDexie) {
            await resetState();
            return;
        }

        updateUIperjalanan();
        window.appState.travelSession = true;

    } catch (error) {
        console.error("Error saat berangkat:", error);
        await resetState();
    } finally {
        isproses = false;
    }
}

async function updateabsen() {
    try {
        const rawsession = localStorage.getItem("user_session");
        if (!rawsession) {
            console.error("Tidak ada session yang tersedia");
            return false;
        }
        const session = JSON.parse(rawsession);
        const uid = session.uid;
        const { error: supabaseError } = await supabase
            .from('absen')
            .update({
                uid: uid,
                status: 'Travel',
            })
            .eq('uid', uid);
        if (supabaseError) {
            console.error("Error update absen:", supabaseError);
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error update absen:", error);
        showOfflineScreen("Sesi login tidak di temukan");
        return false;
    }
}

async function simpansupabase(datatravel) {
    try {
        const { error: supabaseError } = await supabase
            .from('path_history')
            .insert([{
                idseason: datatravel.idseason,
                user_id: datatravel.uid,
                sjkb: encryptData(datatravel.sjkb),
                leadtime: encryptData(datatravel.leadtime),
                dest: encryptData(datatravel.tujuan),
                lat_start: encryptData(datatravel.lat), // lat awal
                lng_start: encryptData(datatravel.lang), // lang awal
                lat: encryptData(datatravel.lat), // lat yang akan di update oleh modul travelActive
                lng: encryptData(datatravel.lang), // Lng yang akan di update oleh modul travelActive
                lattujuan: encryptData(datatravel.lattujuan),
                langtujuan: encryptData(datatravel.langtujuan),
                driver: encryptData(datatravel.driver),
                vendor: encryptData(datatravel.vendor),
                moda: encryptData(datatravel.moda),
                nopol: encryptData(datatravel.nopol),
                depart_at: encryptData(datatravel.depart),
                arrive_target: encryptData(datatravel.targetsampai),
                updated_at: encryptData(datatravel.depart),
                path_hist: null, // di isi oleh module travelActive
                route_master: encryptData(datatravel.routemaster),
                status: datatravel.Status
            }]);
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
        if (supabaseError) {
            console.error('Error simpan ke Supabase:', supabaseError.message);
            return false; //Gagal
        } else {
            return true; // Berhasil
        }
    } catch (error) {
        console.error("Error simpan Supabase:", error);
        return false; // Gagal
    }
}

async function simpandexie(datatravel) {
    try {
        await db.travel_sessions.clear();
        await db.travel_sessions.put({
            idseason: datatravel.idseason,
            user_id: datatravel.uid,
            sjkb: encryptData(datatravel.sjkb),
            leadtime: encryptData(datatravel.leadtime),
            dest: encryptData(datatravel.tujuan),
            lat_start: encryptData(datatravel.lat),
            lng_start: encryptData(datatravel.lang),
            lat: encryptData(datatravel.lat),
            lng: encryptData(datatravel.lang),
            lattujuan: encryptData(datatravel.lattujuan),
            langtujuan: encryptData(datatravel.langtujuan),
            driver: encryptData(datatravel.driver),
            vendor: encryptData(datatravel.vendor),
            moda: encryptData(datatravel.moda),
            nopol: encryptData(datatravel.nopol),
            depart_at: encryptData(datatravel.depart),
            arrive_target: encryptData(datatravel.targetsampai),
            updated_at: encryptData(datatravel.depart),
            path_hist: null,
            route_master: encryptData(datatravel.routemaster),
            status: datatravel.Status
        });
        await db.ocr_results.clear();
        return true;
    } catch (error) {
        console.error("Error simpan Dexie:", error);
        return false;
    }
}

export function updateUIperjalanan() {
    const closeMapBtn = document.getElementById("close_map_btn");
    const trackBerangkat = document.getElementById("trackBerangkat");
    const trackSampai = document.getElementById("trackSampai");
    const tombolrute = document.getElementById("container-tombol-rute");
    if (trackBerangkat) {
        trackBerangkat.style.display = "none";
    }
    if (trackSampai) {
        trackSampai.style.display = "flex";
    }
    if (closeMapBtn) closeMapBtn.style.display = "none";
    if (tombolrute) tombolrute.style.display = "none";
}


async function generateUniqueId(emailSesi) {
    if (!emailSesi) {
        console.warn("generateUniqueId: Email kosong, menggunakan fallback timestamp.");
        return `ID-GUEST-${Date.now()}`;
    }
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + "-" +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
    const cleanEmail = emailSesi.replace(/[@.]/g, '_');
    return `ID-${cleanEmail}-${timestamp}`;
}



