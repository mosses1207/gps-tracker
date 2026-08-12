import { signInWithEmail, getCurrentUser } from './lib/supabase.js';

const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  setLoading(loginBtn, true);
  loginError.textContent = '';

  const { error } = await signInWithEmail(email, password);

  setLoading(loginBtn, false);

  if (error) {
    loginError.textContent = getErrorMessage(error.message);
  } else {
    window.location.href = '/index.html';
  }
});

// Sudah masuk: langsung ke dashboard.
(async function checkAuth() {
  const { user, error } = await getCurrentUser();
  if (user && !error) window.location.href = '/index.html';
})();

function setLoading(btn, isLoading) {
  btn.classList.toggle('loading', isLoading);
  btn.disabled = isLoading;
}

function getErrorMessage(message) {
  const map = {
    'Invalid login credentials': 'Email atau password salah',
    'Email not confirmed': 'Akun belum dikonfirmasi. Hubungi administrator.',
    'Unable to validate email address: invalid format': 'Format email tidak valid',
  };
  return map[message] || message;
}
