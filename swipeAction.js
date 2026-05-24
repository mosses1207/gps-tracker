export function pasangSwipe(handleId, trackId, aksiSukses) {
    const handle = document.getElementById(handleId);
    const track = document.getElementById(trackId);
    if (!handle || !track) {
        console.error(`[SWIPE ERROR] Elemen ${handleId} atau ${trackId} tidak ditemukan di HTML!`);
        return;
    }
    let dragging = false;
    let awalX = 0;
    const mulaiGeser = (e) => {
        dragging = true;
        awalX = (e.type === "touchstart") ? e.touches[0].clientX : e.clientX;
        handle.style.transition = "none";
    };
    const prosesGeser = (e) => {
        if (!dragging) return;       
        const batasMaks = track.clientWidth - handle.clientWidth - 8;
        const skrgX = (e.type === "touchmove") ? e.touches[0].clientX : e.clientX;     
        let jarak = skrgX - awalX;
        if (jarak < 4) jarak = 4;
        if (jarak > batasMaks) jarak = batasMaks;
        handle.style.left = jarak + "px";
        if (jarak >= batasMaks * 0.95) {
            dragging = false;
            handle.style.transition = "left 0.15s ease-out";
            handle.style.left = batasMaks + "px";
            setTimeout(() => {
                handle.style.transition = "none";
                handle.style.left = "4px";
            }, 200);
            aksiSukses(); 
        }
    };
    const lepasGeser = () => {
        if (!dragging) return;
        dragging = false;
        handle.style.transition = "left 0.25s ease-out";
        handle.style.left = "4px";
    };
    handle.addEventListener("touchstart", mulaiGeser, { passive: true });
    window.addEventListener("touchmove", prosesGeser, { passive: true });
    window.addEventListener("touchend", lepasGeser);
    handle.addEventListener("mousedown", mulaiGeser);
    window.addEventListener("mousemove", prosesGeser);
    window.addEventListener("mouseup", lepasGeser);
}