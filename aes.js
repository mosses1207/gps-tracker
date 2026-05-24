import CryptoJS from 'crypto-js'

export function decryptData(ciphertext) {
    const AES_SECRET = import.meta.env.VITE_AES_KEY;
    if (!AES_SECRET) {
        console.error("VITE_AES_KEY nggak ketemu di .env");
        return ciphertext;
    }
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, AES_SECRET);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);

        if (!originalText) {
            console.warn("⚠️ decryptData: hasil decrypt kosong");
            return null;
        }

        try {
            return JSON.parse(originalText);
        } catch {
            return originalText;
        }
    } catch (e) {
        console.error("Gagal Dekripsi:", e);
        return null;
    }
}

export function encryptData(data) {
    const AES_SECRET = import.meta.env.VITE_AES_KEY;
    if (!AES_SECRET) {
        console.error("VITE_AES_KEY nggak ketemu di .env");
        return data;
    }
    try {
        const stringData = typeof data === 'object' ? JSON.stringify(data) : String(data);
        return CryptoJS.AES.encrypt(stringData, AES_SECRET).toString();
    } catch (e) {
        console.error("Gagal Enkripsi:", e);
        return null;
    }
}