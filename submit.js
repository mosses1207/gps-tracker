import { supabase } from './supabaseClient';
import { db } from "./db";
import { showLoading, hideLoading } from "./auth";
import { lookupFrame } from "./bridge";

let isproses = true;
let retryCount = 0;
let selectedKordinat = null;

// ─── Ambil data cabang dari Supabase ───────────────────────────────────────
// ─── Ambil data cabang dari Supabase ───────────────────────────────────────
export async function ambildataCabang() {
    isproses = false;
    const lastEntry = await db.storage.orderBy('created_at').reverse().first();
    const lastTimestamp = lastEntry?.created_at;

    try {
        let query = supabase
            .from('rute_logistik')
            .select('branch, created_at, leadtime, kordinat')
            .order('created_at', { ascending: false });

        // HANYA tambahkan filter .gt() jika sudah ada data sebelumnya di Dexie/lokal
        // dan tanggalnya BUKAN tanggal dummy tahun 2000.
        if (lastTimestamp && !lastTimestamp.startsWith('2000-01-01')) {
            try {
                const validDate = new Date(lastTimestamp).toISOString();
                query = query.gt('created_at', validDate);
            } catch (err) {
                console.warn('[CABANG] Format timestamp lokal tidak valid:', lastTimestamp);
            }
        }

        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
            await db.storage.bulkPut(data);
        }
        
        retryCount = 0;
    } catch (error) {
        console.error('[CABANG] Gagal mengambil data cabang:', error);
        retryCount++;
        if (retryCount <= 5) {
            setTimeout(() => ambildataCabang(), 2000);
        }
    } finally {
        isproses = true;
    }
}

// ─── Set koordinat tujuan dari luar (dipakai pas prefill form mode edit) ──
export function setSelectedKordinat(koordinat) {
    selectedKordinat = koordinat;
}

// ─── Parse koordinat dari string ke { lat, lng } ──────────────────────────
function parseKordinat(str) {
    if (!str) return null;
    const [lat, lng] = str.split(',').map(s => parseFloat(s.trim()));
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
}

// ─── Validasi nomer rangka (fm1-fm6) gak boleh duplikat ───────────────────
// Field kosong bebas (gak wajib semua keisi, minimal fm1), tapi antar field
// yang KEISI gak boleh ada nilai yang sama persis -- ini yang jagain kalau
// operator gak sadar udah nge-scan unit yang sama dua kali ke fm yang beda.
const FRAME_FIELD_IDS = ['fm1', 'fm2', 'fm3', 'fm4', 'fm5', 'fm6'];
const TYPE_FIELD_IDS = ['typefm1', 'typefm2', 'typefm3', 'typefm4', 'typefm5', 'typefm6'];
const MODEL_FIELD_IDS = ['modelfm1', 'modelfm2', 'modelfm3', 'modelfm4', 'modelfm5', 'modelfm6'];
const ALAMAT_FIELD_IDS = ['alamatfm1', 'alamatfm2', 'alamatfm3', 'alamatfm4', 'alamatfm5', 'alamatfm6'];

// True selagi applyGroupToForm() lagi nulis value ke fm1-6 secara program.
// Dipakai buat nyegah trigger lookup bridge ulang gara-gara autofill-nya
// sendiri (fm2-6 ikut keisi pas fm1 discan, itu bukan "input baru" dari user).
let isApplyingGroup = false;

function getFrameValues() {
    return FRAME_FIELD_IDS.map(id => document.getElementById(id).value.trim());
}

// Balikin Set berisi id field yang nilainya bentrok sama field lain
function findDuplicateFrameFields() {
    const values = getFrameValues();
    const firstIndexOf = new Map(); // value -> index field pertama yang punya nilai ini
    const dupIds = new Set();

    values.forEach((val, i) => {
        if (!val) return; // field kosong dilewatin, boleh cuma isi 1-2
        if (firstIndexOf.has(val)) {
            dupIds.add(FRAME_FIELD_IDS[firstIndexOf.get(val)]);
            dupIds.add(FRAME_FIELD_IDS[i]);
        } else {
            firstIndexOf.set(val, i);
        }
    });
    return dupIds;
}

export function clearFrameFieldErrors() {
    FRAME_FIELD_IDS.forEach(id => document.getElementById(id).classList.remove('input-error'));
}

// Highlight field yang bentrok, tampilin pesan kalau ada duplikat.
// Dipanggil tiap ada perubahan di salah satu fm (termasuk pas discan) biar
// operator langsung sadar begitu scan kedua yang sama masuk, gak nunggu submit.
function validateFrameUniqueness() {
    const dupIds = findDuplicateFrameFields();
    clearFrameFieldErrors();

    if (dupIds.size > 0) {
        dupIds.forEach(id => document.getElementById(id).classList.add('input-error'));
        showMsg('Nomer rangka gak boleh sama antara fm1-fm6 (yang ke-highlight merah kembar).', 'error');
        return false;
    }

    // Jangan hideMsg() sembarangan -- bisa nimpa pesan error/info lain yang
    // lagi ditampilin (misal pas proses submit). Cuma bersihin kalau msg yang
    // lagi nongol emang pesan duplikat fm ini.
    const msgEl = document.getElementById('msg');
    if (msgEl.classList.contains('error') && msgEl.textContent.includes('Nomer rangka gak boleh sama')) {
        hideMsg();
    }
    return true;
}

// ─── Bridge lokal: 1x input nomer rangka -> autofill fm1-6/type/model/alamat ─
function setFmStatus(index, text, kind) {
    const el = document.getElementById(`fmstatus${index + 1}`);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'fm-status' + (kind ? ` ${kind}` : '');
}

export function clearFmStatuses() {
    FRAME_FIELD_IDS.forEach((_, i) => setFmStatus(i, '', ''));
}

// Timpa fm1-6 + typefm1-6 + modelfm1-6 + alamatfm1-6 pakai 1 grup (idx sama)
// yang dibalikin bridge. Ini dianggap "data baru" -> nimpa total isian lama
// di slot-slot itu, baik lagi mode input baru (tab Absen) maupun mode edit
// (tab instruksi).
function applyGroupToForm(group) {
    const items = Array.isArray(group) ? group : [];

    isApplyingGroup = true;
    try {
        FRAME_FIELD_IDS.forEach((id, i) => {
            const item = items[i];
            document.getElementById(id).value = item?.frame_number || '';
            document.getElementById(TYPE_FIELD_IDS[i]).value = item?.type || '';
            document.getElementById(MODEL_FIELD_IDS[i]).value = item?.model || '';
            document.getElementById(ALAMAT_FIELD_IDS[i]).value = item?.alamat || '';
            setFmStatus(i, item ? 'Terisi otomatis dari data python' : '', item ? 'ok' : '');
        });
    } finally {
        isApplyingGroup = false;
    }

    validateFrameUniqueness();

    if (items.length > FRAME_FIELD_IDS.length) {
        showMsg(
            `Grup ini punya ${items.length} unit, form cuma nampung ${FRAME_FIELD_IDS.length} — sisanya perlu diisi manual.`,
            'error'
        );
    }
}

// Dipanggil pas salah satu field fm1-6 selesai diisi (blur/Enter). Nomer
// rangka adalah SATU-SATUNYA trigger ke bridge -- sjkb/tujuan sengaja gak
// pernah memicu ini karena memang gak ada datanya di sisi python.
async function handleFrameLookup(index) {
    if (isApplyingGroup) return; // ini autofill program, bukan input user

    const id = FRAME_FIELD_IDS[index];
    const value = document.getElementById(id).value.trim();

    if (!value) {
        setFmStatus(index, '', '');
        return;
    }

    setFmStatus(index, 'Mencari di data python...', 'loading');

    const result = await lookupFrame(value);

    if (!result.ok) {
        const reasonText = result.reason === 'not-configured'
            ? 'Alamat bridge belum diisi (buka Pengaturan)'
            : 'Bridge lokal tidak bisa dihubungi';
        setFmStatus(index, reasonText, 'warn');
        return;
    }

    if (!result.found) {
        setFmStatus(index, 'Nomer rangka tidak ada di data python — isi manual', 'warn');
        return;
    }

    applyGroupToForm(result.group);
}

// ─── Init form (panggil setelah DOM ready) ────────────────────────────────
export function initForm() {
    const destInput = document.getElementById('dest');
    const dropdown = document.getElementById('dest-dropdown');
    const leadtimeInput = document.getElementById('leadtime');

    FRAME_FIELD_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        el.addEventListener('input', validateFrameUniqueness);

        // 'change' fire pas blur & value berubah -- pas operator selesai
        // ngetik/scan 1 nomer rangka, itu yang mancing tanya ke bridge.
        el.addEventListener('change', () => handleFrameLookup(i));

        // Kalau alat scan ngirim Enter setelah scan, langsung blur biar
        // 'change' di atas kepicu saat itu juga (gak nunggu operator klik
        // field lain dulu).
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            }
        });
    });

    destInput.addEventListener('input', async () => {
        const q = destInput.value.toLowerCase();
        dropdown.innerHTML = '';
        selectedKordinat = null;

        if (!q) { dropdown.style.display = 'none'; return; }

        const allCabang = await db.storage.toArray();
        const hasil = allCabang.filter(t => t.branch?.toLowerCase().includes(q));

        if (!hasil.length) { dropdown.style.display = 'none'; return; }

        hasil.forEach(t => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = t.branch;
            item.addEventListener('click', () => {
                destInput.value = t.branch;
                leadtimeInput.value = t.leadtime + ' Menit';
                selectedKordinat = parseKordinat(t.kordinat);
                dropdown.style.display = 'none';
            });
            dropdown.appendChild(item);
        });
        dropdown.style.display = 'block';
    });

    document.addEventListener('click', e => {
        if (!destInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    document.getElementById('btn-reset').addEventListener('click', resetForm);
    document.getElementById('btn-submit').addEventListener('click', submitForm);
}

// ─── Reset ────────────────────────────────────────────────────────────────
export function resetForm() {
    [
        'sjkb', 'dest',
        ...FRAME_FIELD_IDS,
        ...ALAMAT_FIELD_IDS,
        ...TYPE_FIELD_IDS,
        ...MODEL_FIELD_IDS,
    ].forEach(id => document.getElementById(id).value = '');
    document.getElementById('moda').value = '';
    document.getElementById('leadtime').value = '';
    selectedKordinat = null;
    clearFrameFieldErrors();
    clearFmStatuses();
    hideMsg();
}

function showMsg(text, type) {
    const el = document.getElementById('msg');
    el.textContent = text;
    el.className = 'msg ' + type;
    el.style.display = 'block';
}

export function hideMsg() {
    document.getElementById('msg').style.display = 'none';
}

// ─── Submit ───────────────────────────────────────────────────────────────
export async function submitForm() {
    let frame2 = '-', frame3 = '-', frame4 = '-', frame5 = '-', frame6 = '-';
    let alamatfm2 = '-', alamatfm3 = '-', alamatfm4 = '-', alamatfm5 = '-', alamatfm6 = '-';
    let typefm2 = '-', typefm3 = '-', typefm4 = '-', typefm5 = '-', typefm6 = '-';
    let modelfm2 = '-', modelfm3 = '-', modelfm4 = '-', modelfm5 = '-', modelfm6 = '-';
    const sjkb = document.getElementById('sjkb').value.trim();
    const dest = document.getElementById('dest').value.trim();
    const moda = document.getElementById('moda').value;
    const frame1 = document.getElementById('fm1').value.trim();
    const rawframe2 = document.getElementById('fm2').value.trim();
    const rawframe3 = document.getElementById('fm3').value.trim();
    const rawframe4 = document.getElementById('fm4').value.trim();
    const rawframe5 = document.getElementById('fm5').value.trim();
    const rawframe6 = document.getElementById('fm6').value.trim();
    const alamatfm1 = document.getElementById('alamatfm1').value.trim();
    const rawalamatfm2 = document.getElementById('alamatfm2').value.trim();
    const rawalamatfm3 = document.getElementById('alamatfm3').value.trim();
    const rawalamatfm4 = document.getElementById('alamatfm4').value.trim();
    const rawalamatfm5 = document.getElementById('alamatfm5').value.trim();
    const rawalamatfm6 = document.getElementById('alamatfm6').value.trim();
    const typefm1 = document.getElementById('typefm1').value.trim();
    const rawtypefm2 = document.getElementById('typefm2').value.trim();
    const rawtypefm3 = document.getElementById('typefm3').value.trim();
    const rawtypefm4 = document.getElementById('typefm4').value.trim();
    const rawtypefm5 = document.getElementById('typefm5').value.trim();
    const rawtypefm6 = document.getElementById('typefm6').value.trim();
    const modelfm1 = document.getElementById('modelfm1').value.trim();
    const rawmodelfm2 = document.getElementById('modelfm2').value.trim();
    const rawmodelfm3 = document.getElementById('modelfm3').value.trim();
    const rawmodelfm4 = document.getElementById('modelfm4').value.trim();
    const rawmodelfm5 = document.getElementById('modelfm5').value.trim();
    const rawmodelfm6 = document.getElementById('modelfm6').value.trim();
    const form = document.querySelector('.bodyform');
    const databaseId = form?.dataset.recordId; 
    const selectedId = form?.dataset.selectedId;
    const sourceTab = form?.dataset.sourceTab;
    // Status ikut tab asal form-nya dibuka: dari tab Absen -> "order", dari
    // tab instruksi -> "instruksi". Tab Active sengaja tidak pernah membuka
    // form ini (manifest sudah tidak boleh diedit dari situ), jadi tidak
    // akan pernah masuk sini dengan status lain.
    const status = sourceTab === 'absen' ? 'order' : sourceTab === 'instruksi' ? 'instruksi' : null;

    if (!selectedId) {
        showMsg('Pilih driver terlebih dahulu sebelum mengirim instruksi.', 'error');
        return;
    }

    // databaseId wajib ada dan valid (PK path_history dari Supabase).
    // Cek eksplisit di sini (bukan cuma andelin validasi backend) karena
    // kalau id-nya kosong/rusak dari sumber data, backend cuma bakal
    // balikin 409 "Manifest tidak ditemukan" yang membingungkan admin.
    if (!databaseId || databaseId === 'undefined' || databaseId === 'null') {
        showMsg('ID data (primary key) tidak ditemukan untuk baris ini. Coba refresh halaman lalu pilih ulang; kalau masih gagal, cek response /api/request-data atau /api/decrypt — pastikan field "id" ikut dikembalikan.', 'error');
        return;
    }

    if (!sjkb || !dest || !moda || !frame1 || !alamatfm1) {
        showMsg('Semua field wajib diisi.', 'error');
        return;
    }

    if (!selectedKordinat) {
        showMsg('Pilih tujuan resmi dari daftar dropdown.', 'error');
        return;
    }

    if (!validateFrameUniqueness()) {
        return;
    }

    if (rawframe2) {
        frame2 = rawframe2;
    }
    if (rawframe3) {
        frame3 = rawframe3;
    }
    if (rawframe4) {
        frame4 = rawframe4;
    }
    if (rawframe5) {
        frame5 = rawframe5;
    }
    if (rawframe6) {
        frame6 = rawframe6;
    }
    if (rawalamatfm2) {
        alamatfm2 = rawalamatfm2;
    }
    if (rawalamatfm3) {
        alamatfm3 = rawalamatfm3;
    }
    if (rawalamatfm4) {
        alamatfm4 = rawalamatfm4;
    }
    if (rawalamatfm5) {
        alamatfm5 = rawalamatfm5;
    }
    if (rawalamatfm6) {
        alamatfm6 = rawalamatfm6;
    }
    if (rawtypefm2) {
        typefm2 = rawtypefm2;
    }
    if (rawtypefm3) {
        typefm3 = rawtypefm3;
    }
    if (rawtypefm4) {
        typefm4 = rawtypefm4;
    }
    if (rawtypefm5) {
        typefm5 = rawtypefm5;
    }
    if (rawtypefm6) {
        typefm6 = rawtypefm6;
    }
    if (rawmodelfm2) {
        modelfm2 = rawmodelfm2;
    }
    if (rawmodelfm3) {
        modelfm3 = rawmodelfm3;
    }
    if (rawmodelfm4) {
        modelfm4 = rawmodelfm4;
    }
    if (rawmodelfm5) {
        modelfm5 = rawmodelfm5;
    }
    if (rawmodelfm6) {
        modelfm6 = rawmodelfm6;
    }

    const rawLeadtime = document.getElementById('leadtime').value;
    const cleanLeadtime = rawLeadtime.replace(/[^0-9]/g, '');
    const instructionPayload = {
        user_id: selectedId,
        id:databaseId,
        sjkb,
        dest,
        moda,
        status,
        lattujuan: String(selectedKordinat.lat),
        langtujuan: String(selectedKordinat.lng),
        leadtime: cleanLeadtime,
        updated_at: new Date().toISOString(),
        frame1,
        frame2,
        frame3,
        frame4,
        frame5,
        frame6,
        alamatfm1,
        alamatfm2,
        alamatfm3,
        alamatfm4,
        alamatfm5,
        alamatfm6,
        typefm1,
        typefm2,
        typefm3,
        typefm4,
        typefm5,
        typefm6,
        modelfm1,
        modelfm2,
        modelfm3,
        modelfm4,
        modelfm5,
        modelfm6
    };

    showMsg('Sedang memproses instruksi...', 'info');

    const hasil = await sendManifestInstruction(instructionPayload);

    if (hasil.success === true) {
        showMsg('Instruksi manifes berhasil dikirim ke driver!', 'success');
        setTimeout(() => {
            resetForm();
        }, 1500);
        return;
    } 
    if (hasil.error) {
        showMsg(hasil.error, 'error');
        return;
    }
    showMsg('Gagal memproses data. Periksa jaringan Anda.', 'error');
}

let sendmanifest = false;

async function sendManifestInstruction(instructionPayload) {
    showLoading('Mengirim instruksi...');
    if (sendmanifest) {
        return { success: false, error: "Sedang mengirim instruksi, silahkan tunggu." };
    }
    sendmanifest = true;
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        sendmanifest = false;
        return { success: false, error: "Silakan login kembali." };
    }

    try {
        // Field-nya sama persis kayak body yang dulu dikirim ke /api/send-instruction,
        // sekarang langsung UPDATE ke Supabase (tabel path_history) by id.
        // Catatan: field type/model (tfm1-6/mfm1-6) baru terisi kalau nomer
        // rangka-nya berhasil dicocokkan ke data python lewat bridge lokal —
        // pastiin kolom tfm1-6/mfm1-6 sudah ada di tabel path_history.
        const { error } = await supabase
            .from('path_history')
            .update({
                user_id: instructionPayload.user_id,
                sjkb: instructionPayload.sjkb,
                dest: instructionPayload.dest,
                moda: instructionPayload.moda,
                status: instructionPayload.status,
                lattujuan: instructionPayload.lattujuan,
                langtujuan: instructionPayload.langtujuan,
                leadtime: instructionPayload.leadtime,
                updated_at: new Date().toISOString(),
                fm1: instructionPayload.frame1,
                fm2: instructionPayload.frame2,
                fm3: instructionPayload.frame3,
                fm4: instructionPayload.frame4,
                fm5: instructionPayload.frame5,
                fm6: instructionPayload.frame6,
                afm1: instructionPayload.alamatfm1,
                afm2: instructionPayload.alamatfm2,
                afm3: instructionPayload.alamatfm3,
                afm4: instructionPayload.alamatfm4,
                afm5: instructionPayload.alamatfm5,
                afm6: instructionPayload.alamatfm6,
                t1: instructionPayload.typefm1,
                t2: instructionPayload.typefm2,
                t3: instructionPayload.typefm3,
                t4: instructionPayload.typefm4,
                t5: instructionPayload.typefm5,
                t6: instructionPayload.typefm6,
                m1: instructionPayload.modelfm1,
                m2: instructionPayload.modelfm2,
                m3: instructionPayload.modelfm3,
                m4: instructionPayload.modelfm4,
                m5: instructionPayload.modelfm5,
                m6: instructionPayload.modelfm6,
                status: 'instruksi',
            })
            .eq('id', instructionPayload.id);

        if (error) {
            throw new Error(error.message || 'Gagal memproses instruksi');
        }
        sendmanifest = false;
        return { success: true };
    } catch (error) {
        sendmanifest = false;
        return { success: false, error: error.message };
    } finally {
        sendmanifest = false;
        hideLoading();
    }
}
