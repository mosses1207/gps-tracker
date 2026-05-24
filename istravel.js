import { currentCoords, updateStreetName } from "./gpsModule";
import { getRoute } from "./osrmService";
import { drawruteistravel } from "./map";
import { db } from "./dbModule";
import { encryptData, decryptData } from "./aes";
import { supabase } from "./loginModule";
import { handleDriverSampai } from "./sampai";
import { hasInternet } from "./loginModule";
import { decodePolyline } from "./polyline";

let maxdistancefrommarker = 5;
let count = 0;
const THRESHOLD_METERS = 12;
let lastHeading = 0;
let lastLat = null;
let lastLng = null;
const REROUTE_COUNT = 3;
const REROUTE_DISTANCE = 100;
let laslat = null;
let laslng = null;
let lastUpdate = null;
let procesing = false;
let alert150 = false;
let alert50 = false;
let lastInstruction = null;


window.addEventListener('gps-updated', async ({ detail }) => {


    if (!window.appState.travelSession) {
        return;
    }
    if (procesing) {
        return;
    }
    try {
        procesing = true;
        const rawlegs = await db.rute.get('rute');
        const legsencrypt = rawlegs.data[rawlegs.key];
        const legs = {
            polyline: decodePolyline(legsencrypt.polylineCoordinates),
            jarak: legsencrypt.jarakKM,
            durasiMenit: legsencrypt.durasiMenit,
            detailLegs: legsencrypt.detailLegs
        };
        const pointlegs = prepareRouteSteps(legs);
        const pathSteps = pointlegs.map(item => item[0]);
        const indexsteps = snapLegs(pathSteps, currentCoords.latitude, currentCoords.longitude);
        const instruksiSteps = pointlegs.map(item => item[1]);
        const lokasiSteps = pointlegs.map(item => item[2]);
        const online = await hasInternet();
        const currentInstruction = instruksiSteps[indexsteps];
        const now = Date.now();
        if (
            online &&
            window.responsiveVoice &&
            currentInstruction &&
            currentInstruction !== lastInstruction &&
            (now - lastSpeakTime) > 5000
        ) {
            lastInstruction = currentInstruction;
            lastSpeakTime = now;
            window.responsiveVoice.cancel();
            window.responsiveVoice.speak(
                currentInstruction,
                "Indonesian Female",
                {
                    rate: 0.9,
                    pitch: 1,
                    volume: 1
                }
            );
        }
        const streetElement = document.getElementById('street-name');
        const textlength = lokasiSteps[indexsteps].length;
        let text = null;
        if (textlength < 4) {
            updateStreetName(currentCoords.latitude, currentCoords.longitude);
        } else {
            text = lokasiSteps[indexsteps];
        }
        if (streetElement && text) {
            streetElement.textContent = text;
        }
        const path = updatePolylinePath(window.appState.activeRouteCoords, currentCoords);
        if (!path || path.length === 0) {
            procesing = false;
            return;
        }
        const snapped = snapToPolyline(path, currentCoords.latitude, currentCoords.longitude);
        const hitungjarak = hitungJarakMeter(snapped.lat, snapped.lng, currentCoords.latitude, currentCoords.longitude);
        if (hitungjarak > maxdistancefrommarker) {
            count++;
            console.log("count lebih dari maxdistancefrommarker:", count);
            if (hitungjarak > REROUTE_DISTANCE || count >= REROUTE_COUNT) {
                console.log("reroute");
                const rute = await getRoute(true);
                await drawruteistravel(rute);
                count = 0;
                procesing = false;
                return;
            } else {
                const pathplus = [[currentCoords.latitude, currentCoords.longitude], ...path];
                const pathplusplus = bikinRapet(pathplus, 5);
                window.appState.activeRouteCoords = pathplusplus;
            }
        } else {
            count = 0;
            const pathplus = [[currentCoords.latitude, currentCoords.longitude], ...path];
            window.appState.activeRouteCoords = pathplus;
        }

        if (window.appState.activePolyline) {
            window.appState.activePolyline.setLatLngs(window.appState.activeRouteCoords);
        }
        updateVehicle(snapped.lat, snapped.lng);
        await updateTravelSession(currentCoords);
        await endtravelsession(currentCoords);
        procesing = false;
    } catch (error) {
        console.error("Error in istravel.js:", error);
        procesing = false;
    }
});

function snapLegs(routeCoords, gpsLat, gpsLng) {
    let minDist = Infinity;
    let nearestIndex = -1;
    for (let i = 0; i < routeCoords.length - 1; i++) {
        const p1 = routeCoords[i];
        const p2 = routeCoords[i + 1];
        const snapped = closestPointOnSegment(
            p1,
            p2,
            gpsLat,
            gpsLng
        );
        const d = hitungJarakMeter(
            snapped.lat,
            snapped.lng,
            gpsLat,
            gpsLng
        );
        if (d < minDist) {
            minDist = d;
            nearestIndex = i;
        }
    }
    const MAX_SNAP_DISTANCE = 30;
    if (minDist > MAX_SNAP_DISTANCE) {
        return -1;
    }
    return nearestIndex;
}

function prepareRouteSteps(routeData) {
    const polyline = routeData.polyline;
    const steps = routeData.detailLegs[0].steps;
    const routeWithInstructions = polyline.map((coord, index) => {
        const activeStep = steps.find(step =>
            index >= step.way_points[0] && index <= step.way_points[1]
        );

        return [
            [coord[0], coord[1]],
            activeStep ? activeStep.instruction : "Lanjut terus",
            activeStep ? activeStep.name : "-"
        ];
    });
    return routeWithInstructions;
}

async function updateTravelSession(currentCoords) {
    console.log("updateTravelSession dexie dan supabase");
    const rawsessions = await db.travel_sessions.toArray();
    const timestamp = Date.now();
    try {
        if (!rawsessions.length) return;
        const sesions = rawsessions[0].idseason;
        if (laslat === null || laslng === null) {
            await db.travel_sessions.update(sesions, {
                lat: currentCoords.latitude,
                lng: currentCoords.longitude,
                path_hist: [
                    [
                        [currentCoords.latitude, currentCoords.longitude],
                        currentCoords.speed,
                        timestamp
                    ]
                ]
            });
            console.log("updateTravelSession dexie");
            laslat = currentCoords.latitude;
            laslng = currentCoords.longitude;
        }
        const jarak = hitungJarakMeter(
            laslat,
            laslng,
            currentCoords.latitude,
            currentCoords.longitude
        );
        if (jarak > 10) {
            await db.travel_sessions.update(sesions, {
                lat: currentCoords.latitude,
                lng: currentCoords.longitude,
                path_hist: [
                    ...rawsessions[0].path_hist,
                    [
                        [currentCoords.latitude, currentCoords.longitude],
                        currentCoords.speed,
                        timestamp
                    ]
                ]
            });
            laslat = currentCoords.latitude;
            laslng = currentCoords.longitude;
            console.log("updateTravelSession dexie");
        } else {
            console.log("Tidak update ke dexie, Lokasi sama");
        }

        const online = await hasInternet();
        if (!online) {
            console.log("Tidak ada internet, skip update ke supabase");
        } else {
            const now = Date.now();
            if (lastUpdate === null || (now - lastUpdate) > 300000) {
                const { error: supabaseError } = await supabase
                    .from('path_history')
                    .update({
                        idseason: sesions,
                        lat: encryptData(currentCoords.latitude),
                        lng: encryptData(currentCoords.longitude),
                        updated_at: encryptData(now)
                    })
                    .eq('idseason', sesions);
                lastUpdate = now;
                console.log("updateTravelSession supabase");
                if (supabaseError) {
                    console.error('Error simpan ke Supabase:', supabaseError.message);
                }
            } else {
                console.log("Tidak update ke supabase, belum waktunya");
            }
        }
    } catch (error) {
        console.error("Error updating travel session:", error);
    }
}

function snapToPolyline(routeCoords, gpsLat, gpsLng) {
    let minDist = Infinity;
    let snappedLat = gpsLat;
    let snappedLng = gpsLng;
    for (let i = 0; i < routeCoords.length - 1; i++) {
        const p1 = routeCoords[i];
        const p2 = routeCoords[i + 1];
        const snapped = closestPointOnSegment(
            p1,
            p2,
            gpsLat,
            gpsLng
        );

        const d = hitungJarakMeter(
            snapped.lat,
            snapped.lng,
            gpsLat,
            gpsLng
        );
        if (d < minDist) {
            minDist = d;
            snappedLat = snapped.lat;
            snappedLng = snapped.lng;
        }
    }
    const MAX_SNAP_DISTANCE = 30;
    if (minDist > MAX_SNAP_DISTANCE) {
        return {
            lat: gpsLat,
            lng: gpsLng
        };
    }
    return {
        lat: snappedLat,
        lng: snappedLng
    };
}

function closestPointOnSegment(p1, p2, lat, lng) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { lat: p1[0], lng: p1[1] };
    let t = ((lat - p1[0]) * dx + (lng - p1[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return {
        lat: p1[0] + t * dx,
        lng: p1[1] + t * dy
    };
}


function updatePolylinePath(activeRouteCoords, currentCoords) {
    let nearestIndex = -1;
    let minDistance = Infinity;
    const limit = Math.min(activeRouteCoords.length, 100);

    for (let i = 0; i < limit; i++) {
        const lat = activeRouteCoords[i][0];
        const lng = activeRouteCoords[i][1];
        const dist = hitungJarakMeter(lat, lng, currentCoords.latitude, currentCoords.longitude);
        if (dist < minDistance) {
            minDistance = dist;
            nearestIndex = i;
        }
    }

    if (nearestIndex !== -1 && minDistance <= THRESHOLD_METERS) {
        const sliced = activeRouteCoords.slice(nearestIndex + 1);
        return sliced.length > 0 ? sliced : activeRouteCoords;
    }

    return activeRouteCoords;
}

function updateVehicle(latitude, longitude) {
    if (lastLat !== null && lastLng !== null) {
        const heading = getBearing(lastLat, lastLng, latitude, longitude);
        const smoothHeading = smoothRotation(heading);
        if (window.appState.myMarker) {
            window.appState.myMarker.setRotationAngle(smoothHeading);
        }
    }
    if (window.appState.myMarker) {
        window.appState.myMarker.setLatLng([latitude, longitude]);
    }
    lastLat = latitude;
    lastLng = longitude;

    if (window.appState.myMap) {
        const map = window.appState.myMap;
        const markerPoint = map.latLngToContainerPoint([latitude, longitude]);
        const mapSize = map.getSize();
        const MARGIN_PERCENT = 0.1; // 10% dari tepi

        const marginX = mapSize.x * MARGIN_PERCENT;
        const marginY = mapSize.y * MARGIN_PERCENT;

        const nearEdge =
            markerPoint.x < marginX ||
            markerPoint.x > mapSize.x - marginX ||
            markerPoint.y < marginY ||
            markerPoint.y > mapSize.y - marginY;

        if (nearEdge) {
            map.panTo([latitude, longitude], { animate: true, duration: 0.5 });
        }
    }
}

function smoothRotation(newHeading) {
    let delta = newHeading - lastHeading;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lastHeading += delta;
    lastHeading = (lastHeading + 360) % 360;
    return lastHeading;
}

function getBearing(lat1, lng1, lat2, lng2) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;
    const dLng = toRad(lng2 - lng1);
    lat1 = toRad(lat1);
    lat2 = toRad(lat2);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    let bearing = toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
}

function hitungJarakMeter(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function bikinRapet(coords, targetDist = 5) {
    if (!coords || coords.length === 0) return [];

    const rapetCoords = [];

    for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        rapetCoords.push(p1);
        const d = hitungJarakMeter(p1[0], p1[1], p2[0], p2[1]);
        if (d > targetDist) {
            const numPoints = Math.floor(d / targetDist);
            for (let j = 1; j <= numPoints; j++) {
                const ratio = j / (numPoints + 1);
                const newLat = p1[0] + (p2[0] - p1[0]) * ratio;
                const newLng = p1[1] + (p2[1] - p1[1]) * ratio;
                rapetCoords.push([newLat, newLng]);
            }
        }
    }

    rapetCoords.push(coords[coords.length - 1]);
    return rapetCoords;
}


async function endtravelsession(coords) {
    const rawdata = await db.travel_sessions.toArray();
    const lattujuan = decryptData(rawdata[0].lattujuan);
    const lngtujuan = decryptData(rawdata[0].langtujuan);
    const lat = coords.latitude;
    const lng = coords.longitude;
    const jarak = hitungJarakMeter(
        lat,
        lng,
        lattujuan,
        lngtujuan
    );
    if (jarak <= 50) {
        if (!alert50) {
            alert50 = true;
            alert('Anda Sudah Sampai');
            handleDriverSampai();
        }
    } else if (jarak > 100 && jarak <= 150) {
        if (!alert150) {
            alert150 = true;
            alert('lokasi tujuan sudah terdeteksi');
        }
    } else {
        alert150 = false;
        alert50 = false;
    }
}