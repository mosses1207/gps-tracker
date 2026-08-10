// bridge.js
// Klien buat "bridge" HTTP lokal yang diserve aplikasi desktop Python
// (Helper Push Data). Konsepnya: form PWA cuma butuh SEKALI input nomer
// rangka -> tanya bridge -> bridge balikin idx + semua data serombongan
// (idx sama) -> form keisi otomatis (frame_number, type, model, alamat).
//
// Endpoint yang dipakai (lihat services/bridge_service.py di app Python):
//   GET /api/frame/<frame_number>  -> { found, idx, group: [...] }
//
// Nomer SJKB & Tujuan sengaja TIDAK pernah jadi trigger ke bridge ini,
// karena dua field itu memang tidak ada di data python (data python cuma
// tahu frame_number/type/model/alamat/ekspedisi/driver per idx).

import { dlog } from './debug';

const STORAGE_KEY = 'bridge_url';
export const BRIDGE_DEFAULT_PORT = 8877;
const FETCH_TIMEOUT_MS = 4000;

function normalizeUrl(raw) {
    if (!raw) return '';
    let url = raw.trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
        url = `http://${url}`;
    }
    return url.replace(/\/+$/, ''); // buang trailing slash
}

export function getBridgeUrl() {
    try {
        return localStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
        return '';
    }
}

export function setBridgeUrl(raw) {
    const url = normalizeUrl(raw);
    try {
        if (url) {
            localStorage.setItem(STORAGE_KEY, url);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    } catch (e) {
        // storage penuh/disabled -> tetap jalan, cuma gak persist antar sesi
    }
    return url;
}

/**
 * Tanya bridge lokal: 1 frame_number -> semua data serombongan (idx sama).
 *
 * Return salah satu bentuk berikut:
 *   { ok: false, reason: 'not-configured' }  -> alamat bridge belum diisi di Pengaturan
 *   { ok: false, reason: 'offline' }         -> gagal konek (timeout/network/CORS)
 *   { ok: false, reason: 'error' }           -> bridge jawab tapi responsnya gak valid
 *   { ok: true, found: false }               -> bridge hidup, frame_number gak ketemu
 *   { ok: true, found: true, idx, group }    -> ketemu, group = array data 1 idx
 */
export async function lookupFrame(frameNumber) {
    const base = getBridgeUrl();
    if (!base) {
        return { ok: false, reason: 'not-configured' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(`${base}/api/frame/${encodeURIComponent(frameNumber)}`, {
            method: 'GET',
            signal: controller.signal,
        });

        if (res.status === 404) {
            return { ok: true, found: false };
        }

        const data = await res.json().catch(() => null);

        if (!res.ok || !data) {
            return { ok: false, reason: 'error' };
        }

        return {
            ok: true,
            found: Boolean(data.found),
            idx: data.idx,
            group: Array.isArray(data.group) ? data.group : [],
        };
    } catch (e) {
        dlog('[BRIDGE] Gagal konek bridge lokal:', e);
        return { ok: false, reason: 'offline' };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Cek /health ke bridge (dipakai buat validasi pas admin nyimpen alamat
 * bridge baru di Pengaturan, bukan buat alur isi form).
 */
export async function checkBridgeHealth(rawUrl) {
    const base = normalizeUrl(rawUrl);
    if (!base) return { ok: false, reason: 'not-configured' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(`${base}/health`, { signal: controller.signal });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) return { ok: false, reason: 'error' };
        return { ok: true, data };
    } catch (e) {
        return { ok: false, reason: 'offline' };
    } finally {
        clearTimeout(timer);
    }
}
