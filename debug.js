// debug.js
//
// SECURITY (go-live hardening): console.log tersebar di banyak file dan
// nge-log data operasional (idseason, status, driver id, dst) yang gak
// perlu keliatan di production console -- siapa aja yang buka DevTools di
// komputer dispatcher (termasuk komputer yang dipakai bareng-bareng) bisa
// baca semuanya. dlog() cuma aktif pas `vite dev` (import.meta.env.DEV),
// otomatis no-op di hasil `vite build` production.
export function dlog(...args) {
    if (import.meta.env.DEV) console.log(...args);
}
