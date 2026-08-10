// sanitize.js
//
// SECURITY FIX (go-live hardening): active.js, absen.js, dan instruksi.js
// nyusun HTML lewat template literal terus di-inject pakai innerHTML/outerHTML
// TANPA di-escape dulu. Field kayak `driver` dan `vendor` asalnya dari input
// bebas pas registrasi driver (nama lengkap, ekspedisi) — itu berarti akun
// driver mana pun bisa nyisipin payload semacam
// `<img src=x onerror="...">` yang bakal KE-EKSEKUSI di browser dispatcher
// begitu data itu tampil di dashboard (stored XSS). `sjkb`/`dest`/`nopol`
// juga sama-sama harus di-escape walau asalnya dari form dispatcher sendiri
// (defense in depth kalau salah satu akun dispatcher kena phising/compromise).
//
// Escape SEMUA data dinamis sebelum masuk ke template HTML, cukup lewat
// escapeHtml() di bawah ini.
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
