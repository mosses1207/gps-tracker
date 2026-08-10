export async function hasInternet() {
    if (!navigator.onLine) return false;
    try {
        await fetch('https://www.gstatic.com/generate_204', {
            method: 'GET',
            cache: 'no-store',
            mode: 'no-cors',
            signal: AbortSignal.timeout(5000)
        });
        return true;
    } catch {
        return false;
    }
}