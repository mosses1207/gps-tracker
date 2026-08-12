import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    sourcemap: false,
    // Vite hanya membundel index.html secara bawaan. login.html harus
    // didaftarkan sendiri, kalau tidak halaman login hilang saat build.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
      },
    },
  },
});
