import { dlog } from './debug';

const STORAGE_KEY = 'bridge_url';
export const BRIDGE_DEFAULT_PORT = 8877;
const FETCH_TIMEOUT_MS = 4000;

function normalizeUrl(raw) {
    if (!raw) return '';
    let url = raw.trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
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
