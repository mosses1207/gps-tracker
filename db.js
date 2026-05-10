import Dexie from 'dexie';
export const db = new Dexie('logistic_db');

db.version(3).stores({
    all_logs: 'idseason, created_at, saved_at',
    travel_sessions: 'idseason, status, waktu_berangkat',
    real_location: 'idseason, created_at, saved_at, sjkb, updated_at, lat, lng',
});