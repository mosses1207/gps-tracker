import Dexie from 'dexie';

export const db = new Dexie('logistic_db');

db.version(6).stores({
    cabang: 'nama, created_at',
    storage: 'branch, created_at',
    history: 'idseason, created_at',
});

db.version(7).stores({
    cabang: 'nama, created_at',
    storage: 'branch, created_at',
    history: null,
});