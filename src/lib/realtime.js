import { supabase } from './supabase.js';

/* ===========================================================================
   Langganan realtime ke trip_leadtime.

   "Ghost socket" — koneksi yang masih hidup padahal tidak ada yang memakai —
   muncul dari lima jalur, dan semuanya ditutup di sini:

   1. Langganan dobel. Pindah tab atau muat ulang data memanggil start() lagi;
      tanpa penjaga, tiap panggilan membuat channel baru dan yang lama tetap
      terbuka. Dijaga oleh singleton + sapu bersih channel bernama sama.
   2. Sisa hot-reload Vite. Modul dieksekusi ulang saat file disimpan, tapi
      channel lama tidak ikut mati. Ditutup lewat import.meta.hot.dispose.
   3. Tab ditinggal berjam-jam. Socket-nya masih terdaftar tapi sudah basi.
      Saat halaman disembunyikan langganan dilepas, saat kembali dipasang lagi
      berikut satu penyegaran data — karena selama tidak mendengar, ada
      perubahan yang terlewat.
   4. Badai sambung ulang. Kalau server menolak, percobaan diulang dengan
      jeda yang menanjak dan hanya satu timer yang boleh menganggur.
   5. Keluar akun / tutup tab. Dilepas lewat pagehide.

   Perubahan datang berombongan — calc-leadtime menulis 25 baris sekaligus —
   jadi pemberitahuannya dikumpulkan dulu, tidak menggambar ulang 25 kali.
   =========================================================================== */

const NAMA_CHANNEL = 'trip-leadtime-live';
const JEDA_KUMPUL_MS = 1200;
const JEDA_SAMBUNG = [2000, 5000, 15000, 30000, 60000];

let channel = null;
let statusSekarang = 'mati';
let timerKumpul = null;
let timerSambung = null;
let percobaan = 0;
let terpasang = false;          // penanda pendengar dokumen sudah dipasang
let opsi = null;                // { onBatch, onStatus }
const antre = [];

/* ------------------------------------------------------------------ utilitas */

function laporStatus(s) {
  if (statusSekarang === s) return;
  statusSekarang = s;
  opsi?.onStatus?.(s);
}

function jadwalkanKumpul() {
  if (timerKumpul) return;
  timerKumpul = setTimeout(() => {
    timerKumpul = null;
    if (antre.length === 0) return;
    const batch = antre.splice(0, antre.length);
    opsi?.onBatch?.(batch);
  }, JEDA_KUMPUL_MS);
}

function batalTimer() {
  if (timerKumpul) { clearTimeout(timerKumpul); timerKumpul = null; }
  if (timerSambung) { clearTimeout(timerSambung); timerSambung = null; }
}

/** Buang channel bernama sama yang mungkin tertinggal dari siklus sebelumnya. */
async function sapuChannelLama() {
  for (const ch of supabase.getChannels()) {
    if (ch.topic === `realtime:${NAMA_CHANNEL}`) {
      await supabase.removeChannel(ch);
    }
  }
  channel = null;
}

/* -------------------------------------------------------------------- pasang */

async function pasang() {
  // Penjaga langganan dobel: kalau sudah tersambung atau sedang menyambung,
  // panggilan kedua tidak membuat apa-apa.
  if (channel && ['joining', 'joined'].includes(channel.state)) return;

  await sapuChannelLama();

  channel = supabase
    .channel(NAMA_CHANNEL)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trip_leadtime' },
      (payload) => {
        antre.push(payload);
        jadwalkanKumpul();
      },
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        percobaan = 0;
        laporStatus('nyala');
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        laporStatus('putus');
        if (err) console.warn('[realtime]', status, err.message ?? err);
        sambungUlang();
      }
    });
}

function sambungUlang() {
  if (timerSambung) return;                 // hanya satu timer yang menganggur
  if (document.visibilityState === 'hidden') return;   // percuma saat tab tersembunyi

  const jeda = JEDA_SAMBUNG[Math.min(percobaan, JEDA_SAMBUNG.length - 1)];
  percobaan += 1;

  timerSambung = setTimeout(async () => {
    timerSambung = null;
    await sapuChannelLama();
    pasang();
  }, jeda);
}

/* -------------------------------------------------------------------- publik */

export async function startRealtime(o) {
  opsi = o;

  if (!terpasang) {
    terpasang = true;

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden') {
        batalTimer();
        await sapuChannelLama();
        laporStatus('jeda');
      } else {
        percobaan = 0;
        await pasang();
        // Selama tidak mendengar bisa ada perubahan yang lewat, jadi data
        // ditarik ulang sekali begitu kembali.
        opsi?.onKembali?.();
      }
    });

    // pagehide lebih andal dari beforeunload di peramban seluler.
    window.addEventListener('pagehide', () => { stopRealtime(); });
  }

  await pasang();
}

export async function stopRealtime() {
  batalTimer();
  antre.length = 0;
  await sapuChannelLama();
  laporStatus('mati');
}

// Vite menjalankan ulang modul ini tiap kali file disimpan; tanpa ini channel
// lama menumpuk sepanjang sesi pengembangan.
if (import.meta.hot) {
  import.meta.hot.dispose(() => { stopRealtime(); });
}
