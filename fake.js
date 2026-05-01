// --- FAKE GOOGLE SCRIPT RUN (MOCKUP) ---
const google = {
  script: {
    run: {
      withSuccessHandler: function(callback) {
        this.callback = callback;
        return this;
      },
      withFailureHandler: function(failCallback) {
        this.failCallback = failCallback;
        return this;
      },
      // Simulasi Fungsi Ambil Data Tabel
      getData: function() {
        console.log("Mock: Mengambil data...");
        setTimeout(() => {
          const fakeData = [
            ["SJKB-001", "Dealer Jakarta", "2026-04-30T10:00:00", "2026-04-30T11:00:00"],
            ["SJKB-002", "Dealer Bekasi", "2026-04-30T12:00:00", "-"]
          ];
          this.callback(fakeData);
        }, 1000);
      },
      // Simulasi Fungsi OCR
      ocrViaDrive: function(base64) {
        console.log("Mock: Menjalankan OCR...");
        setTimeout(() => {
          this.callback({
            no_sjkb: "SJKB-MOCK-123",
            tujuan: "DEALER TOYOTA CIBUBUR",
            lt: "45",
            confidence: "HIGH",
            rute_options: ["encoded_polyline_1", "encoded_polyline_2"]
          });
        }, 2000);
      },
      // Simulasi Fungsi Mulai Jalan
      mulaiRecordSheet: function(no, tujuan, lat, lng, rute) {
        console.log("Mock: Memulai perjalanan...");
        setTimeout(() => {
          this.callback("Berhasil Record di Server (Fake)");
        }, 1500);
      },
      // Simulasi Fungsi Sampai
      updateSampaiSheet: function(no, path, lat, lng, speed) {
        console.log("Mock: Menyimpan data sampai...");
        setTimeout(() => {
          this.callback();
        }, 1500);
      }
    }
  }
};

///////////////////////////////////////////////

