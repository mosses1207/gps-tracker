export function logToScreen(...args) { // Pakai ...args biar bisa nerima banyak parameter (dipisah koma)
    const logContainer = document.getElementById('debug-log');
    if (!logContainer) return;
    
    const newLog = document.createElement('div');
    const time = new Date().toLocaleTimeString().split(' ')[0];
    
    // Proses semua argumen yang masuk
    const processedArgs = args.map(msg => {
        if (typeof msg === 'object' && msg !== null) {
            // Kalau object, ubah jadi string rapi
            return Object.entries(msg)
                .map(([key, val]) => `${key}: ${val}`)
                .join(' | ');
        }
        return msg; // Kalau teks/angka biasa, biarkan apa adanya
    });

    // Gabungkan semua argumen dengan spasi
    const tampilanTeks = processedArgs.join('   ');
    
    newLog.textContent = `[${time}] ${tampilanTeks}`;
    
    logContainer.appendChild(newLog);
    logContainer.scrollTop = logContainer.scrollHeight; // Auto scroll ke bawah
    
    if (logContainer.children.length > 20) {
        logContainer.removeChild(logContainer.firstChild);
    }
}



// ============================================================
// DEBUG PANEL
// ============================================================

/**
 * Tampilkan panel debug di pojok kanan atas berisi:
 * full canvas, split kiri/kanan, dan 6 region OCR.
 * Panel dapat ditutup manual via tombol CLOSE.
 */
export async function debugCaptureFullScanBox(result) {
    document.getElementById('debug-canvas-wrapper')?.remove();
    const wrapper = createDebugWrapper();
    wrapper.appendChild(createDebugTitle('DEBUG OCR CAPTURE', '#00ff88'));
    wrapper.appendChild(createDebugInfo(result));
    wrapper.appendChild(createDebugTitle('FULL CANVAS', '#00d9ff'));
    wrapper.appendChild(styleDebugCanvas(result.fullCanvas, 'cyan'));
    wrapper.appendChild(createDebugTitle('SPLIT CANVASES', '#ffe600', '15px'));
    wrapper.appendChild(createSplitSection(result.splitCanvases));
    wrapper.appendChild(createDebugTitle('6 OCR REGIONS', '#00ffff', '18px'));
    wrapper.appendChild(createSixRegionsGrid(result.sixRegions));
    wrapper.appendChild(createCloseButton(() => wrapper.remove()));
    document.body.appendChild(wrapper);
    console.log('=== DEBUG OCR ===', {
        orientation: result.orientation,
        fullCanvas: { width: result.fullCanvas.width, height: result.fullCanvas.height },
        splitCanvases: result.splitCanvases.map((c, i) => ({ index: i, width: c.width, height: c.height })),
        sixRegions: result.sixRegions.map(r => ({ id: r.id, width: r.canvas.width, height: r.canvas.height })),
    });
    return result;
}

// --- Sub-helpers untuk debug panel ---

function createDebugWrapper() {
    const el = document.createElement('div');
    el.id = 'debug-canvas-wrapper';
    Object.assign(el.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        width: '340px',
        maxHeight: '95vh',
        overflowY: 'auto',
        zIndex: '999999999',
        background: 'rgba(0,0,0,0.92)',
        border: '2px solid lime',
        borderRadius: '12px',
        padding: '12px',
        fontFamily: 'monospace',
        color: 'white',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 0 30px rgba(0,255,0,0.5)',
    });
    return el;
}

function createDebugTitle(text, color, marginTop = '0px') {
    const el = document.createElement('div');
    el.innerText = text;
    Object.assign(el.style, {
        fontSize: '15px',
        fontWeight: 'bold',
        marginTop,
        marginBottom: '8px',
        color,
    });
    return el;
}

function createDebugInfo(result) {
    const el = document.createElement('div');
    el.style.fontSize = '13px';
    el.style.lineHeight = '1.5';
    el.innerHTML = `
        <div>Orientation: <b>${result.orientation}</b></div>
        <div>Full Width : <b>${result.fullCanvas.width}px</b></div>
        <div>Full Height: <b>${result.fullCanvas.height}px</b></div>
        <hr style="margin:8px 0;border-color:#333;">
    `;
    return el;
}

function styleDebugCanvas(canvas, borderColor) {
    Object.assign(canvas.style, {
        width: '100%',
        border: `2px solid ${borderColor}`,
        borderRadius: '8px',
        background: '#111',
        imageRendering: 'pixelated',
    });
    return canvas;
}

function createSplitSection(splitCanvases) {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { display: 'flex', gap: '8px' });
    splitCanvases.forEach((canvas, index) => {
        const item = document.createElement('div');
        const label = document.createElement('div');
        const info = document.createElement('div');
        label.innerText = `PART ${index + 1}`;
        label.style.fontSize = '12px';
        info.innerHTML = `${canvas.width} x ${canvas.height}`;
        info.style.fontSize = '11px';
        info.style.color = '#aaa';
        Object.assign(item.style, { flex: '1', display: 'flex', flexDirection: 'column', gap: '4px' });
        styleDebugCanvas(canvas, 'yellow');
        item.append(label, canvas, info);
        wrapper.appendChild(item);
    });

    return wrapper;
}

function createSixRegionsGrid(sixRegions) {
    const grid = document.createElement('div');
    Object.assign(grid.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' });
    sixRegions.forEach(region => {
        const item = document.createElement('div');
        const label = document.createElement('div');
        const info = document.createElement('div');
        label.innerText = `R${region.id}`;
        label.style.fontSize = '11px';
        info.innerHTML = `${region.canvas.width} x ${region.canvas.height}`;
        info.style.fontSize = '10px';
        info.style.color = '#999';
        Object.assign(item.style, { display: 'flex', flexDirection: 'column', gap: '4px' });
        styleDebugCanvas(region.canvas, 'lime');
        item.append(label, region.canvas, info);
        grid.appendChild(item);
    });
    return grid;
}

function createCloseButton(onClick) {
    const btn = document.createElement('button');
    btn.innerText = 'CLOSE DEBUG';
    btn.onclick = onClick;
    Object.assign(btn.style, {
        marginTop: '15px',
        padding: '10px',
        border: 'none',
        borderRadius: '8px',
        background: '#ff0033',
        color: 'white',
        fontWeight: 'bold',
        cursor: 'pointer',
        width: '100%',
    });
    return btn;
}