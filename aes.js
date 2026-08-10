import CryptoJS from 'crypto-js';
import { secret } from './auth.js';

export function decryptData(ciphertext) {
    if (!secret.key) {
        return ciphertext;
    }
    if (ciphertext === null || ciphertext === undefined || typeof ciphertext !== 'string') return ciphertext;
    if (!ciphertext.startsWith('U2Fsd')) return ciphertext;
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, secret.key);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        if (!originalText) return ciphertext;
        try {
            return JSON.parse(originalText);
        } catch {
            return originalText;
        }
    } catch (e) {
        return ciphertext;
    }
}

export function encryptData(data) {
    if (!secret.key) {
        return data;
    }
    try {
        const stringData = typeof data === 'object' ? JSON.stringify(data) : String(data);
        return CryptoJS.AES.encrypt(stringData, secret.key).toString();
    } catch (e) {
        return data;
    }
}