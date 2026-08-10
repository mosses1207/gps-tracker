//querysupabase.js
import { supabase } from './supabaseClient';
import { showOfflineScreen } from './auth';
import { hasInternet } from './hasonline';
import { refreshTableActive, createmarker } from './active';
import { refreshTableInstruksi } from './instruksi';
import { refreshTableAbsen } from './absen';
import { openRealtimeChannel } from './realtime';
import { dlog } from './debug';

class DataStore {
    constructor() {
        this.data = {
            active: [],
            instruksi: [],
            order: []
        };
        this.listeners = {
            active: [],
            instruksi: [],
            order: [],
            absen: [] 
        };
        this.lastTimestamps = {
            active: '2000-01-01T00:00:00Z',
            instruksi: '2000-01-01T00:00:00Z',
            order: '2000-01-01T00:00:00Z'
        };
    }

    getData(type) {
        const targetType = type === 'absen' ? 'order' : type;
        return [...this.data[targetType]];
    }


    getItem(type, id) {
        return this.data[type].find(item => item.id === id);
    }


    setData(type, newData) {
        this.data[type] = newData;
        this.updateLastTimestamp(type);
        this.notifyListeners(type, { action: 'set', data: newData });
    }

    addOrUpdateItem(type, item) {
        const index = this.data[type].findIndex(i => i.id === item.id);
        if (index > -1) {
            this.data[type][index] = { ...this.data[type][index], ...item };
        } else {
            this.data[type].push(item);
        }
        this.updateLastTimestamp(type);
        this.notifyListeners(type, { action: 'update', data: item });
    }

    addMultipleItems(type, items) {
        items.forEach(item => this.addOrUpdateItem(type, item));
    }


    deleteItem(type, id) {
        const index = this.data[type].findIndex(i => i.id === id);
        if (index > -1) {
            const deleted = this.data[type].splice(index, 1)[0];
            this.notifyListeners(type, { action: 'delete', data: deleted });
        }
    }

    subscribe(type, callback) {
        const targetType = type === 'absen' ? 'order' : type;

        this.listeners[targetType].push(callback);

        return () => {
            this.listeners[targetType] = this.listeners[targetType].filter(cb => cb !== callback);
        };
    }

    notifyListeners(type, payload) {
        this.listeners[type].forEach(callback => {
            try {
                callback(payload);
            } catch (error) {
                console.error(`Error in listener for ${type}:`, error);
            }
        });
    }

    updateLastTimestamp(type) {
        if (this.data[type].length > 0) {
            const lastItem = this.data[type][this.data[type].length - 1];
            if (lastItem.created_at) {
                this.lastTimestamps[type] = lastItem.created_at;
            }
        }
    }

    getLastTimestamp(type) {
        return this.lastTimestamps[type];
    }


    clear(type) {
        this.data[type] = [];
        this.lastTimestamps[type] = '2000-01-01T00:00:00Z';
        this.notifyListeners(type, { action: 'clear', data: [] });
    }
}

export const dataStore = new DataStore();

export function initializeRealtimeSync() {
    window.addEventListener("bridge:data", async (e) => {
        let payload = e.detail;

        dlog('[WS EVENT] Raw payload received:', payload);

        if (!payload.eventType && !payload.new) {
            if (payload.idseason || payload.sjkb || payload.status || payload.id) {
                dlog('[WS NORMALIZE] Detected raw record format, wrapping...');
                payload = {
                    eventType: 'UPDATE',
                    new: payload,
                    old: null
                };
            }
        }

        if (!payload.eventType && payload.new) {
            dlog('[WS NORMALIZE] Detected .new without eventType, assuming INSERT');
            payload.eventType = 'INSERT';
        }

        const eventType = payload.eventType;
        const newRecord = payload.new;
        const oldRecord = payload.old;

        // Supabase DELETE gak pernah ngirim `new` (cuma `old`), jadi guard ini
        // cuma berlaku buat INSERT/UPDATE. Sebelumnya guard ini nge-block SEMUA
        // event DELETE karena newRecord selalu null buat DELETE -> makanya
        // delete dari realtime gak pernah kepanggil sampai di-refresh manual.
        if (eventType !== 'DELETE' && !newRecord) {
            console.warn('[WS EVENT] No newRecord found in payload, skipping');
            return;
        }
        if (eventType === 'DELETE' && !oldRecord) {
            console.warn('[WS EVENT] DELETE tanpa oldRecord, skip');
            return;
        }

        const status = newRecord?.status?.toLowerCase();
        const idseason = newRecord?.idseason;

        dlog(`[WS HANDLER] eventType=${eventType}, status=${status}, idseason=${idseason}`);

        try {
            switch (eventType) {
                case 'INSERT':
                    dlog('[WS INSERT]', newRecord.idseason);
                    await handleInsert(status, newRecord);
                    break;

                case 'UPDATE':
                    dlog('[WS UPDATE]', newRecord.idseason);
                    await handleUpdate(status, idseason, newRecord, oldRecord);
                    break;

                case 'DELETE':
                    dlog('[WS DELETE]', oldRecord.idseason ?? oldRecord.id);
                    await handleDelete(oldRecord);
                    break;

                default:
                    console.warn(`[WS EVENT] Unknown eventType: ${eventType}`);
            }
        } catch (error) {
            console.error('Error handling realtime event:', error);
        }
    });

    openRealtimeChannel();
}

async function handleInsert(status, newRecord) {
    if (status === 'order') {
        dlog('[HANDLE INSERT] Adding to order:', newRecord.idseason);
        dataStore.addOrUpdateItem('order', newRecord);
        await refreshTableAbsen();
    } else if (status === 'instruksi') {
        dlog('[HANDLE INSERT] Adding to instruksi:', newRecord.idseason);
        dataStore.addOrUpdateItem('instruksi', newRecord);
        await refreshTableInstruksi();
    } else if (status === 'active') {
        dlog('[HANDLE INSERT] Adding to active:', newRecord.idseason);
        dataStore.addOrUpdateItem('active', newRecord);
        await refreshTableActive();
        await createmarker();
        if (typeof window.autoRecenterMap === 'function') {
            window.autoRecenterMap();
        }
    } else {
        console.warn('[HANDLE INSERT] Unknown status:', status);
    }
}

async function handleUpdate(status, idseason, newRecord, oldRecord) {
    const oldStatus = oldRecord?.status?.toLowerCase();

    dlog(`[HANDLE UPDATE] oldStatus=${oldStatus} → newStatus=${status}`);

    if (oldStatus !== status) {
        // Hapus dari kategori lama
        if (oldStatus === 'order') {
            dlog('[HANDLE UPDATE] Removing from order:', newRecord.id);
            dataStore.deleteItem('order', newRecord.id);
            await refreshTableAbsen();
        } else if (oldStatus === 'instruksi') {
            dlog('[HANDLE UPDATE] Removing from instruksi:', newRecord.id);
            dataStore.deleteItem('instruksi', newRecord.id);
            await refreshTableInstruksi();
        } else if (oldStatus === 'active') {
            dlog('[HANDLE UPDATE] Removing from active:', newRecord.id);
            dataStore.deleteItem('active', newRecord.id);
            await refreshTableActive();
            await createmarker();
        }

        if (status === 'order') {
            dlog('[HANDLE UPDATE] Adding to order:', newRecord.idseason);
            dataStore.addOrUpdateItem('order', newRecord);
            await refreshTableAbsen();
        } else if (status === 'instruksi') {
            dlog('[HANDLE UPDATE] Adding to instruksi:', newRecord.idseason);
            dataStore.addOrUpdateItem('instruksi', newRecord);
            await refreshTableInstruksi();
        } else if (status === 'active') {
            dlog('[HANDLE UPDATE] Adding to active:', newRecord.idseason);
            dataStore.addOrUpdateItem('active', newRecord);
            await refreshTableActive();
            await createmarker();
            if (typeof window.autoRecenterMap === 'function') {
                window.autoRecenterMap();
            }
        }
    } else {

        dlog('[HANDLE UPDATE] Same status, just updating data');
        if (status === 'order') {
            dataStore.addOrUpdateItem('order', newRecord);
            await refreshTableAbsen();
        } else if (status === 'instruksi') {
            dataStore.addOrUpdateItem('instruksi', newRecord);
            await refreshTableInstruksi();
        } else if (status === 'active') {
            dataStore.addOrUpdateItem('active', newRecord);
            await refreshTableActive();
            await createmarker();
            if (typeof window.autoRecenterMap === 'function') {
                window.autoRecenterMap();
            }
        }
    }
}

async function handleDelete(record) {
    if (!record) return;
    const id = record.id;
    const status = record.status?.toLowerCase();

    dlog('[HANDLE DELETE]', record.idseason ?? id, 'status=', status);

    if (status === 'order') {
        dataStore.deleteItem('order', id);
        await refreshTableAbsen();
    } else if (status === 'instruksi') {
        dataStore.deleteItem('instruksi', id);
        await refreshTableInstruksi();
    } else if (status === 'active') {
        dataStore.deleteItem('active', id);
        await refreshTableActive();
        await createmarker();
    } else {
        // Payload DELETE dari Supabase defaultnya cuma bawa primary key
        // (kolom `status` gak ikut kecuali REPLICA IDENTITY table ini di-set
        // FULL). Kalau status gak ada, cari id ini di ketiga bucket sekalian —
        // aman karena id unik per baris, paling cuma satu yang ketemu.
        if (dataStore.getItem('order', id)) {
            dataStore.deleteItem('order', id);
            await refreshTableAbsen();
        }
        if (dataStore.getItem('instruksi', id)) {
            dataStore.deleteItem('instruksi', id);
            await refreshTableInstruksi();
        }
        if (dataStore.getItem('active', id)) {
            dataStore.deleteItem('active', id);
            await refreshTableActive();
            await createmarker();
        }
    }
}

export async function requestDataLogistik({ status = null, userId = null, created_at = null } = {}) {
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            return { success: false, error: 'Unauthorized' };
        }

        let query = supabase
            .from('path_history')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);
        if (userId) query = query.eq('user_id', userId);
        
        // HANYA filter created_at jika BUKAN tanggal default tahun 2000
        if (created_at && !created_at.startsWith('2000-01-01')) {
            try {
                const validDate = new Date(created_at).toISOString();
                query = query.gt('created_at', validDate);
            } catch (err) {
                console.warn('[QUERY SUPABASE] Format tanggal created_at tidak valid:', created_at);
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        return { success: true, data: data || [] };
    } catch (error) {
        console.error('[QUERY SUPABASE] Detail error:', error.message || error);
        return { success: false, error: error.message || 'Koneksi internet bermasalah' };
    }
}

let retryCount = 0;

// ============================================
// QUERY FUNCTIONS - ACTIVE
// ============================================
export async function querySupabaseActive() {
    const online = await hasInternet();
    if (!online) {
        showOfflineScreen();
        return null;
    }

    const statusElem = document.getElementById('offline-status');
    if (statusElem) {
        statusElem.textContent = 'Online';
        statusElem.style.color = 'green';
    }

    if (retryCount > 5) {
        showOfflineScreen();
        return null;
    }

    const lastTimestamp = dataStore.getLastTimestamp('active');
    const orderstatus = 'active';

    try {
        const result = await requestDataLogistik({
            status: orderstatus,
            created_at: lastTimestamp
        });

        if (!result.success) throw new Error(result.error || 'Gagal mengambil data dari API Vercel');

        const rows = result.data || [];

        if (rows.length > 0) {
            dataStore.addMultipleItems('active', rows);
        }

        retryCount = 0;
        await refreshTableActive();
        await createmarker();
        if (typeof window.autoRecenterMap === 'function') {
            window.autoRecenterMap();
        }
        return;
    } catch (error) {
        console.error('Error querySupabaseActive:', error);
        retryCount++;
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(querySupabaseActive());
            }, 2000);
        });
    }
}


export async function querySupabaseInstruksi() {
    const online = await hasInternet();
    if (!online) {
        showOfflineScreen();
        return null;
    }

    const statusElem = document.getElementById('offline-status');
    if (statusElem) {
        statusElem.textContent = 'Online';
        statusElem.style.color = 'green';
    }

    if (retryCount > 5) {
        showOfflineScreen();
        return null;
    }

    const lastTimestamp = dataStore.getLastTimestamp('instruksi');
    const orderstatus = 'instruksi';

    try {
        const result = await requestDataLogistik({
            status: orderstatus,
            created_at: lastTimestamp
        });

        if (!result.success) throw new Error(result.error || 'Gagal mengambil data dari API Vercel');

        const rows = result.data || [];

        if (rows.length > 0) {
            dataStore.addMultipleItems('instruksi', rows);
        }

        retryCount = 0;
        await refreshTableInstruksi();
        return;
    } catch (error) {
        console.error('Error querySupabaseInstruksi:', error);
        retryCount++;
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(querySupabaseInstruksi());
            }, 2000);
        });
    }
}


export async function querySupabaseAbsen() {
    const online = await hasInternet();
    if (!online) {
        showOfflineScreen();
        return null;
    }

    const statusElem = document.getElementById('offline-status');
    if (statusElem) {
        statusElem.textContent = 'Online';
        statusElem.style.color = 'green';
    }

    if (retryCount > 5) {
        showOfflineScreen();
        return null;
    }

    const lastTimestamp = dataStore.getLastTimestamp('order');
    const orderstatus = 'order'; 

    try {
        const result = await requestDataLogistik({
            status: orderstatus,
            created_at: lastTimestamp
        });

        if (!result.success) throw new Error(result.error || 'Gagal mengambil data dari API Vercel');

        const rows = result.data || [];

        if (rows.length > 0) {
            dataStore.addMultipleItems('order', rows);
        }

        retryCount = 0;
        await refreshTableAbsen(); 
        return;
    } catch (error) {
        console.error('Error querySupabaseAbsen:', error);
        retryCount++;
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(querySupabaseAbsen());
            }, 2000);
        });
    }
}