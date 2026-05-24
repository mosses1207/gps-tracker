import Dexie from 'dexie';
export const db = new Dexie('logistic_db');

db.version(12).stores({
    ocr_results: 'created_at',
    all_logs: 'idseason, created_at, saved_at',
    travel_sessions: 'idseason, status, waktu_berangkat',
    real_location: 'idseason, created_at, saved_at, sjkb, updated_at, lat, lng',
    user:'id',
    addresses: 'cacheKey, street, timestamp',
    directions: 'cacheKey, timestamp',
    rute: 'id'
});