import { decryptData } from './aes';
import { db } from './dbModule'
import { currentCoords } from './gpsModule';
import { encodePolyline } from './polyline';
import { hasInternet } from './loginModule';

export async function getRoute(isUpdate = false) {

    const status = isUpdate ? 'update' : 'normal';
    const dataset = isUpdate
        ? await db.travel_sessions.toArray()
        : await db.ocr_results.toArray();

    if (!dataset || dataset.length === 0) {
        console.warn("Data destinasi tidak ditemukan!");
        return null;
    }

    const item = dataset[0];
    let latTujuan, lngTujuan;

    if (isUpdate) {
        latTujuan = parseFloat(decryptData(item.lattujuan));
        lngTujuan = parseFloat(decryptData(item.langtujuan));
    } else {
        latTujuan = parseFloat(item.data.estimated_lat);
        lngTujuan = parseFloat(item.data.estimated_lng);
    }

    const latAwal = currentCoords.latitude.toFixed(3);
    const lngAwal = currentCoords.longitude.toFixed(3);
    const cacheKey = `${latTujuan},${lngTujuan},${latAwal},${lngAwal}`;

    console.log("cacheKey", cacheKey);
    const cached = await db.directions.get(cacheKey);
    if (cached) {
        console.log("[CACHE] Menggunakan rute dari cache");

        await db.rute.put({
            id: 'rute',
            key: '0',
            data: cached.data
        });

        return cached.data;
    }

    // FIX: Format konsisten [lng, lat] sesuai standar ORS/GeoJSON
    const coordA = [currentCoords.longitude, currentCoords.latitude];
    const coordB = [lngTujuan, latTujuan];

    const onLine = await hasInternet();
    if (!onLine) {
        console.error("Tidak ada koneksi internet! untuk ORS");
        alert("Tidak ada koneksi internet! untuk ORS");
        return null;
    }

    const rute = await getORSDirections(coordA, coordB, status);

    if (rute) {
        await db.directions.put({
            cacheKey,
            timestamp: new Date().toISOString(),
            data: rute
        });
        cleanupOldCache().catch(console.error);
    }

    const savedRoutes = await db.directions.get(cacheKey);
    return savedRoutes?.data || null;
}

async function cleanupOldCache() {
    const semingguLalu = new Date();
    semingguLalu.setDate(semingguLalu.getDate() - 7);
    await db.directions.where('timestamp').below(semingguLalu.toISOString()).delete();
}

// FIX: coordA dan coordB sudah dalam format [lng, lat] — tidak perlu rapihkanKoordinat lagi
async function getORSDirections(coordA, coordB, status) {
    try {
        const apiKey = import.meta.env.VITE_ORS_API_KEY;
        if (!apiKey) throw new Error("API Key tidak ditemukan.");

        const url = `https://api.openrouteservice.org/v2/directions/driving-car/geojson`;

        let bodyPayload = null;

        if (status === 'normal') {
            const bodyPayload = {
                coordinates: [coordA, coordB],
                language: "id",
                alternative_routes: {
                    target_count: 3,
                    share_factor: 0.5,
                    weight_factor: 2
                }
            };
        } else {
            bodyPayload = {
                coordinates: [coordA, coordB],
                language: "id"
            };
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json, application/geo+json; charset=utf-8',
                'Content-Type': 'application/json',
                'Authorization': apiKey
            },
            body: JSON.stringify(bodyPayload)
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`ORS Error ${response.status}: ${errBody}`);
        }

        const data = await response.json();

        if (!data.features || data.features.length === 0) throw new Error('Rute tidak ditemukan');

        const allRoutes = data.features.map((route, index) => {
            const decodedCoordinates = route.geometry.coordinates.map(
                coord => [coord[1], coord[0]] // balik ke [lat, lng] untuk Leaflet/display
            );

            const summary = route.properties.summary;
            const segments = route.properties.segments;

            const legsDetail = segments.map(segment => ({
                namaJalanUtama:
                    route.properties.routes
                        ? route.properties.routes[0].summary
                        : "Jalan Utama",
                jarakMeter: segment.distance,
                durasiDetik: segment.duration,
                steps: segment.steps
            }));

            return {
                tipeRute: index === 0 ? "UTAMA" : `ALTERNATIF_${index}`,
                jarakKM: (summary.distance / 1000).toFixed(2),
                durasiMenit: Math.round(summary.duration / 60),
                polylineCoordinates: encodePolyline(decodedCoordinates),
                detailLegs: legsDetail
            };
        });

        await db.rute.put({
            id: 'rute',
            key: '0',
            data: allRoutes
        });

        return allRoutes;
    } catch (error) {
        console.error('[ORS FETCH ERROR]:', error.message);
        return null;
    }
}