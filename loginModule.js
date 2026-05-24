import { createClient } from '@supabase/supabase-js';
import { checkTravelActive } from './travelactive';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SATU_BULAN = 30 * 24 * 60 * 60 * 1000;
const MAX_RETRY = 3;

let retryCount = 0;
let retryTimeout = null;

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

function saveLocalSession(user) {
    const metadata = user.user_metadata || {};
    const userData = {
        email: user.email,
        uid: user.id,
        name: metadata.full_name || user.email.split('@')[0],
        photo: metadata.avatar_url || metadata.picture || "",
        lastLogin: new Date().toISOString()
    };
    localStorage.setItem('user_session', JSON.stringify(userData));
}

function clearRetryTimeout() {
    if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
    }
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
    const localData = JSON.parse(localStorage.getItem('user_session'));
    const hasSession = localData?.lastLogin;
    const isSessionValid =
        hasSession &&
        (Date.now() - new Date(localData.lastLogin).getTime() < SATU_BULAN);
    const online = await hasInternet();

    if (online) {
        if (!isSessionValid) {
            await initSystem();
            return;
        }
        hideLoading();
        return;
    }
    if (isSessionValid) {
        hideLoading();
        return;
    }
    hideLoading();
    const pesan = !hasSession
        ? 'Tidak ada data login. Butuh internet untuk login.'
        : 'Sesi berakhir. Anda perlu koneksi internet untuk login ulang.';
    showOfflineScreen(pesan);
}

async function initSystem() {
    clearRetryTimeout();
    try {
        const {
            data: { session },
            error
        } = await supabase.auth.getSession();
        if (error) throw error;
        if (session) {
            localStorage.removeItem('google_sdk_retry');
            saveLocalSession(session.user);
            retryCount = 0;
            hideLoading();
            return;
        }
        handleUnauthenticated();
    } catch (error) {
        console.error('Gagal init system:', error);
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

function handleUnauthenticated() {
    localStorage.removeItem('user_session');
    const emergencyTimer = setTimeout(() => {
        const btn = document.getElementById('google-login-btn');
        if (btn && btn.innerHTML.trim() === '') {
            console.error('Google button timeout.');
            hideLoading();
            showOfflineScreen(
                '<b>Gagal Memuat Sistem Login</b><br>Layanan otentikasi ditolak atau koneksi terganggu.'
            );
        }
    }, 6000);

    if (typeof google !== 'undefined' && google.accounts) {
        renderGoogleButton(emergencyTimer);
        return;
    }
    clearTimeout(emergencyTimer);
    handleSDKLoadFailure();
}

function renderGoogleButton(emergencyTimer = null) {
    google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
            if (emergencyTimer) clearTimeout(emergencyTimer);
            await handleCredentialResponse(response);
        },
        auto_select: false,
        //use_fedcm_for_prompt: false,
    });
    const loginoverlay = document.getElementById('login-overlay');
    const googleBtnDiv = document.getElementById('google-login-btn');
    const googlearea = document.getElementById('area-google');
    if (loginoverlay) loginoverlay.style.display = 'flex';
    if (googlearea) googlearea.style.display = 'block';
    if (!googleBtnDiv) {
        console.warn('google-login-btn tidak ditemukan.');
        if (emergencyTimer) clearTimeout(emergencyTimer);
        return;
    }

    const parentWidth = googleBtnDiv.offsetWidth || 350;
    google.accounts.id.renderButton(googleBtnDiv, {
        theme: 'outline',
        size: 'large',
        width: parentWidth,
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center'
    });
    if (emergencyTimer) clearTimeout(emergencyTimer);
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
        console.log('Data dari Supabase:', data); // ← tambah ini
        console.log('Error dari Supabase:', error); // ← tambah ini
        if (error) throw error;
        saveLocalSession(data.user);
        hideLoginOverlay();
        showLoading('Memuat ulang...');
        setTimeout(() => location.reload(), 800);
    } catch (error) {
        console.error('Detail error:', error); // ← tambah ini
        console.error('Error message:', error.message);
        console.error('Error status:', error.status);
        hideLoading();
        alert('Gagal Login Google: ' + error.message);
        hideLoginOverlay();
    }
}

function handleSDKLoadFailure() {
    console.warn('Google SDK tidak ditemukan.');
    let retry = Number(localStorage.getItem('google_sdk_retry')) || 0;
    if (retry < 2) {
        retry++;
        localStorage.setItem('google_sdk_retry', retry);
        hideLoginOverlay();
        showLoading('Memuat ulang...');
        setTimeout(() => location.reload(), 800);
        return;
    }
    localStorage.removeItem('google_sdk_retry');
    hideLoginOverlay();
    showOfflineScreen('SDK Google tidak dapat dimuat. Pastikan koneksi stabil.');
    console.error('Gagal memuat Google SDK setelah beberapa percobaan.');
}

export async function handleManualLogin() {
    try {
        const emailEl = document.getElementById('login-email');
        const passwordEl = document.getElementById('login-password');
        if (!emailEl || !passwordEl) {
            throw new Error('Element login tidak ditemukan.');
        }

        const email = emailEl.value.trim();
        const password = passwordEl.value;

        if (!email || !password) {
            alert('Harap isi email dan password!');
            return;
        }

        showLoading('Memproses login...');

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        saveLocalSession(data.user);
        hideLoginOverlay();
        showLoading('Memuat ulang...');
        setTimeout(() => location.reload(), 800);
    } catch (error) {
        console.error(error);
        hideLoading();
        alert('Gagal Masuk: ' + error.message);
        showLoginOverlay();
    }
}

window.handleManualLogin = handleManualLogin;

window.togglePassword = function togglePassword() {
    const passwordInput = document.getElementById('login-password');
    const theSvg = document.getElementById('eye-icon');
    if (!passwordInput || !theSvg) {
        console.warn('Element password tidak ditemukan.');
        return;
    }
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    theSvg.innerHTML = isHidden
        ? `
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20 C5 20 1 12 1 12a21.8 21.8 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4 c7 0 11 8 11 8a21.8 21.8 0 0 1-4.06 5.94"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
    `
        : `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/>
        <circle cx="12" cy="12" r="3"/>
    `;
};

export function showOfflineScreen(message = null) {
    const el = document.getElementById('offline-screen');
    if (!el) {
        console.warn('offline-screen tidak ditemukan.');
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
        console.warn('Loading element tidak ditemukan.');
        return;
    }
    textEl.innerText = text;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        console.warn('loading-overlay tidak ditemukan.');
        return;
    }
    overlay.style.display = 'none';
    document.body.style.overflow = '';
}

export async function getSession() {
    try {
        const {
            data: { session },
            error
        } = await supabase.auth.getSession();

        if (error) {
            console.error('Get session error:', error);
            return null;
        }
        return session;
    } catch (error) {
        console.error('Get session fatal:', error);
        return null;
    }
}

window.addEventListener('beforeunload', () => {
    clearRetryTimeout();
});