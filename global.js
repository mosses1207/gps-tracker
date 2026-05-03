window.map = null;
window.userMarker = null;
window.worker = null;
window.watchId = null;
window.currentPos = { lat: 0, lng: 0 };
window.isAutoCenter = true;
window.isCameraActive = false;
window.isFirstLocation = true;
window.isLocked = false;
window.isProcessing = false;
window.lastAddressLat = 0;
window.lastAddressLng = 0;
window.msg = "";
window.result = null;
window.currentPolyline = null;
window.startMarker = null;
window.endMarker = null;


window.logKeLayar = function(msg) {
    const logDiv = document.getElementById('debug-log');
    if (!logDiv) return;
    const entry = document.createElement('div');
    const waktu = new Date().toLocaleTimeString('id-ID', { hour12: false });
    entry.innerText = `> [${waktu}] ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}
