// global.js
let map;             // Objek Leaflet
let userMarker;      // Marker lokasi supir
let worker;          // Objek Tesseract
let watchId = null;  // ID untuk GPS
let currentPos = { lat: 0, lng: 0 };
let isAutoCenter = true;
let isCameraActive = false;
let isFirstLocation = true;
let isLocked = false;
let isProcessing = false;
let lastAddressLat = 0;
let lastAddressLng = 0;
let msg = "";
let result;
let currentPolyline = null;
