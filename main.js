import { createClient } from '@supabase/supabase-js'

// 1. Ambil Kunci Rahasia dari Vercel
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

// 2. Inisialisasi Supabase
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 3. Ambil Elemen HTML untuk Satpam
const loaderSatpam = document.getElementById('loading-satpam');
const loadProgress = document.getElementById('load-progress');

// Fungsi Update Loading Screen
function updateLoading(percent, text) {
  if (loadProgress) loadProgress.innerText = `${text} (${percent}%)`;
  if (percent >= 100) {
    setTimeout(() => {
      if (loaderSatpam) loaderSatpam.style.display = 'none';
    }, 800);
  }
}

// 4. Logic Perpindahan View (Google vs Admin)
window.pindahKeAdmin = (isAdmin) => {
  const areaGoogle = document.getElementById('area-google');
  const areaAdmin = document.getElementById('area-admin');
  const title = document.getElementById('title-login');

  if (isAdmin) {
    areaGoogle.style.display = 'none';
    areaAdmin.style.display = 'block';
    title.innerText = "Admin Login";
  } else {
    areaGoogle.style.display = 'block';
    areaAdmin.style.display = 'none';
    title.innerText = "Akses Sistem";
  }
}

// 5. Handle Login Admin Manual
window.prosesLoginAdmin = async () => {
  const email = document.getElementById('userAdmin').value;
  const password = document.getElementById('passAdmin').value;

  if (!email || !password) return alert("Isi email & password admin!");

  updateLoading(50, "Memverifikasi Admin...");
  
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    alert("Gagal Login Admin: " + error.message);
    updateLoading(100, "Gagal Masuk");
  } else {
    location.reload();
  }
}

// 6. Handle Response dari Google Login
async function handleCredentialResponse(response) {
  updateLoading(50, "Memverifikasi Token Google...");
  
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.credential,
  })

  if (error) {
    alert("Gagal Login Google: " + error.message);
    updateLoading(100, "Gagal Masuk");
  } else {
    updateLoading(100, "Login Berhasil!");
    location.reload(); 
  }
}

// 7. Cek Sesi User & Inisialisasi Halaman
async function initSystem() {
  updateLoading(30, "Mengecek Hak Akses...");
  
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    // JIKA SUDAH LOGIN: Hilangkan Overlay
    console.log("User Aktif:", session.user.email);
    document.getElementById('login-overlay').style.display = 'none';
    updateLoading(100, "Sistem Aktif");
    
    // Panggil fungsi map/tracking jika ada
    if (typeof initMap === "function") initMap();
    if (typeof startTracking === "function") startTracking();
    
  } else {
    // JIKA BELUM LOGIN: Siapkan Gerbang
    updateLoading(60, "Menyiapkan Gerbang Login...");
    document.getElementById('login-overlay').style.display = 'flex';

    // Cek apakah Google SDK sudah siap
    if (typeof google !== 'undefined' && google.accounts) {
      renderGoogleButton();
    } else {
      // Jika belum siap, tunggu 1 detik lalu coba lagi sekali
      console.warn("Google SDK belum siap, mencoba memuat ulang...");
      setTimeout(() => {
        if (typeof google !== 'undefined' && google.accounts) {
          renderGoogleButton();
        } else {
          console.error("SDK Google gagal dimuat.");
          updateLoading(100, "Gagal memuat Google SDK");
        }
      }, 1500);
    }
  }
}

// Fungsi bantu biar nggak nulis berulang
function renderGoogleButton() {
  google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleCredentialResponse
  });

  const googleBtnDiv = document.getElementById("google-login-btn");
  if (googleBtnDiv) {
    google.accounts.id.renderButton(
      googleBtnDiv,
      { theme: "outline", size: "large", width: "100%", text: "signin_with" }
    );
  }
  updateLoading(100, "Silakan Login");
}

// 8. Fungsi Logout
window.logoutSistem = async () => {
  const yakin = confirm("Yakin mau keluar sistem?");
  if (yakin) {
    await supabase.auth.signOut();
    location.reload();
  }
}

// Jalankan sistem saat load
initSystem();
