# RateTrip Dashboard

Dashboard waktu sampai per destinasi. Seluruh angka dibaca dari satu tabel
Supabase: `trip_leadtime`.

## Dari mana angkanya

Dashboard ini **tidak menghitung apa pun**. Semua perhitungan dilakukan di
sisi Supabase oleh Edge Function `calc-leadtime`, yang membaca `path_hist`
lewat view `trip_source` (data hidup + arsip) dan menulis satu baris per
trip ke `trip_leadtime`.

Konsekuensinya: kalau ambang perhitungan berubah, yang diubah adalah Edge
Function-nya, bukan kode di sini. Dashboard tinggal membaca ulang.

Aturan yang berlaku di sisi Supabase:

- Valid: `path_hist` terisi dan titik GPS terakhir <= 1000 m dari tujuan
- Mulai dihitung dari `depart_at`
- Jam sampai: titik GPS pertama yang <= 500 m dari tujuan; kalau tidak
  pernah, dipakai titik terakhir
- Kategori dari rasio aktual/target: <70% advance, 70-100% ontime, >100% delay

## Menjalankan

```bash
npm install
npm run dev
```

`.env` harus berisi:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Isi tab

| Tab | Menjawab |
| --- | --- |
| Ringkasan | Berapa persen tepat waktu, dan bagaimana trennya |
| Destinasi | Berapa lama ke tiap destinasi, dipecah per moda lalu ekspedisi |
| Ekspedisi | Ekspedisi mana yang paling sering telat |
| Jam kirim | Jam berangkat mana yang paling aman |
| Kualitas data | Trip yang tidak terhitung, dan alasannya |

## Median, bukan rata-rata

Angka utama memakai median. Satu truk yang tersangkut enam jam bisa menarik
rata-rata satu destinasi naik puluhan menit padahal puluhan trip lain
normal. Rata-rata dan P90 tetap ditampilkan berdampingan di Ringkasan.

Destinasi dengan kurang dari 5 trip tidak ikut diperingkat, tapi angkanya
tetap tampil di tabel.

## Pita rasio

Elemen penanda dashboard ini. Setiap baris memakai skala tetap 0-200% dari
target, jadi garis target (kuning) berdiri di posisi yang sama pada setiap
baris dan membentuk satu garis lurus menurun sepanjang tabel.

Yang digambar adalah rentang P10-P90 dari rasio, bukan satu batang
rata-rata. Rentang yang lebar berarti rute itu tidak konsisten, dan itu
informasi yang hilang kalau hanya menampilkan satu angka.

Advance sengaja diberi warna biru, bukan hijau: sampai jauh lebih cepat
dari target bukan prestasi, melainkan tanda targetnya keliru atau
kendaraannya terlalu cepat. Hijau hanya untuk ontime.

## Cetak

Tombol Cetak memakai `window.print()` dengan aturan cetak khusus, bukan
tangkapan layar. Hasilnya memuat seluruh isi tab yang sedang terbuka,
termasuk bagian yang harus digulir di layar.

## Yang dihapus dari versi sebelumnya

- `public/data/trips.json` dan seluruh pemuatan file statis
- `transform.js` — semua perhitungan pindah ke Edge Function
- Tab dan grafik penilaian driver (star1-star5) — penilaian driver akan
  ditangani tabel terpisah
- Ekspor Excel titik GPS mentah dan ekspor PDF berbasis html2canvas.
  Digantikan unduh CSV dan cetak lewat browser.
