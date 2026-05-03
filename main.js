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

// Fungsi Update Loading
function updateLoading(percent, text) {
  if (loadProgress) loadProgress.innerText = `${text} (${percent}%)`;
  if (percent >= 100) {
    setTimeout(() => {
      if (loaderSatpam) loaderSatpam.style.display = 'none';
    }, 800);
  }
}

// 4. Handle Response dari Google
async function handleCredentialResponse(response) {
  updateLoading(50, "Memverifikasi Token Google...");
  
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.credential,
  })

  if (error) {
    alert("Gagal Login: " + error.message);
    updateLoading(0, "Gagal Masuk");
  } else {
    updateLoading(100, "Login Berhasil! Memuat Dashboard...");
    location.reload(); 
  }
}

// 5. Cek Sesi User & Pasang Tombol
async function initSystem() {
  updateLoading(30, "Mengecek Hak Akses...");
  
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    // JIKA SUDAH LOGIN
    console.log("User Aktif:", session.user.email);
    document.getElementById('login-overlay').style.display = 'none';
    updateLoading(100, "Sistem Aktif");
    
    // Panggil fungsi inisialisasi dari file lain (mapgps.js, dll)
    if (typeof initMap === "function") initMap();
    if (typeof startTracking === "function") startTracking();
    
  } else {
    // JIKA BELUM LOGIN
    updateLoading(60, "Menyiapkan Gerbang Login...");
    
    // Munculkan Overlay Login
    document.getElementById('login-overlay').style.display = 'flex';

    // Inisialisasi Google One Tap / Button
    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleCredentialResponse
    });

    // Gambar Tombol Google di dalem .login-card
    const loginCard = document.querySelector('.login-card');
    if (loginCard) {
      // Hapus isian username/password manual (karena kita pakai Google)
      const inputManual = loginCard.querySelectorAll('input');
      inputManual.forEach(el => el.style.display = 'none');
      
      const btnDiv = document.createElement('div');
      btnDiv.id = "google-login-btn";
      btnDiv.style.marginTop = "20px";
      loginCard.appendChild(btnDiv);

      google.accounts.id.renderButton(
        document.getElementById("google-login-btn"),
        { theme: "outline", size: "large", width: "100%", text: "signin_with" }
      );
    }
    
    updateLoading(100, "Silakan Login");
  }
}

// 6. Fungsi Logout (Bisa dipanggil dari mana saja)
window.logoutSistem = async () => {
  const yakin = confirm("Yakin mau keluar sistem?");
  if (yakin) {
    await supabase.auth.signOut();
    location.reload();
  }
}

// Jalankan Satpam!
initSystem();
