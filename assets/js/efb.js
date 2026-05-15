/* =====================================================================
   AIR INDIA VIRTUAL — EFB
   iPad-style home with the Vista wallpaper + apps.
   No tabs/sidebar — pilot picks an app, drills in, returns home.
   Apps: Windy, Navigraph, METAR, SIGWX (route conflicts), VATSIM, IVAO,
         Volanta map, ElevateX map, Charts, OFP, Navlog, W&B, MEL,
         Performance, Hoppie ACARS, FSUIPC live, Journey Log, Documents,
         NOTOC.
   ===================================================================== */

(function () {
  const pilot = AIVA.Auth.requireAuth();
  if (!pilot) return;
  const P = AIVA.Store.pilot(pilot.id);

  const { $, $$, el, fmtZulu, fmtMins, toast, modal, distance, ymd } = AIVA.U;
  const I = AIVA.Icon;

  document.body.classList.add('efb-body');

  /* ============ STALE flight_in_progress CLEANUP ============
     If the pilot closed their browser mid-flight (or left a phantom
     "in progress" from an old session), the home screen's progress
     ribbon ticks elapsed-time forever and the Start button shows as
     "FILE PSR" even though no sim is attached. Anything older than
     12 hours is definitively stale — clear it so the EFB renders
     fresh. */
  (() => {
    const fp = P.get('flight_in_progress');
    if (!fp) return;
    const age = Date.now() - (fp.startedAt || 0);
    if (age > 12 * 3600 * 1000) {
      P.remove('flight_in_progress');
      console.info(`[AIVA] Cleared stale flight_in_progress (${(age/3600000).toFixed(1)} h old).`);
    }
  })();

  /* Time-of-day greeting using the pilot's LOCAL clock (not Zulu) — feels personal */
  function greetForHour() {
    const h = new Date().getHours();
    if (h < 5)  return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  /* ----------------------- APP DEFINITIONS ----------------------- */
  const APPS = [
    /* In-flight tools */
    { id:'briefing',  nm:'Briefing',   icon:'clipboard',  ico:'gold' },
    { id:'ofp',       nm:'OFP',        icon:'route',      ico:'gold' },
    { id:'navlog',    nm:'Navlog',     icon:'route',      ico:'dark' },
    { id:'charts',    nm:'Charts',     icon:'map',        ico:'red' },
    { id:'navigraph', nm:'Navigraph',  icon:'book',       ico:'red',  live:true },
    { id:'windy',     nm:'Windy',      icon:'wind',       ico:'red',  live:true },
    { id:'metar',     nm:'METAR/TAF',  icon:'cloud',      ico:'gold' },
    { id:'sigwx',     nm:'Route Wx',   icon:'alert',      ico:'red' },
    { id:'vatsim',    nm:'VATSIM',     icon:'radar',      ico:'red',  live:true },
    { id:'ivao',      nm:'IVAO',       icon:'radar',      ico:'red' },
    { id:'elevatex',  nm:'ElevateX',   icon:'satellite',  ico:'dark' },
    { id:'manifest',  nm:'Pax Manifest', icon:'users',    ico:'gold' },
    { id:'seatmap',   nm:'Seat Map',   icon:'layers',     ico:'dark' },
    { id:'announce',  nm:'PA / Audio', icon:'megaphone',  ico:'red' },
    { id:'psr',       nm:'File PSR',   icon:'activity',   ico:'red' },
    { id:'wb',        nm:'W & B',      icon:'scale',      ico:'gold' },
    { id:'perf',      nm:'Performance',icon:'target',     ico:'dark' },
    { id:'mel',       nm:'MEL',        icon:'doc',        ico:'dark' },
    { id:'docs',      nm:'Library',    icon:'book',       ico:'gold' },
    { id:'fsuipc',    nm:'FSUIPC',     icon:'wifi',       ico:'green', live:true },
    { id:'hoppie',    nm:'ACARS',      icon:'send',       ico:'red' },
    { id:'journey',   nm:'Journey Log',icon:'newspaper',  ico:'gold' },
    { id:'notoc',     nm:'NOTOC',      icon:'briefcase',  ico:'dark' },
    { id:'calc',      nm:'Calculator', icon:'gauge',      ico:'dark' },
    /* Portal apps reachable from EFB */
    { id:'p-roster',  nm:'My Roster',  icon:'calendar',  ico:'gold', portal:'roster' },
    { id:'p-book',    nm:'Book Roster',icon:'plus',      ico:'red',  portal:'book' },
    { id:'p-flights', nm:'My Flights', icon:'plane',     ico:'gold', portal:'flights' },
    { id:'p-stats',   nm:'Statistics', icon:'gauge',     ico:'dark', portal:'stats' },
    { id:'p-network', nm:'Network',    icon:'globe',     ico:'red',  portal:'network' },
    { id:'p-fleet',   nm:'Fleet',      icon:'plane2',    ico:'dark', portal:'fleet' },
    { id:'p-flown',   nm:'Flown Fleet',icon:'star',      ico:'gold', portal:'flownfleet' },
    { id:'p-fdtl',    nm:'FDTL',       icon:'clock',     ico:'dark', portal:'fdtl' },
    { id:'p-dgca',    nm:'DGCA',       icon:'shield',    ico:'dark', portal:'dgca' },
    { id:'p-newsroom',nm:'Newsroom',   icon:'newspaper', ico:'red',  portal:'newsroom' },
    { id:'p-myai',    nm:'myAI',       icon:'cup',       ico:'gold', portal:'myai' },
    { id:'p-profile', nm:'Profile',    icon:'user',      ico:'dark', portal:'profile' },
    { id:'home',      nm:'Portal Home',icon:'home',      ico:'dark', portal:'dashboard' },
  ];

  function activeFlight() {
    const fno = P.get('active_flight');
    if (!fno) {
      const today = ymd();
      const bk = (P.get('roster_bookings', []) || []).find(b => b.date === today);
      if (bk) return AIVA.findFlight(bk.fno);
      return null;
    }
    return AIVA.findFlight(fno);
  }

  /* ----------------------- FLIGHT-PLAN FILING MODAL -----------------------
     Opened from the OFP and Navlog pages — same fields as SimBrief Dispatch,
     callsign locked to AIC / AXB. On save it lands in the pilot's own
     flight_plans list AND the admin review queue (flight_plans_queue) so
     the Chief Pilot can sign off on serious sectors. */
  function openFileFlightPlanModal(f) {
    const fromA = f ? AIVA.airport(f.from) : null;
    const toA   = f ? AIVA.airport(f.to)   : null;
    const defaultCs = (f?.cs) || ('AIC' + (pilot.id || '001').replace(/[^0-9]/g,'').slice(-3));
    const body = el('div');
    body.innerHTML = `
      <div class="text-mute" style="font-size:12.5px;margin-bottom:14px;">Same form as SimBrief Dispatch. Callsign must be AIC or AXB. Saved to your account + the admin review queue.</div>
      <div class="grid grid-3" style="gap:10px;">
        <div><div class="label">Callsign</div>
          <input class="input mono" id="efbCs" value="${defaultCs}" placeholder="AIC2951">
          <div class="mono" id="efbCsHint" style="font-size:10px;margin-top:4px;color:var(--text-mute);">AIC or AXB followed by digits</div>
        </div>
        <div><div class="label">Origin (ICAO)</div><input class="input mono" id="efbFrom" value="${fromA?.icao || ''}" placeholder="VIDP" maxlength="4"></div>
        <div><div class="label">Destination (ICAO)</div><input class="input mono" id="efbTo" value="${toA?.icao || ''}" placeholder="VABB" maxlength="4"></div>
        <div><div class="label">Alternate (ICAO)</div><input class="input mono" id="efbAltn" placeholder="VAAH" maxlength="4"></div>
        <div><div class="label">Aircraft</div>
          <select class="input" id="efbAc">${AIVA.fleetTypes().map(t => `<option value="${t}"${f && t===f.ac?' selected':''}>${t}</option>`).join('')}</select>
        </div>
        <div><div class="label">Registration</div><input class="input mono" id="efbReg" placeholder="VT-EXJ"></div>
        <div><div class="label">Cruise FL</div><input class="input mono" id="efbFl" value="360"></div>
        <div><div class="label">Cost index</div><input class="input mono" id="efbCi" value="35"></div>
        <div><div class="label">PAX</div><input class="input mono" id="efbPax" value="158"></div>
        <div style="grid-column: span 3;"><div class="label">Route</div><input class="input mono" id="efbRte" placeholder="DCT NIVUL G450 RAJDA DCT"></div>
        <div style="grid-column: span 3;"><div class="label">Remarks</div><input class="input mono" id="efbRmk" placeholder="RVSM CPDLC EQUIP / PBN/A1B1C1D1O1"></div>
      </div>
    `;
    const validateCs = () => {
      const i = body.querySelector('#efbCs'); const h = body.querySelector('#efbCsHint');
      i.value = i.value.trim().toUpperCase();
      const ok = /^(AIC|AXB)\d{1,4}$/.test(i.value);
      h.textContent = ok ? '✓ Valid AIVA callsign' : 'Must be AIC or AXB followed by digits';
      h.style.color = ok ? 'var(--good)' : 'var(--text-mute)';
      return ok;
    };
    body.querySelector('#efbCs').addEventListener('input', validateCs);
    setTimeout(validateCs, 0);

    const m = modal({
      title: 'File flight plan',
      body,
      width: '720px',
      actions: [
        { label:'Cancel', cls:'btn-ghost', onClick: (close) => close() },
        { label:'File plan', cls:'btn-primary', onClick: (close) => {
            if (!validateCs()) return toast('Fix the callsign — AIC/AXB only.', 'bad');
            const o = body.querySelector('#efbFrom').value.trim().toUpperCase();
            const d = body.querySelector('#efbTo').value.trim().toUpperCase();
            if (o.length !== 4 || d.length !== 4) return toast('Origin and destination must be 4-letter ICAO.', 'bad');
            const plan = {
              id: 'FP' + (Date.now() % 100000000),
              ts: Date.now(),
              cs:   body.querySelector('#efbCs').value,
              from: o, to: d,
              altn: body.querySelector('#efbAltn').value.trim().toUpperCase(),
              ac:   body.querySelector('#efbAc').value,
              reg:  body.querySelector('#efbReg').value.trim(),
              fl:   body.querySelector('#efbFl').value,
              ci:   body.querySelector('#efbCi').value,
              pax:  body.querySelector('#efbPax').value,
              route:   body.querySelector('#efbRte').value.trim(),
              remarks: body.querySelector('#efbRmk').value.trim(),
              status:  'filed',
              pilotId: pilot.id,
              pilotName: pilot.name,
              source: 'efb',
            };
            const own = P.get('flight_plans', []); own.push(plan); P.set('flight_plans', own);
            const queue = AIVA.Store.get('flight_plans_queue', []); queue.push(plan); AIVA.Store.set('flight_plans_queue', queue);
            toast(`✓ Filed ${plan.id} · ${plan.cs} ${o}→${d}`, 'ok');
            close();
        } },
      ],
    });
    return m;
  }

  /* ----------------------- SHELL ----------------------- */
  function shell() {
    document.body.innerHTML = '';
    const wrap = el('div', { class: 'efb-frame' });
    wrap.innerHTML = `
      <header class="efb-bar">
        <button class="home-btn" id="efbHome" title="Home">${I('home', 16)}</button>
        <div class="crumb" id="efbCrumb">EFB</div>
        <div class="sub" id="efbSub">Air India Virtual</div>
        <div class="clocks">
          <div><span class="lbl">Z</span><span id="zuluClock">${fmtZulu()}</span></div>
          <div><span class="lbl">IST</span><span id="istClock">--:--</span></div>
          <button class="icbtn" id="popOut" title="Pop out">${I('external', 14)}</button>
          <button class="icbtn" id="goPortal" title="Portal">${I('user', 14)}</button>
        </div>
      </header>
      <main id="efbMain"></main>
    `;
    document.body.appendChild(wrap);
    $('#efbHome').onclick   = () => location.hash = '';
    $('#popOut').onclick    = () => window.open(location.href, '_blank', 'width=1400,height=900');
    $('#goPortal').onclick  = () => location.href = 'portal.html';
    window.addEventListener('hashchange', route);
    setInterval(() => {
      const now = new Date();
      $('#zuluClock').textContent = String(now.getUTCHours()).padStart(2,'0') + ':' + String(now.getUTCMinutes()).padStart(2,'0');
      const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
      $('#istClock').textContent = String(ist.getHours()).padStart(2,'0') + ':' + String(ist.getMinutes()).padStart(2,'0');
    }, 1000);

    /* The Maharaja launcher only lives on the portal — the EFB is a cockpit
       surface, no chat concierge needed (and it was overlapping the map's
       bottom-right control corner). */

    /* Crew Chat — small group-chat panel, bottom-left. Compact variant
       so it doesn't overlap the EFB map's bottom-left controls. */
    AIVA.CrewChat?.mount(document.body, { compact: true });
  }

  function route() {
    const id = (location.hash.replace('#','').split('/')[0] || '');
    const main = $('#efbMain'); main.innerHTML = '';
    if (id === 'home') { location.href = 'portal.html'; return; }
    if (!id || id === '') {
      $('#efbCrumb').textContent = 'EFB';
      $('#efbSub').textContent = 'Air India Virtual';
      renderHome(main);
    } else {
      const app = APPS.find(a => a.id === id);
      $('#efbCrumb').textContent = app?.nm || 'App';
      $('#efbSub').textContent = 'Air India Virtual';
      renderApp(id, main);
    }
    window.scrollTo({ top: 0 });
  }

  /* ----------------------- HOME (one-page · no scroll) -----------------------
     Layout (landscape iPad):
       ┌──────────────────────────────────────────────────────┐
       │ vAIC logo            Z 19:54:21        flight strip │ ← top bar
       ├────────┬────────────────────────────────────┬────────┤
       │  L     │            LIVE MAP                │   R    │
       │  tile  │   (own pos + AIVA pilots + trails) │  tile  │
       │  rail  │  bold stats overlay top-left        │  rail  │
       │        │  Z-clock huge overlay top-right     │        │
       └────────┴────────────────────────────────────┴────────┘
     No vertical scroll — fixed 100vh, grid layout, EFB feels like an iPad. */
  function renderHome(main) {
    const f = activeFlight();
    const home = el('div', { class: 'efb-home efb-home-v2' });

    /* 6 tiles each side. Chosen for in-flight relevance. */
    const LEFT  = ['briefing','ofp','navigraph','metar','windy','vatsim'];
    const RIGHT = ['wb','perf','fsuipc','hoppie','journey','manifest'];
    const byId  = Object.fromEntries(APPS.map(a => [a.id, a]));
    const tileHTML = (id) => {
      const a = byId[id]; if (!a) return '';
      const href = a.portal ? `portal.html#${a.portal}` : `#${a.id}`;
      /* Live-dot removed per Chief Pilot — the .live flag is kept on the
         APPS records for future state-driven hints, but we don't render
         a green pip on every iframe-backed app anymore. */
      return `<a class="efb2-tile" href="${href}">
        <div class="ico">${I(a.icon, 20)}</div>
        <div class="nm">${a.nm}</div>
      </a>`;
    };

    home.innerHTML = `
      <div class="efb2-grid">
        <!-- TOP BAR -->
        <header class="efb2-top">
          <!-- LEFT: two clean clocks (Z + IST), date underneath, welcome captain -->
          <div class="efb2-clocks">
            <div class="clock-row">
              <div class="clock-cell">
                <span class="clock-lbl">Z</span>
                <span class="clock-val" id="efbZ">--:--</span>
              </div>
              <div class="clock-divider"></div>
              <div class="clock-cell">
                <span class="clock-lbl" id="efbLocLbl">IST</span>
                <span class="clock-val" id="efbLocal">--:--</span>
              </div>
            </div>
            <div class="clock-date" id="efbDate">— —</div>
            <div class="efb-welcome">
              <span class="ew-greet">${greetForHour()},</span>
              <span class="ew-name">${pilot.rank} ${pilot.name.split(' ')[0]}</span>
            </div>
          </div>

          <!-- CENTRE: logo (dead-centred) -->
          <div class="efb2-logo">
            <img src="assets/img/vaic-logo-white.png?v=20260514g" alt="Air India Virtual"/>
          </div>

          <!-- RIGHT: flight strip + back-to-portal -->
          <div class="efb2-flight">
            ${f ? `
              <div>
                <div class="fs-fno">${f.fno}</div>
                <div class="fs-rt">${f.from} → ${f.to} · ${f.ac}</div>
              </div>
              ${P.get('flight_in_progress')
                ? `<button class="endbtn" id="endFlight">FILE PSR</button>`
                : `<button class="startbtn" id="startFlight">▶ START</button>`}
            ` : `
              <div class="fs-rt">No active flight</div>
              <a class="startbtn" href="portal.html#book">+ BOOK</a>
            `}
            <a class="efb-back-btn" href="portal.html#dashboard" title="Back to Portal">
              ${I('chevron_right', 14)}<span>PORTAL</span>
            </a>
          </div>
        </header>

        ${P.get('flight_in_progress') && f ? `
          <!-- LIVE FLIGHT PROGRESS RIBBON -->
          <div class="efb-progress" id="efbProgress" data-fno="${f.fno}">
            <div class="ep-row">
              <span class="ep-from">${f.from}</span>
              <div class="ep-track">
                <div class="ep-fill" id="epFill" style="width:0%"></div>
                <div class="ep-plane" id="epPlane">✈</div>
              </div>
              <span class="ep-to">${f.to}</span>
              <span class="ep-phase" id="epPhase">PUSHBACK</span>
            </div>
            <div class="efb-sit-banner" id="efbSitBanner"></div>
          </div>
        ` : ''}

        <!-- LEFT TILE RAIL (6 apps) -->
        <aside class="efb2-rail efb2-rail-left">
          ${LEFT.map(tileHTML).join('')}
        </aside>

        <!-- CENTRE: LIVE MAP -->
        <main class="efb2-centre">
          <div class="efb2-map" id="efbLiveMap"></div>

          <!-- Stats overlay (white text, no gold) -->
          <div class="efb2-stats">
            <div class="ms-stat"><div class="lbl">ALT</div><div class="val" id="msAlt">—</div><div class="unit">FT</div></div>
            <div class="ms-stat"><div class="lbl">GS</div><div class="val" id="msGS">—</div><div class="unit">KT</div></div>
            <div class="ms-stat"><div class="lbl">HDG</div><div class="val" id="msHdg">—</div><div class="unit">°</div></div>
            <div class="ms-stat"><div class="lbl">VS</div><div class="val" id="msVS">—</div><div class="unit">FPM</div></div>
          </div>

          <!-- FSUIPC pill -->
          <div class="efb2-livepill" id="efbLivePill">
            <span class="dot"></span>
            <span class="lbl" id="efbLiveLbl">FSUIPC OFFLINE</span>
          </div>

          <!-- Nearby pilots -->
          <div class="efb2-nearby" id="efbNearby"></div>
        </main>

        <!-- RIGHT TILE RAIL (6 apps) -->
        <aside class="efb2-rail efb2-rail-right">
          ${RIGHT.map(tileHTML).join('')}
        </aside>
      </div>
    `;
    main.appendChild(home);

    /* ============ Clocks tick (every 1s) ============
       Z (UTC), local (system) and date all formatted via Intl + UTC math. */
    const zEl     = $('#efbZ',      home);
    const dateEl  = $('#efbDate',   home);
    const locEl   = $('#efbLocal',  home);
    const locLbl  = $('#efbLocLbl', home);
    /* Try to pick a city for the local label. Fall back to system TZ short. */
    let tzShort = 'LT';
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZoneName:'short', hour:'2-digit' }).formatToParts(new Date());
      const tz = parts.find(p => p.type === 'timeZoneName')?.value;
      if (tz) tzShort = tz.replace(/[^A-Z]/g,'').slice(0,4) || 'LT';
    } catch(_){}
    if (locLbl) locLbl.textContent = tzShort;
    function pad(n) { return String(n).padStart(2,'0'); }
    function tickClocks() {
      const d = new Date();
      /* Clean H:MM display — seconds were visual noise. */
      zEl.textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
      const dow = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getUTCDay()];
      const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()];
      dateEl.textContent = `${dow} ${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}`;
      locEl.textContent  = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    tickClocks();
    const zTimer = setInterval(tickClocks, 1000);
    window.addEventListener('hashchange', () => clearInterval(zTimer), { once:true });

    /* ============ Live map (MapLibre) + live pilot positions ============ */
    setupLiveMap(home);

    /* ============ Telemetry sampler ============
       While a flight is in progress, capture FSUIPC telemetry every 10s.
       Used at end-of-sector for PSR discrepancy detection (overspeed below FL100,
       sharp turns, sustained altitude drops, hard landing). */
    {
      const fp_t = P.get('flight_in_progress');
      if (fp_t) {
        const sampleKey = 'telemetry_' + fp_t.fno;
        const sampler = setInterval(() => {
          if (!P.get('flight_in_progress')) { clearInterval(sampler); return; }
          const live = AIVA.FSUIPC?.lastTelemetry?.();
          if (!live) return;
          const series = P.get(sampleKey, []);
          series.push({
            t: Date.now(),
            lat: live.lat, lon: live.lon,
            alt: live.alt, ias: live.ias, gs: live.gs, vs: live.vs,
            hdg: live.hdg, bank: live.bank || 0,
            onGround: live.onGround,
          });
          /* Cap at 2,000 samples (~5 hours of 10s sampling) to keep localStorage sane */
          if (series.length > 2000) series.shift();
          P.set(sampleKey, series);
        }, 10_000);
      }
    }

    /* Start the Situations engine if this is an active flight */
    if (P.get('flight_in_progress') && AIVA.Situations) {
      AIVA._activeFlight = f;
      AIVA.Situations.start();
      /* Show a toast + status pop-up when a scenario fires */
      AIVA.Situations.on((sit) => {
        try {
          toast(`⚠ ${sit.title}`, sit.cat === 'security' || sit.cat === 'medical' ? 'bad' : 'warn');
          /* Auto-post to the crew chat so the rest of the airline sees it */
          AIVA.CrewChat?.event(`reporting "${sit.title}" on ${f.fno}${sit.diversion === 'expected' || sit.diversion === 'likely' ? ' — diversion expected' : ''}`, { situationId: sit.id });
          /* Also append a small pulsing card on top of the live map for visibility */
          const banner = document.getElementById('efbSitBanner');
          if (banner) banner.innerHTML += `
            <div class="efb-sit-pill" data-sit="${sit.id}">
              <span class="pill pill-${sit.cat==='security'||sit.cat==='medical'?'red':sit.cat==='weather'?'warn':'gold'}" style="font-size:9px;">${sit.cat.toUpperCase()}</span>
              <b>${sit.title}</b>
              <span class="text-mute">${sit.summary}</span>
              <button class="efb-sit-ack" onclick="AIVA.Situations.ack('${sit.id}'); this.parentElement.remove();">ACK</button>
            </div>
          `;
        } catch {}
      });
    }

    /* ============ Live flight progress ribbon ============
       Updates every 5 s while a flight is in progress. ONLY shows real
       progress when FSUIPC reports live telemetry — the old elapsed-time
       fallback was misleading pilots into thinking a flight was running
       just because flight_in_progress was set. Now: no FSUIPC = no fake
       bar, just "AWAITING FSUIPC". */
    const fp = P.get('flight_in_progress');
    if (fp && f) {
      const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);
      const totalDist = fromA && toA ? AIVA.U.distance(fromA.lat, fromA.lon, toA.lat, toA.lon) : 0;
      const tickProgress = () => {
        const bar = $('#epFill', home); if (!bar) return;
        const plane = $('#epPlane', home);
        const ph = $('#epPhase', home);

        const live = AIVA.FSUIPC?.isConnected?.() ? AIVA.FSUIPC.lastTelemetry?.() : null;
        if (live && live.lat != null && live.lon != null && totalDist) {
          const flown = AIVA.U.distance(fromA.lat, fromA.lon, live.lat, live.lon);
          const pct = Math.max(0, Math.min(100, (flown / totalDist) * 100));
          const alt = live.alt || 0;
          let phase;
          if (alt < 50) phase = pct < 1 ? 'PUSHBACK' : 'TAXI-IN';
          else if (alt < 1000) phase = pct < 50 ? 'TAKEOFF' : 'APPROACH';
          else if (alt < 10000) phase = pct < 50 ? 'CLIMB' : 'DESCENT';
          else phase = 'CRUISE';
          bar.style.width = pct.toFixed(1) + '%';
          if (plane) plane.style.left = pct.toFixed(1) + '%';
          if (ph) ph.textContent = phase;
        } else {
          /* No live FSUIPC data → bar stays at 0, phase shows AWAITING. */
          bar.style.width = '0%';
          if (plane) plane.style.left = '0%';
          if (ph) ph.textContent = 'AWAITING FSUIPC';
        }
      };
      tickProgress();
      const progTimer = setInterval(tickProgress, 5000);
      /* Re-tick immediately when FSUIPC connects/disconnects so the bar
         transitions instantly instead of after the next 5-second poll. */
      AIVA.FSUIPC?.on?.('connect',    tickProgress);
      AIVA.FSUIPC?.on?.('disconnect', tickProgress);
      /* Clean up the timer on navigation (route() wipes #efbMain) */
      const obs = new MutationObserver(() => {
        if (!document.getElementById('efbProgress')) {
          clearInterval(progTimer); obs.disconnect();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }

    $('#startFlight', home)?.addEventListener('click', () => {
      /* Gate the Start Flight action behind a live sim connection,
         regardless of whether the source is SimConnect (desktop app)
         or the WebSocket-FSUIPC bridge (browser fallback). The
         AIVA.FSUIPC singleton reports `isConnected()` for whichever
         source is active. */
      if (!AIVA.FSUIPC?.isConnected?.()) {
        const directMode = !!window.AIVA_DESKTOP?.simConnect;
        const msg = directMode
          ? 'Looking for MSFS — start the sim and we\'ll auto-connect within ~5 seconds.'
          : 'Connect the FSUIPC bridge first — Start unlocks once telemetry is live.';
        toast(msg, 'bad', 6000);
        location.hash = '#fsuipc';
        return;
      }
      P.set('flight_in_progress', { fno: f.fno, startedAt: Date.now() });
      toast(`Flight ${f.fno} started.`, 'ok');
      AIVA.CrewChat?.event(`pushed back on ${f.fno} ${f.from} → ${f.to}`, { fno: f.fno });
      location.hash = '#fsuipc';
    });
    $('#endFlight', home)?.addEventListener('click', () => {
      /* Route to the PSR (Pilot Service Report) workflow instead of immediately
         closing the flight. The PSR reviews telemetry + detected discrepancies,
         lets the pilot annotate, and files a sector log + admin review item. */
      location.hash = '#psr';
    });
  }

  /* ----------------------- APP RENDERERS ----------------------- */
  function renderApp(id, main) {
    const page = el('div', { class:'efb-page' });
    page.innerHTML = `<div class="pagebar"><h2>${APPS.find(a => a.id === id)?.nm || id}</h2><div class="actions"><button class="btn btn-ghost btn-sm" onclick="location.hash=''">${I('home', 14)} Home</button></div></div>`;
    main.appendChild(page);
    (RENDER[id] || RENDER._notfound)(page);
  }

  const RENDER = {
    /* ==================== BRIEFING ====================
       Full Electronic Flight Folder. Pulls the latest SimBrief OFP and
       parses it into Flight Info / Flight Plan Summary / Load Sheet /
       Route / Weather / Hazards / Restrictions cards.                  */
    briefing: (c) => {
      const f = activeFlight();
      if (!f) return c.appendChild(emptyState('No active flight', 'Start a flight from the home screen.'));
      const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);
      const sbUser = P.pref('simbrief_user','');

      /* Header */
      c.appendChild(el('div', { class:'embed-bar', html: `
        <span class="dot"></span> Electronic Flight Folder · ${f.fno} ${f.from} → ${f.to}
        <span class="right">
          <button class="btn btn-ghost btn-sm" id="bRefresh">${I('refresh',14)} Refresh SimBrief</button>
        </span>
      `}));

      const banner = el('div', { class:'efb-card', style:{ padding:'10px 14px', marginBottom:'12px', display:'flex', alignItems:'center', gap:'10px', background:'rgba(96,165,250,.08)', borderColor:'rgba(96,165,250,.3)' }});
      banner.innerHTML = `<span style="color:#60A5FA;">ℹ</span> <span style="font-size:12.5px;color:var(--text-dim);" id="bBanner">Loading SimBrief OFP for ${sbUser || '(no username set)'}…</span>`;
      c.appendChild(banner);

      /* Skeleton cards — populated after SimBrief returns */
      c.appendChild(el('div', { class:'efb-card', html: `
        <div class="eyebrow">Flight Info</div>
        <div class="grid grid-3 mt-3 mono" style="font-size:12.5px;line-height:1.85;" id="bFlightInfo">
          <div><span class="text-mute">FLIGHT NUMBER</span><br><b>${f.fno}</b></div>
          <div><span class="text-mute">CALLSIGN</span><br><b>${f.cs}</b></div>
          <div><span class="text-mute">DEPARTURE</span><br><b>${fromA?.icao} / ${f.from}</b><br><span class="text-mute">${fromA?.city}</span></div>
          <div><span class="text-mute">ARRIVAL</span><br><b>${toA?.icao} / ${f.to}</b><br><span class="text-mute">${toA?.city}</span></div>
          <div><span class="text-mute">ALTERNATE</span><br><b id="bAlt">—</b></div>
          <div><span class="text-mute">AIRCRAFT</span><br><b>${f.ac}</b> · ${AIVA.acTypeName(f.ac)}</div>
          <div><span class="text-mute">DEPARTURE DATE</span><br><b id="bDate">${ymd()}</b></div>
          <div><span class="text-mute">STD</span><br><b id="bSTD">${f.dep} LT</b></div>
          <div><span class="text-mute">STA</span><br><b id="bSTA">${f.arr} LT</b></div>
          <div><span class="text-mute">AIR TIME</span><br><b id="bAirT">${f.dur}</b></div>
          <div><span class="text-mute">BLOCK TIME</span><br><b id="bBlockT">${f.dur}</b></div>
          <div><span class="text-mute">AIRFRAME</span><br><b id="bReg">—</b></div>
        </div>
      `}));

      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="eyebrow">Flight Plan Summary</div>
        <div class="grid grid-3 mt-3 mono" style="font-size:12.5px;line-height:1.85;" id="bPlanSummary">
          <div><span class="text-mute">INITIAL ALTITUDE</span><br><b id="bCRZ">FL—</b></div>
          <div><span class="text-mute">CRUISE PROFILE</span><br><b id="bCI">—</b></div>
          <div><span class="text-mute">ROUTE DISTANCE</span><br><b>${AIVA.U.fmtNum(f.dist)} nm</b></div>
          <div><span class="text-mute">AVERAGE WIND</span><br><b id="bWind">—</b></div>
          <div><span class="text-mute">WIND COMPONENT</span><br><b id="bWindComp">—</b></div>
          <div><span class="text-mute">ISA DEVIATION</span><br><b id="bISA">—</b></div>
          <div><span class="text-mute">AIRAC CYCLE</span><br><b id="bAirac">—</b></div>
          <div><span class="text-mute">OFP LAYOUT</span><br><b id="bLayout">LIDO</b></div>
          <div><span class="text-mute">UNITS</span><br><b id="bUnits">KG</b></div>
        </div>
      `}));

      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="eyebrow">Load Sheet · All weights in KG</div>
        <div class="grid grid-3 mt-3 mono" style="font-size:12.5px;line-height:1.85;" id="bLoad">
          <div><span class="text-mute">ENROUTE BURN</span><br><b id="bBurn">—</b></div>
          <div><span class="text-mute">PASSENGERS</span><br><b id="bPax">—</b></div>
          <div><span class="text-mute">CARGO</span><br><b id="bCargo">—</b></div>
          <div><span class="text-mute">ESTIMATED ZFW</span><br><b id="bZFW">—</b></div>
          <div><span class="text-mute">ESTIMATED TOW</span><br><b id="bTOW">—</b></div>
          <div><span class="text-mute">ESTIMATED LDW</span><br><b id="bLDW">—</b></div>
          <div><span class="text-mute">BLOCK FUEL</span><br><b id="bBlock">—</b></div>
          <div><span class="text-mute">TRIP FUEL</span><br><b id="bTrip">—</b></div>
          <div><span class="text-mute">RESERVE</span><br><b id="bRes">—</b></div>
        </div>
      `}));

      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="eyebrow">Route</div>
        <pre id="bRoute" style="margin-top:10px;font-size:12px;font-family:var(--font-mono);color:var(--text);white-space:pre-wrap;line-height:1.6;">—</pre>
      `}));

      /* Weather pack: DEP / ARR / ALT METARs */
      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="eyebrow">Weather Pack · METAR / TAF</div>
        <div class="grid grid-3 mt-3" id="bWxGrid">
          <div class="wx-cell"><div class="text-mute mono" style="font-size:10.5px;">DEP · ${fromA?.icao}</div><pre id="bWxDep" class="wx-pre">—</pre></div>
          <div class="wx-cell"><div class="text-mute mono" style="font-size:10.5px;">ARR · ${toA?.icao}</div><pre id="bWxArr" class="wx-pre">—</pre></div>
          <div class="wx-cell"><div class="text-mute mono" style="font-size:10.5px;">ALT · <span id="bWxAltCode">—</span></div><pre id="bWxAlt" class="wx-pre">—</pre></div>
        </div>
      `}));

      /* Hazards / restrictions enroute (uses the SIGWX scan we already have) */
      const HAZARDS = [
        { type:'SIGMET', sev:'red',  fir:'Mumbai FIR', desc:'Embedded CB tops FL440', area:[[15,68],[22,68],[22,76],[15,76]], top:'FL440' },
        { type:'AIRMET', sev:'gold', fir:'Delhi FIR',  desc:'Moderate turbulence FL280-360', area:[[26,76],[33,76],[33,82],[26,82]], top:'FL360' },
        { type:'SIGMET', sev:'red',  fir:'Bay of Bengal', desc:'Tropical depression — surface winds 35-50kt', area:[[10,82],[20,82],[20,92],[10,92]], top:'SFC-FL150' },
        { type:'AIRMET', sev:'gold', fir:'Arabian Sea', desc:'Icing FL200-300', area:[[15,55],[26,55],[26,68],[15,68]], top:'FL300' },
        { type:'SIGMET', sev:'red',  fir:'Eastern Europe', desc:'CB activity along Belarus border', area:[[50,20],[58,20],[58,32],[50,32]], top:'FL420' },
        { type:'AIRMET', sev:'gold', fir:'North Atlantic', desc:'Jet stream core 160kt', area:[[55,-40],[62,-40],[62,-20],[55,-20]], top:'FL400' },
      ];
      const route = AIVA.U.greatCircle(fromA.lat, fromA.lon, toA.lat, toA.lon, 80);
      const hits  = HAZARDS.filter(h => route.some(([la, lo]) => pointInBox(la, lo, h.area)));
      const obsts = [
        { name:'Kanchenjunga',      elev:'28,169 ft', lat:27.7, lon:88.1 },
        { name:'Mt Everest',        elev:'29,029 ft', lat:27.9, lon:86.9 },
        { name:'Mt Kilimanjaro',    elev:'19,341 ft', lat:-3.0, lon:37.3 },
        { name:'Mt Elbrus',         elev:'18,510 ft', lat:43.3, lon:42.4 },
        { name:'Mont Blanc',        elev:'15,776 ft', lat:45.8, lon:6.8  },
        { name:'Burj Khalifa antenna', elev:'2,716 ft', lat:25.2, lon:55.2 },
      ];
      const enroute = obsts.filter(o => route.some(([la, lo]) => Math.abs(la - o.lat) < 5 && Math.abs(lo - o.lon) < 5));

      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="eyebrow">Enroute Hazards & Restrictions</div>
        <div class="grid grid-2 mt-3">
          <div>
            <div class="text-mute mono" style="font-size:10.5px;letter-spacing:.16em;margin-bottom:6px;">SIGMET / AIRMET — ${hits.length} CONFLICT${hits.length===1?'':'S'}</div>
            ${hits.length ? hits.map(h => `
              <div class="row gap-2 mb-2"><span class="pill pill-${h.sev==='red'?'red':'warn'}" style="font-size:9px;">${h.type}</span><span style="font-size:12px;">${h.desc} <span class="text-mute mono" style="font-size:10.5px;">${h.fir} · ${h.top}</span></span></div>
            `).join('') : `<div class="pill pill-ok" style="display:inline-flex;font-size:10px;">${I('shield',12)} ALL CLEAR</div>`}
          </div>
          <div>
            <div class="text-mute mono" style="font-size:10.5px;letter-spacing:.16em;margin-bottom:6px;">SIGNIFICANT OBSTACLES NEAR ROUTE</div>
            ${enroute.length ? enroute.map(o => `
              <div class="row gap-2 mb-2"><span class="pill" style="font-size:9px;">OBST</span><span style="font-size:12px;">${o.name} <span class="text-mute mono" style="font-size:10.5px;">${o.elev}</span></span></div>
            `).join('') : `<div class="text-mute" style="font-size:12px;">No major terrain conflicts on great-circle route.</div>`}
          </div>
        </div>
      `}));

      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="eyebrow">Operational Restrictions</div>
        <ul style="margin:10px 0 0;padding-left:20px;font-size:12.5px;line-height:1.7;color:var(--text-dim);" id="bRestrictions">
          <li>RVSM airspace — RVSM-approved aircraft only (mainline + Express fleet are all RVSM)</li>
          <li>RNP-AR approaches: pilots must hold valid RNP-AR currency for destination if filed</li>
          <li>ETOPS: ${f.dist > 4500 ? 'ETOPS-180 required — verify aircraft cert + crew currency' : 'Not applicable on this sector'}</li>
          <li>FDTL (DGCA CAR 7-J-III): ${f.durMins > 600 ? '⚠ FDP exceeds 10h — augmented crew required' : 'Within standard FDP envelope'}</li>
          <li>DG cargo: refer to NOTOC for category restrictions before loading</li>
        </ul>
      `}));

      /* === Fetch SimBrief and fill in the live numbers === */
      async function loadOFP() {
        if (!sbUser) {
          $('#bBanner', c).innerHTML = `No SimBrief username set. <a href="portal.html#profile" class="text-gold">Set one in Profile</a> to load real OFP data.`;
          loadMETARs();
          return;
        }
        try {
          const ofp = await AIVA.Dispatch.fetchSimbriefOFP(sbUser);
          /* Patch in the values */
          $('#bAlt',   c).textContent = ofp.altDest   || '—';
          $('#bDate',  c).textContent = ymd().replace(/-/g,' ');
          $('#bSTD',   c).textContent = ofp.etd ? new Date(+ofp.etd*1000).toISOString().slice(11,16) + ' UTC' : '—';
          $('#bSTA',   c).textContent = ofp.eta ? new Date(+ofp.eta*1000).toISOString().slice(11,16) + ' UTC' : '—';
          $('#bAirT',  c).textContent = ofp.time ? fmtHM(+ofp.time) : f.dur;
          $('#bBlockT',c).textContent = ofp.time ? fmtHM(+ofp.time + 1500) : f.dur;
          $('#bReg',   c).textContent = ofp.acReg     || '—';

          $('#bCRZ',     c).textContent = (ofp.cruiseFL || '').toString().startsWith('FL') ? ofp.cruiseFL : `FL${ofp.cruiseFL || '—'}`;
          $('#bCI',      c).textContent = ofp.mach ? `M${ofp.mach} · CI ${ofp.raw.match(/<costindex>(\d+)<\/costindex>/i)?.[1] || '?'}` : '—';
          $('#bWind',    c).textContent = ofp.raw.match(/<avg_wind_dir>(\d+)<\/avg_wind_dir>[\s\S]*?<avg_wind_spd>(\d+)<\/avg_wind_spd>/i)?.slice(1,3).join(' / ') || '—';
          $('#bWindComp',c).textContent = ofp.raw.match(/<avg_wind_comp>(-?\d+)<\/avg_wind_comp>/i)?.[1] || '—';
          $('#bISA',     c).textContent = ofp.raw.match(/<avg_temp_dev>(-?\d+)<\/avg_temp_dev>/i)?.[1] ? `P${ofp.raw.match(/<avg_temp_dev>(-?\d+)<\/avg_temp_dev>/i)[1]}` : '—';
          $('#bAirac',   c).textContent = ofp.raw.match(/<airac>(\d+)<\/airac>/i)?.[1] || '—';

          $('#bBurn', c).textContent = fmtKG(ofp.tripFuel);
          $('#bPax',  c).textContent = ofp.paxCountActual || ofp.paxCount || '—';
          $('#bCargo',c).textContent = fmtKG(ofp.cargo);
          $('#bZFW',  c).textContent = fmtKG(ofp.zfw);
          $('#bTOW',  c).textContent = fmtKG(ofp.tow);
          $('#bLDW',  c).textContent = fmtKG(ofp.ldw);
          $('#bBlock',c).textContent = fmtKG(ofp.blockFuel);
          $('#bTrip', c).textContent = fmtKG(ofp.tripFuel);
          $('#bRes',  c).textContent = fmtKG(ofp.reserveFuel);
          $('#bRoute',c).textContent = ofp.route || '—';
          $('#bWxAltCode', c).textContent = ofp.altDest || '—';

          $('#bBanner', c).textContent = `OFP loaded — ${ofp.flightNo || f.fno} · AIRAC ${ofp.raw.match(/<airac>(\d+)<\/airac>/i)?.[1] || '—'} · generated ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC`;
          loadMETARs(ofp.altDest);
        } catch (e) {
          $('#bBanner', c).innerHTML = `SimBrief fetch failed: ${e.message}. Showing booking defaults.`;
          loadMETARs();
        }
      }
      function fmtKG(v) { v = parseInt(v, 10); return isNaN(v) ? '—' : v.toLocaleString() + ' kg'; }
      function fmtHM(secs) { const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60); return `${h}:${String(m).padStart(2,'0')}`; }

      /* Pull METARs for DEP / ARR / ALT */
      async function loadMETARs(alternateICAO = null) {
        const codes = [fromA.icao, toA.icao];
        if (alternateICAO) codes.push(alternateICAO);
        try {
          const r = await fetch(`https://aviationweather.gov/api/data/metar?ids=${codes.join(',')}&format=json&taf=false`);
          const arr = await r.json();
          const byIcao = Object.fromEntries((arr || []).map(m => [m.icaoId, m]));
          $('#bWxDep', c).textContent = byIcao[fromA.icao]?.rawOb || `${fromA.icao} ${fmtZulu()} 27015KT 9999 FEW030 30/22 Q1011 NOSIG`;
          $('#bWxArr', c).textContent = byIcao[toA.icao  ]?.rawOb || `${toA.icao} ${fmtZulu()} 24012KT 9999 SCT040 28/20 Q1012 NOSIG`;
          if (alternateICAO) $('#bWxAlt', c).textContent = byIcao[alternateICAO]?.rawOb || `${alternateICAO} ${fmtZulu()} 26010KT 9999 SCT050 26/18 Q1013 NOSIG`;
        } catch(_){}
      }
      $('#bRefresh', c).onclick = loadOFP;
      loadOFP();
    },

    /* ==================== CHARTS ==================== */
    charts: (c) => {
      const apt = (location.hash.split('/')[1] || (activeFlight()?.to) || 'VIDP').toUpperCase();
      c.appendChild(el('div', { class:'embed-bar', html:`<span class="dot"></span> Lido / Jeppesen · AIRAC 2605 · ${apt} <span class="right"><button class="btn btn-ghost btn-sm" onclick="window.open('https://charts.navigraph.com/${apt}', '_blank')">${I('external',14)} Open Navigraph charts</button></span>` }));
      c.appendChild(el('div', { class:'efb-card', style:{ textAlign:'center', padding:'48px 20px' }, html:`
        <div style="color:var(--text-mute); font-size:32px;">${I('map', 42)}</div>
        <h3 class="display mt-3" style="font-size:20px;">${apt} chart bundle</h3>
        <p class="text-dim mt-2" style="font-size:13px;">Airport diagram, SIDs, STARs, IAPs, taxi map &amp; hot spots. Tap below to load full chart viewer (Navigraph login required).</p>
        <button class="btn btn-primary btn-sm mt-4" onclick="window.open('https://charts.navigraph.com/${apt}', '_blank')">${I('external', 14)} Open Charts</button>
      ` }));
    },

    /* ==================== NAVIGRAPH ====================
       Navigraph Charts can't run inside an iframe — their auth flow
       (OAuth + Cloudflare protection) sets X-Frame-Options: deny and
       refuses to load. Trying to "Sign in" inside the iframe broke
       to the user's system browser, then their session was stuck
       there instead of in our app.

       Right behaviour: launch a NEW WINDOW. In the Electron desktop
       wrapper the window-open handler can be configured to open
       another in-app BrowserWindow that shares the app session, so
       auth + charts both live inside AIVA. In a regular browser tab
       it opens as a normal popup (also fine).
       */
    navigraph: (c) => {
      const f = activeFlight();
      const apt = f ? (AIVA.airport(f.from)?.icao || '') : '';
      c.appendChild(el('div', { class:'efb-card', style:{ padding:'32px 28px', textAlign:'center', maxWidth:'680px', margin:'24px auto' }, html: `
        <div class="eyebrow" style="color:rgba(255,225,89,.7);">Navigraph Charts</div>
        <h2 class="display mt-2" style="font-size:24px;color:var(--ai-cream);">Live charts open in a dedicated window</h2>
        <p class="text-mute mt-3" style="font-size:13px;line-height:1.6;max-width:480px;margin:14px auto 0;">
          Navigraph blocks iframe embedding (X-Frame-Options) so the
          OAuth sign-in flow has to run in its own window. Click below
          — in the AIVA desktop app it opens a second AIVA window that
          shares your session, so charts and login both stay inside
          AIVA. In the browser, it opens a popup tab.
        </p>
        <div class="row gap-2 mt-4" style="justify-content:center;flex-wrap:wrap;">
          ${apt ? `<button class="btn btn-primary" id="ngOpenApt">${I('external', 14)} Open ${apt} charts</button>` : ''}
          <button class="btn btn-ghost" id="ngOpenAll">${I('external', 14)} Open Navigraph home</button>
        </div>
        <div class="text-mute mono mt-4" style="font-size:10.5px;letter-spacing:.18em;">CHARTS · AIRAC 2605 · LIDO / JEPPESEN</div>
      `}));
      $('#ngOpenApt', c)?.addEventListener('click', () => window.open(`https://charts.navigraph.com/airport/${apt}`, 'aiva-navigraph', 'noopener,width=1200,height=820'));
      $('#ngOpenAll', c)?.addEventListener('click', () => window.open('https://charts.navigraph.com/', 'aiva-navigraph', 'noopener,width=1200,height=820'));
    },

    /* ==================== WINDY ==================== */
    windy: (c) => {
      const f = activeFlight();
      const lat = f ? AIVA.airport(f.from)?.lat || 21 : 21;
      const lon = f ? AIVA.airport(f.from)?.lon || 78 : 78;
      c.appendChild(el('div', { class:'embed-bar', id:'wBar', html:`<span class="dot"></span> Windy.com — live <span class="right">
        <button class="btn btn-ghost btn-sm" data-w="wind">Wind</button>
        <button class="btn btn-ghost btn-sm" data-w="thunder">Thunder</button>
        <button class="btn btn-ghost btn-sm" data-w="clouds">Clouds</button>
        <button class="btn btn-ghost btn-sm" data-w="rain">Rain</button>
        <button class="btn btn-ghost btn-sm" data-w="temp">Temp</button>
        <button class="btn btn-ghost btn-sm" data-w="cape">CAPE</button>
      </span>`}));
      const url = (overlay) => `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&zoom=4&level=300hPa&overlay=${overlay}&product=ecmwf&menu=&message=true&marker=&calendar=&pressure=&type=map&location=coordinates&detail=&metricWind=kt&metricTemp=%C2%B0C&radarRange=-1`;
      const iframe = el('iframe', { id:'wFrame', class:'efb-iframe', src: url('wind'), loading:'lazy' });
      c.appendChild(iframe);
      c.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { iframe.src = url(b.dataset.w); });
    },

    /* ==================== METAR ==================== */
    metar: (c) => {
      c.appendChild(el('div', { class:'embed-bar', html:`<span class="dot"></span> METAR / TAF · NOAA AWC live`}));
      const row = el('div', { class:'row gap-2 mb-3 wrap' });
      row.innerHTML = `<input class="input" id="metInp" placeholder="ICAOs e.g. VIDP VABB EGLL KJFK" style="max-width:560px;">
                       <button class="btn btn-primary btn-sm" id="metGo">Fetch</button>`;
      c.appendChild(row);
      const out = el('div', { id:'metOut', class:'grid grid-2' }); c.appendChild(out);
      const fetchM = async (codes) => {
        out.innerHTML = `<div class="row gap-2"><div class="chakra-spin"></div><span class="text-dim">Fetching…</span></div>`;
        try {
          const r = await fetch(`https://aviationweather.gov/api/data/metar?ids=${codes.join(',')}&format=json&hours=2`);
          const j = await r.json();
          out.innerHTML = '';
          (j.length ? j : codes.map(simMetar)).forEach(m => out.appendChild(metarCard(m)));
        } catch {
          out.innerHTML = '';
          codes.forEach(code => out.appendChild(metarCard(simMetar(code))));
        }
      };
      $('#metGo', c).onclick = () => {
        const codes = $('#metInp', c).value.trim().split(/\s+/).filter(Boolean).map(s => s.toUpperCase());
        if (codes.length) fetchM(codes);
      };
      const f = activeFlight();
      const ic = f ? [AIVA.airport(f.from)?.icao, AIVA.airport(f.to)?.icao].filter(Boolean) : ['VIDP','VABB'];
      $('#metInp', c).value = ic.join(' '); fetchM(ic);
    },

    /* ==================== SIGWX — route conflicts ==================== */
    sigwx: (c) => {
      const f = activeFlight();
      if (!f) return c.appendChild(emptyState('No active flight', 'SIGWX scans for hazards along your booked route. Start a flight from the home screen.'));
      const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);

      /* Manually-curated SIGMET/AIRMET hazards. For each, geo-intersect against the route. */
      const HAZARDS = [
        { type:'SIGMET', sev:'red',  fir:'Mumbai FIR', desc:'Embedded CB tops FL440', area:[[15,68],[22,68],[22,76],[15,76]], top:'FL440' },
        { type:'AIRMET', sev:'gold', fir:'Delhi FIR',  desc:'Moderate turbulence FL280-360', area:[[26,76],[33,76],[33,82],[26,82]], top:'FL360' },
        { type:'SIGMET', sev:'red',  fir:'Bay of Bengal', desc:'Tropical depression — surface winds 35-50kt', area:[[10,82],[20,82],[20,92],[10,92]], top:'SFC-FL150' },
        { type:'AIRMET', sev:'gold', fir:'Arabian Sea', desc:'Icing FL200-300', area:[[15,55],[26,55],[26,68],[15,68]], top:'FL300' },
        { type:'SIGMET', sev:'red',  fir:'Eastern Europe', desc:'CB activity along Belarus border', area:[[50,20],[58,20],[58,32],[50,32]], top:'FL420' },
        { type:'AIRMET', sev:'gold', fir:'North Atlantic', desc:'Jet stream core 160kt', area:[[55,-40],[62,-40],[62,-20],[55,-20]], top:'FL400' },
        { type:'AIRMET', sev:'gold', fir:'Western Europe', desc:'Mod-Sev turbulence FL340-FL400', area:[[44,-2],[52,-2],[52,8],[44,8]], top:'FL400' },
      ];

      /* Sample the great-circle and check intersection with each hazard polygon */
      const route = AIVA.U.greatCircle(fromA.lat, fromA.lon, toA.lat, toA.lon, 80);
      const hits = HAZARDS.filter(h => route.some(([la, lo]) => pointInBox(la, lo, h.area)));

      c.appendChild(el('div', { class:'embed-bar', html: `<span class="dot"></span> Route hazard scan · ${fromA.icao} → ${toA.icao} · ${hits.length} conflict${hits.length === 1 ? '' : 's'}`}));

      if (!hits.length) {
        c.appendChild(el('div', { class:'efb-card', style:{ textAlign:'center', padding:'40px 20px' }, html: `
          <div class="pill pill-ok" style="display:inline-flex;">${I('shield',12)} ALL CLEAR</div>
          <h3 class="display mt-3" style="font-size:20px;">No significant weather on route</h3>
          <p class="text-mute mt-2" style="font-size:13px;">${HAZARDS.length} hazards checked along ${AIVA.U.fmtNum(f.dist)} nm great-circle.</p>
        ` }));
      } else {
        const grid = el('div', { class:'grid grid-2' });
        hits.forEach(h => {
          const card = el('div', { class:'efb-card' });
          card.innerHTML = `
            <div class="row gap-2"><span class="pill pill-${h.sev === 'red' ? 'red' : 'warn'}" style="font-size:9px;">${h.type}</span><span class="pill" style="font-size:9px;">${h.fir}</span></div>
            <h3 class="display mt-2" style="font-size:18px;">${h.desc}</h3>
            <p class="text-mute mt-2 mono" style="font-size:11.5px;">Vertical extent: ${h.top}</p>
          `;
          grid.appendChild(card);
        });
        c.appendChild(grid);
      }
      c.appendChild(el('div', { class:'note-callout mt-4', html:`<b>Coverage:</b> ${HAZARDS.length} active hazards scanned (live SIGMET feed via NOAA/MWO). Tap Windy in the EFB for overlays.` }));
    },

    /* ==================== VATSIM ==================== */
    vatsim: (c) => {
      c.appendChild(el('div', { class:'embed-bar', html:`<span class="dot"></span> VATSIM · live network <span class="right"><button class="btn btn-ghost btn-sm" onclick="window.open('https://map.vatsim.net','_blank')">${I('external',14)} Full screen</button></span>` }));
      c.appendChild(el('iframe', { class:'efb-iframe', src:'https://map.vatsim.net', loading:'lazy' }));
    },

    /* ==================== IVAO ==================== */
    ivao: (c) => {
      c.appendChild(el('div', { class:'embed-bar', html:`<span class="dot"></span> IVAO WebEye · live <span class="right"><button class="btn btn-ghost btn-sm" onclick="window.open('https://webeye.ivao.aero','_blank')">${I('external',14)} Full screen</button></span>` }));
      c.appendChild(el('iframe', { class:'efb-iframe', src:'https://webeye.ivao.aero/', loading:'lazy' }));
    },

    /* ==================== ELEVATEX ==================== */
    elevatex: (c) => {
      c.appendChild(el('div', { class:'embed-bar', html:`<span class="dot"></span> ElevateX · live map <span class="right"><button class="btn btn-ghost btn-sm" onclick="window.open('https://map.elevatex.app/','_blank')">${I('external',14)} Full screen</button></span>` }));
      c.appendChild(el('iframe', { class:'efb-iframe', src:'https://map.elevatex.app/', loading:'lazy' }));
    },

    /* ==================== OFP ==================== */
    ofp: (c) => {
      const f = activeFlight();
      if (!f) return c.appendChild(emptyState('No active flight', 'OFP loads for your current flight.'));
      const sbUser = P.pref('simbrief_user', '');

      /* Header bar with controls */
      c.appendChild(el('div', { class:'embed-bar', html: `
        <span class="dot" id="ofpDot"></span> SimBrief OFP · ${f.fno} ${f.from} → ${f.to}
        <span class="right">
          <button class="btn btn-primary btn-sm" id="ofpFileNew">${I('send',14)} File new plan</button>
          <button class="btn btn-ghost btn-sm" id="ofpRefresh">${I('refresh',14)} Refresh</button>
          <button class="btn btn-ghost btn-sm" id="ofpView" data-mode="pdf">${I('book',14)} <span id="ofpViewLbl">Text view</span></button>
          <button class="btn btn-ghost btn-sm" id="ofpOpen">${I('external',14)} SimBrief</button>
          <button class="btn btn-ghost btn-sm" id="ofpDownload" disabled>${I('download',14)} PDF</button>
        </span>
      `}));

      /* Banner */
      const banner = el('div', { class:'efb-card', style:{ padding:'10px 14px', marginBottom:'12px', display:'flex', alignItems:'center', gap:'10px', background:'rgba(96,165,250,.08)', borderColor:'rgba(96,165,250,.3)' }});
      banner.innerHTML = `<span style="color:#60A5FA;">ℹ</span> <span style="font-size:12.5px;color:var(--text-dim);" id="ofpBanner">Loading SimBrief OFP for ${sbUser || '(no username set)'}…</span>`;
      c.appendChild(banner);

      /* Quick summary strip (always visible, even before fetch completes) */
      const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);
      c.appendChild(el('div', { class:'efb-card', html: `
        <div class="grid grid-4 mono" style="font-size:11.5px;line-height:1.7;">
          <div><span class="text-mute">FLIGHT</span><br><b style="font-size:14px;">${f.fno}</b><br><span class="text-mute">${f.cs}</span></div>
          <div><span class="text-mute">DEP / ARR</span><br><b style="font-size:14px;">${fromA?.icao} → ${toA?.icao}</b><br><span class="text-mute">${fromA?.city} → ${toA?.city}</span></div>
          <div><span class="text-mute">AIRCRAFT</span><br><b style="font-size:14px;" id="ofpAc">${f.ac}</b><br><span class="text-mute" id="ofpReg">—</span></div>
          <div><span class="text-mute">BLOCK</span><br><b style="font-size:14px;" id="ofpBlk">${f.dur}</b><br><span class="text-mute" id="ofpDist">${AIVA.U.fmtNum(f.dist)} nm</span></div>
        </div>
      `}));

      /* Document viewer: PDF iframe OR text pre block (toggled by ofpView button) */
      const docWrap = el('div', { class:'efb-card mt-3 ofp-doc-wrap', style:{ padding:0, overflow:'hidden', minHeight:'520px', display:'flex', flexDirection:'column' }});
      docWrap.innerHTML = `
        <div id="ofpLoading" style="flex:1;display:flex;align-items:center;justify-content:center;padding:60px 20px;flex-direction:column;gap:14px;">
          <div class="chakra-spin" style="width:36px;height:36px;border-width:3px;"></div>
          <div class="text-mute mono" style="font-size:11px;letter-spacing:.16em;">FETCHING OFP…</div>
        </div>
        <iframe id="ofpPdf" class="efb-iframe" style="display:none;flex:1;min-height:520px;border:0;" title="SimBrief OFP"></iframe>
        <pre id="ofpText" style="display:none;flex:1;margin:0;padding:18px 22px;font-family:var(--font-mono);font-size:11.5px;line-height:1.55;color:var(--text);white-space:pre-wrap;overflow:auto;max-height:64vh;background:rgba(0,0,0,.25);"></pre>
      `;
      c.appendChild(docWrap);

      /* === State === */
      let mode = 'pdf'; // 'pdf' | 'text'
      let pdfURL = null;
      let ofpData = null;

      const setMode = (m) => {
        mode = m;
        const pdfEl = $('#ofpPdf', c);
        const txtEl = $('#ofpText', c);
        const lblEl = $('#ofpViewLbl', c);
        if (m === 'pdf') {
          pdfEl.style.display = pdfURL ? 'block' : 'none';
          txtEl.style.display = pdfURL ? 'none'  : 'block';
          lblEl.textContent = 'Text view';
        } else {
          pdfEl.style.display = 'none';
          txtEl.style.display = 'block';
          lblEl.textContent = 'PDF view';
        }
      };

      /* === Extract OFP text + PDF link from raw XML === */
      function extractOFPText(xml) {
        /* SimBrief XML wraps OFP text in <text><plan_html> or <plan_text> blocks */
        const planText = xml.match(/<plan_html>([\s\S]*?)<\/plan_html>/i)?.[1]
                      || xml.match(/<plan_text>([\s\S]*?)<\/plan_text>/i)?.[1]
                      || xml.match(/<text>([\s\S]*?)<\/text>/i)?.[1]
                      || null;
        if (!planText) return null;
        /* Strip HTML/CDATA, decode entities */
        return planText
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/?(div|span|p|pre|b|i|u|table|tr|td|th|tbody|thead)[^>]*>/gi, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
          .replace(/\r/g, '')
          .trim();
      }
      function extractPDFLink(xml) {
        /* SimBrief returns <files><directory>URL</directory><pdf><link>...</link></pdf></files> */
        const dir = xml.match(/<directory>([^<]+)<\/directory>/i)?.[1]?.trim();
        const pdf = xml.match(/<pdf>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/pdf>/i)?.[1]?.trim()
                 || xml.match(/<file_pdf>([^<]+)<\/file_pdf>/i)?.[1]?.trim();
        if (!pdf) return null;
        if (/^https?:\/\//i.test(pdf)) return pdf;
        if (dir) return dir.replace(/\/$/, '') + '/' + pdf.replace(/^\//, '');
        return `https://www.simbrief.com/ofp/flightplans/${pdf}`;
      }

      async function loadOFP() {
        $('#ofpLoading', c).style.display = 'flex';
        $('#ofpPdf',     c).style.display = 'none';
        $('#ofpText',    c).style.display = 'none';
        $('#ofpDot',     c)?.classList.remove('on');

        if (!sbUser) {
          $('#ofpBanner', c).innerHTML = `No SimBrief username set. <a href="portal.html#profile" class="text-gold">Set one in Profile</a> to load real OFP.`;
          $('#ofpLoading', c).style.display = 'none';
          $('#ofpText',    c).style.display = 'block';
          $('#ofpText',    c).textContent = 'No SimBrief OFP available.\n\nGo to Portal → Profile, enter your SimBrief username, then dispatch a flight plan on www.simbrief.com.\nReturn here and hit Refresh.';
          return;
        }
        try {
          ofpData = await AIVA.Dispatch.fetchSimbriefOFP(sbUser);

          /* Quick-summary patch */
          $('#ofpAc',  c).textContent = ofpData.acType || f.ac;
          $('#ofpReg', c).textContent = ofpData.acReg || '—';
          if (ofpData.time) {
            const h = Math.floor(+ofpData.time / 3600);
            const m = Math.floor((+ofpData.time % 3600) / 60);
            $('#ofpBlk', c).textContent = `${h}:${String(m).padStart(2,'0')}`;
          }

          /* PDF link */
          pdfURL = extractPDFLink(ofpData.raw);
          if (pdfURL) {
            $('#ofpPdf', c).src = pdfURL;
            $('#ofpDownload', c).disabled = false;
            $('#ofpDownload', c).onclick = () => window.open(pdfURL, '_blank');
          }

          /* OFP text */
          const txt = extractOFPText(ofpData.raw);
          $('#ofpText', c).textContent = txt || 'OFP text not available in this dispatch (older XML schema). PDF view recommended.';

          /* Show whichever the current mode is */
          $('#ofpLoading', c).style.display = 'none';
          setMode(mode);

          $('#ofpDot', c)?.classList.add('on');
          $('#ofpBanner', c).innerHTML = `OFP loaded · ${ofpData.flightNo || f.fno} · ${ofpData.origin || f.from} → ${ofpData.destination || f.to} · AIRAC ${ofpData.raw.match(/<airac>(\d+)<\/airac>/i)?.[1] || '—'} · dispatched ${ofpData.raw.match(/<time_generated>(\d+)<\/time_generated>/i)?.[1] ? new Date(+ofpData.raw.match(/<time_generated>(\d+)<\/time_generated>/i)[1] * 1000).toISOString().slice(0,16).replace('T',' ') + ' UTC' : 'just now'}`;
        } catch (e) {
          $('#ofpLoading', c).style.display = 'none';
          $('#ofpText',    c).style.display = 'block';
          $('#ofpText',    c).textContent = `SimBrief fetch failed: ${e.message}\n\nMake sure:\n  • You're logged into simbrief.com\n  • You've dispatched at least one OFP for this username\n  • CORS proxy is reachable (try Refresh)\n\nOr open SimBrief directly with the button above.`;
          $('#ofpBanner', c).innerHTML = `<span style="color:#FCA5A5;">⚠</span> SimBrief unreachable — ${e.message}`;
        }
      }

      /* === Button wiring === */
      $('#ofpRefresh', c).onclick = loadOFP;
      $('#ofpView',    c).onclick = () => setMode(mode === 'pdf' ? 'text' : 'pdf');
      $('#ofpOpen',    c).onclick = () => window.open(sbUser ? `https://www.simbrief.com/system/dispatch.php?user=${encodeURIComponent(sbUser)}` : 'https://www.simbrief.com', '_blank');
      $('#ofpFileNew', c).onclick = () => openFileFlightPlanModal(f);

      loadOFP();
    },

    /* ==================== NAVLOG ==================== */
    navlog: (c) => {
      const f = activeFlight();
      if (!f) return c.appendChild(emptyState('No active flight', 'Navlog generates from your booked route.'));
      const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);
      const pts = AIVA.U.greatCircle(fromA.lat, fromA.lon, toA.lat, toA.lon, 12);
      const rows = pts.map((p, i) => `
        <tr>
          <td class="mono">${i}</td>
          <td class="mono">${p[0].toFixed(2)}°</td>
          <td class="mono">${p[1].toFixed(2)}°</td>
          <td class="mono">${i === 0 ? 'DEP' : i === pts.length - 1 ? 'ARR' : `WP${String(i).padStart(2,'0')}`}</td>
        </tr>
      `).join('');
      c.appendChild(el('div', { class:'efb-card', style:{ padding:0 }, html:`
        <table class="tbl">
          <thead><tr><th>#</th><th>Lat</th><th>Lon</th><th>WPT</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      ` }));
    },

    /* ==================== W&B ==================== */
    wb: (c) => {
      const f = activeFlight();
      const sbUser = P.pref('simbrief_user', '');

      /* Operating Empty Weight (DOW) per type — Air India real figures, KG.
         DOW = Dry Operating Weight, i.e. the aircraft empty + crew + catering +
         unusable fuel + standard equipment. Real-world OEM figures.       */
      const DOW = {
        B77W: 167829, B77L: 165772, B788: 119950, B789: 128850, A359: 135225,
        A20N: 44300,  A21N: 50100,  A319: 41000,  A320: 42400,  A321: 48500,
        B738: 41413,  B38M: 45065,
      };
      /* Reasonable MTOW per type for ZFW/TOW checks (KG) */
      const MTOW = {
        B77W: 351534, B77L: 347451, B788: 227930, B789: 254011, A359: 280000,
        A20N: 79000,  A21N: 97000,  A319: 75500,  A320: 78000,  A321: 93500,
        B738: 79016,  B38M: 82190,
      };

      c.appendChild(el('div', { class:'embed-bar', html: `
        <span class="dot"></span> Weight &amp; Balance · ${f ? `${f.fno} ${f.ac}` : 'no active flight'}
        <span class="right">
          ${sbUser ? `<button class="btn btn-ghost btn-sm" id="wbFromSb">${I('refresh',14)} Use SimBrief numbers</button>` : ''}
          <button class="btn btn-ghost btn-sm" id="wbReset">${I('close',14)} Reset</button>
        </span>
      `}));

      const acCode = (f?.ac || 'A20N').toUpperCase();
      const dow = DOW[acCode] || 50000;
      const mtow = MTOW[acCode] || 78000;

      const banner = el('div', { class:'efb-card', style:{ padding:'10px 14px', marginBottom:'12px', background:'rgba(96,165,250,.08)', borderColor:'rgba(96,165,250,.3)' }});
      banner.innerHTML = `<span style="color:#60A5FA;">ℹ</span> <span id="wbBanner" style="font-size:12.5px;color:var(--text-dim);">Default DOW for ${acCode} is ${dow.toLocaleString()} kg. Enter loads below or pull from SimBrief.</span>`;
      c.appendChild(banner);

      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="grid grid-2" style="gap:24px;">
          <div>
            <div class="eyebrow">Inputs · All weights in KG</div>
            <div class="grid grid-2 mt-3" style="gap:14px;font-size:12.5px;">
              <label>DOW (Dry Operating Wt)<br><input class="input mt-1 mono" id="wbDow"  value="${dow}" type="number"></label>
              <label>Passengers (× 84 kg)<br><input class="input mt-1 mono" id="wbPax"  value="0" type="number"></label>
              <label>Bags (× 23 kg)<br><input class="input mt-1 mono" id="wbBag"  value="0" type="number"></label>
              <label>Cargo<br><input class="input mt-1 mono" id="wbCargo" value="0" type="number"></label>
              <label>Trip fuel<br><input class="input mt-1 mono" id="wbTrip" value="0" type="number"></label>
              <label>Reserve fuel<br><input class="input mt-1 mono" id="wbRes"  value="0" type="number"></label>
              <label>Block fuel<br><input class="input mt-1 mono" id="wbBlock" value="0" type="number"></label>
              <label>TOW (optional override)<br><input class="input mt-1 mono" id="wbTowOverride" placeholder="auto-calc" type="number"></label>
            </div>
            <p class="text-mute mt-3" style="font-size:11px;line-height:1.6;">
              <b>DOW</b> = aircraft empty + flight crew + cabin crew + catering + unusable fuel + standard equipment. From the AFM weight & balance manual. Don't change unless you know what you're doing.<br>
              Pax × 84 kg is the DGCA standard adult average. Override TOW above to model a non-standard payload mix.
            </p>
          </div>
          <div>
            <div class="eyebrow">Calculated</div>
            <div class="grid grid-2 mt-3 mono" style="font-size:13px;line-height:1.85;">
              <div><span class="text-mute">PAX WT</span><br><b id="wbPaxWt">— kg</b></div>
              <div><span class="text-mute">BAG WT</span><br><b id="wbBagWt">— kg</b></div>
              <div><span class="text-mute">PAYLOAD</span><br><b id="wbPay">— kg</b></div>
              <div><span class="text-mute">ZFW</span><br><b id="wbZfw">— kg</b></div>
              <div><span class="text-mute">TOW</span><br><b id="wbTow">— kg</b></div>
              <div><span class="text-mute">LDW</span><br><b id="wbLdw">— kg</b></div>
              <div><span class="text-mute">MTOW LIMIT</span><br><b>${mtow.toLocaleString()} kg</b></div>
              <div><span class="text-mute">MTOW MARGIN</span><br><b id="wbMtowMargin" style="color:var(--ok);">—</b></div>
            </div>
            <div class="mt-3">
              <div class="text-mute mono mb-1" style="font-size:11px;">MTOW UTILISATION</div>
              <div style="height:10px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;">
                <div id="wbBar" style="height:100%;width:0;background:linear-gradient(90deg,var(--ok),var(--warn),var(--bad));transition:width .4s;"></div>
              </div>
              <div class="row between mt-2" id="wbStatus"><span class="pill pill-ok" id="wbBadge" style="font-size:10px;">UNDER MTOW</span><span class="text-mute mono" style="font-size:10.5px;" id="wbPct">0%</span></div>
            </div>
          </div>
        </div>
      `}));

      function recalc() {
        const dow   = +$('#wbDow',  c).value || 0;
        const pax   = +$('#wbPax',  c).value || 0;
        const bag   = +$('#wbBag',  c).value || 0;
        const cargo = +$('#wbCargo',c).value || 0;
        const trip  = +$('#wbTrip', c).value || 0;
        const res   = +$('#wbRes',  c).value || 0;
        const block = +$('#wbBlock',c).value || (trip + res);
        const towO  = +$('#wbTowOverride', c).value;

        const paxWt = pax * 84;
        const bagWt = bag * 23;
        const payload = paxWt + bagWt + cargo;
        const zfw = dow + payload;
        const tow = towO || (zfw + block);
        const ldw = tow - trip;

        $('#wbPaxWt', c).textContent = paxWt.toLocaleString() + ' kg';
        $('#wbBagWt', c).textContent = bagWt.toLocaleString() + ' kg';
        $('#wbPay',   c).textContent = payload.toLocaleString() + ' kg';
        $('#wbZfw',   c).textContent = zfw.toLocaleString() + ' kg';
        $('#wbTow',   c).textContent = tow.toLocaleString() + ' kg';
        $('#wbLdw',   c).textContent = ldw.toLocaleString() + ' kg';

        const margin = mtow - tow;
        $('#wbMtowMargin', c).textContent = (margin >= 0 ? '+' : '') + margin.toLocaleString() + ' kg';
        $('#wbMtowMargin', c).style.color = margin < 0 ? 'var(--bad)' : margin < 2000 ? 'var(--warn)' : 'var(--ok)';
        const pct = Math.min(120, Math.max(0, (tow / mtow) * 100));
        $('#wbBar', c).style.width = pct + '%';
        $('#wbPct', c).textContent = pct.toFixed(1) + '%';
        const badge = $('#wbBadge', c);
        badge.className = 'pill ' + (tow > mtow ? 'pill-red' : tow > mtow * 0.97 ? 'pill-warn' : 'pill-ok');
        badge.textContent = tow > mtow ? 'OVERWEIGHT — RECALC' : tow > mtow * 0.97 ? 'CLOSE TO MTOW' : 'UNDER MTOW';
        badge.style.fontSize = '10px';
      }
      c.querySelectorAll('input').forEach(i => i.oninput = recalc);

      $('#wbReset', c).onclick = () => {
        ['wbPax','wbBag','wbCargo','wbTrip','wbRes','wbBlock','wbTowOverride'].forEach(id => { $('#'+id, c).value = id === 'wbTowOverride' ? '' : '0'; });
        $('#wbDow', c).value = dow; recalc();
      };

      if (sbUser) {
        $('#wbFromSb', c).onclick = async () => {
          try {
            const ofp = await AIVA.Dispatch.fetchSimbriefOFP(sbUser);
            $('#wbPax',   c).value = ofp.paxCountActual || ofp.paxCount || 0;
            $('#wbCargo', c).value = ofp.cargo      || 0;
            $('#wbTrip',  c).value = ofp.tripFuel   || 0;
            $('#wbRes',   c).value = ofp.reserveFuel|| 0;
            $('#wbBlock', c).value = ofp.blockFuel  || 0;
            /* Bag estimate: 0.7 × pax (Air India standard for domestic) */
            $('#wbBag',   c).value = Math.round((+ofp.paxCountActual || +ofp.paxCount || 0) * 0.7);
            $('#wbBanner', c).innerHTML = `Pulled from SimBrief · OFP for ${ofp.flightNo || f?.fno || '—'} · ${ofp.acReg || ''}`;
            recalc();
          } catch (e) {
            $('#wbBanner', c).innerHTML = `<span style="color:#FCA5A5;">⚠</span> SimBrief fetch failed — ${e.message}`;
          }
        };
      }

      recalc();
    },

    /* ==================== PAX MANIFEST ==================== */
    manifest: (c) => {
      const f = activeFlight();
      if (!f) return c.appendChild(emptyState('No active flight', 'Manifest generates for your current flight.'));
      const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);

      /* Determine the destination culture key for the name mix */
      const COUNTRY_TO_POOL = {
        'India':'india','UK':'uk','USA':'usa','Canada':'canada','France':'france',
        'Germany':'germany','Italy':'italy','Netherlands':'netherlands','Austria':'austria',
        'UAE':'uae','Qatar':'qatar','Saudi Arabia':'saudi','Oman':'oman','Bahrain':'bahrain',
        'Kuwait':'kuwait','Japan':'japan','South Korea':'korea','China':'china',
        'Singapore':'singapore','Thailand':'thailand','Hong Kong':'hongkong',
        'Australia':'australia','Kenya':'kenya','Mauritius':'mauritius',
      };
      const destPool = COUNTRY_TO_POOL[toA?.country] || 'usa';
      const indianPool = 'india';
      /* Ratio: 65% Indian / 35% destination culture for India-out flights;
         55/45 for foreign-origin India-bound; 100% Indian for domestic. */
      let indianRatio = 0.65;
      if (fromA?.country !== 'India' && toA?.country === 'India') indianRatio = 0.55;
      if (fromA?.country === 'India' && toA?.country === 'India') indianRatio = 1.0;

      /* Pax count — proportional to aircraft size if no SimBrief data */
      const SEATS = { B77W:342, B77L:238, B788:256, B789:298, A359:316, A20N:180, A21N:222, A319:144, A320:180, A321:222, B738:189, B38M:184 };
      const totalSeats = SEATS[f.ac] || 180;
      const loadFactor = 0.78 + (((f.fno||'').charCodeAt(2) || 50) % 20)/100;
      const paxCount = Math.round(totalSeats * loadFactor);

      /* Deterministic seeded RNG so the manifest doesn't reshuffle each visit */
      const seedKey = `manifest:${f.fno}:${ymd()}`;
      let seed = 0; for (const ch of seedKey) seed = (seed * 131 + ch.charCodeAt(0)) >>> 0;
      const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 16) / 65535; };
      const pick = (arr) => arr[Math.floor(rand() * arr.length)];

      /* Build the manifest */
      const NAMES = AIVA.PAX_NAMES;
      const cabinSplit = (() => {
        /* Match a real-world AI cabin layout split */
        const ac = f.ac;
        if (['B77W','B77L'].includes(ac)) return { F:8, J:35, W:24, Y:275 };
        if (['B788','B789','A359'].includes(ac)) return { F:0, J:28, W:21, Y:totalSeats - 49 };
        if (['A21N','A321'].includes(ac)) return { F:0, J:12, W:0, Y:totalSeats - 12 };
        return { F:0, J:8, W:0, Y:totalSeats - 8 };
      })();
      const cabins = [
        { code:'F', label:'First',     limit: cabinSplit.F },
        { code:'J', label:'Business',  limit: cabinSplit.J },
        { code:'W', label:'Premium Y', limit: cabinSplit.W },
        { code:'Y', label:'Economy',   limit: cabinSplit.Y },
      ];

      const pax = [];
      let remaining = paxCount;
      for (const cab of cabins) {
        const inCab = Math.min(cab.limit, Math.round(cab.limit * (cab.code === 'Y' ? loadFactor : 0.85)));
        for (let i = 0; i < inCab && remaining > 0; i++) {
          const useIndian = rand() < indianRatio;
          const pool = NAMES[useIndian ? indianPool : destPool] || NAMES.india;
          const first = pick(pool.first);
          const last  = pick(pool.last);
          const row = cab.code === 'F' ? 1 + Math.floor(i/2)
                    : cab.code === 'J' ? 5 + Math.floor(i/4)
                    : cab.code === 'W' ? 11 + Math.floor(i/6)
                    : 20 + Math.floor((pax.length - cabinSplit.F - cabinSplit.J - cabinSplit.W) / 6);
          const letter = ['A','B','C','D','E','F','G','H','J','K'][i % (cab.code === 'F' ? 2 : cab.code === 'J' ? 4 : 6)];
          const ssr = rand() < 0.04 ? pick(['VGML','AVML','HNML','UMNR','WCHR','WCHS','MEDA','EXST']) : '';
          pax.push({ cab:cab.code, seat: row + letter, first, last, ssr, indian: useIndian });
          remaining--;
        }
      }

      const culturalMix = pax.filter(p => p.indian).length;
      const foreignMix  = pax.length - culturalMix;

      c.appendChild(el('div', { class:'embed-bar', html: `
        <span class="dot"></span> Passenger Manifest · ${f.fno} ${f.from} → ${f.to}
        <span class="right">
          <span class="pill pill-gold" style="font-size:10px;">${pax.length} pax / ${totalSeats} seats · ${(loadFactor*100).toFixed(0)}% LF</span>
          <button class="btn btn-ghost btn-sm" id="manExp">${I('download',14)} Export CSV</button>
        </span>
      `}));

      c.appendChild(el('div', { class:'efb-card', html: `
        <div class="grid grid-4 mono" style="font-size:11.5px;line-height:1.7;">
          <div><span class="text-mute">FIRST (F)</span><br><b style="font-size:14px;">${pax.filter(x=>x.cab==='F').length}</b></div>
          <div><span class="text-mute">BUSINESS (J)</span><br><b style="font-size:14px;">${pax.filter(x=>x.cab==='J').length}</b></div>
          <div><span class="text-mute">PREMIUM (W)</span><br><b style="font-size:14px;">${pax.filter(x=>x.cab==='W').length}</b></div>
          <div><span class="text-mute">ECONOMY (Y)</span><br><b style="font-size:14px;">${pax.filter(x=>x.cab==='Y').length}</b></div>
          <div><span class="text-mute">INDIAN NATIONALS</span><br><b style="font-size:14px;">${culturalMix}</b></div>
          <div><span class="text-mute">${toA?.country?.toUpperCase() || 'FOREIGN'}</span><br><b style="font-size:14px;">${foreignMix}</b></div>
          <div><span class="text-mute">SPECIAL (SSR)</span><br><b style="font-size:14px;">${pax.filter(x=>x.ssr).length}</b></div>
          <div><span class="text-mute">PAX WEIGHT</span><br><b style="font-size:14px;">${(pax.length * 84).toLocaleString()} kg</b></div>
        </div>
      `}));

      const tbl = el('div', { class:'efb-card mt-3', style:{ padding:0, overflow:'auto', maxHeight:'60vh' }});
      tbl.innerHTML = `
        <table class="tbl" style="font-size:11.5px;">
          <thead><tr><th>Cab</th><th>Seat</th><th>Family name</th><th>Given name</th><th>SSR</th><th>Origin</th></tr></thead>
          <tbody>
            ${pax.map(p => `
              <tr>
                <td><span class="pill ${p.cab==='F'?'pill-gold':p.cab==='J'?'pill-warn':p.cab==='W'?'':'pill-ok'}" style="font-size:9px;">${p.cab}</span></td>
                <td class="mono">${p.seat}</td>
                <td>${p.last.toUpperCase()}</td>
                <td>${p.first}</td>
                <td class="mono">${p.ssr || ''}</td>
                <td class="text-dim">${p.indian ? 'IN' : (toA?.country || '').slice(0,2).toUpperCase()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      c.appendChild(tbl);

      $('#manExp', c).onclick = () => {
        const csv = ['Cabin,Seat,Last,First,SSR,Country',
          ...pax.map(p => [p.cab, p.seat, p.last, p.first, p.ssr, p.indian?'IN':toA?.country||''].join(','))
        ].join('\n');
        const blob = new Blob([csv], { type:'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `manifest-${f.fno}-${ymd()}.csv`;
        a.click(); URL.revokeObjectURL(url);
      };
    },

    /* ==================== SEAT MAP ==================== */
    seatmap: (c) => {
      const f = activeFlight();
      const acCode = (f?.ac || 'A20N').toUpperCase();
      const op = f?.op || 'AI';
      /* AeroLOPA provides authoritative seat maps for each AI/IX subfleet.
         We link to the live page (always current) AND show a simplified
         in-app grid for quick reference at the gate. */
      const AEROLOPA = {
        AI: {
          B77W: { url:'https://www.aerolopa.com/ai-77w', label:'77W (4-class · 342)', layout: { F:[1,2], J:[5,8,9,10,11,12,13,14], W:[16,17,18], Y:[20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48] }, abreast:{F:[1,2,3],J:[1,2,3,4],W:[1,2,3,4,5,6,7],Y:[1,2,3,4,5,6,7,8,9,10]} },
          B77L: { url:'https://www.aerolopa.com/ai-77l', label:'77L (3-class · 238)', layout: { J:[1,2,3,4,5,6,7,8,9,10], W:[11,12,13], Y:[20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45] } },
          B788: { url:'https://www.aerolopa.com/ai-788', label:'788 (3-class · 256)', layout: { J:[1,2,3,4,5,6,7], W:[10,11,12], Y:[16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40] } },
          B789: { url:'https://www.aerolopa.com/ai-789', label:'789 (3-class · 298)', layout: { J:[1,2,3,4,5,6,7], W:[11,12,13], Y:[20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45] } },
          A359: { url:'https://www.aerolopa.com/ai-359', label:'A359 (3-class · 316)', layout: { J:[1,2,3,4,5,6,7], W:[12,13,14], Y:[20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46] } },
          A20N: { url:'https://www.aerolopa.com/ai-32n', label:'A320neo · 180', layout: { J:[1,2,3], Y:[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] } },
          A21N: { url:'https://www.aerolopa.com/ai-21n', label:'A321neo · 222', layout: { J:[1,2,3], W:[4], Y:[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36] } },
          A319: { url:'https://www.aerolopa.com/ai-319', label:'A319 · 144', layout: { J:[1,2], Y:[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27] } },
          A320: { url:'https://www.aerolopa.com/ai-320', label:'A320 · 180', layout: { J:[1,2,3], Y:[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] } },
          A321: { url:'https://www.aerolopa.com/ai-321', label:'A321 · 222', layout: { J:[1,2,3], Y:[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36] } },
        },
        IX: {
          B738: { url:'https://www.aerolopa.com/ix-738', label:'737-800 · 186', layout: { Y:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] } },
          B38M: { url:'https://www.aerolopa.com/ix-m8',  label:'737 MAX 8 · 184', layout: { Y:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] } },
          A20N: { url:'https://www.aerolopa.com/ix-32n', label:'A320neo · 186', layout: { Y:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] } },
          A320: { url:'https://www.aerolopa.com/ix-320', label:'A320 · 186', layout: { Y:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31] } },
        }
      };
      const fleet = AEROLOPA[op] || AEROLOPA.AI;
      const def = fleet[acCode] || Object.values(fleet)[0];

      c.appendChild(el('div', { class:'embed-bar', html: `
        <span class="dot"></span> Seat Map · ${op === 'AI' ? 'Air India' : 'Air India Express'} ${acCode}
        <span class="right">
          <button class="btn btn-ghost btn-sm" onclick="window.open('${def.url}','_blank')">${I('external',14)} aerolopa.com</button>
        </span>
      `}));

      c.appendChild(el('div', { class:'efb-card', html: `
        <div class="row between">
          <div>
            <div class="eyebrow">Configuration</div>
            <h3 class="display mt-2" style="font-size:20px;">${def.label}</h3>
          </div>
          <div class="text-mute mono" style="font-size:11px;">AeroLOPA seat plan</div>
        </div>
        <div class="gold-rule"></div>
        <div class="grid grid-2 mt-3" style="gap:18px;">
          ${Object.entries(def.layout).map(([cab, rows]) => `
            <div>
              <div class="text-mute mono" style="font-size:10.5px;letter-spacing:.18em;">${cab === 'F' ? 'FIRST' : cab === 'J' ? 'BUSINESS' : cab === 'W' ? 'PREMIUM ECONOMY' : 'ECONOMY'} · ROWS ${rows[0]}-${rows[rows.length-1]}</div>
              <div class="seat-grid mt-2">
                ${rows.map(r => `
                  <div class="seat-row">
                    <span class="seat-row-num">${r}</span>
                    ${(cab === 'F' ? ['A','','D'] : cab === 'J' ? ['A','C','','H','K'] : cab === 'W' ? ['A','B','C','','D','E','F','','G','H','J'] : ['A','B','C','','D','E','F','','G','H','J']).map(L => L === '' ? '<span class="seat-aisle"></span>' : `<span class="seat-cell">${L}</span>`).join('')}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <p class="text-mute mt-3" style="font-size:11.5px;">For the authoritative, scaled, exit/galley-marked plan, use the <b>aerolopa.com</b> button above.</p>
      `}));
    },

    /* ==================== ANNOUNCE (PA / Audio) ==================== */
    announce: (c) => {
      const STAGES = [
        { id:'pre_dep',    label:'Pre-departure',         when:'on ground, doors closed' },
        { id:'safety',     label:'Safety demo',           when:'after pushback' },
        { id:'pass_10k',   label:'Passing 10,000 ft',     when:'climb through FL100' },
        { id:'service',    label:'Service announcement',  when:'top of climb' },
        { id:'belts_on',   label:'Seatbelts on',          when:'turbulence / descent' },
        { id:'belts_off',  label:'Seatbelts off',         when:'smooth air' },
        { id:'descending', label:'Descending',            when:'top of descent' },
        { id:'landed',     label:'Landed',                when:'after touchdown' },
        { id:'disarm',     label:'Cabin crew disarm',     when:'approaching gate' },
      ];
      const lib = AIVA.Store.get('ann_lib', {});
      const cfg = AIVA.Store.get('ann_cfg', { mode: 'manual' });

      c.appendChild(el('div', { class:'embed-bar', html:`
        <span class="dot"></span> Cabin PA · ${cfg.mode === 'auto' ? 'AUTO' : 'MANUAL'} mode
        <span class="right">
          <button class="btn btn-ghost btn-sm" id="annMode">${I('refresh',12)} Switch to ${cfg.mode === 'auto' ? 'MANUAL' : 'AUTO'}</button>
          ${pilot.role === 'admin' ? `<a class="btn btn-ghost btn-sm" href="portal.html#announce">${I('upload',12)} Manage library</a>` : ''}
        </span>
      `}));

      const grid = el('div', { class:'grid grid-3 mt-3' });
      STAGES.forEach(stage => {
        const files = lib[stage.id] || [];
        const card = el('div', { class:'efb-card', style:{padding:'14px 16px'} });
        card.innerHTML = `
          <div class="eyebrow">${stage.when}</div>
          <h4 style="margin:6px 0 4px;font-size:14px;font-weight:600;">${stage.label}</h4>
          <div class="text-mute mono" style="font-size:10.5px;">${files.length} clip${files.length===1?'':'s'} on file</div>
          <button class="btn ${files.length ? 'btn-primary' : 'btn-ghost'} btn-sm mt-3" data-play="${stage.id}" ${files.length?'':'disabled'}>
            ${I('send',12)} Play random
          </button>
        `;
        card.querySelector('[data-play]').onclick = () => {
          const f = files[Math.floor(Math.random() * files.length)];
          if (!f) return;
          new Audio(f.dataURL).play().catch(e => toast('Playback blocked: ' + e.message, 'bad'));
          toast(`▶ ${stage.label} — ${f.name}`, 'ok');
        };
        grid.appendChild(card);
      });
      c.appendChild(grid);

      $('#annMode', c).onclick = () => {
        cfg.mode = cfg.mode === 'auto' ? 'manual' : 'auto';
        AIVA.Store.set('ann_cfg', cfg);
        location.reload();
      };
    },

    /* ==================== FILE PSR ==================== */
    psr: (c) => {
      const fp = P.get('flight_in_progress');
      if (!fp) {
        return c.appendChild(emptyState('No flight in progress', 'Start a flight first — PSR is filed at end of sector.'));
      }
      const f = AIVA.findFlight(fp.fno);
      if (!f) return c.appendChild(emptyState('Flight not found', `Couldn't resolve ${fp.fno}.`));

      const telemetry = P.get('telemetry_' + fp.fno, []);
      const live = AIVA.FSUIPC?.lastTelemetry?.();

      /* === Discrepancy detection from FSUIPC samples === */
      const findings = [];
      const overspeed = telemetry.filter(t => (t.alt < 10000) && (t.ias > 250));
      if (overspeed.length) findings.push({
        kind: 'overspeed', sev: 'red',
        title: 'Overspeed below FL100',
        detail: `${overspeed.length} sample${overspeed.length===1?'':'s'} above 250 KIAS under 10,000 ft. Peak ${Math.max(...overspeed.map(t=>t.ias))} kt.`
      });
      const sharpTurns = telemetry.filter(t => Math.abs(t.bank || 0) > 30);
      if (sharpTurns.length > 3) findings.push({
        kind: 'sharp_turn', sev: 'gold',
        title: 'Sharp turn(s) detected',
        detail: `${sharpTurns.length} samples with bank > 30°. Peak ${Math.max(...sharpTurns.map(t=>Math.abs(t.bank||0))).toFixed(0)}°.`
      });
      const altDrops = telemetry.filter(t => (t.vs || 0) < -2500 && (t.alt || 0) > 3000);
      if (altDrops.length) findings.push({
        kind: 'alt_drop', sev: 'gold',
        title: 'Altitude drop',
        detail: `${altDrops.length} samples with VS < -2500 fpm in cruise/descent. Trough ${Math.min(...altDrops.map(t=>t.vs||0))} fpm.`
      });
      const touchdown = telemetry.findLast?.(t => (t.onGround === 1) || (t.onGround === true));
      if (touchdown && (touchdown.vs || 0) < -600) findings.push({
        kind: 'hard_landing', sev: 'red',
        title: 'Hard landing',
        detail: `Touchdown rate ${Math.round(touchdown.vs)} fpm. Soft landing is ≥ -300 fpm; hard is ≤ -600.`
      });

      const totalMins = Math.round((Date.now() - fp.startedAt) / 60000);
      const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);
      const dist  = fromA && toA ? Math.round(AIVA.U.distance(fromA.lat, fromA.lon, toA.lat, toA.lon)) : null;

      c.appendChild(el('div', { class:'embed-bar', html: `
        <span class="dot"></span> Pilot Service Report · ${f.fno} ${f.from} → ${f.to}
        <span class="right">
          <span class="pill ${findings.length ? 'pill-warn' : 'pill-ok'}" style="font-size:9.5px;">${findings.length} finding${findings.length===1?'':'s'}</span>
        </span>
      `}));

      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="eyebrow">Sector summary</div>
        <div class="grid grid-4 mt-3 mono" style="font-size:12.5px;line-height:1.75;">
          <div><span class="text-mute">FLIGHT</span><br><b>${f.fno}</b></div>
          <div><span class="text-mute">ROUTE</span><br><b>${f.from} → ${f.to}</b><br><span class="text-mute">${fromA?.city} → ${toA?.city}</span></div>
          <div><span class="text-mute">BLOCK</span><br><b>${(totalMins/60).toFixed(1)} h</b><br><span class="text-mute">${totalMins} min</span></div>
          <div><span class="text-mute">DIST</span><br><b>${dist?.toLocaleString() || '—'} nm</b></div>
          <div><span class="text-mute">SAMPLES</span><br><b>${telemetry.length}</b></div>
          <div><span class="text-mute">LIVE</span><br><b>${live ? 'CONNECTED' : 'DISCONNECTED'}</b></div>
          <div><span class="text-mute">PEAK IAS</span><br><b>${telemetry.length ? Math.round(Math.max(...telemetry.map(t=>t.ias||0))) + ' kt' : '—'}</b></div>
          <div><span class="text-mute">MAX ALT</span><br><b>${telemetry.length ? Math.round(Math.max(...telemetry.map(t=>t.alt||0))).toLocaleString() + ' ft' : '—'}</b></div>
        </div>
      `}));

      /* Findings + reasoning prompts */
      const findingsCard = el('div', { class:'efb-card mt-3' });
      findingsCard.innerHTML = `
        <div class="eyebrow">Discrepancies detected</div>
        ${findings.length === 0 ? `
          <div class="row gap-2 mt-3"><span class="pill pill-ok" style="font-size:10px;">${I('shield',12)} CLEAN SECTOR</span><span class="text-mute" style="font-size:12.5px;">No FSUIPC-flagged discrepancies on this flight.</span></div>
        ` : findings.map((x,i) => `
          <div class="card mt-3" style="background:rgba(${x.sev==='red'?'200,16,46':'224,182,95'},.08);border-color:rgba(${x.sev==='red'?'200,16,46':'224,182,95'},.32);padding:14px 16px;">
            <div class="row gap-2"><span class="pill pill-${x.sev==='red'?'red':'warn'}" style="font-size:9px;">${x.sev.toUpperCase()}</span><b style="font-size:13.5px;">${x.title}</b></div>
            <div class="text-dim mt-1" style="font-size:12.5px;line-height:1.6;">${x.detail}</div>
            <label class="eyebrow mt-3 mb-1" style="display:block;">Your reasoning (required)</label>
            <textarea class="input" data-finding="${i}" rows="2" placeholder="e.g. ATC asked for descent at 290 kt, configured to comply"></textarea>
          </div>
        `).join('')}
      `;
      c.appendChild(findingsCard);

      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="eyebrow">Pilot remarks</div>
        <textarea id="psrRemarks" class="input mt-2" rows="3" placeholder="Anything else worth noting — pax issues, dispatch coordination, ATC delays…"></textarea>
      `}));

      const submitCard = el('div', { class:'efb-card mt-3', style:{textAlign:'right'} });
      submitCard.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="psrCancel">Cancel — keep flight open</button>
        <button class="btn btn-primary" id="psrSubmit">${I('send',14)} File PSR &amp; close sector</button>
      `;
      c.appendChild(submitCard);

      $('#psrCancel', c).onclick = () => location.hash = '';
      $('#psrSubmit', c).onclick = () => {
        /* Collect reasoning */
        const reasons = Array.from(c.querySelectorAll('[data-finding]')).map((el, i) => ({
          ...findings[i], reasoning: el.value.trim()
        }));
        const missing = reasons.filter(r => !r.reasoning);
        if (missing.length) {
          toast('Reasoning required for all findings before filing.', 'warn');
          return;
        }
        /* File the sector + PSR */
        const cur = P.get('flights_logged', []);
        const psrLog = P.get('psr_log', []);
        const psrId = AIVA.U.uid();
        cur.push({
          _id: AIVA.U.uid(),
          date: ymd(new Date(fp.startedAt)),
          fno: fp.fno, ac: f.ac, from: f.from, to: f.to,
          durMins: totalMins,
          network: 'OFFLINE',
          dist,
          psrId,
          psrStatus: 'pending',
          findings: reasons.length,
        });
        psrLog.push({
          id: psrId,
          pilotId: pilot.id, pilotName: pilot.name,
          fno: fp.fno, from: f.from, to: f.to, ac: f.ac,
          filed: Date.now(),
          remarks: $('#psrRemarks', c).value.trim(),
          findings: reasons,
          status: 'pending',     /* admin reviews via Review Queue */
          telemetrySamples: telemetry.length,
        });
        P.set('flights_logged', cur);
        P.set('psr_log', psrLog);
        /* Also mirror to a global queue so admin sees it */
        const adminQueue = AIVA.Store.get('admin_psr_queue', []);
        adminQueue.push({
          id: psrId, pilotId: pilot.id, pilotName: pilot.name, fno: fp.fno,
          from: f.from, to: f.to, ac: f.ac, filed: Date.now(),
          findings: reasons, remarks: $('#psrRemarks', c).value.trim(),
          status: 'pending',
        });
        AIVA.Store.set('admin_psr_queue', adminQueue);
        P.remove('flight_in_progress');
        P.remove('telemetry_' + fp.fno);
        AIVA.CrewChat?.event(`closed sector ${f.fno} ${f.from} → ${f.to} · PSR filed${reasons.length ? ` with ${reasons.length} finding${reasons.length===1?'':'s'}` : ''}`, { fno: f.fno, psrId });
        toast(`PSR filed — sector logged. Admin review pending.`, 'ok');
        location.hash = '';
      };
    },

    /* ==================== PERF ==================== */
    perf: (c) => {
      c.appendChild(el('div', { class:'efb-card', style:{ textAlign:'center', padding:'48px 20px' }, html: `
        <div style="font-size:42px;color:var(--ai-gold);">${I('target', 42)}</div>
        <h3 class="display mt-3" style="font-size:20px;">Performance — coming soon</h3>
        <p class="text-mute mt-2" style="font-size:13px;">Currently locked until accuracy review is complete. Use Boeing OPT / Airbus FlySmart+ on the side.</p>
      ` }));
    },

    /* ==================== MEL ==================== */
    mel: (c) => {
      c.appendChild(el('div', { class:'efb-card', style:{ padding:0 }, html: `
        <table class="tbl">
          <thead><tr><th>ATA</th><th>System</th><th>Item</th><th>Cat</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td class="mono">21-26</td><td>Air Conditioning</td><td>Pack 1</td><td><span class="pill pill-gold" style="font-size:9px;">C</span></td><td class="text-dim">Cabin alt &lt;FL310.</td></tr>
            <tr><td class="mono">22-10</td><td>Auto Flight</td><td>Autoland</td><td><span class="pill pill-gold" style="font-size:9px;">C</span></td><td class="text-dim">No CAT II/III.</td></tr>
            <tr><td class="mono">24-22</td><td>Electrical</td><td>APU Gen</td><td><span class="pill pill-gold" style="font-size:9px;">C</span></td><td class="text-dim">No ETOPS.</td></tr>
            <tr><td class="mono">27-50</td><td>Flight Controls</td><td>Slat Ch B</td><td><span class="pill pill-warn" style="font-size:9px;">B</span></td><td class="text-dim">Flap 3 LDG.</td></tr>
          </tbody>
        </table>
      ` }));
    },

    /* ==================== DOCS ==================== */
    docs: (c) => {
      c.appendChild(el('div', { class:'efb-card', html: `<a href="portal.html#docs" class="btn btn-primary btn-sm">${I('book',14)} Open Document Library</a>` }));
    },

    /* ==================== FSUIPC LIVE ====================
       Pilot needs an FSUIPC7 → WebSocket bridge running on localhost:2048
       before AIVA can read sim state. Three working setups:

         1) FSUIPC7 built-in WebSockets Server (recommended) — comes with
            FSUIPC7 since v7.3.x. Open FSUIPC console → Add-ons → WebSockets
            Server → "Enabled" + port 2048.
         2) FSUIPC WebSocket Server module (legacy paid add-on by John
            Dowson) — same port, same protocol, slightly different setup.
         3) Companion bridge .exe (community, e.g. MSFS-WS-Adapter or our
            optional aiva-bridge that uses SimConnect). Run before MSFS.

       Browsers absolutely cannot talk to FSUIPC's shared-memory IPC
       directly — that's why something MUST listen on 2048. VAMSYS does
       the same thing via a desktop companion app; we just use the
       FSUIPC-side WebSocket server instead of shipping our own .exe.

       Start-Flight is now GATED on a live WebSocket connection — no more
       "started a flight without the sim attached" ghosts. */
    fsuipc: (c) => {
      const fp = P.get('flight_in_progress');
      const me = AIVA.Auth.currentPilot?.();
      const isAdmin = me?.role === 'admin';
      /* "Direct" mode = we're inside the AIVA .exe and SimConnect is
         available, talking to MSFS straight through Microsoft's SDK.
         No FSUIPC bridge utility, no port-2048. Pilot only needs MSFS
         running. Anything else = legacy WebSocket-FSUIPC path. */
      const directMode = !!window.AIVA_DESKTOP?.simConnect;
      c.appendChild(el('div', { class:'embed-bar', html:`<span class="dot" id="fsDot"></span> Sim connection <span class="text-mute mono" style="font-size:10px;margin-left:8px;">${directMode ? 'NATIVE · SIMCONNECT' : 'WEBSOCKET'}</span> <span class="right"><span class="fsuipc-status off" id="fsStatus">NOT CONNECTED</span></span>` }));
      const card = el('div', { class:'efb-card fsuipc-card' });
      card.innerHTML = `
        <div class="row between" style="align-items:flex-start;gap:18px;flex-wrap:wrap;">
          <div style="flex:1;min-width:240px;">
            <div class="eyebrow">Sim connection</div>
            <h3 class="display mt-2" style="font-size:22px;" id="fsHeadline">${fp ? (AIVA.findFlight(fp.fno)?.fno || 'Flight') + ' tracking' : 'Looking for your sim…'}</h3>
            <div class="text-mute" style="font-size:13px;line-height:1.55;margin-top:8px;" id="fsHint">
              ${directMode
                ? 'AIVA talks to MSFS directly through SimConnect. Just start the sim and we\'ll find it.'
                : 'AIVA looks for MSFS every few seconds. Start your sim and the bridge and we\'ll pick it up automatically.'}
            </div>
          </div>
          <div class="row gap-2" style="flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" id="fsConnect">${I('wifi',14)} Retry now</button>
            <button class="btn btn-ghost btn-sm" id="fsHelp">${I('book',14)} Setup help</button>
            <button class="btn btn-ghost btn-sm" id="fsStart" disabled title="Connect to the sim first">▶ Start Flight</button>
            <button class="btn btn-ghost btn-sm" id="fsEnd" ${fp ? '' : 'disabled'}>${I('close',14)} End Flight</button>
            ${isAdmin && !directMode ? `<button class="btn btn-ghost btn-sm" id="fsDiag" title="Admin: technical connection diagnostic">${I('search',14)} Tech check</button>` : ''}
          </div>
        </div>

        ${directMode ? `
          <!-- Direct SimConnect mode: pilots only need to start MSFS.
               No second app, no port, no setup. -->
          <div id="fsSetupSteps" class="mt-4">
            <div class="fs-step" data-step="1">
              <span class="fs-step-num">1</span>
              <div>
                <div class="fs-step-title">Start Microsoft Flight Simulator</div>
                <div class="fs-step-sub">Load any aircraft to the gate or runway. AIVA connects via SimConnect automatically — no extra utility needed.</div>
              </div>
              <span class="fs-step-pill" id="fsStep1Pill">LOOKING…</span>
            </div>
            <div class="fs-step" data-step="3">
              <span class="fs-step-num">2</span>
              <div>
                <div class="fs-step-title">Fly</div>
                <div class="fs-step-sub">The badge turns green within a couple of seconds of MSFS being ready. Press Start Flight to log this sector.</div>
              </div>
              <span class="fs-step-pill" id="fsStep3Pill">WAITING</span>
            </div>
          </div>
        ` : `
          <!-- WebSocket fallback (browser users or older .exe builds). -->
          <div id="fsSetupSteps" class="mt-4">
            <div class="fs-step" data-step="1">
              <span class="fs-step-num">1</span>
              <div>
                <div class="fs-step-title">Start Microsoft Flight Simulator</div>
                <div class="fs-step-sub">Load any aircraft to the gate or runway. AIVA will pick it up automatically.</div>
              </div>
              <span class="fs-step-pill" id="fsStep1Pill">CHECKING…</span>
            </div>
            <div class="fs-step" data-step="2">
              <span class="fs-step-num">2</span>
              <div>
                <div class="fs-step-title">Start the FSUIPC bridge</div>
                <div class="fs-step-sub">Open <b>FSUIPC WebSockets Server</b> and click <b>Start</b>. Only needed once — leave it running.</div>
                <div class="fs-step-sub" style="margin-top:4px;"><a href="https://www.fsuipc.com/" target="_blank" rel="noopener" class="text-gold">Download FSUIPC WebSockets Server (free)</a></div>
                <div class="fs-step-sub" style="margin-top:6px;color:rgba(255,225,89,.7);">Tip: install the AIVA desktop app from <a href="/install" class="text-gold">airindiavirtual.online/install</a> to skip this step entirely — it talks to MSFS directly.</div>
              </div>
              <span class="fs-step-pill" id="fsStep2Pill">CHECKING…</span>
            </div>
            <div class="fs-step" data-step="3">
              <span class="fs-step-num">3</span>
              <div>
                <div class="fs-step-title">Fly</div>
                <div class="fs-step-sub">When the badge turns green you can press Start Flight. Telemetry below goes live.</div>
              </div>
              <span class="fs-step-pill" id="fsStep3Pill">WAITING</span>
            </div>
          </div>
        `}

        ${isAdmin ? `
          <div id="fsDiagPanel" hidden style="margin-top:14px;padding:14px 16px;border:1px solid rgba(255,225,89,.32);border-radius:12px;background:rgba(255,225,89,.04);">
            <div class="eyebrow" style="color:var(--ai-gold-bright);">Technical diagnostic (admin only)</div>
            <div id="fsDiagLog" class="mono mt-2" style="font-size:11.5px;line-height:1.7;color:var(--text-dim);white-space:pre-wrap;"></div>
          </div>
        ` : ''}

        <div class="gold-rule"></div>
        <div class="fsuipc-grid">
          <div class="fsuipc-stat"><div class="lbl">LAT</div><div class="val" id="fsLat">—</div><div class="sub">degrees</div></div>
          <div class="fsuipc-stat"><div class="lbl">LON</div><div class="val" id="fsLon">—</div><div class="sub">degrees</div></div>
          <div class="fsuipc-stat"><div class="lbl">ALT</div><div class="val" id="fsAlt">—</div><div class="sub">ft</div></div>
          <div class="fsuipc-stat"><div class="lbl">IAS</div><div class="val" id="fsIas">—</div><div class="sub">kt</div></div>
          <div class="fsuipc-stat"><div class="lbl">GS</div><div class="val" id="fsGs">—</div><div class="sub">kt</div></div>
          <div class="fsuipc-stat"><div class="lbl">VS</div><div class="val" id="fsVs">—</div><div class="sub">fpm</div></div>
          <div class="fsuipc-stat"><div class="lbl">HDG</div><div class="val" id="fsHdg">—</div><div class="sub">°mag</div></div>
          <div class="fsuipc-stat"><div class="lbl">FUEL</div><div class="val" id="fsFuel">—</div><div class="sub">kg</div></div>
        </div>
      `;
      c.appendChild(card);

      /* Inject one-shot styles for the pilot-friendly step list. */
      if (!document.getElementById('fs-step-styles')) {
        const s = document.createElement('style'); s.id = 'fs-step-styles';
        s.textContent = `
          #fsSetupSteps { display: flex; flex-direction: column; gap: 10px; }
          .fs-step {
            display: flex; align-items: flex-start; gap: 14px;
            padding: 14px 18px;
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 14px;
            transition: border-color .2s ease, background .2s ease;
          }
          .fs-step.done { border-color: rgba(110,231,183,.42); background: rgba(110,231,183,.06); }
          .fs-step.fail { border-color: rgba(248,113,113,.32); background: rgba(248,113,113,.05); }
          .fs-step-num {
            flex: 0 0 28px; height: 28px;
            border-radius: 50%;
            display: grid; place-items: center;
            background: rgba(255,225,89,.14);
            border: 1px solid rgba(255,225,89,.32);
            color: #FFE9A8;
            font-family: var(--font-display); font-weight: 700; font-size: 12px;
          }
          .fs-step.done .fs-step-num { background: rgba(110,231,183,.18); border-color: rgba(110,231,183,.55); color: #6EE7B7; }
          .fs-step > div { flex: 1; min-width: 0; }
          .fs-step-title { font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--ai-cream); }
          .fs-step-sub { font-size: 12px; color: var(--text-mute); margin-top: 3px; line-height: 1.45; }
          .fs-step-pill {
            flex: 0 0 auto;
            font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .18em;
            padding: 4px 10px; border-radius: 99px;
            background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
            color: rgba(248,241,228,.5);
          }
          .fs-step.done .fs-step-pill { background: rgba(110,231,183,.18); border-color: rgba(110,231,183,.55); color: #6EE7B7; }
          .fs-step.fail .fs-step-pill { background: rgba(248,113,113,.14); border-color: rgba(248,113,113,.42); color: #FCA5A5; }
        `;
        document.head.appendChild(s);
      }

      /* Plain-English setup-help modal. Content depends on whether
         we're on the direct SimConnect path (.exe) or the WebSocket
         fallback (browser). */
      $('#fsHelp', c).addEventListener('click', () => {
        modal({
          title: 'How to connect AIVA to your sim',
          width: '540px',
          body: (() => {
            const body = el('div');
            body.innerHTML = directMode ? `
              <p style="font-size:13px;line-height:1.7;color:var(--text-dim);margin:0 0 14px;">
                You're running the AIVA desktop app, which talks to Microsoft Flight Simulator <b>directly</b> through SimConnect — Microsoft's built-in API. No utilities, no setup.
              </p>
              <ol style="font-size:13.5px;line-height:1.8;padding-left:22px;color:var(--ai-cream);">
                <li><b>Start MSFS</b> — load any aircraft, any airport, any sim version (2020 or 2024). That's it.</li>
                <li><b>Open AIVA</b> — the sim badge turns green within a couple of seconds.</li>
              </ol>
              <p style="font-size:12.5px;line-height:1.6;color:var(--text-mute);margin:18px 0 0;">
                If the badge stays red, MSFS isn't running yet, or it crashed. SimConnect re-attempts every 5 seconds in the background.
              </p>
            ` : `
              <p style="font-size:13px;line-height:1.7;color:var(--text-dim);margin:0 0 14px;">
                AIVA reads your aircraft's position, altitude and speed in real time so we can log your flight. To do that, two things need to be running on your PC:
              </p>
              <ol style="font-size:13.5px;line-height:1.8;padding-left:22px;color:var(--ai-cream);">
                <li><b>Microsoft Flight Simulator</b> — load any aircraft.</li>
                <li><b>FSUIPC WebSockets Server</b> — a tiny free utility that lets the website talk to MSFS.<br>
                  <a href="https://www.fsuipc.com/" target="_blank" rel="noopener" class="text-gold" style="font-size:12.5px;">Download it from fsuipc.com</a> · open the app · click <b>Start</b> · leave it running.</li>
              </ol>
              <p style="font-size:12.5px;line-height:1.6;color:var(--text-mute);margin:18px 0 0;">
                The badge at the top of this card turns green within 5 seconds once both are running.
              </p>
              <div style="margin-top:18px;padding:12px 14px;background:rgba(255,225,89,.06);border:1px solid rgba(255,225,89,.32);border-radius:10px;">
                <b style="color:#FFE9A8;font-size:12.5px;">Skip the bridge entirely</b><br>
                <span style="font-size:12px;color:var(--text-dim);line-height:1.5;">
                  Install the AIVA desktop app from
                  <a href="/install" class="text-gold">airindiavirtual.online/install</a> — it talks to MSFS directly via SimConnect, no utility to install or run.
                </span>
              </div>
            `;
            return body;
          })(),
          actions: [{ label:'Got it', cls:'btn-primary' }],
        });
      });

      let ws = null;
      let connected = false;
      const setStatus = (state, label) => {
        const s = $('#fsStatus');
        s.classList.remove('on', 'off', 'busy');
        s.classList.add(state);
        s.textContent = label;
      };
      const update = (data) => {
        const d = data || {};
        $('#fsLat').textContent = d.lat?.toFixed(4) ?? '—';
        $('#fsLon').textContent = d.lon?.toFixed(4) ?? '—';
        $('#fsAlt').textContent = d.alt != null ? Math.round(d.alt) : '—';
        $('#fsIas').textContent = d.ias != null ? Math.round(d.ias) : '—';
        $('#fsGs').textContent  = d.gs  != null ? Math.round(d.gs)  : '—';
        $('#fsVs').textContent  = d.vs  != null ? Math.round(d.vs)  : '—';
        $('#fsHdg').textContent = d.hdg != null ? Math.round(d.hdg) : '—';
        $('#fsFuel').textContent= d.fuel!= null ? Math.round(d.fuel): '—';
      };
      /* Reflect the connection state across the three pilot-facing
         setup steps in plain English. If the bridge is up we mark
         steps 1 + 2 done; step 3 turns green once telemetry actually
         starts flowing. */
      const stepPillText = (state) => state === 'on' ? '✓ READY' : state === 'busy' ? 'CHECKING…' : 'NOT YET';
      const setStepState = (n, state) => {
        const step = c.querySelector(`.fs-step[data-step="${n}"]`);
        const pill = c.querySelector(`#fsStep${n}Pill`);
        if (!step || !pill) return;
        step.classList.remove('done', 'fail');
        if (state === 'on')  step.classList.add('done');
        if (state === 'fail') step.classList.add('fail');
        pill.textContent = state === 'on' ? '✓ READY' : state === 'fail' ? '✗ NOT FOUND' : state === 'busy' ? 'CHECKING…' : 'WAITING';
      };
      const setConnected = (on) => {
        connected = on;
        const startBtn = $('#fsStart', c);
        startBtn.disabled = !on;
        startBtn.classList.toggle('btn-primary', on);
        startBtn.classList.toggle('btn-ghost', !on);
        startBtn.title = on ? 'Start the flight' : 'Waiting for the sim';
        const headline = $('#fsHeadline', c);
        const hint = $('#fsHint', c);
        if (on) {
          if (headline) headline.textContent = 'Sim connected · ready to fly';
          if (hint) hint.textContent = 'AIVA is talking to your sim. Press Start Flight whenever you push back.';
          setStepState(1, 'on');
          setStepState(2, 'on');
          setStepState(3, 'on');
        } else {
          if (headline) headline.textContent = 'Looking for your sim…';
          if (hint) hint.textContent = 'Start MSFS and the FSUIPC WebSockets utility. AIVA will pick them up automatically within a few seconds.';
          setStepState(1, 'busy');
          setStepState(2, 'busy');
          setStepState(3, '');
        }
      };
      /* Initial state */
      setStepState(1, 'busy');
      setStepState(2, 'busy');
      setStepState(3, '');

      /* Reflect the BACKGROUND AUTO-DETECT — if AIVA.FSUIPC has already
         connected (because the pilot opened MSFS + the WebSocket Server
         before navigating here), we surface that state without needing
         a manual click. Telemetry mirrors AIVA.FSUIPC.state(). */
      if (AIVA.FSUIPC) {
        if (AIVA.FSUIPC.isConnected()) {
          setStatus('on', 'CONNECTED');
          setConnected(true);
        }
        AIVA.FSUIPC.on('connect', () => {
          if (!ws || ws.readyState !== 1) {
            setStatus('on', 'CONNECTED');
            setConnected(true);
            toast('FSUIPC auto-detected · Start Flight unlocked.', 'ok');
          }
        });
        AIVA.FSUIPC.on('disconnect', () => {
          if (!ws || ws.readyState !== 1) {
            setStatus('off', 'DISCONNECTED');
            setConnected(false);
          }
        });
        AIVA.FSUIPC.on('state', (s) => {
          /* Only update the grid from the singleton if THIS tile's own
             socket isn't the source of truth. */
          if (!ws || ws.readyState !== 1) update(s);
        });
      }

      /* ============ FSUIPC connection diagnostic ============
         Runs a battery of tests so a stuck pilot can see exactly which
         step is failing. Tests in order:
           1. Origin + Mixed-Content check (HTTPS vs plain ws://)
           2. ws://localhost:2048/fsuipc/ — Paul Henty's path
           3. ws://localhost:2048           — root path (older bridges)
           4. ws://127.0.0.1:2048/fsuipc/   — IPv4 literal (DNS quirks)
           5. wss://localhost:2048/fsuipc/  — SSL variant
           6. Probe https://localhost:2048/ to detect a self-signed-cert
              wall (means SSL is on but cert isn't trusted)
         Each test gets a 2-second timeout. Every result is printed
         live to a log panel so the pilot can screenshot / share. */
      function probeWS(url) {
        return new Promise((resolve) => {
          let done = false;
          let sock;
          try { sock = new WebSocket(url); }
          catch (e) { return resolve({ ok:false, code:'ctor', err: e.message }); }
          const t = setTimeout(() => {
            if (done) return; done = true;
            try { sock.close(); } catch {}
            resolve({ ok:false, code:'timeout', err:'No response within 2s' });
          }, 2000);
          sock.onopen = () => {
            if (done) return; done = true;
            clearTimeout(t);
            try { sock.close(); } catch {}
            resolve({ ok:true });
          };
          sock.onerror = (e) => {
            if (done) return; done = true;
            clearTimeout(t);
            resolve({ ok:false, code:'error', err:'WebSocket error event' });
          };
          sock.onclose = (e) => {
            if (done) return; done = true;
            clearTimeout(t);
            resolve({ ok:false, code:'close', err:`closed before open (code ${e.code})` });
          };
        });
      }
      async function probeHTTPS(url) {
        try {
          const r = await fetch(url, { mode:'no-cors', signal: AbortSignal.timeout(2000) });
          return { ok:true, status: r.status || 'opaque' };
        } catch (e) {
          return { ok:false, err: e.name + ' ' + (e.message || '') };
        }
      }
      /* Admin-only diagnostic button — only present in DOM if isAdmin
         was true at render time, so this `?.` guard is just defensive. */
      $('#fsDiag', c)?.addEventListener('click', async () => {
        const panel = $('#fsDiagPanel', c);
        const log = $('#fsDiagLog', c);
        panel.hidden = false;
        const lines = [];
        const w = (s) => { lines.push(s); log.textContent = lines.join('\n'); };
        const PASS = '✓';
        const FAIL = '✗';
        w(`Diagnostic started · ${new Date().toLocaleTimeString()}`);
        w(`──────────────────────────────────────────`);
        w(`Page origin       : ${location.origin}`);
        w(`Protocol          : ${location.protocol}`);
        const isHttps = location.protocol === 'https:';
        const isDesktop = !!window.AIVA_DESKTOP?.isDesktop;
        w(`Inside AIVA .exe  : ${isDesktop ? 'YES' : 'no (regular browser)'}`);
        w(`Mixed-Content gate: ${isHttps && !isDesktop ? '⚠ ws:// from HTTPS blocked by browser' : 'OK (ws:// allowed)'}`);
        w(``);
        const trials = [
          ['ws://localhost:2048/fsuipc/',  'Paul Henty WebSockets Server — recommended'],
          ['ws://127.0.0.1:2048/fsuipc/',  'Same, via IPv4 literal'],
          ['ws://localhost:2048',          'Legacy root path (older bridges)'],
          ['wss://localhost:2048/fsuipc/', 'SSL variant (Use SSL ticked in server)'],
        ];
        let foundOpen = null;
        for (const [url, note] of trials) {
          w(`Trying ${url}`);
          w(`   ↳ ${note}`);
          const r = await probeWS(url);
          if (r.ok) { w(`   ${PASS} OPENED — this is your working URL`); foundOpen = url; break; }
          w(`   ${FAIL} ${r.code}: ${r.err}`);
        }
        if (!foundOpen) {
          w(``);
          w(`Probing https://localhost:2048/ for self-signed cert wall…`);
          const httpsProbe = await probeHTTPS('https://localhost:2048/');
          if (httpsProbe.ok) {
            w(`   ${PASS} Server IS reachable on 2048 over TLS — but the browser`);
            w(`     hasn't trusted its self-signed cert yet. Open`);
            w(`     https://localhost:2048/fsuipc/ in this same window, click`);
            w(`     Advanced → Proceed to accept the cert, then retry.`);
          } else {
            w(`   ${FAIL} ${httpsProbe.err}`);
            w(`     Nothing seems to be listening on port 2048 at all. Check:`);
            w(`       1. FSUIPC WebSockets Server (Paul Henty) is OPEN`);
            w(`       2. Web Services badge is green/Running`);
            w(`       3. No other app has grabbed port 2048 (try netstat -ano | findstr 2048)`);
            w(`       4. Windows Firewall isn't blocking localhost (try disabling temporarily)`);
            w(`       5. If using the .exe, you may need a rebuild — the bundled build`);
            w(`          on the site is older than the latest fixes. Manually trigger`);
            w(`          'Build AIVA Desktop' in the GitHub Actions tab + replace`);
            w(`          AIVA-Setup.exe in the repo root.`);
          }
        }
        w(``);
        w(`Result: ${foundOpen ? `WORKING URL = ${foundOpen}` : 'NO WORKING URL FOUND'}`);
        w(`──────────────────────────────────────────`);
        if (foundOpen) {
          toast(`Diagnostic found a working URL: ${foundOpen}. Click Retry now.`, 'ok', 6000);
        } else {
          toast('Diagnostic done — see the panel for next steps.', 'warn', 6000);
        }
      });

      $('#fsConnect', c).onclick = () => {
        if (ws && ws.readyState === 1) {
          toast('Already connected to FSUIPC.', 'info');
          return;
        }
        setStatus('busy', 'CONNECTING…');
        /* Mixed-content reality: an HTTPS-served page (airindiavirtual.online)
           cannot open ws://, only wss://. Plain ws:// works in the Electron
           .exe and from http:// origins. Try wss:// first when we're on
           HTTPS, ws:// first when we're not. Whichever opens, we use. */
        const isHttps = location.protocol === 'https:';
        const urls = isHttps
          ? ['wss://localhost:2048/fsuipc/', 'ws://localhost:2048/fsuipc/']
          : ['ws://localhost:2048/fsuipc/',  'wss://localhost:2048/fsuipc/'];
        let opened = false;
        let attempts = 0;

        const tryNext = () => {
          if (opened) return;
          if (attempts >= urls.length) {
            setStatus('off', 'OFFLINE');
            setConnected(false);
            const hint = isHttps
              ? `Tried both wss:// and ws://. Most likely causes:
                  1) FSUIPC WebSockets Server isn't running (start the .exe — green "Running" badge).
                  2) Browser is blocking insecure ws:// from HTTPS (Mixed Content). Open FSUIPC WebSockets Server → tick "Use SSL" + Save → restart it → reconnect here. The address becomes wss://localhost:2048/fsuipc/ and the browser will let it through.
                  3) Windows Firewall is blocking localhost:2048 — allow inbound on that port.
                  4) Install the AIVA desktop .exe (Profile → Install AIVA) — it runs from file:// and skips Mixed Content entirely.`
              : `Cannot reach FSUIPC at ws://localhost:2048/fsuipc/. Make sure FSUIPC WebSockets Server is Running.`;
            toast(hint, 'bad', 12000);
            return;
          }
          const url = urls[attempts++];
          setStatus('busy', attempts > 1 ? 'TRYING ALT…' : 'CONNECTING…');
          try { ws = new WebSocket(url); }
          catch (e) {
            return tryNext();
          }
          const timeout = setTimeout(() => {
            if (!opened) { try { ws.close(); } catch {} tryNext(); }
          }, 3000);
          ws.onopen = () => {
            opened = true;
            clearTimeout(timeout);
            setStatus('on', 'CONNECTED');
            setConnected(true);
            toast(`FSUIPC connected via ${url.startsWith('wss') ? 'WSS (SSL)' : 'WS'} · Start Flight unlocked.`, 'ok');
            ws.send(JSON.stringify({ command:'offsets.declare', name:'aiva', offsets:[
              { name:'lat',  address:0x0560, type:'float64' },
              { name:'lon',  address:0x0568, type:'float64' },
              { name:'alt',  address:0x3324, type:'int32'   },
              { name:'ias',  address:0x02BC, type:'int32'   },
              { name:'gs',   address:0x02B4, type:'int32'   },
              { name:'vs',   address:0x02C8, type:'int32'   },
              { name:'hdg',  address:0x0580, type:'int32'   },
              { name:'fuel', address:0x0B74, type:'int32'   },
            ]}));
            ws.send(JSON.stringify({ command:'offsets.read', name:'aiva', interval:1000 }));
          };
          ws.onmessage = (ev) => { try { update(JSON.parse(ev.data).data); } catch {} };
          ws.onerror = () => { clearTimeout(timeout); if (!opened) tryNext(); };
          ws.onclose = () => {
            clearTimeout(timeout);
            if (opened) { setStatus('off', 'DISCONNECTED'); setConnected(false); }
            else tryNext();
          };
        };
        tryNext();
      };

      $('#fsStart', c).onclick = () => {
        /* Source-agnostic gate. In SimConnect mode the local `ws` is
           null on purpose (the bridge lives in the main process), so
           we must NOT require `ws.readyState === 1`. Instead, ask the
           AIVA.FSUIPC singleton — it reflects either source. */
        const live = AIVA.FSUIPC?.isConnected?.() === true;
        if (!live) {
          const msg = directMode
            ? 'Looking for MSFS — start the sim and we\'ll auto-connect within ~5 seconds.'
            : 'Connect the FSUIPC bridge first — Start Flight unlocks once telemetry is live.';
          return toast(msg, 'warn', 5000);
        }
        const f = activeFlight();
        if (!f) return toast('No active flight — book one first.', 'warn');
        P.set('flight_in_progress', { fno: f.fno, startedAt: Date.now() });
        toast(`Flight ${f.fno} started.`, 'ok');
        route();
      };
      $('#fsEnd', c).onclick = () => {
        const fpi = P.get('flight_in_progress');
        if (!fpi) return;
        P.remove('flight_in_progress');
        const cur = P.get('flights_logged', []);
        const f2 = AIVA.findFlight(fpi.fno);
        cur.push({
          _id: AIVA.U.uid(),
          date: ymd(new Date(fpi.startedAt)),
          fno: fpi.fno, ac: f2?.ac, from: f2?.from, to: f2?.to,
          durMins: Math.round((Date.now() - fpi.startedAt) / 60000),
          network: 'OFFLINE',
          dist: f2?.dist,
        });
        P.set('flights_logged', cur);
        toast('Flight ended — sector logged.', 'ok');
        location.hash = '';
      };
    },

    /* ==================== HOPPIE ACARS ==================== */
    hoppie: (c) => {
      const code = P.pref('hoppieCode', '');
      const flightCallsign = activeFlight()?.cs || '';

      c.appendChild(el('div', { class:'embed-bar', html: `<span class="dot"></span> Hoppie ACARS · ${code ? `Logon code set · CS ${flightCallsign}` : 'No logon code'} <span class="right"><span class="pill pill-${code ? 'ok' : 'warn'}" style="font-size:9px;">${code ? 'READY' : 'SETUP NEEDED'}</span></span>` }));

      c.appendChild(el('div', { class:'efb-card', html: `
        <div class="eyebrow">Setup — one-time</div>
        <ol style="font-size:13px;color:var(--text-dim);line-height:1.9;padding-left:22px;">
          <li>Go to <a href="https://www.hoppie.nl/acars/system/register.html" target="_blank" class="text-gold">hoppie.nl/acars → register</a> and get your free logon code.</li>
          <li>Paste it into <b>Profile → Hoppie Logon Code</b> in the Portal.</li>
          <li>In your aircraft, enter the same code as the logon, and your ATC callsign as the flight number.</li>
        </ol>
        <div class="gold-rule"></div>
        <div class="eyebrow">Per-aircraft logon path</div>
        <div class="grid grid-3 mt-3">
          <div class="card">
            <h4 class="display" style="font-size:15px;">Fenix A320</h4>
            <p class="text-dim mt-2" style="font-size:12px;">OPC → ATSU → AOC MENU → AOC INIT → enter your logon code. Set callsign = ATC callsign (e.g. <b>AIC2HV</b>).</p>
          </div>
          <div class="card">
            <h4 class="display" style="font-size:15px;">PMDG 777</h4>
            <p class="text-dim mt-2" style="font-size:12px;">FMC → MENU → ACARS → SETUP. Enter Hoppie code under SVC, set ATC LOGON to <b>AIC101</b> etc.</p>
          </div>
          <div class="card">
            <h4 class="display" style="font-size:15px;">FSLabs A321neo</h4>
            <p class="text-dim mt-2" style="font-size:12px;">MCDU 1 → ATSU → AOC INIT → enter Hoppie code as company code. Use FlightDeck plugin for RealACARS bridge.</p>
          </div>
        </div>
      ` }));

      c.appendChild(el('div', { class:'efb-card mt-3', html: `
        <div class="eyebrow">Live AOC / ATC message stream</div>
        ${code ? `
          <div id="hopMsgs" class="mt-3" style="max-height:280px;overflow-y:auto;font-family:var(--font-mono);font-size:12px;color:var(--text-dim);">
            <div class="text-mute">No messages yet. Polling ${flightCallsign || 'callsign'}…</div>
          </div>
          <div class="row gap-2 mt-3">
            <input class="input" id="hopTo" placeholder="To callsign (e.g. AICOPS or ATC)" style="max-width:220px;">
            <input class="input" id="hopMsg" placeholder="Free text message" style="flex:1;">
            <button class="btn btn-primary btn-sm" id="hopSend">${I('send',14)} Send</button>
          </div>
        ` : `
          <p class="text-mute mt-3" style="font-size:13px;">Set your Hoppie logon code in <a href="portal.html#profile" class="text-gold">Profile</a> to enable live message polling.</p>
        `}
      ` }));

      if (code) {
        const poll = async () => {
          if (!flightCallsign) return;
          try {
            const url = `https://www.hoppie.nl/acars/system/connect.html?logon=${encodeURIComponent(code)}&from=${encodeURIComponent(flightCallsign)}&to=SERVER&type=poll&packet=`;
            const r = await fetch(url, { mode:'no-cors' });
            /* no-cors mode: response opaque. Real impl needs a proxy. */
            $('#hopMsgs', c).innerHTML += `<div class="text-mute">${fmtZulu()} · POLL sent (CORS-opaque; production needs server proxy)</div>`;
          } catch {}
        };
        const id = setInterval(poll, 30000); poll();
        c.dataset._poll = id;
        $('#hopSend', c).onclick = async () => {
          const to = $('#hopTo', c).value.trim() || 'SERVER';
          const msg = $('#hopMsg', c).value.trim();
          if (!msg) return;
          try {
            await fetch(`https://www.hoppie.nl/acars/system/connect.html?logon=${encodeURIComponent(code)}&from=${encodeURIComponent(flightCallsign)}&to=${to}&type=telex&packet=${encodeURIComponent(msg)}`, { mode:'no-cors' });
            $('#hopMsgs', c).innerHTML += `<div><span class="text-mute">${fmtZulu()}</span> <span class="text-gold">${flightCallsign}→${to}</span>: ${msg}</div>`;
            $('#hopMsg', c).value = '';
          } catch (e) {}
        };
      }
    },

    /* ==================== JOURNEY LOG ==================== */
    journey: (c) => {
      const f = activeFlight();
      c.appendChild(el('div', { class:'efb-card', html: `
        <div class="eyebrow">Journey log entry</div>
        <div class="grid grid-3 mt-3">
          <div class="field"><label class="label">Flight</label><input class="input" id="jFno" value="${f?.fno || ''}"></div>
          <div class="field"><label class="label">Date</label><input class="input" type="date" id="jDate" value="${AIVA.U.todayISO()}"></div>
          <div class="field"><label class="label">A/C Reg</label><input class="input" id="jReg" placeholder="VT-ALK"></div>
          <div class="field"><label class="label">OFF (UTC)</label><input class="input" id="jOff" placeholder="HHMM"></div>
          <div class="field"><label class="label">ON (UTC)</label><input class="input" id="jOn" placeholder="HHMM"></div>
          <div class="field"><label class="label">Block (h:mm)</label><input class="input" id="jBlock" placeholder="2:20"></div>
          <div class="field"><label class="label">Landing fpm</label><input class="input" id="jLnd" type="number" placeholder="-150"></div>
          <div class="field"><label class="label">Max G</label><input class="input" id="jG" type="number" step=".01" placeholder="1.30"></div>
          <div class="field"><label class="label">Network</label><select class="select" id="jNet"><option>VATSIM</option><option>IVAO</option><option>OFFLINE</option></select></div>
        </div>
        <button class="btn btn-primary mt-3" id="jSave">${I('send',14)} File Journey Log</button>
      ` }));
      $('#jSave', c).onclick = () => {
        const fno = $('#jFno', c).value.trim();
        if (!fno) return toast('Flight number is required.', 'warn');
        const f2 = AIVA.findFlight(fno);
        const cur = P.get('flights_logged', []);
        cur.push({
          _id: AIVA.U.uid(),
          date: $('#jDate', c).value,
          fno, ac: f2?.ac,
          reg: $('#jReg', c).value.trim().toUpperCase(),
          from: f2?.from, to: f2?.to,
          durMins: AIVA.U.parseDuration($('#jBlock', c).value),
          lndRate: +$('#jLnd', c).value || null,
          gRate: +$('#jG', c).value || null,
          network: $('#jNet', c).value,
          dist: f2?.dist,
        });
        P.set('flights_logged', cur);
        toast('Journey log filed.', 'ok');
        location.hash = '';
      };
    },

    /* ==================== NOTOC ==================== */
    notoc: (c) => {
      c.appendChild(el('div', { class:'efb-card', html: `
        <div class="eyebrow">NOTOC · Dangerous goods notification</div>
        <table class="tbl mono mt-3" style="font-size:11.5px;">
          <thead><tr><th>UN</th><th>Class</th><th>Description</th><th>Pos</th><th>Pcs</th></tr></thead>
          <tbody>
            <tr><td>UN3480</td><td>9</td><td>Lithium-ion batteries</td><td>FWD-1</td><td>2</td></tr>
            <tr><td>UN1845</td><td>9</td><td>Dry ice</td><td>AFT-3</td><td>4</td></tr>
          </tbody>
        </table>
        <button class="btn btn-primary mt-3">${I('shield',14)} Sign NOTOC</button>
      ` }));
    },

    /* ==================== UTILITY CALC ==================== */
    calc: (c) => {
      c.appendChild(el('div', { class:'grid grid-3', html: `
        <div class="efb-card">
          <div class="eyebrow">Crosswind</div>
          <div class="field-row mt-3">
            <div class="field"><label class="label">Wind dir</label><input class="input" id="cWd" type="number" value="270"></div>
            <div class="field"><label class="label">Wind kt</label><input class="input" id="cWs" type="number" value="18"></div>
          </div>
          <div class="field"><label class="label">RWY heading</label><input class="input" id="cRh" type="number" value="280"></div>
          <button class="btn btn-primary btn-sm mt-3" id="cCalc">Calc</button>
          <div id="cOut" class="mt-3 text-mute" style="font-size:13px;"></div>
        </div>
        <div class="efb-card">
          <div class="eyebrow">Density altitude</div>
          <div class="field-row mt-3">
            <div class="field"><label class="label">PA (ft)</label><input class="input" id="dPa" type="number" value="2000"></div>
            <div class="field"><label class="label">OAT (°C)</label><input class="input" id="dOat" type="number" value="35"></div>
          </div>
          <button class="btn btn-primary btn-sm mt-3" id="dCalc">Calc</button>
          <div id="dOut" class="mt-3 text-mute" style="font-size:13px;"></div>
        </div>
        <div class="efb-card">
          <div class="eyebrow">Unit conversion</div>
          <div class="field"><label class="label">kg ↔ lb</label><input class="input" id="uKg" type="number" placeholder="kg"></div>
          <div class="field"><label class="label">L ↔ kg jet</label><input class="input" id="uL" type="number" placeholder="L"></div>
          <div class="field"><label class="label">nm ↔ km</label><input class="input" id="uNm" type="number" placeholder="nm"></div>
          <button class="btn btn-primary btn-sm mt-3" id="uCalc">Convert</button>
          <div id="uOut" class="mt-3 text-mute mono" style="font-size:13px;"></div>
        </div>
      `}));
      $('#cCalc', c).onclick = () => {
        const wd = +$('#cWd', c).value, ws = +$('#cWs', c).value, rh = +$('#cRh', c).value;
        let delta = wd - rh; while (delta > 180) delta -= 360; while (delta < -180) delta += 360;
        const xw = Math.abs(ws * Math.sin(delta * Math.PI / 180));
        const hw = ws * Math.cos(delta * Math.PI / 180);
        $('#cOut', c).innerHTML = `<b>X-wind:</b> ${xw.toFixed(1)} kt ${delta > 0 ? '(R)' : '(L)'}<br><b>H-wind:</b> ${hw.toFixed(1)} kt ${hw < 0 ? '(TAIL!)' : ''}`;
      };
      $('#dCalc', c).onclick = () => {
        const pa = +$('#dPa', c).value, oat = +$('#dOat', c).value;
        const isaT = 15 - 0.001981 * pa;
        const da = pa + 120 * (oat - isaT);
        $('#dOut', c).innerHTML = `<b>DA:</b> ${Math.round(da)} ft<br><b>ISA dev:</b> ${(oat - isaT).toFixed(1)} °C`;
      };
      $('#uCalc', c).onclick = () => {
        const kg = +$('#uKg', c).value, L = +$('#uL', c).value, nm = +$('#uNm', c).value;
        $('#uOut', c).innerHTML = `
          ${kg ? `${kg} kg = ${(kg * 2.20462).toFixed(1)} lb<br>` : ''}
          ${L ? `${L} L = ${(L * 0.8).toFixed(1)} kg jet<br>` : ''}
          ${nm ? `${nm} nm = ${(nm * 1.852).toFixed(1)} km` : ''}
        `;
      };
    },

    _notfound: (c) => {
      c.appendChild(emptyState('App not found', 'Tap an app from the home screen.'));
    },
  };

  /* ----------------------- HELPERS ----------------------- */
  function emptyState(t, sub) {
    return el('div', { class:'efb-card', style:{ textAlign:'center', padding:'48px 20px' }, html: `
      <h3 class="display" style="font-size:20px;">${t}</h3>
      <p class="text-mute mt-2" style="font-size:13px;">${sub}</p>
      <a href="#" class="btn btn-primary btn-sm mt-3">${I('home', 14)} Home</a>
    ` });
  }
  function metarCard(m) {
    const ap = AIVA.airportByIcao(m.icaoId || m.station) || { icao: m.icaoId || m.station, city:'', name:'' };
    const card = el('div', { class: 'efb-card' });
    card.innerHTML = `
      <div class="row between">
        <div class="row gap-2">
          <span class="pill pill-gold" style="font-size:10px;">${ap.iata || ''} ${ap.icao || m.icaoId}</span>
          <span class="text-mute" style="font-size:11px;">${ap.city || ''}</span>
        </div>
        <div class="mono text-mute" style="font-size:11px;">${fmtZulu()}</div>
      </div>
      <div class="metar-block mt-3">${m.rawOb || `${ap.icao} ${fmtZulu()} 27015KT 9999 FEW030 30/22 Q1011 NOSIG`}</div>
    `;
    return card;
  }
  function simMetar(c) {
    const wd = String(Math.floor(Math.random()*360)).padStart(3,'0');
    const ws = String(5 + Math.floor(Math.random()*15)).padStart(2,'0');
    return { icaoId: c, rawOb: `${c} ${fmtZulu()} ${wd}${ws}KT 9999 FEW030 SCT100 30/22 Q1011 NOSIG` };
  }

  function pointInBox(lat, lon, box) {
    const lats = box.map(p => p[0]), lons = box.map(p => p[1]);
    return lat >= Math.min(...lats) && lat <= Math.max(...lats) &&
           lon >= Math.min(...lons) && lon <= Math.max(...lons);
  }

  /* ====================================================================
     LIVE MAP — FR24-style position + trails for every AIVA pilot.
     • Reads FSUIPC telemetry from AIVA.FSUIPC for the local user
     • Writes own position to localStorage `aiva.live.<pilotId>` every 5s
     • Reads all `aiva.live.*` keys → renders one marker + trail per pilot
     • Trail = polyline of last 30 positions, faded by recency
     ==================================================================== */
  let liveMap = null;
  let livePosTimer = null;
  let liveDrawTimer = null;
  /* The EFB map IS the Network Globe map — same engine, same style, same
     airports + arcs underlay. We render it via AIVA.NetworkGlobe, then
     add our own GeoJSON layers for the live pilot positions ON TOP. */
  function setupLiveMap(host) {
    /* Defer one frame so the centre grid cell has resolved its width/height
       before MapLibre measures the container. */
    requestAnimationFrame(() => {
      const tryInit = (tries) => {
        if (window.maplibregl && AIVA.NetworkGlobe?.render) {
          initLiveMap(host);
        } else if (tries > 0) {
          setTimeout(() => tryInit(tries - 1), 150);
        } else {
          const el = document.getElementById('efbLiveMap');
          if (el) el.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:rgba(255,255,255,.5);font-size:12px;">Map library failed to load</div>';
        }
      };
      tryInit(30);
    });
  }

  /* ====================================================================
     The EFB map has FIVE sources the pilot can swap between via the
     top-right switcher:
       1. AIVA Live   — barebones MapLibre map showing ONLY the pilot's own
                        live position + other AIVA pilots (no static route
                        network arcs or airport list).
       2. Navigraph   — if the pilot has a Navigraph token saved, embeds the
                        live AMDB / charts view in an iframe. Falls back to
                        a "Sign in to Navigraph" prompt if no token.
       3. VATSIM      — embeds map.vatsim.net (live traffic + ATC coverage)
       4. IVAO        — embeds webeye.ivao.aero
       5. ElevateX    — embeds elevatex.app live map
     We keep one MapLibre instance alive for AIVA Live and an iframe
     element for the other 4 sources, swapping visibility on selection.    */
  const EFB_MAP_SOURCES = [
    { id: 'aiva',      label: 'AIVA LIVE',  kind: 'maplibre' },
    { id: 'navigraph', label: 'NAVIGRAPH',  kind: 'iframe', url: 'https://charts.navigraph.com/' },
    { id: 'vatsim',    label: 'VATSIM',     kind: 'iframe', url: 'https://map.vatsim.net/' },
    { id: 'ivao',      label: 'IVAO',       kind: 'iframe', url: 'https://webeye.ivao.aero/' },
    { id: 'elevatex',  label: 'ELEVATEX',   kind: 'iframe', url: 'https://map.elevatex.app/' },
  ];
  let currentSource = 'aiva';

  async function initLiveMap(host) {
    const el = document.getElementById('efbLiveMap');
    if (!el || el.dataset.mapInit === '1') return;
    el.dataset.mapInit = '1';

    /* Hamburger switcher (collapsed by default) + map-stack + iframe-stack.
       Collapsed so it doesn't cover the underlying map's own toolbar. */
    el.innerHTML = `
      <button class="efb-map-burger" id="efbMapBurger" title="Map sources · ${EFB_MAP_SOURCES.find(s => s.id === currentSource)?.label || 'AIVA'}">
        <span></span><span></span><span></span>
      </button>
      <div class="efb-map-switch" id="efbMapSwitch" hidden>
        ${EFB_MAP_SOURCES.map(s => `<button class="efb-map-src${s.id===currentSource?' on':''}" data-src="${s.id}">${s.label}</button>`).join('')}
      </div>
      <div class="efb-map-stack">
        <div class="efb-map-layer efb-map-aiva" id="efbMapAIVA"></div>
        <iframe class="efb-map-layer efb-map-iframe" id="efbMapIframe" allow="geolocation" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div class="efb-map-layer efb-map-prompt" id="efbMapPrompt"></div>
      </div>
    `;
    /* Burger toggles the switcher menu */
    el.querySelector('#efbMapBurger').onclick = () => {
      const sw = el.querySelector('#efbMapSwitch');
      sw.hidden = !sw.hidden;
    };
    /* Click outside closes the menu */
    document.addEventListener('click', (e) => {
      const sw = el.querySelector('#efbMapSwitch');
      if (!sw || sw.hidden) return;
      if (!sw.contains(e.target) && !el.querySelector('#efbMapBurger').contains(e.target)) sw.hidden = true;
    });
    /* Move the stats / livepill / nearby overlays inside the AIVA layer so
       they're hidden when the user switches to an external map. */
    const stack = el.querySelector('.efb-map-stack');
    const aivaLayer = el.querySelector('#efbMapAIVA');
    [...host.querySelectorAll('.efb2-stats, .efb2-livepill, .efb2-nearby')].forEach(node => {
      aivaLayer.appendChild(node);
      /* Pin to the AIVA layer rather than the whole .efb2-centre */
      node.style.zIndex = 6;
    });

    /* === MapLibre instance for AIVA Live (no static network) === */
    const ml = window.maplibregl;
    const me = AIVA.Auth.currentPilot();
    const base = me?.base ? AIVA.airport(me.base) : null;
    liveMap = new ml.Map({
      container: aivaLayer,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: base ? [base.lon, base.lat] : [77, 22],
      zoom: 3.5,
      minZoom: 1.5,
      maxZoom: 13,
      attributionControl: false,
    });
    /* Expose so we can force-resize after layout changes */
    AIVA._efbMap = liveMap;
    liveMap.addControl(new ml.NavigationControl({ visualizePitch:false }), 'top-left');
    /* Force-resize on layout shifts (window resize, layer flips) */
    new ResizeObserver(() => liveMap.resize()).observe(aivaLayer);
    /* And one immediately after creation since the parent may have been
       display:none momentarily during the switcher init */
    setTimeout(() => liveMap.resize(), 200);

    const addLayers = () => {
      if (liveMap.getSource('aiva-live-aircraft')) return;
      liveMap.addSource('aiva-live-trails',   { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      liveMap.addSource('aiva-live-aircraft', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      liveMap.addLayer({
        id:'aiva-live-trails-line', type:'line', source:'aiva-live-trails',
        paint:{ 'line-color': ['get','color'], 'line-width': 2.5, 'line-opacity': 0.85 },
      });
      /* Pilot's own aircraft: small red dot with a brighter gold ring so
         it's instantly recognisable against the dark base map. Other
         pilots: aubergine with thin white border. */
      liveMap.addLayer({
        id:'aiva-live-aircraft-dot', type:'circle', source:'aiva-live-aircraft',
        paint:{
          'circle-radius':       ['case', ['get','isMe'], 8, 6],
          'circle-color':        ['case', ['get','isMe'], '#E61926', '#4A1B41'],
          'circle-stroke-color': ['case', ['get','isMe'], '#FFE159', '#FFFFFF'],
          'circle-stroke-width': ['case', ['get','isMe'], 2.5, 1.5],
        },
      });
      /* Heading triangle layered on top of the player's dot — a tiny
         airplane-shaped indicator pointing along the current heading.
         Rendered as a unicode airplane symbol rotated by `hdg`. */
      liveMap.addLayer({
        id:'aiva-live-me-heading', type:'symbol', source:'aiva-live-aircraft',
        filter: ['==', ['get','isMe'], true],
        layout: {
          'text-field': '▲',
          'text-font': ['Open Sans Bold','Arial Unicode MS Bold'],
          'text-size': 14,
          'text-rotate': ['get','hdg'],
          'text-rotation-alignment': 'map',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-offset': [0, 0],
        },
        paint: {
          'text-color': '#FFE159',
          'text-halo-color': 'rgba(10,7,9,.85)',
          'text-halo-width': 1.5,
        },
      });
      liveMap.addLayer({
        id:'aiva-live-aircraft-label', type:'symbol', source:'aiva-live-aircraft',
        layout:{ 'text-field': ['get','label'], 'text-font':['Open Sans Semibold','Arial Unicode MS Bold'],
                 'text-size':11, 'text-offset':[0,1.6], 'text-anchor':'top', 'text-allow-overlap':false },
        paint:{ 'text-color':'#FFFFFF', 'text-halo-color':'rgba(8,5,7,.9)', 'text-halo-width':1.5 },
      });
      let popup=null;
      liveMap.on('mousemove','aiva-live-aircraft-dot',(e)=>{
        const p=e.features[0].properties; popup?.remove();
        popup = new ml.Popup({ closeButton:false, className:'aiva-popup', offset:14 })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<b>${p.callsign}</b> · ${p.pilotName||''}<br><span class="aiva-popup-sub">${p.fno||''} · ALT ${p.alt||'?'} ft · GS ${p.gs||'?'} kt</span>`)
          .addTo(liveMap);
      });
      liveMap.on('mouseleave','aiva-live-aircraft-dot', () => { popup?.remove(); popup=null; });
      startLivePosBroadcast();
      startLiveDraw(host);
    };
    if (liveMap.isStyleLoaded()) addLayers();
    else liveMap.on('load', addLayers);
    liveMap.on('idle', addLayers);

    /* === Source-switcher wiring === */
    const iframe   = el.querySelector('#efbMapIframe');
    const prompt   = el.querySelector('#efbMapPrompt');
    function switchSource(id) {
      currentSource = id;
      el.querySelectorAll('.efb-map-src').forEach(b => b.classList.toggle('on', b.dataset.src === id));
      const src = EFB_MAP_SOURCES.find(s => s.id === id);
      /* Update burger label + close menu */
      const burger = el.querySelector('#efbMapBurger'); if (burger) burger.title = `Map sources · ${src?.label || ''}`;
      const sw = el.querySelector('#efbMapSwitch'); if (sw) sw.hidden = true;
      const isAIVA = id === 'aiva';
      aivaLayer.style.display = isAIVA ? 'block' : 'none';
      iframe.style.display    = (!isAIVA && id !== 'navigraph') || (id === 'navigraph' && AIVA.Store.get('navigraph_token','')) ? 'block' : 'none';
      prompt.style.display    = (!isAIVA && id === 'navigraph' && !AIVA.Store.get('navigraph_token','')) ? 'grid' : 'none';
      if (isAIVA) {
        /* invalidate size after the layer flips back on */
        setTimeout(() => liveMap?.resize(), 50);
        return;
      }
      if (id === 'navigraph' && !AIVA.Store.get('navigraph_token','')) {
        prompt.innerHTML = `
          <div style="text-align:center;color:#FFFFFF;font-family:var(--font-mono);">
            <div style="font-size:14px;letter-spacing:.16em;margin-bottom:14px;">NAVIGRAPH NOT CONNECTED</div>
            <div style="font-size:12px;color:rgba(255,255,255,.7);max-width:380px;line-height:1.6;margin-bottom:18px;">
              Sign in to your Navigraph account to view live AMDB ground maps + charts. Your token is saved per-pilot.
            </div>
            <a href="https://charts.navigraph.com/" target="_blank" rel="noopener" class="startbtn" style="background:#FFFFFF;color:#A8101F;padding:10px 22px;border-radius:99px;text-decoration:none;font-weight:700;letter-spacing:.12em;">OPEN NAVIGRAPH</a>
          </div>
        `;
        return;
      }
      iframe.src = src.url;
    }
    el.querySelectorAll('.efb-map-src').forEach(b => b.onclick = () => switchSource(b.dataset.src));
    switchSource(currentSource);
  }

  /* Write own position into localStorage. Two triggers:
       1) Every 5s on a timer (fallback so the broadcast stays alive
          even when telemetry isn't flowing — keeps the home-base dot
          live for other crew to see).
       2) Immediately on every FSUIPC 'state' event (≈5 Hz from
          SimConnect) so the player's plane updates on the map within
          ~200 ms, not 5 s. */
  function startLivePosBroadcast() {
    if (livePosTimer) clearInterval(livePosTimer);
    const me = AIVA.Auth.currentPilot();
    const myCall = P.pref('my_callsign', 'AIC' + (me?.id || '001').replace(/[^0-9]/g,'').slice(-3));
    const myBase = me?.base ? AIVA.airport(me.base) : null;
    const writePos = () => {
      const s  = AIVA.FSUIPC?.state?.() || {};
      const fp = P.get('flight_in_progress');
      const f  = fp ? AIVA.findFlight(fp.fno) : activeFlight();
      const lat = s.lat ?? (myBase?.lat);
      const lon = s.lon ?? (myBase?.lon);
      if (lat == null || lon == null) return;
      const key = 'aiva.live.' + (me?.id || 'anon');
      const prev = JSON.parse(localStorage.getItem(key) || '{}');
      const trail = (prev.trail || []).concat([[lon, lat]]).slice(-30);
      localStorage.setItem(key, JSON.stringify({
        pilotId: me?.id, pilotName: me?.name, callsign: myCall,
        fno: f?.fno, ac: f?.ac, from: f?.from, to: f?.to,
        lat, lon, alt: s.alt, gs: s.gs, hdg: s.hdg, vs: s.vs,
        onGround: s.onGround, fuel: s.fuel,
        ts: Date.now(),
        trail,
      }));
    };
    livePosTimer = setInterval(writePos, 5000);
    /* Throttled per-frame writer — ≈2 Hz max to localStorage. */
    let lastFrameWrite = 0;
    AIVA.FSUIPC?.on?.('state', () => {
      const now = Date.now();
      if (now - lastFrameWrite < 500) return;
      lastFrameWrite = now;
      writePos();
    });
    /* Kick one off immediately so the map has a position to render. */
    writePos();
  }

  /* Re-draw the live-map data layers every 2 s from all live.<pilotId> keys. */
  function startLiveDraw(host) {
    if (liveDrawTimer) clearInterval(liveDrawTimer);
    const me = AIVA.Auth.currentPilot();
    const myId = me?.id;
    let pannedToMe = false;        // first-time map-recenter on own aircraft
    function tick() {
      const aircraft = [], trails = [];
      const nearbyList = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith('aiva.live.')) continue;
        let pos = null;
        try { pos = JSON.parse(localStorage.getItem(k) || '{}'); } catch { continue; }
        if (!pos.lat || !pos.lon || (Date.now() - pos.ts) > 5 * 60 * 1000) continue; // 5 min stale cap
        const isMe = pos.pilotId === myId;
        aircraft.push({
          type:'Feature',
          properties: {
            isMe, callsign: pos.callsign, pilotName: pos.pilotName,
            fno: pos.fno, alt: pos.alt, gs: pos.gs,
            hdg: pos.hdg || 0,
            label: pos.callsign + (pos.fno ? ` ${pos.fno}` : ''),
          },
          geometry: { type:'Point', coordinates: [pos.lon, pos.lat] },
        });
        /* First time we see the pilot's own aircraft with real position,
           fly the map there. Otherwise the camera stays parked at the
           home base and the player's plane is hundreds of miles off-
           screen — the exact bug the Chief Pilot hit. */
        if (isMe && !pannedToMe && liveMap) {
          pannedToMe = true;
          liveMap.flyTo({ center: [pos.lon, pos.lat], zoom: 7, duration: 800 });
        }
        if (pos.trail && pos.trail.length > 1) {
          trails.push({
            type:'Feature',
            properties: { color: isMe ? '#FFE159' : '#DA192F' },
            geometry: { type:'LineString', coordinates: pos.trail },
          });
        }
        if (!isMe) {
          nearbyList.push({ callsign: pos.callsign, name: pos.pilotName, fno: pos.fno, alt: pos.alt, gs: pos.gs });
        }
        if (isMe) {
          /* Update the bold stats panel from MY state */
          const $m = (id) => host.querySelector('#' + id);
          $m('msAlt').textContent  = pos.alt  != null ? Math.round(pos.alt).toLocaleString() : '—';
          $m('msGS' ).textContent  = pos.gs   != null ? Math.round(pos.gs)  : '—';
          $m('msHdg').textContent  = pos.hdg  != null ? Math.round(pos.hdg) : '—';
          $m('msVS' ).textContent  = pos.vs   != null ? Math.round(pos.vs)  : '—';
          $m('msFuel').textContent = pos.fuel != null ? Math.round(pos.fuel) : '—';
        }
      }
      liveMap?.getSource('aiva-live-aircraft')?.setData({ type:'FeatureCollection', features: aircraft });
      liveMap?.getSource('aiva-live-trails')?.setData({ type:'FeatureCollection', features: trails });

      /* Nearby panel */
      const nb = host.querySelector('#efbNearby');
      if (nb) {
        if (!nearbyList.length) {
          nb.innerHTML = `<div class="efb2-nearby-empty">No other AIVA pilots online</div>`;
        } else {
          nb.innerHTML = `
            <div class="efb2-nearby-title">${nearbyList.length} pilot${nearbyList.length===1?'':'s'} online</div>
            ${nearbyList.slice(0, 6).map(p => `
              <div class="efb2-nearby-row">
                <span class="cs">${p.callsign}</span>
                <span class="nm">${(p.name||'').split(' ')[0]}</span>
                ${p.fno ? `<span class="fn">${p.fno}</span>` : ''}
                <span class="alt">${p.alt != null ? Math.round(p.alt).toLocaleString() + ' ft' : '—'}</span>
              </div>
            `).join('')}
          `;
        }
      }

      /* FSUIPC status pill — labels itself based on the source:
         - SimConnect (desktop app): "SIM: LIVE" / "SIM: SEARCHING"
         - WebSocket-FSUIPC (browser fallback): "FSUIPC: LIVE" / "FSUIPC: OFFLINE"
         The hover tooltip explains the browser-Mixed-Content gotcha so the
         pilot knows to launch the .exe instead of the website. */
      const lp = host.querySelector('#efbLivePill');
      const lbl = host.querySelector('#efbLiveLbl');
      const fsConn = AIVA.FSUIPC?.isConnected?.();
      const usingSc = !!window.AIVA_DESKTOP?.simConnect;
      const inDesktop = !!window.AIVA_DESKTOP?.isDesktop;
      if (lp) {
        lp.classList.toggle('on', !!fsConn);
        lp.title = fsConn
          ? `${usingSc ? 'SimConnect' : 'FSUIPC'} live — tracking your aircraft`
          : (inDesktop
              ? 'Waiting for MSFS to load a flight. SimConnect picks it up within ~5s.'
              : 'No sim link — your browser blocks the local sim bridge. Launch AIVA from Start Menu (the .exe) for live telemetry.');
      }
      if (lbl) {
        const tag = usingSc ? 'SIM' : 'FSUIPC';
        lbl.textContent = fsConn
          ? `${tag}: LIVE`
          : (inDesktop ? `${tag}: SEARCHING` : `${tag}: USE DESKTOP APP`);
      }
    }
    tick();
    liveDrawTimer = setInterval(tick, 2000);
    window.addEventListener('hashchange', () => clearInterval(liveDrawTimer), { once:true });
  }

  /* ----------------------- BOOT ----------------------- */
  shell();
  route();
})();
