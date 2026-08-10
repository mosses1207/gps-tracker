//ini
import { checkSessionGate, showLoading, hideLoading, handleManualLogin } from './auth';
import { initForm, ambildataCabang } from './submit';
import './style.css';
import { querySupabaseActive, querySupabaseAbsen } from './querysupabase';
import { hasInternet } from './hasonline';
import { openRealtimeChannel } from './realtime';
import { manageData } from './helper';
import { db } from './db';
import { refreshTableActive, updateMarker, removeMarker, createmarker } from './active';
import { refreshTableAbsen } from './absen';
import { refreshTableInstruksi } from './instruksi';

import { initializeActiveModule } from './active';
import { initializeAbsenModule } from './absen';
import { initializeInstruksiModule } from './instruksi';
import { initSettingsUI } from './settings';
import { initializeNotificationsModule } from './notifications';
import { initBridgeSync, initBridgeSetupModalUI } from './bridgeSync';

// 1. Pastikan seluruh kode browser hanya berjalan di sisi Client
if (typeof window !== 'undefined') {

    // Registrasi Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js?v=24')
                .then(reg => {
                    reg.onupdatefound = () => {
                        const installingWorker = reg.installing;
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                location.reload();
                            }
                        };
                    };
                })
                .catch(err => console.error("SW Error:", err));
        });
    }

    // 2. Bungkus top-level await dan inisialisasi DOM ke dalam satu fungsi async
    const jalankanAplikasi = async () => {
        // Pindahkan top-level await ke sini agar aman dari error bundler Node.js
        await initializeActiveModule();
        await initializeAbsenModule();
        await initializeInstruksiModule();
        initializeNotificationsModule();

        checkSessionGate();
        showLoading('Memuat...');
        await re_initEventListeners();
        hideLoading();
        showLoading('Memuat form...');
        initForm();
        hideLoading();
        showLoading('Memuat cabang...');
        await ambildataCabang();
        hideLoading();
        initBridgeSync();
    };

    // Jalankan inisialisasi aplikasi saat DOM siap
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', jalankanAplikasi);
    } else {
        jalankanAplikasi();
    }

    // Event Listener Online
    window.addEventListener('online', async () => {
        const isActuallyOnline = await hasInternet();
        if (isActuallyOnline) {
            const status = document.getElementById('offline-status');
            if (status) {
                status.textContent = 'Online';
                status.style.color = 'green';
            }
            querySupabaseActive();
            querySupabaseAbsen();
            openRealtimeChannel();
        }
    });

    // Event Listener Offline
    window.addEventListener('offline', () => {
        const status = document.getElementById('offline-status');
        if (status) {
            status.textContent = 'Offline';
            status.style.color = 'red';
        }
    });

    // Window global function untuk Tab Content
    window.openContent = function (evt, contentId) {
        const contents = document.querySelectorAll('.tab-content');
        const buttons = document.querySelectorAll('.tab-btn');
        contents.forEach(c => c.classList.remove('active'));
        buttons.forEach(b => b.classList.remove('active'));
        
        const targetContent = document.getElementById(contentId);
        if (targetContent) targetContent.classList.add('active');
        if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');
    };
}

// Fungsi helper untuk event listener
function re_initEventListeners() {
    if (typeof document === 'undefined') return;

    const btn = document.getElementById('confirmPin');
    if (btn) btn.onclick = () => handlepin(); // Pastikan handlepin tersedia/di-import

    initSettingsUI();
    initBridgeSetupModalUI();
    initSidebarToggle();

    
    const recenterBtn = document.getElementById('recenterBtn');
    if (recenterBtn) {
        recenterBtn.onclick = async () => {
            window.autofokus = true;
            window.lastUserInteraction = 0;
            await recenterMap(); // Pastikan recenterMap tersedia/di-import
            window.lastrecenter = Date.now();
        };
    }

    const btnCloseForm = document.getElementById('btn-close-form');
    if (btnCloseForm) {
        btnCloseForm.addEventListener('click', () => {
            document.querySelector('.bodyform')?.classList.remove('show');
        });
    }

    document.querySelectorAll('.tab-btn[data-content]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', (evt) => {
            window.openContent(evt, tabBtn.dataset.content);
        });
    });

    const eyeBtn = document.getElementById('eyebuton');
    if (eyeBtn) {
        eyeBtn.addEventListener('click', () => window.togglePassword());
    }

    const reloadBtn = document.getElementById('btn-reload-offline');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => window.location.reload());
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (evt) => {
            evt.preventDefault();
            handleManualLogin();
        });
    }
}

// Toggle sidebar: mode normal (lebar penuh) <-> mode rail tipis (map full)
function initSidebarToggle() {
    if (typeof document === 'undefined') return;

    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const container = document.querySelector('.container');
    if (!sidebar || !toggleBtn) return;

    const applyState = (collapsed) => {
        sidebar.classList.toggle('collapsed', collapsed);
        if (container) container.classList.toggle('sidebar-collapsed', collapsed);
        toggleBtn.title = collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar';
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };

    let collapsed = localStorage.getItem('sidebarCollapsed') === '1';
    applyState(collapsed);

    toggleBtn.addEventListener('click', () => {
        collapsed = !collapsed;
        applyState(collapsed);
        localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
    });

    document.querySelectorAll('.tab-btn[data-content]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            if (sidebar.classList.contains('collapsed')) {
                collapsed = false;
                applyState(false);
                localStorage.setItem('sidebarCollapsed', '0');
            }
        });
    });


    const notifBtn = document.getElementById('notifBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            if (sidebar.classList.contains('collapsed')) {
                collapsed = false;
                applyState(false);
                localStorage.setItem('sidebarCollapsed', '0');
            }
        });
    }
}