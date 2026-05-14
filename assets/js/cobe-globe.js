/* =====================================================================
   AIVA — Cobe globe wrapper (v3 — zoomable, hover, robust nav)
   • Drag to rotate · scroll/pinch to zoom · click to expand routes
   • Hover highlights the airport nearest the cursor (helps clicking)
   • Re-render safe when navigating between pages
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.CobeGlobe = (() => {

  let cobeMod = null;
  async function loadCobe() {
    if (cobeMod) return cobeMod;
    cobeMod = await import('https://cdn.jsdelivr.net/npm/cobe@0.6.3/+esm');
    return cobeMod;
  }

  const AI_RED   = [0.91, 0.10, 0.18];
  const AI_GOLD  = [0.95, 0.85, 0.45];
  const AI_BASE  = [0.20, 0.06, 0.08];
  const AI_GLOW  = [0.85, 0.10, 0.18];
  const AI_HUB   = [1.00, 0.78, 0.30];

  /* Track active instances so a nav-away can be cleaned up explicitly. */
  const ACTIVE = new Map();

  async function render(elId, opts = {}) {
    /* If a previous instance exists on this id, kill it first. */
    if (ACTIVE.has(elId)) { try { ACTIVE.get(elId).destroy(); } catch(_){} ACTIVE.delete(elId); }

    const cobe = await loadCobe();
    const createGlobe = cobe.default || cobe;
    const host = document.getElementById(elId);
    if (!host) return null;
    /* If the host element is detached (page changed), bail. */
    if (!document.body.contains(host)) return null;
    host.innerHTML = '';
    host.style.position = host.style.position || 'relative';

    /* Wrapper lets us CSS-zoom the canvas without recreating the globe. */
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute; inset:0; transform-origin:50% 50%; will-change:transform; transition:transform .12s ease-out;';
    host.appendChild(wrap);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%; height:100%; cursor:grab; touch-action:none; display:block;';
    wrap.appendChild(canvas);

    /* Hover label overlay */
    const hoverLabel = document.createElement('div');
    hoverLabel.style.cssText = 'position:absolute; pointer-events:none; padding:6px 10px; background:rgba(0,0,0,.78); border:1px solid rgba(255,225,89,.4); border-radius:8px; color:#FFE159; font: 11px/1.2 ui-monospace, monospace; transform:translate(-50%, calc(-100% - 8px)); display:none; white-space:nowrap; z-index:10;';
    host.appendChild(hoverLabel);

    /* Hint pill (only shown for a few seconds) */
    const hint = document.createElement('div');
    hint.textContent = 'Drag · Scroll to zoom · Click a pin';
    hint.style.cssText = 'position:absolute; bottom:10px; left:50%; transform:translateX(-50%); padding:5px 12px; background:rgba(0,0,0,.55); border:1px solid rgba(255,225,89,.3); border-radius:99px; color:rgba(255,225,89,.9); font: 10.5px ui-monospace, monospace; letter-spacing:.08em; pointer-events:none; opacity:1; transition:opacity .5s ease; z-index:5;';
    host.appendChild(hint);
    setTimeout(() => hint.style.opacity = '0', 6000);

    const W = host.clientWidth;
    const H = host.clientHeight || W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const meta = buildMarkers(opts);
    let markers = meta.markers;

    /* Interaction state */
    let phi = opts.startPhi ?? 4.5;
    let theta = opts.startTheta ?? 0.25;
    let userMoved = false;
    let autoSpinPaused = false;
    let pointerDown = null;
    let dragMoved = false;
    let zoom = 1.0;
    let hoverCode = null;

    let selectedCode = opts.selected || null;
    const onPick = typeof opts.onPick === 'function' ? opts.onPick : null;
    const showArcsFromSelected = opts.showArcsFromSelected !== false;

    let globe = null;
    let destroyed = false;
    function buildGlobe() {
      if (destroyed) return;
      if (globe) { try { globe.destroy(); } catch(_){} }
      const baseMarkers = markers.slice();
      if (selectedCode && showArcsFromSelected) {
        baseMarkers.push(...arcMarkersFrom(selectedCode));
        const sel = AIVA.airport(selectedCode);
        if (sel) baseMarkers.push({ location: [sel.lat, sel.lon], size: 0.12, color: AI_HUB });
      }
      /* Hover highlight — bigger gold ring on the nearest pin */
      if (hoverCode && hoverCode !== selectedCode) {
        const h = AIVA.airport(hoverCode);
        if (h) baseMarkers.push({ location: [h.lat, h.lon], size: 0.10, color: AI_GOLD });
      }
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: canvas.width,
        height: canvas.height,
        phi: 0,
        theta: 0.25,
        dark: 1,
        diffuse: 1.4,
        mapSamples: 16000,
        mapBrightness: 8,
        mapBaseBrightness: 0.05,
        baseColor: AI_BASE,
        markerColor: AI_RED,
        glowColor: AI_GLOW,
        markers: baseMarkers,
        onRender: (state) => {
          if (!userMoved && !autoSpinPaused) phi += 0.0018;
          state.phi = phi;
          state.theta = theta;
          state.width  = canvas.width;
          state.height = canvas.height;
        },
      });
    }
    buildGlobe();

    /* ---------- Hit testing (lat/lon → screen) ----------
       Matches cobe@0.6.3 internal coords exactly. From the source:
         x = cos(lat) * cos(lon)
         y = sin(lat)
         z = -cos(lat) * sin(lon)
       Then phi rotates around Y, theta rotates around X.                  */
    function project(lat, lon) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const r  = Math.min(canvas.width, canvas.height) * 0.46;
      const la = lat * Math.PI / 180;
      const lo = lon * Math.PI / 180;
      /* Pre-rotation cobe coords */
      let x = Math.cos(la) * Math.cos(lo);
      let y = Math.sin(la);
      let z = -Math.cos(la) * Math.sin(lo);
      /* Rotate around Y by phi (cobe rotates opposite our default).
         Verified empirically: with this sign, lon=L centers when phi=L+π/2. */
      const cP = Math.cos(phi), sP = Math.sin(phi);
      const x1 = x * cP - z * sP;
      const z1 = x * sP + z * cP;
      x = x1; z = z1;
      /* Rotate around X by theta */
      const cT = Math.cos(theta), sT = Math.sin(theta);
      const y2 = y * cT - z * sT;
      const z2 = y * sT + z * cT;
      y = y2; z = z2;
      return { sx: cx + x * r, sy: cy - y * r, frontFacing: z >= 0 };
    }
    function findNearest(px, py, maxPx = 24 * dpr) {
      let best = null, bestD = Infinity;
      for (const m of meta.codedMarkers) {
        const p = project(m.lat, m.lon);
        if (!p.frontFacing) continue;
        const d = Math.hypot(px - p.sx, py - p.sy);
        /* Hubs get a bigger hit radius */
        const tol = m.isHub ? maxPx * 1.6 : maxPx;
        if (d < tol && d < bestD) { bestD = d; best = m; }
      }
      return best;
    }

    /* ---------- Pointer interaction ---------- */
    canvas.addEventListener('pointerdown', (e) => {
      pointerDown = { x: e.clientX, y: e.clientY };
      dragMoved = false;
      userMoved = true;
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture?.(e.pointerId);
    });
    /* Cursor → canvas-internal pixel coords. Accounts for CSS zoom on the
       wrap element AND device pixel ratio. We sample the canvas's actual
       displayed bounding box, then scale to the canvas's internal pixel grid. */
    function clientToCanvas(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const px = (clientX - rect.left) * (canvas.width  / rect.width);
      const py = (clientY - rect.top)  * (canvas.height / rect.height);
      return { px, py };
    }

    canvas.addEventListener('pointermove', (e) => {
      const { px, py } = clientToCanvas(e.clientX, e.clientY);
      const rect = canvas.getBoundingClientRect();
      if (pointerDown) {
        const dx = e.clientX - pointerDown.x, dy = e.clientY - pointerDown.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
        phi += dx / 250;
        theta = Math.max(-0.6, Math.min(0.7, theta + dy / 800));
        pointerDown = { x: e.clientX, y: e.clientY };
        hoverLabel.style.display = 'none';
        return;
      }
      /* Not dragging — show hover label for nearest airport */
      const nearest = findNearest(px, py, 22 * dpr);
      const newCode = nearest?.code || null;
      if (newCode !== hoverCode) {
        hoverCode = newCode;
        buildGlobe();
      }
      if (nearest) {
        const a = AIVA.airport(nearest.code);
        hoverLabel.textContent = `${a.iata} · ${a.city}`;
        hoverLabel.style.left = (e.clientX - rect.left) + 'px';
        hoverLabel.style.top  = (e.clientY - rect.top)  + 'px';
        hoverLabel.style.display = 'block';
        canvas.style.cursor = 'pointer';
      } else {
        hoverLabel.style.display = 'none';
        canvas.style.cursor = 'grab';
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      const wasDown = pointerDown;
      pointerDown = null;
      canvas.style.cursor = 'grab';
      if (!wasDown || dragMoved) return;
      const { px, py } = clientToCanvas(e.clientX, e.clientY);
      const hit = findNearest(px, py, 30 * dpr);
      if (hit) {
        selectedCode = hit.code;
        hoverCode = null;
        hoverLabel.style.display = 'none';
        buildGlobe();
        if (onPick) onPick(hit.code);
      }
    });
    canvas.addEventListener('pointercancel', () => { pointerDown = null; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('pointerleave', () => { pointerDown = null; canvas.style.cursor = 'grab'; hoverLabel.style.display = 'none'; if (hoverCode) { hoverCode = null; buildGlobe(); } });

    /* ---------- Real zoom (CSS scale on wrapper) ---------- */
    function applyZoom() { wrap.style.transform = `scale(${zoom})`; }
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.085;
      zoom = Math.max(0.6, Math.min(3.5, zoom * factor));
      applyZoom();
      hint.style.opacity = '0';
    }, { passive: false });

    /* Pinch zoom for touch */
    let pinchStart = null;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        pinchStart = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: zoom };
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinchStart) {
        const [a, b] = e.touches;
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        zoom = Math.max(0.6, Math.min(3.5, pinchStart.z * (d / pinchStart.d)));
        applyZoom();
        e.preventDefault();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', () => { pinchStart = null; }, { passive: true });

    /* ---------- Resize ---------- */
    const ro = new ResizeObserver(() => {
      if (destroyed) return;
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      canvas.width = w * dpr; canvas.height = h * dpr;
      buildGlobe();
    });
    ro.observe(host);

    const handle = {
      get globe() { return globe; },
      destroy: () => {
        destroyed = true;
        try { globe?.destroy(); } catch(_){}
        try { ro.disconnect(); } catch(_){}
        ACTIVE.delete(elId);
      },
      pauseAutoSpin: () => { autoSpinPaused = true; },
      resumeAutoSpin: () => { autoSpinPaused = false; userMoved = false; },
      select: (code) => { selectedCode = code; buildGlobe(); },
      clearSelection: () => { selectedCode = null; zoom = 1; applyZoom(); buildGlobe(); },
      zoomIn:  () => { zoom = Math.min(3.5, zoom * 1.25); applyZoom(); },
      zoomOut: () => { zoom = Math.max(0.6, zoom / 1.25); applyZoom(); },
      resetView: () => { zoom = 1; phi = opts.startPhi ?? 4.5; theta = opts.startTheta ?? 0.25; userMoved = true; applyZoom(); buildGlobe(); },
      setMode: (mode, ac) => {
        /* Stay within the same host — rebuild data only */
        const newOpts = { ...opts, mode, ac };
        Object.assign(opts, newOpts);
        const m = buildMarkers(newOpts);
        markers = m.markers;
        meta.codedMarkers = m.codedMarkers;
        buildGlobe();
      },
    };
    ACTIVE.set(elId, handle);
    return handle;
  }

  /* ------------------------------------------------------------------ */
  function buildMarkers(opts) {
    const flown = opts.flown || [];
    const flownPairs = new Set(flown.map(f => `${f.from}-${f.to}`));
    let routes = AIVA.FLIGHTS;
    if (opts.mode === 'ai')    routes = routes.filter(f => f.op === 'AI');
    if (opts.mode === 'ix')    routes = routes.filter(f => f.op === 'IX');
    if (opts.mode === 'flown') routes = routes.filter(f => flownPairs.has(`${f.from}-${f.to}`));
    if (opts.ac && opts.ac.length) routes = routes.filter(f => opts.ac.includes(f.ac));

    const codes = new Set();
    routes.forEach(r => { codes.add(r.from); codes.add(r.to); });

    const markers = [];
    const codedMarkers = [];
    for (const c of codes) {
      const a = AIVA.airport(c);
      if (!a) continue;
      const isHub   = !!a.hub;
      const isFlown = flown.some(f => f.from === c || f.to === c);
      markers.push({
        location: [a.lat, a.lon],
        size: isHub ? 0.075 : 0.028,
        color: isFlown ? AI_GOLD : (isHub ? AI_HUB : AI_RED),
      });
      codedMarkers.push({ code: c, lat: a.lat, lon: a.lon, isHub });
    }
    return { markers, codedMarkers };
  }

  function arcPoints(la1, lo1, la2, lo2, n = 28) {
    const r = Math.PI / 180;
    la1 *= r; lo1 *= r; la2 *= r; lo2 *= r;
    const d = 2 * Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2));
    const pts = [];
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const A = Math.sin((1-f)*d) / Math.sin(d);
      const B = Math.sin(f*d)     / Math.sin(d);
      const x = A*Math.cos(la1)*Math.cos(lo1) + B*Math.cos(la2)*Math.cos(lo2);
      const y = A*Math.cos(la1)*Math.sin(lo1) + B*Math.cos(la2)*Math.sin(lo2);
      const z = A*Math.sin(la1)               + B*Math.sin(la2);
      pts.push([Math.atan2(z, Math.sqrt(x*x+y*y)) / r, Math.atan2(y, x) / r]);
    }
    return pts;
  }

  function arcMarkersFrom(code) {
    const out = [];
    const seenPair = new Set();
    for (const f of AIVA.FLIGHTS) {
      let from, to;
      if (f.from === code)      { from = f.from; to = f.to; }
      else if (f.to === code)   { from = f.to;   to = f.from; }
      else continue;
      const k = from + '|' + to;
      if (seenPair.has(k)) continue;
      seenPair.add(k);
      const a = AIVA.airport(from), b = AIVA.airport(to);
      if (!a || !b) continue;
      const pts = arcPoints(a.lat, a.lon, b.lat, b.lon, 26);
      for (const [la, lo] of pts) {
        out.push({ location: [la, lo], size: 0.012, color: AI_GOLD });
      }
    }
    return out;
  }

  return { render };
})();
