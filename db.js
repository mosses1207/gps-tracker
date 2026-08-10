import Dexie from 'dexie';

export const db = new Dexie('logistic_db');

db.version(6).stores({
    cabang: 'nama, created_at',
    storage: 'branch, created_at',
    history: 'idseason, created_at',
});

// History module dihapus — table 'history' sudah tidak dipakai lagi.
// Tetap didefinisikan lewat version bump (bukan dihapus diam-diam) supaya
// Dexie membersihkan object store lama pada database milik user yang sudah ada.
db.version(7).stores({
    cabang: 'nama, created_at',
    storage: 'branch, created_at',
    history: null,
});