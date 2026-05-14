/* =====================================================================
   AIR INDIA VIRTUAL — Globe renderer
   Canvas-based orthographic globe (no Mapbox dependency, no token).
   Draws coastlines (low-detail GeoJSON inline), airports, and animated
   great-circle arcs between AI/IX route endpoints.
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.Globe = (() => {

  /* Low-res world coastline polygon set — public domain Natural Earth subset
     simplified to ~30 polygons. Coords are [lon, lat] pairs. */
  const LAND = [
    // Africa
    [[-17,21],[-16,15],[-12,12],[-5,4],[8,4],[10,2],[14,-4],[12,-9],[15,-15],[18,-22],[20,-28],[26,-34],[32,-29],[34,-19],[36,-9],[40,-3],[42,1],[51,10],[44,12],[36,18],[34,28],[27,33],[24,32],[15,31],[10,33],[2,34],[-9,30],[-12,28],[-15,25],[-17,21]],
    // Asia (rough)
    [[26,40],[35,40],[40,38],[44,40],[47,42],[55,40],[60,33],[68,38],[76,35],[80,33],[82,30],[80,27],[78,22],[74,18],[72,21],[70,15],[76,8],[80,6],[85,8],[88,15],[92,18],[95,12],[100,5],[104,1],[110,4],[112,10],[110,18],[115,22],[118,28],[122,34],[127,38],[130,42],[135,47],[140,52],[145,57],[150,60],[160,65],[170,67],[175,68],[180,68],[170,72],[155,73],[140,72],[125,72],[110,72],[95,72],[80,72],[65,68],[55,67],[45,66],[35,65],[28,60],[24,55],[26,50],[26,45],[26,40]],
    // Europe (rough)
    [[-10,36],[-9,42],[-9,50],[-5,55],[-2,58],[2,58],[6,58],[10,58],[10,54],[12,52],[14,50],[18,50],[22,52],[26,52],[28,55],[30,58],[30,62],[26,65],[22,68],[18,68],[14,66],[10,64],[6,62],[2,60],[-1,55],[-3,50],[-1,46],[2,44],[5,43],[10,44],[12,46],[10,38],[4,37],[-5,36],[-10,36]],
    // North America
    [[-168,65],[-160,70],[-150,71],[-140,69],[-130,69],[-125,60],[-130,55],[-128,50],[-124,48],[-122,38],[-118,33],[-115,30],[-110,27],[-102,25],[-95,28],[-90,29],[-85,30],[-80,25],[-80,32],[-77,35],[-75,40],[-72,42],[-68,45],[-65,48],[-60,55],[-55,55],[-52,52],[-58,50],[-64,49],[-70,52],[-78,55],[-88,58],[-95,60],[-105,65],[-115,68],[-125,70],[-135,70],[-145,69],[-155,68],[-165,67],[-168,65]],
    // South America
    [[-80,12],[-72,12],[-65,9],[-60,5],[-55,3],[-50,-2],[-48,-10],[-45,-15],[-42,-22],[-44,-27],[-48,-32],[-52,-36],[-58,-38],[-64,-42],[-68,-50],[-70,-54],[-72,-52],[-71,-45],[-73,-40],[-75,-35],[-72,-30],[-71,-22],[-71,-15],[-78,-10],[-80,-5],[-80,2],[-80,12]],
    // Australia
    [[114,-22],[115,-32],[120,-34],[129,-32],[135,-33],[140,-37],[145,-38],[150,-38],[152,-32],[153,-28],[150,-23],[145,-17],[140,-15],[135,-13],[130,-11],[125,-13],[120,-18],[114,-22]],
    // India (more detail)
    [[68,24],[70,21],[71,17],[73,15],[76,9],[78,8],[80,7],[82,9],[85,12],[88,15],[88,18],[91,22],[93,24],[94,28],[91,29],[88,28],[85,27],[81,30],[78,32],[74,33],[72,31],[68,27],[68,24]],
  ];

  /* Major coastline lines for additional detail (lat/lon polylines) */
  const COASTLINES = [
    // Indian subcontinent west
    [[24,68],[22,68],[20,72],[18,73],[14,74],[10,76],[8,77],[10,79],[13,80],[16,82],[19,85],[20,86],[22,88],[24,89],[27,89],[29,87]],
  ];

  function projectOrtho(lat, lon, cLat, cLon, R, cx, cy) {
    const φ1 = cLat * Math.PI / 180, λ0 = cLon * Math.PI / 180;
    const φ  = lat  * Math.PI / 180, λ  = lon  * Math.PI / 180;
    const cosC = Math.sin(φ1) * Math.sin(φ) + Math.cos(φ1) * Math.cos(φ) * Math.cos(λ - λ0);
    if (cosC < 0) return null; // back of globe
    const x = R * Math.cos(φ) * Math.sin(λ - λ0);
    const y = R * (Math.cos(φ1) * Math.sin(φ) - Math.sin(φ1) * Math.cos(φ) * Math.cos(λ - λ0));
    return [cx + x, cy - y];
  }

  function clear(ctx, W, H) {
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars(ctx, W, H) {
    ctx.fillStyle = 'rgba(245,240,232,.5)';
    for (let i = 0; i < 240; i++) {
      const x = (i * 137.5) % W;
      const y = (i * 89.7) % H;
      const r = (i % 7) === 0 ? 1.4 : 0.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawSphere(ctx, cx, cy, R) {
    // ocean
    const g = ctx.createRadialGradient(cx - R/3, cy - R/3, R/4, cx, cy, R);
    g.addColorStop(0, '#162028');
    g.addColorStop(.55, '#0A1218');
    g.addColorStop(1, '#02050a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
    // atmosphere
    ctx.strokeStyle = 'rgba(201,166,104,.18)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.shadowBlur = 14; ctx.shadowColor = 'rgba(201,166,104,.25)';
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawGraticule(ctx, cLat, cLon, R, cx, cy) {
    ctx.strokeStyle = 'rgba(201,166,104,.08)';
    ctx.lineWidth = .6;
    for (let lat = -80; lat <= 80; lat += 20) {
      ctx.beginPath(); let first = true;
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = projectOrtho(lat, lon, cLat, cLon, R, cx, cy);
        if (!p) { first = true; continue; }
        if (first) { ctx.moveTo(...p); first = false; } else ctx.lineTo(...p);
      }
      ctx.stroke();
    }
    for (let lon = -180; lon <= 180; lon += 20) {
      ctx.beginPath(); let first = true;
      for (let lat = -85; lat <= 85; lat += 4) {
        const p = projectOrtho(lat, lon, cLat, cLon, R, cx, cy);
        if (!p) { first = true; continue; }
        if (first) { ctx.moveTo(...p); first = false; } else ctx.lineTo(...p);
      }
      ctx.stroke();
    }
  }

  function drawLand(ctx, cLat, cLon, R, cx, cy) {
    ctx.fillStyle = 'rgba(60,42,28,.85)';
    ctx.strokeStyle = 'rgba(201,166,104,.32)';
    ctx.lineWidth = .7;
    LAND.forEach(poly => {
      ctx.beginPath(); let first = true; let any = false;
      poly.forEach(([lon, lat]) => {
        const p = projectOrtho(lat, lon, cLat, cLon, R, cx, cy);
        if (!p) { first = true; return; }
        any = true;
        if (first) { ctx.moveTo(...p); first = false; } else ctx.lineTo(...p);
      });
      if (any) { ctx.closePath(); ctx.fill(); ctx.stroke(); }
    });
  }

  function drawArc(ctx, lat1, lon1, lat2, lon2, cLat, cLon, R, cx, cy, color, opts = {}) {
    const pts = AIVA.U.greatCircle(lat1, lon1, lat2, lon2, 96);
    ctx.beginPath();
    let started = false;
    pts.forEach(([la, lo]) => {
      const p = projectOrtho(la, lo, cLat, cLon, R, cx, cy);
      if (!p) { started = false; return; }
      if (!started) { ctx.moveTo(...p); started = true; } else ctx.lineTo(...p);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = opts.width || 1.3;
    if (opts.glow) {
      ctx.shadowBlur = 10; ctx.shadowColor = color;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawAirport(ctx, lat, lon, cLat, cLon, R, cx, cy, lbl) {
    const p = projectOrtho(lat, lon, cLat, cLon, R, cx, cy);
    if (!p) return;
    ctx.fillStyle = '#E4C988';
    ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(201,166,104,.4)';
    ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI*2); ctx.fill();
    if (lbl) {
      ctx.fillStyle = '#F5F0E8';
      ctx.font = '10.5px JetBrains Mono, monospace';
      ctx.fillText(lbl, p[0] + 8, p[1] - 4);
    }
  }

  function render(hostId, opts = {}) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    const dpr = window.devicePixelRatio || 1;
    const W = host.clientWidth;
    const H = host.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.style.display = 'block';
    canvas.style.cursor = 'grab';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    let cLat = 22, cLon = 78;
    const R = Math.min(W, H) * 0.42;
    const cx = W / 2, cy = H / 2;

    let arcPhase = 0;
    let dragging = false, lastX, lastY;

    const flights = filterFlights(opts.mode, opts.flown);
    const flownSet = new Set((opts.flown || []).map(f => `${f.from}-${f.to}`));

    function draw() {
      clear(ctx, W, H);
      drawStars(ctx, W, H);
      drawSphere(ctx, cx, cy, R);
      drawGraticule(ctx, cLat, cLon, R, cx, cy);
      drawLand(ctx, cLat, cLon, R, cx, cy);

      // routes
      flights.forEach(f => {
        const a = AIVA.airport(f.from), b = AIVA.airport(f.to);
        if (!a || !b) return;
        const isFlown = flownSet.has(`${f.from}-${f.to}`);
        let color = f.op === 'AI' ? 'rgba(197,16,46,.45)' : 'rgba(110,45,92,.45)';
        if (isFlown) color = 'rgba(228,201,136,.92)';
        drawArc(ctx, a.lat, a.lon, b.lat, b.lon, cLat, cLon, R, cx, cy, color, { width: isFlown ? 1.6 : 1, glow: isFlown });
      });

      // airports — unique set
      const aps = new Set();
      flights.forEach(f => { aps.add(f.from); aps.add(f.to); });
      [...aps].forEach(code => {
        const a = AIVA.airport(code);
        if (!a) return;
        drawAirport(ctx, a.lat, a.lon, cLat, cLon, R, cx, cy, a.iata);
      });

      // animated dot on a featured route
      const feat = flights[Math.floor(arcPhase * 0.001) % flights.length] || flights[0];
      if (feat) {
        const a = AIVA.airport(feat.from), b = AIVA.airport(feat.to);
        if (a && b) {
          const pts = AIVA.U.greatCircle(a.lat, a.lon, b.lat, b.lon, 80);
          const idx = Math.floor((arcPhase % 1) * pts.length);
          const [la, lo] = pts[idx];
          const p = projectOrtho(la, lo, cLat, cLon, R, cx, cy);
          if (p) {
            ctx.fillStyle = '#E6243F';
            ctx.shadowBlur = 12; ctx.shadowColor = '#E6243F';
            ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      // legend
      ctx.fillStyle = 'rgba(245,240,232,.85)';
      ctx.font = '11px JetBrains Mono, monospace';
      const legX = 20, legY = H - 90;
      ctx.fillText('LEGEND', legX, legY);
      ctx.fillStyle = '#C8102E';
      ctx.fillRect(legX, legY + 12, 10, 2);
      ctx.fillStyle = 'rgba(245,240,232,.7)'; ctx.fillText('Air India route', legX + 16, legY + 16);
      ctx.fillStyle = '#6E2D5C'; ctx.fillRect(legX, legY + 28, 10, 2);
      ctx.fillStyle = 'rgba(245,240,232,.7)'; ctx.fillText('AI Express', legX + 16, legY + 32);
      ctx.fillStyle = '#E4C988'; ctx.fillRect(legX, legY + 44, 10, 2);
      ctx.fillStyle = 'rgba(245,240,232,.7)'; ctx.fillText('Flown route', legX + 16, legY + 48);

      // header
      ctx.fillStyle = 'rgba(245,240,232,.6)';
      ctx.font = '10.5px JetBrains Mono, monospace';
      ctx.fillText(`MODE: ${(opts.mode || 'ALL').toUpperCase()}  ·  ${flights.length} ROUTES`, 20, 24);
      ctx.fillText('DRAG TO ROTATE  ·  SCROLL TO ZOOM', 20, 40);
    }

    let scale = 1;
    function loop() {
      arcPhase += .002;
      draw();
      requestAnimationFrame(loop);
    }
    loop();

    canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing'; });
    window.addEventListener('mouseup', () => { dragging = false; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      cLon -= dx * .35; cLat = Math.max(-85, Math.min(85, cLat + dy * .35));
      lastX = e.clientX; lastY = e.clientY;
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      scale *= e.deltaY < 0 ? 1.05 : 0.95;
      scale = Math.max(.6, Math.min(2.4, scale));
    }, { passive:false });
  }

  function filterFlights(mode, flown) {
    if (mode === 'flown' && flown?.length) {
      const set = new Set(flown.map(f => `${f.from}-${f.to}`));
      return AIVA.FLIGHTS.filter(f => set.has(`${f.from}-${f.to}`));
    }
    if (mode === 'ai') return AIVA.FLIGHTS.filter(f => f.op === 'AI');
    if (mode === 'ix') return AIVA.FLIGHTS.filter(f => f.op === 'IX');
    return AIVA.FLIGHTS;
  }

  return { render };
})();
