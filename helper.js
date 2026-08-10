import { db } from "./db";
import { decryptData, encryptData } from "./aes";

/**
 * @param {string} tableName
 * @param {'decrypt' | 'encrypt'} action
 * @param {string|null} [idSeason]
 * @param {any} [dataPayload]
 */

export async function manageData(tableName, action, idSeason = null, dataPayload = null) {
    if (!db[tableName]) return [];
    if (action === 'encrypt' && dataPayload) {
        const dataToSave = dataPayload.map(item => {
            const processedItem = {};
            for (const [key, value] of Object.entries(item)) {
                if (['idseason', 'user_id', 'created_at', 'status', 'path_hist'].includes(key.toLowerCase())) {
                    processedItem[key] = value;
                } else {
                    processedItem[key] = encryptData(value);
                }
            }
            return processedItem;
        });
        await db[tableName].bulkPut(dataToSave);
        return dataToSave;
    }
    if (action === 'decrypt') {
        let data;
        if (Array.isArray(dataPayload)) {
            data = dataPayload;
        } 
        else if (dataPayload) {
            const item = await db[tableName].get(dataPayload);
            data = item ? [item] : [];
        } 
        else {
            data = idSeason 
                ? await db[tableName].where('idseason').equals(idSeason).toArray() 
                : await db[tableName].toArray();
        }
        return data.map(item => {
            const decryptedItem = {};
            for (const [key, value] of Object.entries(item)) {
                if (['idseason', 'user_id', 'created_at', 'status', 'path_hist'].includes(key.toLowerCase())) {
                    decryptedItem[key] = value;
                } else {
                    decryptedItem[key] = decryptData(value);
                }
            }
            return decryptedItem;
        });
    }
}
