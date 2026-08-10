//auth.js

import { initializeMap } from './map';
import { querySupabaseActive, querySupabaseAbsen, querySupabaseInstruksi } from './querysupabase';
import { setupRealtimeSync } from './setup-realtime';
import { openRealtimeChannel } from './realtime';
import { supabase } from './supabaseClient';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SATU_BULAN = 30 * 24 * 60 * 60 * 1000;
const MAX_RETRY = 3;

let retryCount = 0;
let retryTimeout = null;
let realtimeSyncInitialized = false; // Prevent multiple initializations

function saveLocalSession(user) {
    if (!user) return;
    const metadata = user.user_metadata || {};
    const userData = {
        email: user.email,
        uid: user.id,
        name: metadata.full_name || metadata.name || user.email?.split('@')[0] || 'User',
        photo: metadata.avatar_url || metadata.picture || '',
        lastLogin: new Date().toISOString()
    };
    localStorage.setItem('user_session', JSON.stringify(userData));
}

// Initialize real-time sync hanya sekali
function initializeRealtimeIfNeeded() {
    if (!realtimeSyncInitialized) {
        setupRealtimeSync();
        realtimeSyncInitialized = true;
    }
}

function waitForGoogleSDK(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        if (typeof google !== 'undefined' && google?.accounts?.id) {
            resolve();
            return;
        }
        const timer = setTimeout(() => {
            reject(new Error('Google SDK timeout'));
        }, timeoutMs);
        const existingScript = document.querySelector(
            'script[src*="accounts.google.com/gsi/client"]'
        );
        const onLoad = () => {
            clearTimeout(timer);
            if (typeof google !== 'undefined' && google?.accounts?.id) {
                resolve();
            } else {
                reject(new Error('Google SDK load tapi object tidak tersedia'));
            }
        };
        const onError = () => {
            clearTimeout(timer);
            reject(new Error('Google SDK gagal dimuat'));
        };
        if (existingScript) {
            existingScript.addEventListener('load', onLoad, { once: true });
            existingScript.addEventListener('error', onError, { once: true });
        } else {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.addEventListener('load', onLoad, { once: true });
            script.addEventListener('error', onError, { once: true });
            document.head.appendChild(script);
        }
    });
}

export async function hasInternet() {
    if (!navigator.onLine) return false;
    try {
        await fetch('https://www.gstatic.com/generate_204', {
            method: 'GET',
            cache: 'no-store',
            mode: 'no-cors',
            signal: AbortSignal.timeout(5000)
        });
        return true;
    } catch {
        return false;
    }
}

export async function checkSessionGate() {
    showLoading('Memeriksa sesi...');
    const localData = JSON.parse(localStorage.getItem('user_session') || 'null');
    const isSessionValid =
        localData?.lastLogin &&
        Date.now() - new Date(localData.lastLogin).getTime() < SATU_BULAN;
    const online = await hasInternet();
    if (!online) {
        if (isSessionValid) {
            initializeRealtimeIfNeeded();
            initializeMap();
            querySupabaseActive();
            querySupabaseAbsen();
            querySupabaseInstruksi();
            openRealtimeChannel();
            hideLoading();
            return;
        }
        hideLoading();
        const pesan = !localData?.lastLogin
            ? 'Tidak ada data login. Butuh internet untuk login.'
            : 'Sesi berakhir. Anda perlu koneksi internet untuk login ulang.';
        showOfflineScreen(pesan);
        return;
    }
    await initSystem();
}

async function initSystem() {
    clearRetryTimeout();
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (session?.user) {
            localStorage.removeItem('google_sdk_retry');
            saveLocalSession(session.user);
            retryCount = 0;
            
            // Initialize real-time sync (hanya dipanggil sekali)
            initializeRealtimeIfNeeded();

            initializeMap();
            querySupabaseActive();
            querySupabaseAbsen();
            querySupabaseInstruksi();
            openRealtimeChannel();
            hideLoading();
            return;
        }
        handleUnauthenticated();
    } catch (error) {
        if (retryCount < MAX_RETRY) {
            retryCount++;
            retryTimeout = setTimeout(() => initSystem(), 2000);
            return;
        }
        retryCount = 0;
        clearRetryTimeout();
        hideLoading();
        showOfflineScreen('Gagal memuat sistem. Periksa koneksi internet Anda.');
    }
}

async function handleUnauthenticated() {
    localStorage.removeItem('user_session');
    showLoginOverlay();
    try {
        await waitForGoogleSDK(8000);
        renderGoogleButton();
    } catch (err) {
        handleSDKLoadFailure();
    }
}

function renderGoogleButton() {
    const googleBtnDiv = document.getElementById('google-login-btn');
    if (!googleBtnDiv) {
        hideLoading();
        return;
    }

    google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
            await handleCredentialResponse(response);
        },
        auto_select: false,
    });

    const googlearea = document.getElementById('area-google');
    if (googlearea) googlearea.style.display = 'block';
    const parentWidth = googleBtnDiv.offsetWidth || 350;
    google.accounts.id.renderButton(googleBtnDiv, {
        theme: 'outline',
        size: 'large',
        width: parentWidth,
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center'
    });
    hideLoading();
    const passInput = document.getElementById('login-password');
    if (passInput) {
        passInput.onkeydown = (e) => {
            if (e.key === 'Enter') handleManualLogin();
        };
    }
}

async function handleCredentialResponse(response) {
    try {
        showLoading('Memproses login Google...');

        const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
        });

        if (error) throw error;
        if (!data?.user) throw new Error('User tidak ditemukan setelah login.');

        saveLocalSession(data.user);
        hideLoginOverlay();
        showLoading('Memuat ulang...');
        setTimeout(() => location.reload(), 800);
    } catch (error) {
        hideLoading();
        alert('Gagal Login Google: ' + error.message);
        location.reload();
        showLoginOverlay();
    }
}

function handleSDKLoadFailure() {
    let retry = Number(localStorage.getItem('google_sdk_retry') || '0');
    if (retry < 2) {
        retry++;
        localStorage.setItem('google_sdk_retry', String(retry));
        hideLoginOverlay();
        showLoading('Memuat ulang...');
        setTimeout(() => location.reload(), 800);
        return;
    }
    localStorage.removeItem('google_sdk_retry');
    hideLoginOverlay();
    showOfflineScreen('SDK Google tidak dapat dimuat. Pastikan koneksi stabil.');
}

export async function handleManualLogin() {
    try {
        const emailEl = document.getElementById('login-email');
        const passwordEl = document.getElementById('login-password');
        if (!emailEl || !passwordEl) throw new Error('Element login tidak ditemukan.');
        const email = emailEl.value.trim();
        const password = passwordEl.value;
        if (!email || !password) {
            alert('Harap isi email dan password!');
            return;
        }
        showLoading('Memproses login...');
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data?.user) throw new Error('User tidak ditemukan setelah login.');
        saveLocalSession(data.user);
        hideLoginOverlay();
        showLoading('Memuat ulang...');
        setTimeout(() => location.reload(), 800);
    } catch (error) {
        hideLoading();
        alert('Gagal Masuk: ' + error.message);
        showLoginOverlay();
    }
}

window.handleManualLogin = handleManualLogin;

export async function handleLogout() {
    try {
        showLoading('Logout...');
        await supabase.auth.signOut();
    } catch (error) {
        console.error('Gagal signOut dari Supabase:', error);
    } finally {
        localStorage.removeItem('user_session');
        location.reload();
    }
}

window.handleLogout = handleLogout;

window.togglePassword = function togglePassword() {
    const passwordInput = document.getElementById('login-password');
    const theSvg = document.getElementById('eye-icon');
    if (!passwordInput || !theSvg) {
        return;
    }
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    theSvg.innerHTML = isHidden
        ? `<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20 C5 20 1 12 1 12a21.8 21.8 0 0 1 5.06-5.94"/>
           <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4 c7 0 11 8 11 8a21.8 21.8 0 0 1-4.06 5.94"/>
           <line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/>
           <circle cx="12" cy="12" r="3"/>`;
};

export function showOfflineScreen(message = null) {
    const el = document.getElementById('offline-screen');
    if (!el) {
        return;
    }
    el.style.display = 'flex';
    if (message) {
        const msg = document.getElementById('offline-message');
        if (msg) msg.innerHTML = message;
    }
}

export function showLoading(text = 'Memproses...') {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');
    if (!overlay || !textEl) {
        return;
    }
    textEl.innerText = text;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        return;
    }
    overlay.style.display = 'none';
    document.body.style.overflow = '';
}

export async function getSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            return null;
        }
        return session;
    } catch (error) {
        return null;
    }
}

function hideLoginOverlay() {
    const loginoverlay = document.getElementById('login-overlay');
    if (loginoverlay) loginoverlay.style.display = 'none';
    const areagoogle = document.getElementById('area-google');
    if (areagoogle) areagoogle.style.display = 'none';
}

function showLoginOverlay() {
    const loginoverlay = document.getElementById('login-overlay');
    if (loginoverlay) loginoverlay.style.display = 'flex';
}

window.addEventListener('beforeunload', () => {
    clearRetryTimeout();
});


function clearRetryTimeout() {
    if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
    }
}

export const secret = {
    key: null
};
