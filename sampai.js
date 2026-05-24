import { bersihkanRutePeta } from "./map"
import { encryptData } from "./aes"
import { supabase, showLoading, hideLoading, hasInternet } from "./loginModule"
import { db } from "./dbModule"
import { encodePolyline } from "./polyline"
import { currentCoords } from "./gpsModule"

export async function handleDriverSampai() {
    showLoading("Memproses data...");
    try {
        const online = await hasInternet();
        if (!online) {
            return;
        }
        const rawdata = await db.travel_sessions.toArray();
        const idseason = rawdata[0].idseason;
        console.log("idseason", idseason);
        const pathHist = rawdata[0].path_hist;
        const pathPolyline = encodePolyline(pathHist.map(item => item[0]));
        const pathSpeed = pathHist.map(item => item[1]);
        const pathTime = pathHist.map(item => item[2]);
        const path = [pathPolyline, pathSpeed, pathTime];

        const { error: supabaseError } = await supabase
            .from('path_history')
            .update({
                idseason: idseason,
                lat: encryptData(currentCoords.latitude),
                lng: encryptData(currentCoords.longitude),
                path_hist: encryptData(path),
                updated_at: encryptData(Date.now()),
                status: 'arrival'
            })
            .eq('idseason', idseason);
        if (supabaseError) {
            console.error('Error simpan ke Supabase:', supabaseError.message);
            return;
        }
        resetui();
        location.reload();
    } catch (error) {
        console.error("Sampai Error:", error);
        hideLoading();
    } finally {
        hideLoading();
    }
}

async function resetui() {
    const containerpeta = document.getElementById("map_container");
    const trackBerangkat = document.getElementById("trackBerangkat");
    const trackSampai = document.getElementById("trackSampai");
    const btnrute = document.getElementById("container-tombol-rute");
    const btnBtnMulaiperjalanan = document.getElementById("btnmulaiperjalanan");
    const textsjkb = document.getElementById("no_sjkb");
    const texttujuandealer = document.getElementById("tujuan_dealer");
    const textdurasiperjalanan = document.getElementById("lt_input");
    bersihkanRutePeta();
    if (trackBerangkat) {
        trackBerangkat.style.display = "flex";
    }
    if (trackSampai) {
        trackSampai.style.display = "none";
    }
    if (btnrute) {
        btnrute.style.display = "none";
    }
    if (containerpeta) {
        containerpeta.style.display = "none";
    }
    if (btnBtnMulaiperjalanan) {
        btnBtnMulaiperjalanan.style.display = "none";
    }
    if (textsjkb) {
        textsjkb.textContent = "";
    }
    if (texttujuandealer) {
        texttujuandealer.textContent = "";
    }
    if (textdurasiperjalanan) {
        textdurasiperjalanan.textContent = "";
    }
    window.appState.travelSession = false;
    await db.travel_sessions.clear();
    await db.ocr_results.clear();
    await db.rute.clear();
}