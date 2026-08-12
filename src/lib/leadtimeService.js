import { supabase } from './supabase.js';

const TABLE = 'trip_leadtime';
const PAGE = 1000;

/**
 * Kolom yang diambil. Sengaja disebut satu per satu, bukan '*': kalau nanti
 * ada kolom baru yang berat, dashboard tidak ikut menariknya tanpa sengaja.
 */
const COLUMNS = [
  'trip_id', 'sumber', 'lokasi', 'dest', 'moda', 'vendor', 'driver',
  'hari', 'jam_berangkat', 'menit_aktual', 'menit_target', 'rasio_pct',
  'kategori', 'menit_di_area', 'is_valid', 'alasan_invalid',
  'jarak_akhir_m', 'sumber_tiba', 'gps_points',
].join(',');

/**
 * Tarik seluruh baris trip_leadtime. Tabelnya sudah tidak memuat path_hist,
 * jadi satu baris hanya ratusan byte — ribuan trip masih ringan untuk
 * diagregasi di sisi klien, dan drill-down jadi tanpa jeda.
 */
export async function fetchLeadtime({ from = null, to = null } = {}) {
  const rows = [];
  let offset = 0;

  for (;;) {
    let q = supabase
      .from(TABLE)
      .select(COLUMNS)
      .order('hari', { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (from) q = q.gte('hari', from);
    if (to) q = q.lte('hari', to);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return rows;
}

/** Rentang tanggal yang tersedia, untuk mengisi nilai awal filter. */
export async function fetchDateBounds() {
  const [min, max] = await Promise.all([
    supabase.from(TABLE).select('hari').order('hari', { ascending: true }).limit(1).maybeSingle(),
    supabase.from(TABLE).select('hari').order('hari', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    min: min.data?.hari ?? null,
    max: max.data?.hari ?? null,
  };
}
