/* =====================================================================
   AIR INDIA VIRTUAL — Portal
   Single-page hash-routed UI. Slim, brand-aligned, per-pilot storage.
   ===================================================================== */

(function () {
  const pilot = AIVA.Auth.requireAuth();
  if (!pilot) return;
  const P = AIVA.Store.pilot(pilot.id);

  /* One-time cleanup: drop active_flight if it points at a flight that's not
     on today's roster — fixes "AIC2807 ghost" from stale state. */
  (() => {
    const af = P.get('active_flight', null);
    if (!af) return;
    const today = ymd();
    const bookingsToday = (P.get('roster_bookings', []) || []).filter(b => b.date === today);
    if (!bookingsToday.find(b => b.fno === af)) {
      P.remove('active_flight');
      console.info(`[AIVA] Cleared stale active_flight=${af} (not on today's roster).`);
    }
  })();

  const { $, $$, el, fmtNum, fmtMins, fmtDate, fmtZulu, greeting, toast, modal,
          distance, parseCSV, detectFormat, mapColumn, parseDuration, avg, ymd } = AIVA.U;
  const I = AIVA.Icon;

  /* ----------------------- NAV ----------------------- */
  const NAV = [
    /* Sidebar order follows the actual pilot workflow:
         1. Plan the day  — dashboard → roster → book
         2. Build the OFP — ofp/navlog → met
         3. Fly + log     — simbridge → flights
         4. Reference     — fleet / docs / NOTAM / MEL / DGCA
         5. Crew + admin  — FDTL, ranks, crew, newsroom, myAI, profile
       Hoppie moved out of the portal entirely — lives on the EFB
       (admin auto-dispatch + pilot inbox both load there). */
    { group: 'Flying', items: [
      { id:'dashboard',  label:'Dashboard',     icon:'dashboard' },
      { id:'roster',     label:'My Roster',     icon:'calendar' },
      { id:'book',       label:'Book Roster',   icon:'plus', chip:'NEW' },
      { id:'ofp',        label:'OFP / Navlog',  icon:'route' },
      { id:'met',        label:'Met Briefing',  icon:'cloud' },
      { id:'simbridge',  label:'Sim Bridge',    icon:'wifi' },
      { id:'flights',    label:'My Flights',    icon:'plane', chipDyn:'logCount' },
    ]},
    { group: 'Operations', items: [
      { id:'notam',       label:'NOTAM / AIP',   icon:'alert' },
      { id:'network',     label:'Network Globe', icon:'globe' },
      { id:'situations',  label:'Situations',    icon:'activity' },
      { id:'announce',    label:'Announcements', icon:'megaphone' },
      { id:'import',      label:'Import flights',icon:'upload' },
      { id:'stats',       label:'Statistics',    icon:'gauge' },
    ]},
    { group: 'Fleet & Library', items: [
      { id:'fleet',       label:'Fleet Register', icon:'hangar' },
      { id:'flownfleet',  label:'Flown Fleet',    icon:'star' },
      { id:'docs',        label:'OM / FCOM / QRH',icon:'book' },
      { id:'dgca',        label:'DGCA / CAR',     icon:'shield' },
      { id:'mel',         label:'MEL / CDL',      icon:'doc' },
    ]},
    { group: 'Crew & Comms', items: [
      { id:'fdtl',      label:'FDTL Tracker',  icon:'clock' },
      { id:'ranks',     label:'Ranks',         icon:'star' },
      { id:'crew',      label:'Crew List',     icon:'users' },
      { id:'newsroom',  label:'Newsroom',      icon:'newspaper' },
      { id:'myai',      label:'myAI',          icon:'newspaper' },
      { id:'profile',   label:'Profile',       icon:'user' },
      ...(pilot.role === 'admin' ? [{ id:'review', label:'Review Queue', icon:'shield', adminOnly:true }] : []),
    ]},
    /* Crew Welfare items are intentionally NOT in the sidebar nav — they
       live inside the myAI tile grid (per Chief Pilot direction). The route
       table still knows about them so direct links / hash navigation work.
       Hoppie ACARS now lives on the EFB only (admin + pilot views). */
  ];

  /* ----------------------- SHELL ----------------------- */
  function shell() {
    document.body.innerHTML = '';
    const root = el('div', { class: 'app-shell' });

    const sb = el('aside', { class: 'sidebar', id: 'sidebar' });
    sb.innerHTML = `
      <div class="sidebar-head sidebar-head-logo">
        <a href="#dashboard" style="display:block;text-decoration:none;">
          <img src="assets/img/vaic-logo-colour.png?v=20260513z" alt="Air India Virtual" style="width:100%; max-width:180px; height:auto; display:block;"/>
        </a>
      </div>
      <nav class="sidebar-nav" id="navList"></nav>
      <div class="sidebar-foot">
        <div class="pilot">
          <div class="avatar">${pilot.avatar || pilot.name.split(' ').map(p => p[0]).slice(0,2).join('')}</div>
          <div class="info">
            <div class="pname">${pilot.name}</div>
            <div class="prank">${pilot.rank} · ${pilot.id}</div>
          </div>
        </div>
        <div class="row" style="gap:6px;">
          <button class="btn btn-primary btn-sm" id="openEfb" title="Open EFB" style="flex:1;">${I('plane', 14)} Open EFB</button>
          <button class="btn btn-ghost btn-sm" id="hardReload" title="Force-refresh AIVA · pulls the latest site code" style="width:34px; padding:6px;">${I('refresh', 14)}</button>
          <button class="btn btn-ghost btn-sm" id="doLogout" title="Logout" style="width:34px; padding:6px;">${I('logout', 14)}</button>
        </div>
      </div>
    `;
    root.appendChild(sb);

    const main = el('main');
    main.innerHTML = `
      <header class="topbar">
        <button class="iconbtn mobile-burger" id="burger">${I('menu', 16)}</button>
        <div class="breadcrumb">
          <div>
            <div class="page-title" id="pageTitle">Dashboard</div>
          </div>
          <div class="sub" id="pageSub">Operations · Live</div>
        </div>
        <div class="clock-grp">
          <button class="btn btn-ghost btn-sm pwa-install" id="pwaInstall" hidden title="Install AIVA as a desktop app">${I('download', 12)} Install AIVA</button>
          <span class="fs-chip fs-off" id="fsChip" title="FSUIPC not connected — start MSFS + FSUIPC WebSockets Server">FSUIPC ○</span>
          <div class="clock"><span class="lbl">Z</span><span id="zuluClock">—</span></div>
          <div class="clock"><span class="lbl">IST</span><span id="istClock">—</span></div>
          <button class="iconbtn tt theme-toggle" id="themeToggle" data-tt="Toggle light/dark">${I('moon', 16)}</button>
          <button class="iconbtn tt notif-bell" data-tt="Notifications">${I('bell', 14)}</button>
        </div>
      </header>
      <div class="content" id="content"></div>
    `;
    root.appendChild(main);
    document.body.appendChild(root);
    buildNav();
    bindShell();
    startClock();

    /* Mount the chatbot once shell is up */
    AIVA.Chatbot.mount(pilot);

    /* Mount the group crew chat — floating panel bottom-left */
    AIVA.CrewChat?.mount();
    /* Pipe incoming chat to native OS notifications when the window
       isn't focused. Skips own messages + reactions + avatar updates. */
    AIVA.CrewChat?.onMessage?.((msg) => {
      if (!msg || msg.type === 'reaction' || msg.type === 'avatar_set') return;
      if (msg.pilotId === pilot.id) return;
      const me = pilot.id;
      const visible = !msg.to || msg.to === me;
      if (!visible) return;
      const who = msg.pilotName?.split(' ')[0] || 'crew';
      const dmLabel = msg.to === me ? `${who} (DM)` : who;
      desktopNotify(msg.type === 'event' ? 'AIVA · crew event' : `AIVA · ${dmLabel}`,
                    msg.type === 'event' ? `${who} ${msg.text}` : msg.text);
    });
    /* Post a login event once per session — the panel doubles as an ops feed */
    if (!sessionStorage.getItem('aiva.cc_login_posted')) {
      AIVA.CrewChat?.event(`just signed on at ${pilot.base}`);
      sessionStorage.setItem('aiva.cc_login_posted', '1');
    }

    /* ====================================================================
       AUTO-FLOW BRIDGE
       Activates the moment any pilot logs in (AIVA credentials).
       Different behaviour per role:

       ALL PILOTS (incl. admin):
         • FSUIPC monitor tries to connect to ws://localhost:2048
         • Crash detection → opens crash-report modal on this pilot's screen
         • Hoppie auto-poll every 60 s (started inside the Hoppie page)
         • On 10k descent → auto-send a position report to admin's callsign
         • On landing → auto-send "ON BLOCKS at <dest>" to admin's callsign

       ADMIN ONLY (Gunant · AIV001):
         • Same as above, PLUS
         • On 10k descent → auto-send arrival gate to dispatch_target callsign
         • On landing → auto-send goodbye + roll dispatch_target to next sector
       ==================================================================== */

    /* AIVA.FSUIPC starts a 5-second auto-detect probe on script load. No
       manual connect() call needed — the moment FSUIPC's WebSocket Server
       is running, the 'connect' event fires and the topbar chip flips
       green. The original explicit connect() lived here for older versions
       that lacked auto-detect; harmless to keep as a hint to start sooner. */
    AIVA.FSUIPC?.connect?.().catch(() => { /* swallow — auto-detect handles retries */ });

    /* ============ Phase-driven announcement triggers ============
       AIVA.FSUIPC emits 'phase' events as the state machine transitions
       (GATE → PUSHBACK → TAXI_OUT → TAKEOFF → CLIMB → CRUISE → DESCENT
       → APPROACH → LANDED → TAXI_IN → PARKED). When the pilot's
       Announcements page is in AUTO mode, each phase transition picks
       a random recording from the matching stage's library and plays
       it. Guarded against double-firing per sector via firedStages. */
    const PHASE_TO_STAGE = {
      'GATE':     'pre_dep',
      'TAXI_OUT': 'safety',
      'DESCENT':  'descending',
      'APPROACH': 'belts_on',
      'LANDED':   'landed',
      'TAXI_IN':  'disarm',
      'PARKED':   'disarm',
    };
    const firedStages = new Set();
    AIVA.FSUIPC?.on?.('phase', ({ from, to, state }) => {
      const cfg = AIVA.Store.get('ann_cfg', { mode: 'manual' });
      if (cfg.mode !== 'auto') return;
      const stageId = PHASE_TO_STAGE[to];
      if (!stageId || firedStages.has(stageId)) return;
      const files = (AIVA.Store.get('ann_lib', {}) || {})[stageId] || [];
      if (!files.length) return;
      firedStages.add(stageId);
      const pick = files[Math.floor(Math.random() * files.length)];
      try { new Audio(pick.dataURL).play().catch(() => {}); } catch {}
      toast(`Cabin announcement · ${stageId}`, 'ok', 3500);
    });
    /* Pass-10k climb announcement uses the alt threshold, separate
       from the phase machine because passing 10,000 ft happens
       transiently during the CLIMB phase. */
    AIVA.FSUIPC?.on?.('state', (s) => {
      if (!s || s.onGround) return;
      if (!s._above10kSeenClimb && (s.alt || 0) > 10000 && (s.vs || 0) > 0) {
        s._above10kSeenClimb = true;
        const cfg = AIVA.Store.get('ann_cfg', { mode: 'manual' });
        if (cfg.mode !== 'auto') return;
        if (firedStages.has('pass_10k')) return;
        const files = (AIVA.Store.get('ann_lib', {}) || {}).pass_10k || [];
        if (!files.length) return;
        firedStages.add('pass_10k');
        const pick = files[Math.floor(Math.random() * files.length)];
        try { new Audio(pick.dataURL).play().catch(() => {}); } catch {}
        toast('Cabin announcement · passing 10,000 ft', 'ok', 3500);
      }
    });
    /* When a NEW sector starts, reset the fired-stages bookkeeping so
       the next departure gets its boarding/safety announcements too. */
    AIVA.FSUIPC?.on?.('connect', () => { /* keep firedStages — same sector */ });
    AIVA.FSUIPC?.on?.('landing', () => { /* allow post-landing stages */ });

    /* === "Install AIVA" button ===
       Takes the pilot to /install — branded landing page with the
       step-by-step guide. The page reads ?go=1 and auto-kicks the
       static .exe download (/AIVA-Setup.exe) so the pilot lands AND
       starts downloading in one click. Hidden inside the desktop
       wrapper (already installed). */
    document.addEventListener('click', (e) => {
      if (!(e.target.id === 'pwaInstall' || e.target.closest('#pwaInstall'))) return;
      e.preventDefault();
      window.location.href = '/install?go=1';
    });
    /* Hide the "Install AIVA" pill in every place we know we're already
       inside the desktop wrapper, not just AIVA_DESKTOP.isDesktop:
         - file:// origin (Electron loads index from disk)
         - user-agent contains "Electron" (older .exe builds without preload)
         - AIVA_DESKTOP global is present in any shape
       Belt-and-suspenders so pilots running an old .exe build still don't
       see the redundant Install CTA. */
    const insideDesktopApp =
      !!window.AIVA_DESKTOP?.isDesktop ||
      !!window.AIVA_DESKTOP ||
      location.protocol === 'file:' ||
      /Electron/i.test(navigator.userAgent || '');
    if (insideDesktopApp) {
      setTimeout(() => { const b = document.getElementById('pwaInstall'); if (b) b.hidden = true; }, 0);
    } else {
      /* Show the button — the .exe is available to anyone on the website. */
      setTimeout(() => { const b = document.getElementById('pwaInstall'); if (b) b.hidden = false; }, 0);
    }

    /* === SHARED — crash detection for every pilot === */
    AIVA.FSUIPC?.on('crash', (info) => {
      AIVA.Store.pilot(pilot.id).set('crash_pending', info);
      toast(`Sim crash detected near ${info.lastPos || 'last position'} — please file a report`, 'bad');
      AIVA.CrewChat?.event(`went off-net mid-flight near ${info.lastPos || 'last reported position'} — crash report pending`);
      setTimeout(() => AIVA._openCrashReport?.(info), 1500);
    });

    /* Small helper — fires a Hoppie POST (no response needed for one-way
       auto-messages). Goes through AIVA.Dispatch.fetchViaProxies so a
       rate-limited corsproxy.io doesn't silently swallow phase-trigger
       progress reports. Callsign mirrors the Hoppie page: ACTIVE FLIGHT
       cs > saved my_callsign > pilot-id derived. The cockpit ATSU is
       logged on with the flight callsign, so messages from/to it MUST
       match or they're lost on the network. */
    async function hoppieAutoSend(to, type, body) {
      const code = P.pref('hoppieCode', '');
      if (!code) return;
      const fpRec     = P.get('flight_in_progress');
      const activeFl  = fpRec ? AIVA.findFlight?.(fpRec.fno) : null;
      const activeCs  = (activeFl?.cs || '').toString().trim().toUpperCase();
      const fallback  = 'AIC' + (pilot.id || '001').replace(/[^0-9]/g, '').slice(-3).padStart(3, '0');
      const savedCs   = (P.pref('my_callsign', '') || '').trim();
      const myCall    =
        /^[A-Z]{2,3}\d{2,4}$/i.test(activeCs) ? activeCs.toUpperCase() :
        /^[A-Z]{2,3}\d{2,4}$/i.test(savedCs) ? savedCs.toUpperCase()  :
        fallback;
      const url = 'https://www.hoppie.nl/acars/system/connect.html?' +
        new URLSearchParams({ logon: code, from: myCall, to, type, packet: body });
      try {
        await AIVA.Dispatch.fetchViaProxies(url);
        /* Log locally so it appears in the pilot's Hoppie log */
        const log = AIVA.Store.get('hoppie_log', []);
        log.push({ dir:'tx', from: myCall, to, type, body, ts: Date.now(), hoppie:'ok', auto:true });
        AIVA.Store.set('hoppie_log', log.slice(-200));
      } catch(_){}
    }

    /* === PILOT AUTO-FLOW (everyone) ===
       Whenever the pilot crosses 10k ft on descent OR touches down, send
       a quick OPS/PROGRESS to admin (AIC001) so dispatch sees their state. */
    AIVA.FSUIPC?.on('descent10k', async (info) => {
      const myCall = P.pref('my_callsign','AIC' + (pilot.id || '001').replace(/[^0-9]/g,'').slice(-3));
      /* Find this pilot's active sector from today's bookings */
      const today = ymd();
      const bks = AIVA.Store.pilot(pilot.id).get('roster_bookings', []).filter(b => b.date === today);
      const active = bks[0] ? AIVA.findFlight(bks[0].fno) : null;
      const dest = active ? (AIVA.airport(active.to)?.icao || active.to) : (info.dest || 'XXXX');
      const body = `PROGRESS · ${myCall}\nDESCENDING THROUGH FL100 INTO ${dest}\nGS ${info.gs||'?'} kt · ${info.lat?.toFixed?.(2) || '?'}, ${info.lon?.toFixed?.(2) || '?'}`;
      await hoppieAutoSend('AIC001', 'progress', body);
      AIVA.CrewChat?.event(`passing FL100 inbound ${AIVA.airport(active?.to)?.city || dest}`, { phase: 'descent10k' });
      toast('Sent progress report to dispatch (FL100 descent)', 'ok');
    });

    AIVA.FSUIPC?.on('landing', async (info) => {
      const myCall = P.pref('my_callsign','AIC' + (pilot.id || '001').replace(/[^0-9]/g,'').slice(-3));
      const today = ymd();
      const bks = AIVA.Store.pilot(pilot.id).get('roster_bookings', []).filter(b => b.date === today);
      const active = bks[0] ? AIVA.findFlight(bks[0].fno) : null;
      const destCity = active ? (AIVA.airport(active.to)?.city || active.to) : '';
      const body = `ON BLOCKS · ${myCall}${destCity ? ' at ' + destCity : ''}\nBlock complete · awaiting AOC confirmation`;
      await hoppieAutoSend('AIC001', 'progress', body);
      AIVA.CrewChat?.event(`landed${destCity ? ' at ' + destCity : ''}`, { phase: 'landed' });
      toast(`Sent on-blocks report to dispatch${destCity ? ' (' + destCity + ')' : ''}`, 'ok');
      /* If pilot has a NEXT booking today, auto-fetch SimBrief for that next
         leg in the background and queue it so the pre-flight pack is ready. */
      const nextIdx = bks.findIndex(b => b.fno === active?.fno) + 1;
      const nextBk  = bks[nextIdx];
      if (nextBk) {
        const nextF = AIVA.findFlight(nextBk.fno);
        if (nextF) {
          toast(`Next leg in roster: ${nextF.fno} ${nextF.from}→${nextF.to}`, 'ok');
          /* Pull SimBrief for next leg if username configured (auto-prep) */
          const sb = P.pref('simbrief_user', '');
          if (sb) {
            AIVA.Dispatch.fetchSimbriefOFP(sb).then(ofp => {
              AIVA.Store.pilot(pilot.id).set('next_leg_ofp', ofp);
              toast('Next-leg SimBrief OFP cached', 'ok');
            }).catch(()=>{});
          }
        }
      }
    });

    /* === ADMIN-ONLY auto-flow (Gunant) ===
       Layered ON TOP of the pilot flow above — admin's portal also fires
       OUTBOUND dispatch to whoever is in dispatch_target. */
    if (pilot.role === 'admin') {
      AIVA.FSUIPC?.on('descent10k', async (info) => {
        const target = AIVA.Store.get('dispatch_target', null);
        if (!target?.callsign) return;
        const a = AIVA.airportByIcao(target.dest) || AIVA.airport(target.dest);
        const iata = a?.iata || target.dest;
        const body = AIVA.Dispatch.arrivalGate(iata, target.ac, target.pilotFirstName);
        if (!body) return;
        await hoppieAutoSend(target.callsign, 'telex', body);
        toast(`Auto-sent arrival gate to ${target.callsign}`, 'ok');
      });
      AIVA.FSUIPC?.on('landing', async (info) => {
        const target = AIVA.Store.get('dispatch_target', null);
        if (!target?.callsign) return;
        const a = AIVA.airportByIcao(target.dest) || AIVA.airport(target.dest);
        const iata = a?.iata || target.dest;
        const body = AIVA.Dispatch.goodbye(target.pilotFirstName, iata);
        await hoppieAutoSend(target.callsign, 'telex', body);
        toast(`Auto-sent goodbye to ${target.callsign}`, 'ok');
        /* Auto-roll dispatch_target to next sector */
        const allPilots = AIVA.Auth.allPilots();
        for (const p of allPilots) {
          const bks = AIVA.Store.pilot(p.id).get('roster_bookings', [])
            .filter(b => b.date >= ymd())
            .sort((a,b) => a.date.localeCompare(b.date));
          const idx = bks.findIndex(b => b.fno.endsWith((target.callsign.match(/(\d+)$/)||[,''])[1]));
          if (idx !== -1 && bks[idx+1]) {
            const next = AIVA.findFlight(bks[idx+1].fno);
            if (next) {
              AIVA.Store.set('dispatch_target', {
                callsign: 'AIC' + (next.fno.match(/(\d+)$/)||[,''])[1],
                dest: AIVA.airport(next.to)?.icao || next.to,
                ac: next.ac,
                pilotFirstName: p.name.split(' ')[0],
              });
              toast(`Rolled dispatch to next leg · ${next.fno} ${next.from}→${next.to}`, 'ok');
            }
            break;
          }
        }
      });
    }

    /* Tell the pilot the auto-flow is active. One-time toast per session. */
    if (!sessionStorage.getItem('autoflow_announced')) {
      sessionStorage.setItem('autoflow_announced', '1');
      setTimeout(() => {
        toast(`Auto-flow active · FSUIPC + Hoppie polling enabled for ${pilot.name.split(' ')[0]}`, 'ok');
      }, 1500);
    }
  }

  function buildNav() {
    const host = $('#navList');
    host.innerHTML = '';
    NAV.forEach(grp => {
      const g = el('div', { class: 'nav-group' });
      g.appendChild(el('div', { class: 'nav-group-title', text: grp.group }));
      grp.items.forEach(it => {
        const dyn = it.chipDyn === 'logCount' ? (P.get('flights_logged', []).length || '') : null;
        const chip = it.chip || dyn;
        const node = el('a', {
          class: 'nav-item',
          href: `#${it.id}`,
          dataset: { route: it.id },
          html: `<span class="icon">${I(it.icon, 16)}</span><span>${it.label}</span>${chip ? `<span class="chip">${chip}</span>` : ''}`,
        });
        g.appendChild(node);
      });
      host.appendChild(g);
    });
  }
  function bindShell() {
    $('#doLogout').addEventListener('click', AIVA.Auth.logout);
    $('#openEfb').addEventListener('click', () => location.href = 'efb.html');
    $('#burger').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    /* Hard-reload button (always visible in the sidebar foot). Forces a
       cache-bypass reload so pilots running an old .exe still get latest
       site code without having to know Ctrl+Shift+R exists. */
    $('#hardReload')?.addEventListener('click', () => {
      toast('Forcing reload — pulling latest AIVA code…', 'ok', 2000);
      setTimeout(() => location.reload(true), 200);
    });
    window.addEventListener('hashchange', route);
    /* Theme toggle */
    const applyTheme = (t) => {
      document.documentElement.setAttribute('data-theme', t);
      AIVA.Store.set('theme', t);
      const btn = $('#themeToggle');
      /* Sun when in dark mode (click → go light), moon when in light mode (click → go dark) */
      if (btn) btn.innerHTML = t === 'light' ? AIVA.Icon('moon', 16) : AIVA.Icon('sun', 16);
    };
    applyTheme(AIVA.Store.get('theme', 'dark'));
    $('#themeToggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }
  function startClock() {
    const tick = () => {
      const now = new Date();
      $('#zuluClock').textContent = String(now.getUTCHours()).padStart(2,'0') + ':' + String(now.getUTCMinutes()).padStart(2,'0') + ':' + String(now.getUTCSeconds()).padStart(2,'0');
      const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
      $('#istClock').textContent = String(ist.getHours()).padStart(2,'0') + ':' + String(ist.getMinutes()).padStart(2,'0') + ':' + String(ist.getSeconds()).padStart(2,'0');
    };
    tick(); setInterval(tick, 1000);

    /* FSUIPC status chip — driven by the AIVA.FSUIPC singleton which runs
       a 5-second auto-detect probe in the background. The pilot doesn't
       have to click anything: in the .exe, SimConnect picks MSFS up
       automatically; on the web, FSUIPC WebSockets Server is the path
       (blocked by Mixed Content unless you load the desktop app). */
    const chip = $('#fsChip');
    const isDesktopApp = !!window.AIVA_DESKTOP?.isDesktop;
    const usingSimConnect = !!window.AIVA_DESKTOP?.simConnect;
    const setFsChip = (state) => {
      if (!chip) return;
      chip.classList.remove('fs-on','fs-off');
      chip.classList.add(state === 'on' ? 'fs-on' : 'fs-off');
      const label = usingSimConnect ? 'SIM' : 'FSUIPC';
      chip.textContent = state === 'on' ? `${label} ●` : `${label} ○`;
      chip.title = state === 'on'
        ? `${usingSimConnect ? 'SimConnect' : 'FSUIPC'} connected · tracking live`
        : (isDesktopApp
            ? 'Waiting for MSFS — start the sim and load a flight. SimConnect detects it within ~5s.'
            : 'No sim link — your browser blocks the local sim bridge. Open AIVA from your Start Menu (the .exe) instead.');
    };
    if (AIVA.FSUIPC) {
      setFsChip(AIVA.FSUIPC.isConnected() ? 'on' : 'off');
      AIVA.FSUIPC.on('connect',    () => { setFsChip('on');  desktopNotify('FSUIPC connected', 'Bridge live · Start Flight unlocked.'); });
      AIVA.FSUIPC.on('disconnect', () => { setFsChip('off'); desktopNotify('FSUIPC disconnected', 'Bridge offline. Reconnect from the EFB.'); });
      AIVA.FSUIPC.on('descent10k', (info) => desktopNotify('Passing 10,000 ft', `${info?.fno || 'Flight'} descending through FL100.`));
      AIVA.FSUIPC.on('landing',    (info) => desktopNotify('Touchdown', `${info?.fno || 'Flight'} on the ground.`));
      AIVA.FSUIPC.on('crash',      (info) => desktopNotify('Sim disconnect', `${info?.fno || 'Flight'} lost telemetry mid-air — crash report queued.`));
    }
  }

  /* Desktop-only native notification helper. Silently no-ops in the
     browser. Honors the per-pilot opt-out (Profile → OS notifications).
     Only fires when the window isn't focused — in-foreground we use
     toasts, OS notifications would just be noise. The `force` flag
     overrides the focus check for high-priority events (FDTL violation,
     sim crash, etc). */
  function desktopNotify(title, body, opts = {}) {
    if (!window.AIVA_DESKTOP?.isDesktop) return;
    if (AIVA.Store.get('desktop_notif', true) === false) return;
    if (!opts.force && document.hasFocus()) return;
    try { window.AIVA_DESKTOP.notify({ title, body }); } catch {}
  }
  AIVA._desktopNotify = desktopNotify;

  /* ============ AIVA RELEASE NOTES =============
     Chronological feed of platform updates + new routes. The dashboard
     shows the latest few; the OS-notification system fires once per
     new entry the first time the pilot loads the portal after the
     release date. Add new items at the TOP. */
  const AIVA_RELEASE_NOTES = [
    { date: '2026-05-15', tag: 'ROUTE',    title: 'Delhi ↔ Ludhiana service launched',
      body: 'Air India commenced twice-daily AI481/482/483/484 between DEL and Halwara on A320 family. Live in Book Roster.' },
    { date: '2026-05-15', tag: 'PLATFORM', title: 'AIVA v1.3 — Maharaja release',
      body: 'EFB Vista redesign, system tray + OS notifications (desktop), end-to-end encrypted chat, profile-pic cropper with cross-device sync, FSUIPC diagnostic.' },
    { date: '2026-05-14', tag: 'PLATFORM', title: 'Chat reactions, replies, DMs',
      body: 'Hover a message to react, reply with quoted context, or click a pilot to DM them. 2-hour rolling retention.' },
    { date: '2026-05-13', tag: 'PLATFORM', title: 'NOTAMs from SimBrief OFP',
      body: 'NOTAM page now pulls live NOTAMs from your latest dispatched SimBrief OFP — no API keys needed.' },
  ];
  AIVA.RELEASE_NOTES = AIVA_RELEASE_NOTES;

  /* Fire desktop notifications for any release notes newer than the
     pilot's last-seen marker. Capped at 3 so a fresh install doesn't
     spam the Action Center on first launch. */
  (function announceReleaseNotes() {
    try {
      const lastSeen = P.get('last_seen_release', '2000-01-01');
      const fresh = AIVA_RELEASE_NOTES.filter(n => n.date > lastSeen);
      if (!fresh.length) return;
      fresh.slice(0, 3).forEach((n, i) => {
        setTimeout(() => desktopNotify(`AIVA · ${n.tag === 'ROUTE' ? 'New route' : 'New release'}`,
                                       `${n.title}\n${n.body.slice(0, 120)}${n.body.length > 120 ? '…' : ''}`,
                                       { force: i === 0 }),
                   2000 + i * 1500);
      });
      P.set('last_seen_release', AIVA_RELEASE_NOTES[0].date);
    } catch {}
  })();
  function route() {
    const id = (location.hash.replace('#','').split('/')[0] || 'dashboard');
    $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === id));
    const matched = NAV.flatMap(g => g.items).find(it => it.id === id);
    /* Page-title fallback table for routes that aren't in the sidebar nav
       (welfare pages live in the myAI tile grid only). */
    const HIDDEN_TITLES = {
      payslip:'Payslip', competency:'Competency Card', leave:'Leave Relief',
      hotels:'Layover & Hotel', layovers:'Layover & Hotel',
      welfare:'Crew Welfare', bylaws:'Bylaws',
    };
    $('#pageTitle').textContent = matched ? matched.label : (HIDDEN_TITLES[id] || 'Dashboard');
    $('#pageSub').textContent = (PAGES[id]?.sub || 'Operations · Live');
    const c = $('#content'); c.innerHTML = '';
    (PAGES[id] || PAGES.dashboard).render(c);
    if (window.innerWidth < 980) $('#sidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    /* Show the Maharaja onboarding tip for this tab, unless skipped */
    showOnboardingFor(id);
  }

  /* ================================================================
     ONBOARDING — Maharaja explains each tab the first time you visit.
     Pilot can "Skip this" or "Don't show again" for the whole system.
     ================================================================ */
  const ONBOARDING = {
    dashboard: { title:'Welcome aboard', body:'This is your **Crew Terminal**. Top hero shows your duty status — today\'s flights and what\'s next. Below: KPIs, a 7-day roster strip, and Quick Access tiles to jump anywhere.' },
    roster:    { title:'My Roster',       body:'Your full month at a glance. Tap any **green** day to see all sectors that day. Days with multiple legs show a "X sectors" header. Tap an empty day to book.' },
    book:      { title:'Book a roster',   body:'Three modes:\n• **Search & Book** — click a pin on the globe or type a city/IATA to filter flights, then add sectors to your basket and confirm.\n• **Generate Roster** — auto-build a 1–4 day rotation from your base.\n• **Monthly Bid** — bid the whole month with hour/off-day/aircraft filters.' },
    flights:   { title:'My Flights log',  body:'Every flight you\'ve completed, with block time, landing rate, and OFP attached. Import from SimBrief XML, or add manually. Use **Statistics** for trends.' },
    simbridge: { title:'Sim Bridge',       body:'Live diagnostic of the AIVA ↔ MSFS link. Shows which protocol you\'re on (SimConnect inside the .exe, FSUIPC WebSocket in a browser), live telemetry, and a "Retry now" that\'s source-aware. The first place to check if the EFB or dashboard shows OFFLINE while telemetry is actually flowing.' },
    import:    { title:'Import flights',  body:'Drag an SBA XML, CSV, or Volanta export here. AIVA auto-detects the format, maps columns, and only adds new (de-duped) sectors.' },
    stats:     { title:'Statistics',      body:'Hours by month, by aircraft, by route, plus your landing rate distribution. All data is local to your pilot ID — nothing leaves the device.' },
    briefing:  { title:'Crew Briefing',   body:'Your today/tomorrow briefing pack — NOTAMs to acknowledge, weather summary, fuel policy, and crew bulletins. Always check before you push back.' },
    met:       { title:'Met Briefing',    body:'METAR / TAF / SIGMET for your route. Tap any station for the raw + decoded read. SIGWX charts auto-load if you have a Navigraph token.' },
    notam:     { title:'NOTAM / AIP',     body:'Filtered NOTAMs for departure, destination, and alternates. Acknowledge them here — your tick syncs to the briefing pack.' },
    ofp:       { title:'OFP / Navlog',    body:'Generate a SimBrief flight plan from your booking, then download the OFP PDF + simulator FMS files. Saved per-booking so you can re-open later.' },
    performance:{ title:'Performance',    body:'Takeoff and landing performance for the actual aircraft + airport + weather you have. Cross-checks against AFM limits and shows margin.' },
    wb:        { title:'Weight & Balance',body:'Build a load sheet — pax, bags, cargo, fuel. AIVA plots CG against the envelope and confirms ZFW + TOW + LDW are legal.' },
    network:   { title:'Network globe',   body:'Spin the globe (drag + scroll to zoom), click any pin to see every route from there as gold arcs. Toggle My flights / AI mainline / IX Express / All routes.' },
    fleet:     { title:'Fleet Register',  body:'Every aircraft Air India + IX operates, grouped by type. Tap a registration for delivery date, age, and base assignment.' },
    docs:      { title:'Document Library',body:'FCOM, FCTM, QRH, MEL, FOM — by aircraft type. Tap a chapter to open the official PDF in-app. Search across all docs.' },
    fdtl:      { title:'FDTL Tracker',    body:'DGCA CAR 7-J compliance: rolling 7d / 28d / yearly counters plus night/sector caps. Red bars = you\'re close to a limit; green = legal.' },
    newsroom:  { title:'Air India Newsroom', body:'Press releases mirrored from airindia.com/in/en/newsroom. The latest official updates from the company — partnerships, route launches, retrofit milestones.' },
    myai:      { title:'myAI',            body:'The internal employee hub — payslip, leave relief, competency card, hotel & transport, layover browser, bylaws, crew welfare FAQ. Most tiles deep-link to existing AIVA pages.' },
    profile:   { title:'Profile',         body:'Your identity, integrations (SimBrief, Mapbox, Hoppie), preferences. Theme toggle lives in the topbar.' },
  };
  function showOnboardingFor(id) {
    if (!ONBOARDING[id]) return;
    const skipAll  = AIVA.Store.get('onb_skip_all', false);
    if (skipAll) return;
    const seenKey  = 'onb_seen_' + id;
    if (AIVA.Store.get(seenKey, false)) return;
    AIVA.Store.set(seenKey, true);   // mark seen now; pilot can still close

    const o = ONBOARDING[id];
    const wrap = document.createElement('div');
    wrap.className = 'onb-toast';
    wrap.innerHTML = `
      <div class="onb-card">
        <div class="onb-figure"><img src="assets/img/maharaja.png?v=20260513m" alt=""></div>
        <div class="onb-body">
          <div class="onb-eyebrow">Maharaja says</div>
          <div class="onb-title">${o.title}</div>
          <div class="onb-text">${o.body.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>')}</div>
          <div class="onb-actions">
            <button class="btn btn-ghost btn-sm" data-skip="all">Don’t show again</button>
            <button class="btn btn-primary btn-sm" data-skip="this">Got it</button>
          </div>
        </div>
        <button class="onb-close" aria-label="Close">✕</button>
      </div>
    `;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    const dismiss = () => { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 250); };
    wrap.querySelector('[data-skip="this"]').onclick = dismiss;
    wrap.querySelector('.onb-close').onclick = dismiss;
    wrap.querySelector('[data-skip="all"]').onclick = () => {
      AIVA.Store.set('onb_skip_all', true);
      dismiss();
    };
  }

  /* ----------------------- HELPERS ----------------------- */
  function flightCardEl(f, opts = {}) {
    if (!f) {
      const div = el('div', { class: 'flight-card', style: { textAlign:'center', padding:'40px 20px' } });
      div.innerHTML = `
        <div style="color:var(--text-mute); font-size:28px;">${AIVA.Icon('plane', 32)}</div>
        <div class="display mt-3" style="font-size:18px;">${opts.title || 'No flight scheduled'}</div>
        <div class="text-mute mt-2" style="font-size:12px;">Book a roster to get started.</div>
        <a href="#book" class="btn btn-primary btn-sm mt-4">${I('plus', 14)} Book a flight</a>
      `;
      return div;
    }
    const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);
    const div = el('div', { class: `flight-card ${opts.active ? 'active' : ''}` });
    div.innerHTML = `
      <div class="head">
        <div class="left">
          <div class="fno">${f.fno}</div>
          <div class="cs">ATC ${f.cs} · ${f.op === 'AI' ? 'AIRINDIA' : 'EXPRESS INDIA'}</div>
        </div>
        <div class="row gap-2">
          <span class="pill pill-gold">${f.ac}</span>
          <span class="pill ${opts.active ? 'pill-red' : 'pill-aubergine'}">${opts.active ? 'ACTIVE' : (opts.label || f.cat.toUpperCase())}</span>
        </div>
      </div>
      <div class="route-line">
        <div class="ap from">
          <div class="code">${f.from}</div>
          <div class="city">${fromA?.city || ''} · ${fromA?.icao || ''}</div>
          <div class="time">STD ${f.dep} LT</div>
        </div>
        <div class="arrow"></div>
        <div class="ap to">
          <div class="code">${f.to}</div>
          <div class="city">${toA?.city || ''} · ${toA?.icao || ''}</div>
          <div class="time">STA ${f.arr} LT</div>
        </div>
      </div>
      <div class="foot">
        <div class="item"><div class="lbl">Block</div><div class="val">${f.dur}</div></div>
        <div class="item"><div class="lbl">Distance</div><div class="val">${fmtNum(f.dist)} nm</div></div>
        <div class="item"><div class="lbl">Aircraft</div><div class="val">${f.ac}</div></div>
      </div>
      <div class="actionbar">
        <button class="btn btn-primary btn-sm" data-act="dispatch">${I('send', 14)} Dispatch</button>
        <button class="btn btn-ghost btn-sm" data-act="charts">${I('map', 14)} Charts</button>
        <button class="btn btn-ghost btn-sm" data-act="efb">${I('plane', 14)} Open in EFB</button>
      </div>
    `;
    div.querySelector('[data-act="dispatch"]').onclick = () => openSimbrief(f);
    div.querySelector('[data-act="charts"]').onclick   = () => { location.href = `efb.html#charts/${f.to}`; };
    div.querySelector('[data-act="efb"]').onclick      = () => { P.set('active_flight', f.fno); location.href = `efb.html`; };
    return div;
  }
  function openSimbrief(f) {
    const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);
    const u = `https://dispatch.simbrief.com/options/custom?orig=${fromA.icao}&dest=${toA.icao}&type=${encodeURIComponent(f.ac)}&airline=${f.op === 'AI' ? 'AIC' : 'AXB'}&fltnum=${f.fno.replace(/\D/g,'')}&deph=00&depm=00&route=`;
    window.open(u, '_blank', 'noopener');
    toast('SimBrief dispatch opened.', 'ok');
  }
  function landingRateColor(v) {
    if (v == null) return 'var(--text-mute)';
    const abs = Math.abs(v);
    if (abs < 100) return 'var(--ok)';
    if (abs < 200) return 'var(--ai-gold-bright)';
    if (abs < 400) return 'var(--warn)';
    return 'var(--bad)';
  }

  /* ----------------------- BOOKING ----------------------- */
  function getBookings() {
    const raw = P.get('roster_bookings', []);

    /* ===== Migration: fix UTC-shifted dates from pre-ymd() code =====
       Pilots who confirmed rosters BEFORE the local-date fix had their
       booking dates saved using `new Date().toISOString().slice(0,10)`,
       which for IST users after 05:30 local returned YESTERDAY's UTC
       date. Those bookings end up < today and get nuked by the purge
       below, even though they were intended for today (or later).

       Heuristic: if a booking's date string is EARLIER than the local
       date of its ts (creation) timestamp, the date was wrong at save
       time — bump it to match the local date of ts. Future-dated
       bookings (auto-generated rotations) have date >= ts-day so they
       pass through untouched. */
    let migrated = false;
    const fixed = raw.map(b => {
      if (!b.ts || !b.date) return b;
      const tsLocal = ymd(new Date(b.ts));
      if (b.date < tsLocal) { migrated = true; return { ...b, date: tsLocal, _migrated: true }; }
      return b;
    });
    if (migrated) {
      P.set('roster_bookings', fixed);
      console.info(`[AIVA] Migrated stale UTC-shifted booking date(s) to local.`);
    }

    /* Auto-clean past-dated bookings on read. Stale bookings from the old
       deterministic bid generator (pre-2026-05-14) littered the roster with
       past dates that were never actually flown. We purge them here once. */
    const today = ymd();
    const cleaned = fixed.filter(b => (b.date || '') >= today);
    if (cleaned.length !== fixed.length) {
      P.set('roster_bookings', cleaned);
      console.info(`[AIVA] Purged ${fixed.length - cleaned.length} past-dated booking(s).`);
    }
    return cleaned;
  }
  function setBookings(b) { P.set('roster_bookings', b); }

  /* ====================================================================
     CLAIMS QUEUE — manual flight adds + crash reports.
     Stored GLOBALLY (not per-pilot) so the admin can review all crews.
     Schema: { id, type, pilotId, pilotName, payload, files:[{name,dataUrl}], ts, status }
     ==================================================================== */
  function getClaims() { return AIVA.Store.get('claims_queue', []); }
  function setClaims(arr) { AIVA.Store.set('claims_queue', arr); }
  function addClaim(claim) {
    const all = getClaims();
    claim.id = 'CL' + (Date.now() % 100000000);
    claim.ts = Date.now();
    claim.status = 'pending';
    claim.pilotId   = pilot.id;
    claim.pilotName = pilot.name;
    all.push(claim);
    setClaims(all);
    return claim;
  }
  async function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: r.result });
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  /* Modal: pilot adds a flight manually but MUST attach a Volanta/ElevateX CSV. */
  function openManualClaimModal() {
    const body = el('div');
    body.innerHTML = `
      <div class="text-mute" style="font-size:12.5px;line-height:1.55;margin-bottom:14px;">
        Manual logbook entries must be backed by a CSV export from <b>Volanta</b> or <b>ElevateX</b> covering this exact sector. Admin reviews and approves before it lands in your logbook.
      </div>
      <div class="grid grid-2" style="gap:10px;">
        <div><div class="label">Date (YYYY-MM-DD)</div><input class="input mono" id="cmDate" value="${ymd()}"/></div>
        <div><div class="label">Flight number</div><input class="input mono" id="cmFno" placeholder="AI187"/></div>
        <div><div class="label">From (IATA)</div><input class="input mono" id="cmFrom" placeholder="DEL"/></div>
        <div><div class="label">To (IATA)</div><input class="input mono" id="cmTo" placeholder="BOM"/></div>
        <div><div class="label">Aircraft type</div><select class="input" id="cmAc">${AIVA.fleetTypes().map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>
        <div><div class="label">Registration</div><input class="input mono" id="cmReg" placeholder="VT-XXX"/></div>
        <div><div class="label">Block time (hh:mm)</div><input class="input mono" id="cmBlock" placeholder="2:15"/></div>
        <div><div class="label">Landing rate (fpm, negative)</div><input class="input mono" id="cmLnd" placeholder="-140"/></div>
        <div><div class="label">Network</div><select class="input" id="cmNet"><option>OFFLINE</option><option>VATSIM</option><option>IVAO</option><option>POSCON</option></select></div>
        <div><div class="label">Notes</div><input class="input" id="cmNotes" placeholder="optional"/></div>
      </div>

      <div class="mt-3" style="padding:14px;border:2px dashed var(--border-gold);border-radius:12px;background:rgba(255,225,89,.04);">
        <div class="label" style="margin-bottom:6px;">Required · CSV export from Volanta / ElevateX</div>
        <input type="file" id="cmCsv" accept=".csv,text/csv" style="font-size:12px;color:var(--text);">
        <div class="text-mute mt-2" style="font-size:11px;">Export → CSV, filter to this sector, upload. The admin will check the CSV matches your claimed times before approving.</div>
      </div>

      <div class="text-mute mt-3" style="font-size:11px;">Status after submit: <b>PENDING</b>. You'll see it in the queue badge until accepted.</div>
    `;
    modal({
      title: 'File flight claim',
      body,
      actions: [
        { label:'Cancel', cls:'btn-ghost' },
        { label:'Submit claim', cls:'btn-primary', onClick: async (close) => {
          const fno = $('#cmFno', body).value.trim().toUpperCase();
          const from = $('#cmFrom', body).value.trim().toUpperCase();
          const to   = $('#cmTo',   body).value.trim().toUpperCase();
          const file = $('#cmCsv',  body).files?.[0];
          if (!fno || !from || !to) { toast('Need flight, from, to', 'bad'); return; }
          if (!file) { toast('CSV export from Volanta/ElevateX is required', 'bad'); return; }
          if (file.size > 5 * 1024 * 1024) { toast('CSV must be < 5 MB', 'bad'); return; }
          const csv = await fileToDataURL(file);
          addClaim({
            type: 'manual_flight',
            payload: {
              date:  $('#cmDate', body).value,
              fno, from, to,
              ac:    $('#cmAc',   body).value,
              reg:   $('#cmReg',  body).value.trim().toUpperCase(),
              block: $('#cmBlock',body).value.trim(),
              lnd:   $('#cmLnd',  body).value.trim(),
              net:   $('#cmNet',  body).value,
              notes: $('#cmNotes',body).value.trim(),
            },
            files: [csv],
          });
          toast('Claim submitted — awaiting admin review', 'ok');
          buildNav();
          close();
        }},
      ],
    });
  }

  /* Modal: pilot files a sim-crash report with supporting screenshots. */
  function openCrashReportModal(detected = {}) {
    const body = el('div');
    body.innerHTML = `
      <div class="text-mute" style="font-size:12.5px;line-height:1.55;margin-bottom:14px;">
        Your sim disconnected mid-flight before reaching the destination. File a crash report — attach <b>screenshots</b> of the crash, ATC log, or sim-error dialog as proof. Admin reviews; approved reports count toward your hours.
      </div>
      <div class="grid grid-2" style="gap:10px;">
        <div><div class="label">Flight number (in progress)</div><input class="input mono" id="crFno" value="${detected.fno || ''}"/></div>
        <div><div class="label">Last known position</div><input class="input mono" id="crPos" value="${detected.lastPos || ''}" placeholder="lat,lon or fix"/></div>
        <div><div class="label">Block flown (hh:mm)</div><input class="input mono" id="crBlock" placeholder="1:42"/></div>
        <div><div class="label">Cause</div><select class="input" id="crCause">
          <option>Sim crash · CTD</option><option>FSUIPC disconnect</option><option>MSFS lockup</option><option>Network drop</option><option>Power outage</option><option>Other</option>
        </select></div>
      </div>
      <div class="mt-3"><div class="label">Narrative</div><textarea class="input" id="crNarr" rows="4" placeholder="What happened, from gate to crash. Be specific."></textarea></div>
      <div class="mt-3" style="padding:14px;border:2px dashed var(--border-red);border-radius:12px;background:rgba(218,25,47,.06);">
        <div class="label" style="margin-bottom:6px;">Required · proof screenshots (1–4 files)</div>
        <input type="file" id="crFiles" accept="image/*" multiple style="font-size:12px;color:var(--text);">
        <div class="text-mute mt-2" style="font-size:11px;">PNG / JPG, max 3 MB each. Crash dialog, FSUIPC error log, ATC console, anything that confirms the incident.</div>
      </div>
    `;
    modal({
      title: 'Sim crash report',
      body,
      actions: [
        { label:'Cancel', cls:'btn-ghost' },
        { label:'Submit report', cls:'btn-primary', onClick: async (close) => {
          const fno = $('#crFno', body).value.trim().toUpperCase();
          const narr = $('#crNarr', body).value.trim();
          const files = [...($('#crFiles', body).files || [])];
          if (!fno) { toast('Need flight number', 'bad'); return; }
          if (!narr) { toast('Need narrative', 'bad'); return; }
          if (!files.length) { toast('Need at least one screenshot', 'bad'); return; }
          if (files.length > 4) { toast('Max 4 screenshots', 'bad'); return; }
          if (files.some(f => f.size > 3 * 1024 * 1024)) { toast('Each file must be < 3 MB', 'bad'); return; }
          const dataUrls = await Promise.all(files.map(fileToDataURL));
          addClaim({
            type: 'crash_report',
            payload: {
              fno,
              lastPos: $('#crPos',   body).value.trim(),
              block:   $('#crBlock', body).value.trim(),
              cause:   $('#crCause', body).value,
              narrative: narr,
              detected,
            },
            files: dataUrls,
          });
          P.remove('crash_pending');
          toast('Crash report filed · admin notified', 'ok');
          buildNav();
          close();
        }},
      ],
    });
  }
  /* Expose globally so the FSUIPC monitor can call it */
  AIVA._openCrashReport = openCrashReportModal;
  function clearAllBookings() { P.set('roster_bookings', []); }
  function nextDays(n) {
    const out = []; const today = new Date(); today.setHours(0,0,0,0);
    for (let i = 0; i < n; i++) out.push(new Date(today.getTime() + i * 86400000));
    return out;
  }
  function findBooking(date) {
    return getBookings().find(b => b.date === date);
  }
  /* Returns a merged flight record for a booking — the live flight
     looked up from data.js, but with from/to/ac OVERLAID from the
     booking record where present. AIVA.RAW has duplicate flight
     numbers for legitimate multi-leg sectors (e.g. AI173 DEL→VIE
     and AI173 VIE→ORD); findFlight returns the first match, which
     isn't always the leg the pilot booked. Saving from/to in the
     booking gives us the right answer regardless. */
  function bookingFlight(b) {
    const live = AIVA.findFlight(b.fno) || null;
    if (!b.from && !b.to) return live;
    /* If the booking has from/to but the live tuple disagrees, fall
       back to a synthesised flight that respects the booking. */
    if (live && live.from === b.from && live.to === b.to) return live;
    /* Search RAW for a matching directional variant of this fno. */
    const variants = (AIVA.FLIGHTS || []).filter(f => f.fno === b.fno);
    const matched = variants.find(f => f.from === b.from && f.to === b.to);
    if (matched) return matched;
    /* As a last resort: shape an object from the booking + best-effort
       fields off the live tuple so the UI doesn't crash. */
    return {
      fno: b.fno, cs: live?.cs || b.fno,
      from: b.from, to: b.to,
      op: b.op || live?.op || 'AI',
      ac: b.ac || live?.ac || 'A20N',
      acName: AIVA.acTypeName(b.ac || live?.ac || 'A20N'),
      dist: live?.dist || 0, dur: live?.dur || '0:00', durMins: live?.durMins || 0,
      dep:  live?.dep  || '—', arr: live?.arr  || '—',
      cat:  live?.cat  || 'unknown', region: live?.region || 'India',
    };
  }
  /* Returns ALL bookings on a given date, sorted by departure time. */
  function findBookingsOnDate(date) {
    return getBookings()
      .filter(b => b.date === date)
      .map(b => ({ ...b, _f: bookingFlight(b) }))
      .sort((x, y) => (x._f?.dep || '99:99').localeCompare(y._f?.dep || '99:99'));
  }

  /* ----------------------- PAGES ----------------------- */
  const PAGES = {

    /* ============ DASHBOARD ============ */
    dashboard: {
      sub: 'Operations · Live',
      render: (c) => {
        const bookings = getBookings();
        const today = ymd();
        const todayBookings = findBookingsOnDate(today);
        /* "Next" = the EARLIEST upcoming day with at least one booking */
        const futureDates = [...new Set(bookings.filter(b => b.date > today).map(b => b.date))].sort();
        const nextDate = futureDates[0];
        const nextBookings = nextDate ? findBookingsOnDate(nextDate) : [];
        const todayBk = todayBookings[0];   // legacy single-day refs
        const nextBk  = nextBookings[0];
        const todayF = todayBk ? todayBk._f : null;
        const nextF  = nextBk  ? nextBk._f  : null;

        const logged = P.get('flights_logged', []);
        const totalNm  = logged.reduce((s, f) => s + (Number(f.dist)    || 0), 0);
        const totalMins= logged.reduce((s, f) => s + (Number(f.durMins) || 0), 0);
        const lr = logged.filter(f => f.lndRate);

        c.appendChild(el('section', { html: `
          <div class="hero-card">
            <div class="vista-bg-art" aria-hidden="true">${AIVA.VistaArch(360, 420)}</div>
            <div class="eyebrow">Crew Terminal · ${pilot.base} base</div>
            <h1>${greeting()}, <em>${pilot.rank} ${pilot.name.split(' ')[0]}</em>.</h1>
            <div class="namaste">नमस्ते — your roster is loaded. The Maharaja awaits.</div>
            <div class="hero-meta">
              <div class="meta-item"><div class="lbl">Crew ID</div><div class="val">${pilot.id}</div></div>
              <div class="meta-item"><div class="lbl">Base</div><div class="val">${pilot.base} · ${AIVA.airport(pilot.base)?.city || ''}</div></div>
              <div class="meta-item"><div class="lbl">Type rating</div><div class="val">${pilot.aircraft.slice(0,3).join(' · ')}${pilot.aircraft.length > 3 ? ' +' + (pilot.aircraft.length - 3) : ''}</div></div>
              <div class="meta-item"><div class="lbl">Medical</div><div class="val">${pilot.medClass} · ${pilot.medExpiry || '—'}</div></div>
            </div>
          </div>
        ` }));

        /* ============ LIVE FLIGHT IN PROGRESS — pinned at top ============ */
        const fpRec = P.get('flight_in_progress');
        if (fpRec) {
          /* Prefer the merged-from-booking flight (right direction + ac).
             Falls back to findFlight if the active flight isn't on the
             roster anymore. */
          const fpFlight = (() => {
            const today = ymd();
            const bookings = P.get('roster_bookings', []) || [];
            const todayBks = bookings.filter(b => b.date <= today + 'z');
            const bk = todayBks.find(b => b.fno === fpRec.fno);
            return bk ? bookingFlight(bk) : AIVA.findFlight(fpRec.fno);
          })();
          if (fpFlight) {
            const fromA = AIVA.airport(fpFlight.from), toA = AIVA.airport(fpFlight.to);
            c.appendChild(el('section', { html: `
              <div class="card fp-card mt-4">
                <div class="row between mb-2">
                  <div>
                    <div class="eyebrow" style="color:var(--ai-gold-bright);">Flight in progress</div>
                    <h3 class="display" style="font-size:22px;margin:6px 0 2px;">${fpFlight.fno} · ${fpFlight.from} → ${fpFlight.to}</h3>
                    <div class="text-mute" style="font-size:12.5px;">${fromA?.city} to ${toA?.city} · ${fpFlight.ac} · ${fpFlight.dur} block</div>
                  </div>
                  <div style="text-align:right;">
                    <div class="fp-phase" id="fpPhase">AWAITING SIM</div>
                    <div class="mono text-mute mt-1" style="font-size:11px;" id="fpEta">ETA —</div>
                  </div>
                </div>
                <div class="fp-bar"><div class="fp-fill" id="fpFill" style="width:0%"></div></div>
                <div class="row between mt-2 mono" style="font-size:10.5px;color:var(--text-mute);">
                  <span id="fpPct">0% complete</span>
                  <span class="row gap-2">
                    <a href="efb.html" class="btn btn-ghost btn-sm">${I('plane',12)} Open EFB</a>
                    <button class="btn btn-ghost btn-sm" id="fpCancel" title="Stop this flight without filing">${I('close',12)} End flight</button>
                  </span>
                </div>
              </div>
            ` }));

            /* "End flight" hard-stop on the dashboard card itself —
               pilots don't have to go to the EFB → FSUIPC tile just to
               clear a stuck flight_in_progress record. */
            const cancelBtn = $('#fpCancel', c);
            if (cancelBtn) cancelBtn.onclick = () => {
              if (!confirm('Stop the in-progress flight without filing a PSR? Any auto-detected events (10k descent, landing) will reset.')) return;
              P.remove('flight_in_progress');
              toast('Flight stopped.', 'ok');
              AIVA.FSUIPC?.resetSector?.();
              route();
            };

            /* Progress source: ONLY drive the bar when AIVA.FSUIPC is
               actively reporting telemetry. The old elapsed-time
               fallback was the bug — even without a sim attached, the
               bar would keep ticking off wall-clock minutes. With no
               telemetry we stay at 0% and show "AWAITING SIM" so the
               pilot knows nothing's actually happening. */
            const totalDist = fromA && toA ? AIVA.U.distance(fromA.lat, fromA.lon, toA.lat, toA.lon) : 0;
            const totalMins = fpFlight.durMins || 60;
            const tickFP = () => {
              const fillEl = document.getElementById('fpFill');
              if (!fillEl) return;
              const pctEl  = document.getElementById('fpPct');
              const phEl   = document.getElementById('fpPhase');
              const etaEl  = document.getElementById('fpEta');
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
                fillEl.style.width = pct.toFixed(1) + '%';
                if (pctEl) pctEl.textContent = pct.toFixed(0) + '% complete';
                if (phEl)  phEl.textContent  = phase;
                if (etaEl) {
                  const remainMins = totalMins * (1 - pct/100);
                  const eta = new Date(Date.now() + remainMins * 60000);
                  etaEl.textContent = `ETA ${String(eta.getUTCHours()).padStart(2,'0')}:${String(eta.getUTCMinutes()).padStart(2,'0')}z`;
                }
              } else {
                /* No live data — stay frozen at 0% and label clearly. */
                fillEl.style.width = '0%';
                if (pctEl) pctEl.textContent = 'Awaiting sim telemetry';
                if (phEl)  phEl.textContent  = 'AWAITING SIM';
                if (etaEl) etaEl.textContent = 'ETA —';
              }
            };
            tickFP();
            const fpTimer = setInterval(tickFP, 5000);
            AIVA.FSUIPC?.on?.('connect',    tickFP);
            AIVA.FSUIPC?.on?.('disconnect', tickFP);
            const fpObs = new MutationObserver(() => {
              if (!document.getElementById('fpFill')) { clearInterval(fpTimer); fpObs.disconnect(); }
            });
            fpObs.observe(document.body, { childList: true, subtree: true });
          }
        }

        const flights = el('section', { class: 'grid grid-2' });
        /* If multi-sector today, render a stacked card; otherwise the original single-card */
        if (todayBookings.length > 1) {
          const tCard = el('div', { class:'card flight-card flight-card-active' });
          const totalT = todayBookings.reduce((s,b) => s + (b._f?.durMins || 0), 0);
          tCard.innerHTML = `
            <div class="row between mb-2">
              <div>
                <div class="eyebrow" style="color:var(--ai-gold);">${todayBookings.length} sectors today</div>
                <div class="display" style="font-size:18px;font-weight:600;margin-top:4px;">${(totalT/60).toFixed(1)} block hours</div>
              </div>
              <span class="pill pill-gold">TODAY</span>
            </div>
            <div class="col gap-2">
              ${todayBookings.map((bk, i) => bk._f ? `
                <div style="padding:10px 12px;background:rgba(255,225,89,.06);border-radius:10px;border:1px solid rgba(255,225,89,.18);">
                  <div class="row between">
                    <div class="row gap-2">
                      <span class="mono" style="color:var(--ai-gold);font-size:11px;">#${i+1}</span>
                      <span class="mono"><b>${bk._f.fno}</b></span>
                      <span class="text-mute" style="font-size:12px;">${AIVA.airport(bk._f.from)?.city} → ${AIVA.airport(bk._f.to)?.city}</span>
                    </div>
                    <span class="mono text-mute" style="font-size:11px;">${bk._f.dep}–${bk._f.arr} · ${bk._f.dur}</span>
                  </div>
                </div>` : '').join('')}
            </div>
          `;
          flights.appendChild(tCard);
        } else {
          flights.appendChild(flightCardEl(todayF, { active: !!todayF, title:'No flight today' }));
        }

        if (nextBookings.length > 1) {
          const nCard = el('div', { class:'card flight-card' });
          const totalN = nextBookings.reduce((s,b) => s + (b._f?.durMins || 0), 0);
          const niceDate = nextDate ? new Date(nextDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) : '';
          nCard.innerHTML = `
            <div class="row between mb-2">
              <div>
                <div class="eyebrow">${niceDate} · ${nextBookings.length} sectors</div>
                <div class="display" style="font-size:18px;font-weight:600;margin-top:4px;">${(totalN/60).toFixed(1)} block hours</div>
              </div>
              <span class="pill">NEXT</span>
            </div>
            <div class="col gap-2">
              ${nextBookings.map((bk, i) => bk._f ? `
                <div style="padding:10px 12px;background:rgba(218,25,47,.05);border-radius:10px;border:1px solid rgba(218,25,47,.16);">
                  <div class="row between">
                    <div class="row gap-2">
                      <span class="mono" style="color:var(--ai-red-bright);font-size:11px;">#${i+1}</span>
                      <span class="mono"><b>${bk._f.fno}</b></span>
                      <span class="text-mute" style="font-size:12px;">${AIVA.airport(bk._f.from)?.city} → ${AIVA.airport(bk._f.to)?.city}</span>
                    </div>
                    <span class="mono text-mute" style="font-size:11px;">${bk._f.dep}–${bk._f.arr} · ${bk._f.dur}</span>
                  </div>
                </div>` : '').join('')}
            </div>
          `;
          flights.appendChild(nCard);
        } else {
          flights.appendChild(flightCardEl(nextF, { label: 'NEXT', title: 'Nothing scheduled next' }));
        }
        c.appendChild(flights);

        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Your Numbers</h2><div class="sub">All-time · imported & flown</div></div></div>
          <div class="kpi-grid">
            <div class="kpi"><div class="lbl">Flights Logged</div><div class="val">${logged.length}</div><div class="sub">across ${new Set(logged.map(f => f.to)).size} ports</div><div class="bar" style="width:${Math.min(100, logged.length * 4)}%"></div></div>
            <div class="kpi"><div class="lbl">Hours Flown</div><div class="val">${fmtMins(totalMins)}</div><div class="sub">${(totalMins/60).toFixed(1)} hrs</div><div class="bar" style="width:${Math.min(100, totalMins / 60)}%"></div></div>
            <div class="kpi"><div class="lbl">Avg Landing</div><div class="val">${lr.length ? Math.round(avg(lr, 'lndRate')) : '0'} <span style="font-size:13px;color:var(--text-mute)">fpm</span></div><div class="sub">target -180 ±60</div><div class="bar" style="width:${lr.length ? 60 : 0}%"></div></div>
            <div class="kpi"><div class="lbl">Distance</div><div class="val">${fmtNum(totalNm)} <span style="font-size:13px;color:var(--text-mute)">nm</span></div><div class="sub">${(totalNm * 1.852).toFixed(0)} km</div><div class="bar" style="width:${Math.min(100, totalNm / 1000)}%"></div></div>
          </div>
        ` }));

        const ros = el('section', { html: `
          <div class="section-title"><div><h2>Next 7 days</h2><div class="sub">Roster overview · ${bookings.length} booking${bookings.length === 1 ? '' : 's'} active</div></div><div class="actions"><a href="#book" class="btn btn-primary btn-sm">${I('plus', 14)} Book Roster</a><a href="#roster" class="btn btn-ghost btn-sm">Full roster →</a></div></div>
          <div class="roster-strip" id="rstrip"></div>
        ` });
        c.appendChild(ros);
        const rsp = $('#rstrip', ros);
        nextDays(7).forEach(d => rsp.appendChild(rosterDayEl(d, false)));

        const qa = el('section');
        qa.innerHTML = `
          <div class="section-title"><div><h2>Quick Access</h2><div class="sub">Most used during pre-flight</div></div></div>
          <div class="grid grid-4">
            ${quickCard('Book Roster','Plan your next trip','book','plus')}
            ${quickCard('Met Briefing','METAR · TAF · SIGWX','met','cloud')}
            ${quickCard('Network Globe','All routes · planned','network','globe')}
            ${quickCard('OFP / Navlog','SimBrief OFP','ofp','route')}
            ${quickCard('EFB','In-flight tools','efb','plane', true)}
            ${quickCard('Newsroom','AI press releases','newsroom','newspaper')}
          </div>
        `;
        c.appendChild(qa);
        $$('.qac', qa).forEach(a => a.addEventListener('click', () => {
          if (a.dataset.efb) location.href = 'efb.html';
          else location.hash = '#' + a.dataset.go;
        }));
      }
    },

    /* ============ MY ROSTER ============ */
    roster: {
      sub: 'My active bookings',
      render: (c) => {
        const bookings = getBookings().sort((a,b) => a.date.localeCompare(b.date));
        const flying = bookings.length;

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>My Roster</h2><div class="sub">${flying} duty day${flying === 1 ? '' : 's'} on roster</div></div>
            <div class="actions">
              <a href="#book" class="btn btn-primary btn-sm">${I('plus', 14)} Add Booking</a>
              ${flying ? `<button class="btn btn-ghost btn-sm" id="clearRoster">${I('close', 14)} Clear all</button>` : ''}
            </div>
          </div>
          <div class="kpi-grid">
            <div class="kpi"><div class="lbl">Booked sectors</div><div class="val">${flying}</div><div class="sub">across ${new Set(bookings.map(b => b.fno)).size} flight nos.</div><div class="bar" style="width:${flying * 5}%"></div></div>
            <div class="kpi"><div class="lbl">Block hrs planned</div><div class="val">${(bookings.reduce((s,b) => s + (parseDuration(AIVA.findFlight(b.fno)?.dur || '0') || 0), 0)/60).toFixed(1)}</div><div class="sub">hours</div></div>
            <div class="kpi"><div class="lbl">Destinations</div><div class="val">${new Set(bookings.map(b => AIVA.findFlight(b.fno)?.to).filter(Boolean)).size}</div><div class="sub">unique ports</div></div>
            <div class="kpi"><div class="lbl">Aircraft types</div><div class="val">${new Set(bookings.map(b => AIVA.findFlight(b.fno)?.ac).filter(Boolean)).size}</div><div class="sub">fleet variety</div></div>
          </div>
        ` }));

        if ($('#clearRoster', c)) $('#clearRoster', c).onclick = () => {
          if (confirm('Clear all bookings?')) { clearAllBookings(); route(); }
        };

        /* Look ahead far enough to cover monthly bids (~45 days) so every
           booked sector remains visible on the calendar. */
        const days = bookings.length ? nextDays(45) : nextDays(14);
        const grid = el('section', { html: `
          <div class="section-title"><div><h2>Calendar</h2><div class="sub">Tap any day for details · tap empty days to book</div></div></div>
          <div class="grid" style="grid-template-columns: repeat(7, 1fr); gap: 8px;" id="calGrid"></div>
        ` });
        c.appendChild(grid);
        const cg = $('#calGrid', grid);
        days.forEach(d => cg.appendChild(rosterDayEl(d, true)));

        /* Map showing the routes you've booked (uses the same MapLibre engine
           as the Network Globe page). */
        if (bookings.length) {
          c.appendChild(el('section', { html: `
            <div class="section-title mt-6"><div><h2>Roster map</h2><div class="sub">Every leg on your roster · the same engine as Network Globe</div></div></div>
            <div class="ng-host" id="rosterMap" style="height:60vh; min-height:420px;"></div>
          ` }));
          /* Filter the map to ONLY pairs that appear on the pilot's bookings */
          const fnos = new Set(bookings.map(b => b.fno));
          const pairs = bookings.map(b => AIVA.findFlight(b.fno)).filter(Boolean);
          /* Temporarily monkey-patch AIVA.uniqueRoutePairs to scope to this pilot */
          const origPairs = AIVA.uniqueRoutePairs;
          AIVA.uniqueRoutePairs = () => {
            const m = new Map();
            for (const f of pairs) {
              const k = f.from + '-' + f.to;
              if (!m.has(k)) m.set(k, { from:f.from, to:f.to, fromAirport: AIVA.airport(f.from), toAirport: AIVA.airport(f.to), dist:f.dist, count:0, types:new Set() });
              const p = m.get(k); p.count++; p.types.add(f.ac);
            }
            return [...m.values()].map(p => ({ ...p, types:[...p.types] }));
          };
          AIVA.NetworkGlobe.render('rosterMap').finally(() => {
            /* Restore the original after render so other pages aren't affected */
            AIVA.uniqueRoutePairs = origPairs;
          });
        }
      }
    },

    /* ============ BOOK ROSTER ============ */
    book: {
      sub: 'Plan your next trip',
      render: (c) => {
        /* ============================================================
           NEW BOOK ROSTER — three modes:
           1) Search & Book — globe + From/To picker + multi-sector picker
           2) Generate Roster — auto-build a 1–4 day rotation
           3) Monthly Bid — bid an entire month with constraints
           Aircraft substitutions honored everywhere via AIVA.acSubstitutes().
           ============================================================ */
        const BASES = AIVA.HUBS;   // ['DEL','BOM','CCU','MAA','HYD','BLR']
        const acTypes = AIVA.fleetTypes();
        const FAMILIES = AIVA.AC_FAMILY;
        let mode = 'search';     // 'search' | 'gen' | 'bid'

        /* Pilot's selected sectors for the current roster build.
           Seeded from the persistent basket so flights added on the Network
           globe (or any other "Add to basket" surface) survive page nav. */
        let selectedSectors = (AIVA.Store.get('book_basket', []) || [])
          .map(b => AIVA.findFlight(b.fno))
          .filter(Boolean);
        /* Keep the persistent store in sync whenever we mutate the in-memory list */
        const persistBasket = () => AIVA.Store.set('book_basket',
          selectedSectors.map(f => ({ fno: f.fno, ac: f.ac, from: f.from, to: f.to, op: f.op, ts: Date.now() }))
        );

        const refreshAll = () => {
          c.innerHTML = '';
          try {
            renderShell();
            if (mode === 'search') renderSearchMode();
            else if (mode === 'gen') renderGenMode();
            else if (mode === 'bid') renderBidMode();
          } catch (err) {
            console.error('[Book Roster] render failed:', err);
            c.appendChild(el('div', { class:'card', html:`<b>Render error:</b> ${err.message}<br><pre style="font-size:11px;color:var(--text-mute);">${(err.stack||'').slice(0,500)}</pre>` }));
          }
        };

        function renderShell() {
          c.appendChild(el('section', { html: `
            <div class="section-title">
              <div><h2>Book Your Roster</h2><div class="sub">${AIVA.FLIGHTS.length} flights · ${BASES.length} bookable bases · ${[...new Set(AIVA.FLIGHTS.map(f=>f.to))].length} ports served</div></div>
            </div>
            <div class="trip-tabs mb-4" id="modeTabs">
              ${[
                ['search','Search & Book','Pick airports, see flights, build roster'],
                ['gen',   'Generate Roster','Auto-build a 1–4 day rotation'],
                ['bid',   'Monthly Bid','Bid the whole month with constraints'],
              ].map(([k,lbl,sub]) => `
                <button class="trip-tab ${mode===k?'on':''}" data-mode="${k}">
                  <div class="lbl">${lbl}</div><div class="sub">${sub}</div>
                </button>
              `).join('')}
            </div>
          ` }));
          c.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
            mode = b.dataset.mode; refreshAll();
          });
        }

        /* ============================================================
           MODE 1 — Search & Book (default)
           - Cobe globe up top showing all airports
           - From/To search (city or IATA/ICAO) with autocomplete
           - Selected route → flights sorted by dep time
           - Multi-sector picker, FDTL check, Confirm roster button
           ============================================================ */
        function renderSearchMode() {
          /* MAP — the same MapLibre engine as the Network Globe page, scoped
             to the entire network. Click a pin to filter the search below.   */
          const globeSec = el('section', { html: `
            <div class="section-title">
              <div><h2>Network map</h2><div class="sub">Drag to pan · scroll to zoom · click any pin to filter results below</div></div>
            </div>
            <div class="ng-host" id="bookGlobe" style="height:min(58vh, 520px); min-height:380px;"></div>
            <div class="text-mute mono mt-2" id="globePickInfo" style="font-size:11px;text-align:center;">Click an airport on the map to filter the search.</div>
          ` });
          c.appendChild(globeSec);

          /* Hand the MapLibre renderer an onPick callback via global ref */
          const _origPick = AIVA.NetworkGlobe?._onPickOverride;
          AIVA.NetworkGlobe._onPickOverride = (code) => {
            const a = AIVA.airport(code);
            if (!a) return;
            fromCode = code; toCode = null;
            if (fromBox) fromBox.value = `${code} · ${a.city}`;
            if (toBox)   toBox.value = '';
            $('#globePickInfo', c).innerHTML = `<b style="color:var(--ai-gold);">${code} · ${a.city}</b> selected — ${AIVA.routesFromBase(code).length} out · ${AIVA.routesToBase(code).length} in`;
            doSearch();
            document.getElementById('resultsSection')?.scrollIntoView({ behavior:'smooth', block:'start' });
          };
          AIVA.NetworkGlobe.render('bookGlobe').then(() => {
            /* Restore the override after this render finishes */
            setTimeout(() => { AIVA.NetworkGlobe._onPickOverride = _origPick; }, 200);
          });

          /* FROM/TO SEARCH */
          const search = el('section', { html: `
            <div class="section-title mt-4">
              <div><h2>Search flights</h2><div class="sub">Type a city, IATA (e.g. BLR) or ICAO (e.g. VOBL) — for either airport</div></div>
            </div>
            <div class="card" style="padding:18px;">
              <div class="row gap-3" style="flex-wrap:wrap;">
                <div style="flex:1;min-width:240px;position:relative;">
                  <div class="eyebrow mb-1">From</div>
                  <input id="fromBox" class="input" placeholder="e.g. Delhi · BLR · VABB" autocomplete="off" data-1p-ignore data-lpignore="true"/>
                  <div id="fromDrop" class="airport-drop"></div>
                  <div id="fromPick" class="text-mute mono mt-1" style="font-size:11px;"></div>
                </div>
                <div style="flex:1;min-width:240px;position:relative;">
                  <div class="eyebrow mb-1">To</div>
                  <input id="toBox" class="input" placeholder="e.g. Mumbai · CCU · VECC" autocomplete="off" data-1p-ignore data-lpignore="true"/>
                  <div id="toDrop" class="airport-drop"></div>
                  <div id="toPick" class="text-mute mono mt-1" style="font-size:11px;"></div>
                </div>
                <div style="min-width:180px;">
                  <div class="eyebrow mb-1">Aircraft type (optional)</div>
                  <select id="acSel" class="input">
                    <option value="">Any aircraft</option>
                    <optgroup label="Family (with substitutions)">
                      ${Object.keys(FAMILIES).map(k => `<option value="fam:${k}">${AIVA.acFamilyLabel(k)}</option>`).join('')}
                    </optgroup>
                    <optgroup label="Specific type">
                      ${acTypes.map(t => `<option value="${t}">${t} · ${AIVA.acTypeName(t).replace('Boeing ','').replace('Airbus ','')}</option>`).join('')}
                    </optgroup>
                  </select>
                </div>
                <div class="row gap-2" style="align-items:flex-end;">
                  <button class="btn btn-primary" id="searchBtn">${I('search', 14)} Search</button>
                  <button class="btn btn-ghost" id="swapBtn" title="Swap from/to">⇄</button>
                </div>
              </div>
              <div class="row gap-2 mt-3" style="flex-wrap:wrap;">
                <div class="eyebrow" style="margin:6px 6px 0 0;">Quick base picks:</div>
                ${BASES.map(b => `<button class="ac-chip" data-quick="${b}">${b} · ${AIVA.airport(b)?.city}</button>`).join('')}
              </div>
            </div>
          ` });
          c.appendChild(search);

          /* ===== Target-date banner =====
             If the pilot clicked a future calendar day to open this page,
             stage the booking for THAT day instead of today. The banner
             shows what date the basket is going to be filed under and lets
             them flip back to today with one tap. */
          let targetDate = (() => {
            try {
              const v = sessionStorage.getItem('book_target_date');
              if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= ymd()) return v;
            } catch {}
            return ymd();
          })();
          const targetBanner = el('section', { id: 'targetBanner', style:'margin-top:14px;' });
          const renderTargetBanner = () => {
            const isToday = targetDate === ymd();
            const d = new Date(targetDate + 'T00:00:00');
            const human = d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
            targetBanner.innerHTML = `
              <div class="card" style="padding:13px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;${isToday ? '' : 'border-color:rgba(255,225,89,.5);background:rgba(255,225,89,.05);'}">
                <div style="flex:1;min-width:240px;">
                  <div class="eyebrow" style="margin-bottom:2px;color:${isToday ? 'var(--text-mute)' : 'var(--ai-gold-bright)'};">${isToday ? 'Filing for today' : 'Filing for'}</div>
                  <div class="display" style="font-size:15px;font-weight:600;">${human}</div>
                </div>
                ${!isToday ? `<button class="btn btn-ghost btn-sm" id="resetTargetDate">${I('refresh', 12)} File for today instead</button>` : ''}
              </div>
            `;
            const reset = $('#resetTargetDate', targetBanner);
            if (reset) reset.onclick = () => {
              targetDate = ymd();
              try { sessionStorage.removeItem('book_target_date'); } catch {}
              renderTargetBanner();
            };
          };
          c.appendChild(targetBanner);
          renderTargetBanner();

          /* SECTOR BASKET — moved ABOVE results so pilots see what they've
             selected without scrolling. Pre-FDTL message reflects the
             non-blocking warning policy. */
          const basket = el('section', { id:'basketSection', html: `
            <div class="card mt-3" style="padding:18px;">
              <div class="row between mb-2">
                <div><h3 style="margin:0;">Selected sectors</h3><div class="text-mute" style="font-size:11.5px;" id="basketSub">Add at least one flight to enable the roster builder.</div></div>
                <div class="row gap-2">
                  <button class="btn btn-ghost btn-sm" id="clearBasket">Clear</button>
                  <button class="btn btn-primary btn-sm" id="confirmRoster" disabled>${I('check', 14)} Confirm roster</button>
                </div>
              </div>
              <div id="basketList" class="col gap-2"></div>
              <div id="fdtlBox" class="text-mute mono mt-2" style="font-size:10.5px;"></div>
            </div>
          ` });
          c.appendChild(basket);

          /* RESULTS LIST — below the basket so pilots scroll only to find
             new flights, not to see what they've already added. */
          const results = el('section', { id:'resultsSection', html: `
            <div class="section-title mt-4">
              <div><h2 id="resultsTitle">Pick a route</h2><div class="sub" id="resultsSub">Choose From + To above, or click a hub chip</div></div>
            </div>
            <div id="results" class="grid grid-2" style="max-height:680px; overflow-y:auto; padding-right:6px;"></div>
          ` });
          c.appendChild(results);

          /* ===== Wire up From/To autocomplete ===== */
          let fromCode = null, toCode = null, acFilter = null;
          const fromBox = $('#fromBox', c), toBox = $('#toBox', c);
          const fromDrop = $('#fromDrop', c), toDrop = $('#toDrop', c);

          const wireBox = (input, dropEl, pickEl, setter) => {
            input.addEventListener('input', () => {
              const matches = AIVA.airportSearch(input.value);
              if (!matches.length) { dropEl.innerHTML = ''; dropEl.style.display='none'; return; }
              dropEl.style.display = 'block';
              dropEl.innerHTML = matches.map(a => `
                <div class="airport-row" data-code="${a.iata}">
                  <span class="iata">${a.iata}</span>
                  <span class="city">${a.city}</span>
                  <span class="name">${a.name}</span>
                  <span class="icao">${a.icao}</span>
                </div>
              `).join('');
              [...dropEl.querySelectorAll('.airport-row')].forEach(r => {
                r.onclick = () => {
                  const code = r.dataset.code;
                  setter(code);
                  input.value = `${code} · ${AIVA.airport(code).city}`;
                  pickEl.textContent = `${AIVA.airport(code).iata} / ${AIVA.airport(code).icao} · ${AIVA.airport(code).name}`;
                  dropEl.style.display = 'none';
                  doSearch();
                };
              });
            });
            input.addEventListener('blur', () => setTimeout(() => dropEl.style.display = 'none', 200));
            input.addEventListener('focus', () => { if (input.value) input.dispatchEvent(new Event('input')); });
          };
          wireBox(fromBox, fromDrop, $('#fromPick', c), v => fromCode = v);
          wireBox(toBox,   toDrop,   $('#toPick', c),   v => toCode = v);

          $('#acSel', c).onchange = (e) => { acFilter = e.target.value || null; doSearch(); };
          $('#swapBtn', c).onclick = () => {
            [fromCode, toCode] = [toCode, fromCode];
            [fromBox.value, toBox.value] = [toBox.value, fromBox.value];
            doSearch();
          };
          $('#searchBtn', c).onclick = () => doSearch();
          c.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => {
            fromCode = b.dataset.quick;
            fromBox.value = `${fromCode} · ${AIVA.airport(fromCode).city}`;
            doSearch();
          });

          function doSearch() {
            const opts = {};
            if (acFilter) {
              if (acFilter.startsWith('fam:')) opts.acTypes = FAMILIES[acFilter.slice(4)];
              else opts.acTypes = AIVA.acSubstitutes(acFilter);
            }
            let list;
            if (fromCode && toCode) {
              list = AIVA.flightsOnRoute(fromCode, toCode, opts);
              $('#resultsTitle', c).textContent = `${AIVA.airport(fromCode).city} → ${AIVA.airport(toCode).city}`;
              $('#resultsSub', c).textContent = `${list.length} flights · sorted by departure time` + (acFilter ? ` · ${acFilter.replace('fam:', '')} substitution allowed` : '');
            } else if (fromCode) {
              list = AIVA.FLIGHTS.filter(f => f.from === fromCode);
              if (opts.acTypes) list = list.filter(f => opts.acTypes.includes(f.ac));
              list = list.sort((a,b) => a.dep.localeCompare(b.dep));
              $('#resultsTitle', c).textContent = `Departing ${AIVA.airport(fromCode).city}`;
              $('#resultsSub', c).textContent = `${list.length} flights to all destinations · sorted by dep time`;
            } else if (toCode) {
              list = AIVA.FLIGHTS.filter(f => f.to === toCode);
              if (opts.acTypes) list = list.filter(f => opts.acTypes.includes(f.ac));
              list = list.sort((a,b) => a.dep.localeCompare(b.dep));
              $('#resultsTitle', c).textContent = `Arriving ${AIVA.airport(toCode).city}`;
              $('#resultsSub', c).textContent = `${list.length} flights inbound · sorted by dep time`;
            } else {
              list = [];
              $('#resultsTitle', c).textContent = 'Pick a route';
              $('#resultsSub', c).textContent = 'Type a From and To, or click a hub chip';
            }
            renderResults(list);
          }

          function renderResults(list) {
            const body = $('#results', c);
            body.innerHTML = '';
            if (!list.length) {
              body.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-mute);">No flights match. Try a different aircraft, or remove the type filter.</div>`;
              return;
            }
            list.forEach(f => {
              const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);
              const inBasket = selectedSectors.some(s => s.fno === f.fno);
              const card = el('div', { class:'card card-hover' });
              card.innerHTML = `
                <div class="row between">
                  <div>
                    <div class="display" style="font-size:18px;font-weight:600;">${f.fno} <span class="text-mute" style="font-size:11px;font-family:var(--font-mono);">${f.cs}</span></div>
                    <div class="text-mute" style="font-size:11.5px;margin-top:2px;">${fromA?.city} (${f.from}) → ${toA?.city} (${f.to})</div>
                    <div class="mono mt-1" style="font-size:13px;color:var(--text);"><b>${f.dep}</b> → <b>${f.arr}</b> LT · ${f.dur}</div>
                  </div>
                  <div class="col" style="gap:4px;align-items:flex-end;">
                    <span class="pill pill-gold" title="${f.acName}">${f.ac}</span>
                    <span class="text-mute mono" style="font-size:10.5px;">${fmtNum(f.dist)} nm</span>
                    <span class="text-mute mono" style="font-size:9.5px;">${f.region}</span>
                  </div>
                </div>
                <div class="row gap-2 mt-3">
                  <button class="btn ${inBasket?'btn-ghost':'btn-primary'} btn-sm" data-add="${f.fno}">${inBasket ? '✓ In basket' : I('plus', 14)+' Add sector'}</button>
                  <button class="btn btn-ghost btn-sm" data-sb="${f.fno}">${I('send', 14)} SimBrief</button>
                </div>
              `;
              card.querySelector(`[data-add]`).onclick = () => addSector(f);
              card.querySelector(`[data-sb]`).onclick   = () => openSimbrief(f);
              body.appendChild(card);
            });
          }

          /* ===== Sector basket + FDTL check ===== */
          function addSector(f) {
            if (selectedSectors.some(s => s.fno === f.fno)) {
              toast('Already in basket', 'warn');
              return;
            }
            selectedSectors.push(f);
            persistBasket();
            renderBasket();
            doSearch();   // re-render results so the button text updates
            toast(`Added ${f.fno} (${f.from}→${f.to})`, 'ok');
          }
          function removeSector(idx) {
            selectedSectors.splice(idx, 1);
            persistBasket();
            renderBasket();
            doSearch();
          }
          $('#clearBasket', c).onclick = () => { selectedSectors = []; persistBasket(); renderBasket(); doSearch(); };

          function renderBasket() {
            const list = $('#basketList', c);
            list.innerHTML = '';
            if (!selectedSectors.length) {
              list.innerHTML = `<div class="text-mute" style="font-size:12px;">Add a flight to start building today's pairing.</div>`;
              $('#basketSub', c).textContent = `Add at least one flight to enable the roster builder.`;
              $('#confirmRoster', c).disabled = true;
              $('#fdtlBox', c).textContent = '';
              return;
            }
            /* ===== FDTL ADVISORY (not blocking) =====
               Per Chief Pilot direction: FDTL caps are warnings, not gates.
               Show the math, flag exceedances, but let the pilot confirm
               anyway after a yes/no dialog. A single long-haul like AI173
               easily exceeds 10h block by itself — pilots roleplaying
               augmented-crew rotations should be free to book it. */
            const totalBlock = selectedSectors.reduce((s, f) => s + f.durMins, 0);
            const sectorCount = selectedSectors.length;
            const fdtlCap = 600;            // 10h max FDP for ≤6 sectors (DGCA CAR 7-J simplified)
            const sectorCap = 6;
            const blockOk   = totalBlock  <= fdtlCap;
            const sectorOk  = sectorCount <= sectorCap;
            const ok = blockOk && sectorOk;
            const parts = [];
            parts.push(`FDTL: ${(totalBlock/60).toFixed(1)} h block / ${sectorCount} sectors · cap 10.0 h / 6 sectors`);
            if (ok) parts.push('✓ legal');
            else {
              if (!blockOk)  parts.push(`⚠ ${(totalBlock/60).toFixed(1)} h exceeds 10 h FDP — augmented-crew roster recommended`);
              if (!sectorOk) parts.push(`⚠ ${sectorCount} sectors exceeds 6-sector cap`);
            }
            $('#fdtlBox', c).textContent = parts.join(' · ');
            $('#fdtlBox', c).style.color = ok ? 'var(--text-mute)' : '#FBBF24';
            /* Confirm stays ENABLED — the dialog at click time enforces
               acknowledgement, not the button. Empty basket still disables. */
            $('#confirmRoster', c).disabled = sectorCount === 0;
            $('#basketSub', c).textContent = `${sectorCount} sector${sectorCount===1?'':'s'} · ${(totalBlock/60).toFixed(1)} block hours total`;

            /* Connectivity check (also advisory) */
            let connectivity = '';
            for (let i = 1; i < selectedSectors.length; i++) {
              if (selectedSectors[i].from !== selectedSectors[i-1].to) {
                connectivity = ` · ⚠ sector ${i+1} doesn't depart from where ${i} arrives — pilot positioning required`;
                break;
              }
            }
            if (connectivity) $('#fdtlBox', c).textContent += connectivity;

            selectedSectors.forEach((f, i) => {
              const row = el('div', { class:'row between', style:'padding:10px 12px;background:rgba(255,225,89,.05);border-radius:10px;border:1px solid rgba(255,225,89,.18);' });
              row.innerHTML = `
                <div class="row gap-2">
                  <span class="mono" style="font-size:11px;color:var(--ai-gold);">#${i+1}</span>
                  <span class="mono"><b>${f.fno}</b></span>
                  <span class="text-mute" style="font-size:12px;">${AIVA.airport(f.from)?.city} (${f.from}) → ${AIVA.airport(f.to)?.city} (${f.to})</span>
                  <span class="mono text-mute" style="font-size:11px;">${f.dep}–${f.arr} · ${f.dur}</span>
                  <span class="pill pill-gold" style="font-size:9.5px;">${f.ac}</span>
                </div>
                <button class="btn btn-ghost btn-sm" data-rm="${i}">Remove</button>
              `;
              row.querySelector('[data-rm]').onclick = () => removeSector(i);
              list.appendChild(row);
            });
          }

          $('#confirmRoster', c).onclick = () => {
            if (!selectedSectors.length) return;
            /* Re-compute FDTL state at click time (basket may have changed). */
            const tb = selectedSectors.reduce((s, f) => s + f.durMins, 0);
            const sc = selectedSectors.length;
            const fdtlExceeded = tb > 600 || sc > 6;
            const longHaul = selectedSectors.find(f => f.durMins >= 480);

            const doSave = () => {
              const bookings = getBookings();
              /* Persist from/to + ac in the booking record. Display
                 sites prefer these over AIVA.findFlight(fno) — that
                 lookup can return the wrong duplicate when a flight
                 number appears on multiple sectors (return legs, tag
                 flights). Without the saved from/to we were rendering
                 JAI→BOM as BOM→JAI when the data had both. */
              const newOnes = selectedSectors.map(f => ({
                date: targetDate, fno: f.fno,
                from: f.from, to: f.to,
                ac: f.ac, op: f.op,
                ts: Date.now(),
              }));
              setBookings([...bookings, ...newOnes]);
              const human = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
              toast(`✓ Roster confirmed — ${newOnes.length} sector${newOnes.length===1?'':'s'} on ${human}`, 'ok');
              selectedSectors = [];
              persistBasket();
              try { sessionStorage.removeItem('book_target_date'); } catch {}
              targetDate = ymd();
              renderTargetBanner();
              renderBasket();
              doSearch();
              buildNav();
            };

            /* If anything exceeds FDTL or is single-leg long-haul, surface
               an explicit yes/no dialog so the pilot acknowledges before
               we file it. Otherwise just save. */
            if (fdtlExceeded || longHaul) {
              /* Fire a Windows toast too — pilots flagged that FDTL
                 advisory can fly past you in the toast and you confirm
                 by reflex. OS notification stays until dismissed. */
              if (fdtlExceeded) {
                AIVA._desktopNotify?.(`AIVA · FDTL advisory`,
                  `${(tb/60).toFixed(1)} h block / ${sc} sectors exceeds 10 h FDP. Confirm dialog open.`,
                  { force: true });
              }
              const body = el('div');
              const warnLines = [];
              if (tb > 600)
                warnLines.push(`<li><b>${(tb/60).toFixed(1)} h total block</b> exceeds the 10 h FDP cap. Realistically you'd fly this as an augmented-crew roster across two days; the system will still log it as a single duty day if you confirm.</li>`);
              if (sc > 6)
                warnLines.push(`<li><b>${sc} sectors</b> exceeds the 6-sector cap. Allowed under augmented or extended-FDP rules with rest, but you're acknowledging the deviation.</li>`);
              if (longHaul && !fdtlExceeded)
                warnLines.push(`<li><b>${longHaul.fno} ${longHaul.from}→${longHaul.to}</b> is ${(longHaul.durMins/60).toFixed(1)} h block. Long-haul sectors typically need augmented crew + a layover before the return leg.</li>`);
              body.innerHTML = `
                <div class="text-mute" style="font-size:12.5px;line-height:1.6;margin-bottom:14px;">
                  Your basket is outside standard FDTL norms. AIVA treats these as <b>advisory</b>, not blocking — confirm only if you've planned the duty period accordingly.
                </div>
                <ul style="font-size:13px;line-height:1.7;color:var(--text-dim);padding-left:20px;margin:0;">
                  ${warnLines.join('')}
                </ul>
              `;
              modal({
                title: 'FDTL advisory — confirm anyway?',
                body,
                width: '540px',
                actions: [
                  { label:'Cancel', cls:'btn-ghost', onClick: close => close() },
                  { label:'Confirm anyway', cls:'btn-primary', onClick: close => { doSave(); close(); } },
                ],
              });
              return;
            }
            doSave();
          };

          renderBasket();
          /* Default view: pick pilot's home base if we know it */
          const me = AIVA.Auth.currentPilot?.();
          if (me?.base) {
            fromCode = me.base;
            fromBox.value = `${fromCode} · ${AIVA.airport(fromCode)?.city}`;
            doSearch();
          }
        }

        /* ============================================================
           MODE 2 — Generate Roster (auto)
           Pilot picks: cities, target block hours, days (1–4)
           Engine builds a connected pairing and writes it to the calendar.
           Day 1 starts TODAY (single-day rosters).
           Multi-day rosters start TOMORROW so prep day = today.
           ============================================================ */
        function renderGenMode() {
          const sec = el('section', { html: `
            <div class="card" style="padding:22px;">
              <div class="eyebrow mb-2">Cities to visit (pick 1–6)</div>
              <div class="row wrap gap-2 mb-3" id="genCities">
                ${BASES.map(b => `<button class="ac-chip" data-city="${b}">${b} · ${AIVA.airport(b)?.city}</button>`).join('')}
                ${[...new Set(AIVA.FLIGHTS.map(f=>f.to))].filter(c=>!BASES.includes(c)).slice(0,40).map(c=>`<button class="ac-chip" data-city="${c}">${c}</button>`).join('')}
              </div>
              <div class="row gap-3" style="flex-wrap:wrap;">
                <div style="min-width:200px;flex:1;">
                  <div class="eyebrow mb-1">Departing base</div>
                  <select id="genBase" class="input">
                    ${BASES.map(b => `<option value="${b}">${b} · ${AIVA.airport(b)?.city}</option>`).join('')}
                  </select>
                </div>
                <div style="min-width:170px;">
                  <div class="eyebrow mb-1">Operator</div>
                  <select id="genOp" class="input">
                    <option value="">Both (AI + AXB)</option>
                    <option value="AI">Air India (AIC)</option>
                    <option value="IX">Air India Express (AXB)</option>
                  </select>
                </div>
                <div style="min-width:200px;flex:1;">
                  <div class="eyebrow mb-1">Aircraft type (substitutions allowed)</div>
                  <select id="genAc" class="input">
                    <option value="">Any (mixed fleet)</option>
                    ${Object.keys(FAMILIES).map(k => `<option value="fam:${k}">${AIVA.acFamilyLabel(k)}</option>`).join('')}
                    ${acTypes.map(t => `<option value="${t}">${t} · ${AIVA.acTypeName(t).replace('Boeing ','').replace('Airbus ','')}</option>`).join('')}
                  </select>
                </div>
                <div style="min-width:140px;">
                  <div class="eyebrow mb-1">Target block hrs / day</div>
                  <input id="genBlock" class="input" type="number" min="1" max="18" step="0.5" value="8"/>
                </div>
                <div style="min-width:120px;">
                  <div class="eyebrow mb-1">Days</div>
                  <select id="genDays" class="input">
                    <option value="1">1 day</option>
                    <option value="2">2 days</option>
                    <option value="3">3 days</option>
                    <option value="4" selected>4 days</option>
                  </select>
                </div>
              </div>
              <label class="row gap-2 mt-3" style="font-size:12.5px;color:var(--text-dim);cursor:pointer;">
                <input type="checkbox" id="genReturn" checked> <span><b>Return to base</b> — auto-add the return leg so the aircraft (and you) get home</span>
              </label>
              <div class="row gap-2 mt-3">
                <button class="btn btn-primary" id="genGo">${I('check', 14)} Generate roster</button>
                <button class="btn btn-ghost" id="genReset">Reset</button>
              </div>
            </div>
            <div class="mt-4" id="genPreview"></div>
          ` });
          c.appendChild(sec);

          const picked = new Set();
          c.querySelectorAll('[data-city]').forEach(b => b.onclick = () => {
            const code = b.dataset.city;
            if (picked.has(code)) { picked.delete(code); b.classList.remove('on'); }
            else { picked.add(code); b.classList.add('on'); }
          });
          $('#genReset', c).onclick = () => refreshAll();
          $('#genGo', c).onclick = () => {
            const baseCode = $('#genBase', c).value;
            const acVal = $('#genAc', c).value;
            const opVal = $('#genOp', c).value;
            const returnToBase = $('#genReturn', c).checked;
            const targetBlock = parseFloat($('#genBlock', c).value) * 60;
            const days = parseInt($('#genDays', c).value, 10);

            let allowedTypes = null;
            if (acVal) {
              if (acVal.startsWith('fam:')) allowedTypes = new Set(FAMILIES[acVal.slice(4)]);
              else allowedTypes = new Set(AIVA.acSubstitutes(acVal));
            }
            const cityPool = picked.size ? new Set(picked) : null;

            const filterCands = (list) => {
              if (allowedTypes) list = list.filter(f => allowedTypes.has(f.ac));
              if (opVal)       list = list.filter(f => f.op === opVal);
              return list;
            };

            /* Build the rotation, day by day. */
            const rotation = [];
            let cursor = baseCode;
            for (let d = 0; d < days; d++) {
              const dayLegs = [];
              let blockSoFar = 0;
              let here = cursor;
              const isLastDay = d === days - 1;
              /* Long-haul (>= 9h) is one-leg-per-day. We detect this from the first
                 leg we pick — if it's a longhaul, we stop after 1. */
              let longHaulMode = false;
              for (let attempt = 0; attempt < 6 && blockSoFar < targetBlock; attempt++) {
                if (longHaulMode) break;
                let candidates = filterCands(AIVA.FLIGHTS.filter(f => f.from === here));
                if (cityPool) {
                  candidates = candidates.filter(f => cityPool.has(f.to) || f.to === baseCode);
                }
                const mustReturn = (isLastDay && attempt > 0) || (returnToBase && here !== baseCode && attempt >= 1);
                if (mustReturn) {
                  candidates = candidates.filter(f => f.to === baseCode);
                }
                if (!candidates.length) break;
                candidates.sort((a, b) => Math.abs((blockSoFar + a.durMins) - targetBlock) - Math.abs((blockSoFar + b.durMins) - targetBlock));
                const next = candidates[0];
                dayLegs.push(next);
                blockSoFar += next.durMins;
                here = next.to;
                /* === TAG-FLIGHT CHAIN ===
                   Same-fno continuation is the same physical flight, so it
                   always gets added regardless of any cap (e.g. AI127
                   DEL→VIE → AI127 VIE→ORD). */
                const cont = AIVA.FLIGHTS.find(f => f.fno === next.fno && f.from === next.to);
                if (cont) {
                  dayLegs.push(cont);
                  blockSoFar += cont.durMins;
                  here = cont.to;
                }
                /* Anything 6+ hours total is single-leg-per-day */
                if (blockSoFar >= 360) longHaulMode = true;
                if (here === baseCode) break;
              }
              rotation.push({ legs: dayLegs, block: blockSoFar, end: here });
              cursor = here;
            }

            /* ===== RETURN-TO-BASE BACKFILL =====
               After all duty days are laid out, if the final position is NOT base
               and the toggle is on, append additional days each containing the
               return flight(s) until we make it home.
               If the LAST flown leg was 8+ hours (long-haul), insert a rest day
               BEFORE the return so the pilot gets a 24 h layover. */
            if (returnToBase && cursor !== baseCode) {
              const lastDay = rotation[rotation.length - 1];
              const lastDayBlock = lastDay?.block || 0;
              if (lastDayBlock >= 480) {
                /* One-day rest at the layover hotel */
                rotation.push({ legs: [], block: 0, end: cursor, rest: true });
              }
              for (let safety = 0; safety < 4 && cursor !== baseCode; safety++) {
                let candidates = filterCands(AIVA.FLIGHTS.filter(f => f.from === cursor));
                /* Prefer the operational pair return (outbound fno ± 1) so
                   AI127 DEL→VIE→ORD returns as AI128 ORD→VIE→DEL, not random. */
                const lastOut = rotation[rotation.length - 1];
                const outFno = lastOut?.legs?.[0]?.fno;
                let next = null;
                if (outFno) {
                  const outNum = parseInt(String(outFno).replace(/\D/g,''), 10);
                  next = candidates.find(c => {
                    const n = parseInt(String(c.fno).replace(/\D/g,''), 10);
                    return c.to === baseCode && (n === outNum + 1 || n === outNum - 1);
                  });
                }
                if (!next) next = candidates.find(f => f.to === baseCode);
                if (!next) next = candidates.sort((a,b) => a.durMins - b.durMins)[0];
                if (!next) break;
                /* Chain return continuation too */
                const retLegs = [next];
                let retEnd = next.to, retBlock = next.durMins;
                const retCont = AIVA.FLIGHTS.find(f => f.fno === next.fno && f.from === next.to);
                if (retCont) { retLegs.push(retCont); retEnd = retCont.to; retBlock += retCont.durMins; }
                rotation.push({ legs: retLegs, block: retBlock, end: retEnd, ret: true });
                cursor = retEnd;
              }
            }

            renderGenPreview(rotation, baseCode);
          };

          function renderGenPreview(rotation, baseCode) {
            const preview = $('#genPreview', c);
            const days = rotation.length;
            const today = new Date(); today.setHours(0,0,0,0);
            const startDate = days === 1 ? today : new Date(today.getTime() + 86400000);
            const totalLegs = rotation.reduce((s,d) => s + d.legs.length, 0);
            const totalBlock = rotation.reduce((s,d) => s + d.block, 0);

            preview.innerHTML = `
              <div class="card" style="padding:18px;">
                <div class="row between mb-2">
                  <div><h3 style="margin:0;">Generated rotation</h3><div class="text-mute" style="font-size:11.5px;">Starting ${ymd(startDate)} · ${totalLegs} sectors · ${(totalBlock/60).toFixed(1)} block hours</div></div>
                  <button class="btn btn-primary btn-sm" id="acceptGen">${I('check', 14)} Accept & add to calendar</button>
                </div>
                ${rotation.map((day, i) => {
                  const date = ymd(new Date(startDate.getTime() + i * 86400000));
                  if (day.rest) {
                    return `
                      <div class="mt-2" style="padding:12px 14px;background:rgba(96,165,250,.08);border-radius:10px;border:1px dashed rgba(96,165,250,.32);">
                        <div class="row between">
                          <div class="mono" style="color:#93C5FD;font-size:12px;">DAY ${i+1} · ${date} · LAYOVER REST</div>
                          <div class="text-mute mono" style="font-size:11px;">24 h ground rest at ${day.end}</div>
                        </div>
                      </div>
                    `;
                  }
                  if (!day.legs.length) return `<div class="card mt-2" style="padding:12px;background:rgba(230,25,38,.08);">Day ${i+1} (${date}) — could not find any legal sectors. Loosen your filters.</div>`;
                  return `
                    <div class="mt-2" style="padding:12px;background:rgba(255,225,89,.06);border-radius:10px;border:1px solid rgba(255,225,89,.18);">
                      <div class="row between mb-1">
                        <div class="mono" style="color:var(--ai-gold);font-size:12px;">DAY ${i+1} · ${date}${day.ret ? ' · RETURN' : ''}</div>
                        <div class="text-mute mono" style="font-size:11px;">${(day.block/60).toFixed(1)} h block · ends at ${day.end}</div>
                      </div>
                      ${day.legs.map(f => `
                        <div class="row between" style="padding:6px 0;border-top:1px dashed rgba(255,225,89,.12);">
                          <div class="row gap-2">
                            <span class="mono"><b>${f.fno}</b></span>
                            <span class="text-mute" style="font-size:12px;">${AIVA.airport(f.from)?.city} → ${AIVA.airport(f.to)?.city}</span>
                            <span class="mono text-mute" style="font-size:11px;">${f.dep}–${f.arr}</span>
                            <span class="pill pill-gold" style="font-size:9.5px;">${f.ac}</span>
                          </div>
                          <span class="mono text-mute" style="font-size:11px;">${f.dur}</span>
                        </div>
                      `).join('')}
                    </div>
                  `;
                }).join('')}
              </div>
            `;
            $('#acceptGen', c).onclick = () => {
              const bookings = getBookings();
              const newOnes = [];
              rotation.forEach((day, i) => {
                const date = ymd(new Date(startDate.getTime() + i * 86400000));
                day.legs.forEach(f => newOnes.push({
                  date, fno: f.fno,
                  from: f.from, to: f.to,
                  ac: f.ac, op: f.op,
                  ts: Date.now(),
                }));
              });
              setBookings([...bookings, ...newOnes]);
              toast(`✓ Added ${newOnes.length} sectors across ${rotation.length} days`, 'ok');
              buildNav();
              location.hash = '#roster';
            };
          }
        }

        /* ============================================================
           MODE 3 — Monthly Bid
           Filters: total hours/month, days flying, off-day picker,
                    aircraft (with substitutions), departure base.
           ============================================================ */
        function renderBidMode() {
          const monthName = new Date().toLocaleString('en-US', { month:'long', year:'numeric' });
          const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();

          const sec = el('section', { html: `
            <div class="card" style="padding:22px;">
              <div class="row between mb-3">
                <div><h3 style="margin:0;">Bid for ${monthName}</h3><div class="text-mute" style="font-size:11.5px;">Pre-generated bid lines · pick filters then choose a line</div></div>
                <div class="text-mute mono" style="font-size:11px;">${daysInMonth} days · DGCA cap 100h / 28d</div>
              </div>
              <div class="row gap-3" style="flex-wrap:wrap;">
                <div style="min-width:160px;">
                  <div class="eyebrow mb-1">Departing base</div>
                  <select id="bidBase" class="input">
                    ${BASES.map(b => `<option value="${b}">${b} · ${AIVA.airport(b)?.city}</option>`).join('')}
                  </select>
                </div>
                <div style="min-width:160px;">
                  <div class="eyebrow mb-1">Operator</div>
                  <select id="bidOp" class="input">
                    <option value="">Both (AI + AXB)</option>
                    <option value="AI">Air India (AIC)</option>
                    <option value="IX">Air India Express (AXB)</option>
                  </select>
                </div>
                <div style="min-width:200px;">
                  <div class="eyebrow mb-1">Aircraft (strict — only A320-series subs)</div>
                  <select id="bidAc" class="input">
                    <option value="">Any I'm rated on</option>
                    <option value="fam:A320_FAMILY">A320 family — A319 / 320 / 320neo / 321 / 321neo</option>
                    <option value="fam:B787_FAMILY">787 family — 787-8 + 787-9 (same type rating)</option>
                    <option value="fam:B777_FAMILY">777 family — 777-300ER + 777-200LR</option>
                    <option value="fam:B737_FAMILY">737 family — 737-800 + 737 MAX 8</option>
                    ${acTypes.map(t => `<option value="${t}">${t} · ${AIVA.acTypeName(t).replace('Boeing ','').replace('Airbus ','')} (exact)</option>`).join('')}
                  </select>
                </div>
                <div style="min-width:180px;">
                  <div class="eyebrow mb-1">Total hours target</div>
                  <input id="bidHours" class="input" type="number" min="40" max="100" value="80"/>
                </div>
                <div style="min-width:160px;">
                  <div class="eyebrow mb-1">Max block hrs / day</div>
                  <input id="bidDayCap" class="input" type="number" min="2" max="18" step="0.5" value="14"/>
                </div>
                <div style="min-width:140px;">
                  <div class="eyebrow mb-1">Days flying</div>
                  <input id="bidDays" class="input" type="number" min="10" max="22" value="16"/>
                </div>
              </div>
              <label class="row gap-2 mt-3" style="font-size:12.5px;color:var(--text-dim);cursor:pointer;">
                <input type="checkbox" id="bidReturn" checked> <span><b>Return to base</b> — every outbound is paired with the return flight. Long-haul (>8 h) automatically gets a 24 h layover before the return.</span>
              </label>
              <div class="eyebrow mt-3 mb-2">Days I want OFF (click dates)</div>
              <div id="bidOffGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;"></div>
              <div class="row gap-2 mt-3">
                <button class="btn btn-primary" id="bidGenerate">${I('refresh', 14)} Generate bid lines</button>
                <button class="btn btn-ghost" id="bidReset">Reset</button>
              </div>
            </div>
            <div class="mt-4" id="bidLines"></div>
          ` });
          c.appendChild(sec);

          /* Off-day grid for current month */
          const offDays = new Set();
          const grid = $('#bidOffGrid', c);
          const today = new Date();
          for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(today.getFullYear(), today.getMonth(), d);
            const dYmd = ymd(date);
            const cell = el('button', { class:'ac-chip', html:`${d}<br><span style="font-size:9px;opacity:.6;">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()]}</span>`, style:'padding:8px 4px;text-align:center;font-size:11px;' });
            cell.onclick = () => {
              if (offDays.has(dYmd)) { offDays.delete(dYmd); cell.classList.remove('on'); }
              else { offDays.add(dYmd); cell.classList.add('on'); }
            };
            grid.appendChild(cell);
          }

          $('#bidReset', c).onclick = () => refreshAll();

          $('#bidGenerate', c).onclick = () => {
            const baseCode = $('#bidBase', c).value;
            const acVal = $('#bidAc', c).value;
            const opVal = $('#bidOp', c).value;     // 'AI' | 'IX' | ''
            const returnToBase = $('#bidReturn', c).checked;
            const targetHours = parseFloat($('#bidHours', c).value);
            const dayCapMins = parseFloat($('#bidDayCap', c).value || '14') * 60;
            const daysFlying = parseInt($('#bidDays', c).value, 10);

            /* === STRICT bid substitution policy ===
               Real airline rule (and Chief Pilot direction): a 787-rated pilot
               cannot operate a 777, and vice versa. The Book-Roster page still
               uses the loose AIVA.acSubstitutes() because that page tracks
               training currency, not bid eligibility. The Bid generator is the
               canonical "what can I actually fly this month" filter so it uses
               this tighter map: only the A320-series cross-substitutes; every
               other family stays within its own type. */
            const STRICT_FAMS = {
              'A320_FAMILY': ['A20N','A21N','A319','A320','A321'],
              'B787_FAMILY': ['B788','B789'],
              'B777_FAMILY': ['B77W','B77L'],
              'A350_FAMILY': ['A359'],
              'B737_FAMILY': ['B738','B38M'],
            };
            const A320_FAM = new Set(STRICT_FAMS.A320_FAMILY);
            let allowedTypes = null;
            if (acVal) {
              if (acVal.startsWith('fam:')) {
                allowedTypes = new Set(STRICT_FAMS[acVal.slice(4)] || []);
              } else if (A320_FAM.has(acVal)) {
                /* Picking any single A320-series type gives you the whole family */
                allowedTypes = A320_FAM;
              } else {
                /* Every other Boeing/Airbus: strict — only the exact type */
                allowedTypes = new Set([acVal]);
              }
            }

            /* Build 3 candidate bid lines with different shapes:
               A) Heavy days (3-leg domestic shuttle days)
               B) Layover-friendly (1 longhaul + rest day pattern)
               C) Balanced (mixed 2-leg days) */
            const lines = ['heavy', 'layover', 'balanced'].map(shape =>
              buildBidLine(shape, baseCode, allowedTypes, opVal, returnToBase, dayCapMins, targetHours, daysFlying, offDays, daysInMonth)
            );

            renderBidLines(lines);
          };

          function buildBidLine(shape, baseCode, allowedTypes, opVal, returnToBase, dayCapMins, targetHours, daysFlying, offDays, daysInMonth) {
            const today = new Date();
            const todayYmd = ymd(today);
            const targetMins = targetHours * 60;
            const out = { shape, days: [], totalMins: 0 };
            const seed = { heavy: 7, balanced: 17, layover: 23 }[shape] || 1;
            const usedFnos = new Set();

            const filter = (list) => {
              if (allowedTypes) list = list.filter(f => allowedTypes.has(f.ac));
              if (opVal)       list = list.filter(f => f.op === opVal);
              return list;
            };
            /* Find a return flight from `from` back to `baseCode`. Accepts two
               kinds of return:
                 a) DIRECT — a single sector from `from` straight to base
                 b) TAG    — a first-leg from `from` whose same-fno continuation
                             ends at base (e.g. AI188 YYZ→VIE whose continuation
                             VIE→DEL gets us home)
               Prefers the operational pair (outFno ± 1) so AI127↔AI128,
               AI187↔AI188, etc. */
            const findReturn = (from, outFnoStr, used) => {
              const all = filter(AIVA.FLIGHTS.filter(f => f.from === from));
              const direct = all.filter(f => f.to === baseCode && f.durMins <= dayCapMins);
              const tag    = all.filter(f => {
                if (f.to === baseCode) return false;       // not direct
                const cont = AIVA.FLIGHTS.find(c => c.fno === f.fno && c.from === f.to);
                return cont && cont.to === baseCode && (f.durMins + cont.durMins) <= dayCapMins;
              });
              const cands = [...direct, ...tag];
              if (!cands.length) return null;
              const outNum = parseInt(String(outFnoStr).replace(/\D/g,''), 10);
              const pair = cands.find(c => {
                const n = parseInt(String(c.fno).replace(/\D/g,''), 10);
                return n === outNum + 1 || n === outNum - 1;
              });
              if (pair) return pair;
              const fresh = cands.find(c => !used.has(c.fno));
              return fresh || cands[0];
            };
            /* If the just-picked leg has a same-fno continuation (e.g. AI127
               DEL→VIE has AI127 VIE→ORD), return that continuation. */
            const findContinuation = (leg) => {
              return AIVA.FLIGHTS.find(f => f.fno === leg.fno && f.from === leg.to);
            };

            let pickedDays = 0, dayIdx = today.getDate();
            while (pickedDays < daysFlying && dayIdx <= daysInMonth && out.totalMins < targetMins) {
              const date = new Date(today.getFullYear(), today.getMonth(), dayIdx);
              const dYmd = ymd(date);
              dayIdx++;
              if (dYmd < todayYmd) continue;
              if (offDays.has(dYmd)) continue;

              let legs = [];
              let here = baseCode;
              const wantLegs = shape === 'heavy' ? 3 : shape === 'layover' ? 1 : 2;
              const wantBlock = shape === 'heavy' ? 540 : shape === 'layover' ? 780 : 360;
              let dayIsLongHaul = false;
              /* Anything ≥ 6 h total block in a day collapses to a single-leg
                 duty period — long-haul means no same-day same-leg return. */
              const LONG_HAUL_MIN = 360;

              for (let i = 0; i < wantLegs; i++) {
                const blockSoFar = legs.reduce((s,f) => s + f.durMins, 0);
                let cands = filter(AIVA.FLIGHTS.filter(f => f.from === here));
                cands = cands.filter(f => (blockSoFar + f.durMins) <= dayCapMins);
                if (i === wantLegs - 1 && shape !== 'layover') {
                  cands = cands.filter(f => f.to === baseCode);
                }
                if (!cands.length) break;
                cands.sort((a, b) => Math.abs(a.durMins - wantBlock/wantLegs) - Math.abs(b.durMins - wantBlock/wantLegs));
                const topN = cands.slice(0, Math.max(4, Math.min(8, cands.length)));
                let pick = null;
                for (let r = 0; r < topN.length; r++) {
                  const c = topN[(pickedDays + seed + i + r) % topN.length];
                  if (!usedFnos.has(c.fno)) { pick = c; break; }
                }
                if (!pick) pick = topN[(pickedDays + seed + i) % topN.length];
                usedFnos.add(pick.fno);
                legs.push(pick);
                here = pick.to;

                /* === TAG-FLIGHT CHAIN ===
                   Same-fno continuation is ALWAYS added — it's the same
                   physical flight (e.g. AI127 DEL→VIE→ORD), the pilot can't
                   refuse the second leg even if it would exceed the day cap.
                   Augmented crew handles the FDTL implication. */
                const cont = findContinuation(pick);
                if (cont) {
                  legs.push(cont);
                  here = cont.to;
                }

                /* Long-haul detection: any single leg ≥ 6 h, OR a tag chain
                   whose total exceeds 6 h, collapses to a single-leg-per-day. */
                const dayBlock = legs.reduce((s,f) => s + f.durMins, 0);
                if (dayBlock >= LONG_HAUL_MIN) {
                  dayIsLongHaul = true;
                  break;
                }
              }
              if (!legs.length) continue;
              const block = legs.reduce((s,f) => s + f.durMins, 0);
              out.days.push({ date: dYmd, legs, block, longHaul: dayIsLongHaul });
              out.totalMins += block;
              pickedDays++;

              /* === RETURN-TO-BASE + 24h LAYOVER REST === */
              const wasLongHaul = dayIsLongHaul || block >= 480;
              if (returnToBase && here !== baseCode) {
                const outFno = legs[0].fno;
                const ret = findReturn(here, outFno, usedFnos);
                if (ret) {
                  /* Insert rest day(s) before scheduling the return */
                  let retIdx = dayIdx + (wasLongHaul ? 1 : 0);
                  while (retIdx <= daysInMonth) {
                    const rDate = new Date(today.getFullYear(), today.getMonth(), retIdx);
                    const rYmd  = ymd(rDate);
                    if (rYmd >= todayYmd && !offDays.has(rYmd)) {
                      /* Chain the return flight's continuation too (AI128 ORD→VIE → VIE→DEL) */
                      const retLegs = [ret];
                      const retCont = findContinuation(ret);
                      if (retCont) retLegs.push(retCont);
                      const retBlock = retLegs.reduce((s,f) => s + f.durMins, 0);
                      out.days.push({ date: rYmd, legs: retLegs, block: retBlock, ret: true, restGap: wasLongHaul });
                      out.totalMins += retBlock;
                      usedFnos.add(ret.fno);
                      pickedDays++;
                      dayIdx = retIdx + 1;
                      break;
                    }
                    retIdx++;
                  }
                }
              } else if (shape === 'layover') {
                dayIdx++;
              }
            }
            /* Sort the line so dates appear in chronological order */
            out.days.sort((a, b) => a.date.localeCompare(b.date));
            return out;
          }

          function renderBidLines(lines) {
            const host = $('#bidLines', c);
            const labels = { heavy:'Heavy domestic (3-leg days)', layover:'Layover-friendly (longhaul rotations)', balanced:'Balanced (2-leg days)' };
            host.innerHTML = `
              <div class="grid grid-3 mt-2">
                ${lines.map((l, i) => {
                  const datesSet = new Set(l.days.map(d => d.date));
                  const firstDate = l.days[0]?.date;
                  const lastDate  = l.days[l.days.length-1]?.date;
                  const uniqueLegs = new Set(l.days.flatMap(d => d.legs.map(f => f.fno)));
                  return `
                  <div class="card" style="padding:18px;">
                    <div class="row between mb-1">
                      <div><h3 style="margin:0;font-size:16px;">Line ${String.fromCharCode(65+i)}</h3><div class="text-mute" style="font-size:11.5px;">${labels[l.shape]}</div></div>
                      <span class="pill pill-gold">${(l.totalMins/60).toFixed(1)} h</span>
                    </div>
                    <div class="text-mute mono mb-2" style="font-size:11px;">
                      ${l.days.length} duty days · ${uniqueLegs.size} unique sectors · avg ${(l.totalMins / Math.max(l.days.length,1) / 60).toFixed(1)} h/day
                    </div>
                    <div class="text-mute mono mb-2" style="font-size:10.5px;letter-spacing:.12em;">
                      ${firstDate ? `${firstDate.slice(5)} → ${lastDate.slice(5)} · ${datesSet.size} dates` : ''}
                    </div>
                    <div class="col gap-1" style="max-height:240px;overflow:auto;">
                      ${l.days.slice(0, 12).map(d => `
                        <div style="font-size:11px;color:var(--text-mute);display:flex;gap:8px;align-items:baseline;${d.ret ? 'background:rgba(96,165,250,.06);padding:3px 6px;border-radius:6px;' : ''}">
                          <span class="mono" style="color:${d.ret ? '#93C5FD' : 'var(--ai-gold)'};min-width:42px;">${d.date.slice(5)}</span>
                          <span style="flex:1;">
                            ${d.ret && d.restGap ? '<span class="text-mute" style="font-size:10px;">↳ after 24h layover</span> ' : ''}
                            ${d.legs.map(f => `<span class="mono" style="color:var(--text);">${f.from}→${f.to}</span> <span class="text-mute mono" style="font-size:10px;">${f.fno}</span>`).join(' · ')}
                          </span>
                          <span class="mono">${(d.block/60).toFixed(1)}h</span>
                        </div>
                      `).join('')}
                      ${l.days.length > 12 ? `<div style="font-size:10.5px;color:var(--text-mute);">… +${l.days.length-12} more days</div>` : ''}
                    </div>
                    <button class="btn btn-primary btn-sm mt-3" data-bid="${i}" style="width:100%;">${I('check', 14)} Submit this bid</button>
                  </div>
                `;}).join('')}
              </div>
            `;
            host.querySelectorAll('[data-bid]').forEach(b => b.onclick = () => {
              const line = lines[parseInt(b.dataset.bid, 10)];
              const bookings = getBookings();
              const newOnes = [];
              line.days.forEach(d => d.legs.forEach(f => newOnes.push({
                date: d.date, fno: f.fno,
                from: f.from, to: f.to,
                ac: f.ac, op: f.op,
                ts: Date.now(),
              })));
              setBookings([...bookings, ...newOnes]);
              toast(`✓ Bid Line ${String.fromCharCode(65+parseInt(b.dataset.bid,10))} accepted — ${newOnes.length} sectors over ${line.days.length} days`, 'ok');
              buildNav();
              location.hash = '#roster';
            });
          }
        }

        refreshAll();
      }
    },

    /* ============ SIM BRIDGE ============
       Source-of-truth status page for the link between AIVA and MSFS.
       Most pilots never need to open this — the topbar chip + EFB pill
       already show live/offline. But when things look broken (chip red
       while telemetry IS flowing, or vice versa), this page lays the
       wiring bare so we can spot which side is at fault:

         • Desktop runtime — am I inside the .exe? Which version? Does
           it expose the SimConnect bridge to the renderer?
         • Source — SimConnect direct (.exe) or WebSocket-FSUIPC (browser
           fallback)?
         • Live status — is the singleton's `connected` true? When was
           the last frame received? What was in it?
         • Retry / restart controls — source-aware (won't fire the
           legacy WebSocket attempts inside the .exe).                 */
    simbridge: {
      sub: 'AIVA ↔ MSFS link diagnostic',
      render: (c) => {
        const inDesktop = !!window.AIVA_DESKTOP?.isDesktop;
        const hasSc     = !!window.AIVA_DESKTOP?.simConnect;
        const fileProto = location.protocol === 'file:';
        const source    = hasSc ? 'SimConnect (native)' : 'WebSocket-FSUIPC';
        const desktopVer = inDesktop ? (window.AIVA_DESKTOP.version || '—') : '—';
        const platform   = inDesktop ? (window.AIVA_DESKTOP.platform || '—') : 'browser';

        c.appendChild(el('section', { html: `
          <div class="card" style="padding:20px 22px;">
            <div class="row between" style="align-items:flex-start;gap:18px;flex-wrap:wrap;">
              <div style="flex:1;min-width:240px;">
                <div class="eyebrow">Live sim link</div>
                <h2 class="display mt-2" style="font-size:24px;line-height:1.1;" id="sbHeadline">Checking…</h2>
                <div class="text-mute" style="font-size:13px;line-height:1.55;margin-top:8px;" id="sbHint">Reading bridge state from AIVA runtime…</div>
              </div>
              <div class="row gap-2" style="flex-wrap:wrap;align-self:flex-start;">
                <button class="btn btn-primary btn-sm" id="sbRetry">${I('refresh',14)} Retry now</button>
                <a class="btn btn-ghost btn-sm" href="efb.html#fsuipc">${I('plane',14)} Open in EFB</a>
              </div>
            </div>

            <!-- Runtime fingerprint -->
            <div class="grid grid-3 mt-4 mono" style="font-size:12.5px;gap:14px;">
              <div>
                <div class="text-mute" style="font-size:10.5px;letter-spacing:.14em;">DESKTOP APP</div>
                <div style="margin-top:4px;"><b style="color:${inDesktop ? 'var(--ai-gold-bright)' : '#FCA5A5'};">${inDesktop ? 'YES · running inside .exe' : 'NO · browser tab'}</b></div>
                <div class="text-mute" style="font-size:11px;margin-top:2px;">v${desktopVer} · ${platform}</div>
              </div>
              <div>
                <div class="text-mute" style="font-size:10.5px;letter-spacing:.14em;">SIMCONNECT BRIDGE</div>
                <div style="margin-top:4px;"><b style="color:${hasSc ? 'var(--ai-gold-bright)' : '#FCA5A5'};">${hasSc ? 'EXPOSED' : 'NOT AVAILABLE'}</b></div>
                <div class="text-mute" style="font-size:11px;margin-top:2px;">${hasSc ? 'preload.js wired this renderer to the native MSFS link' : (inDesktop ? '⚠ .exe is OLD — rebuild needed' : 'Browsers can\'t use SimConnect — open the .exe')}</div>
              </div>
              <div>
                <div class="text-mute" style="font-size:10.5px;letter-spacing:.14em;">PROTOCOL</div>
                <div style="margin-top:4px;"><b>${source}</b></div>
                <div class="text-mute" style="font-size:11px;margin-top:2px;">${fileProto ? 'file:// origin' : location.origin}</div>
              </div>
            </div>
          </div>

          <!-- Live status row -->
          <div class="card mt-4" style="padding:18px 22px;">
            <div class="row between" style="align-items:center;flex-wrap:wrap;gap:10px;">
              <div>
                <div class="eyebrow">Connection status</div>
                <div class="row gap-2 mt-2" style="align-items:center;">
                  <span class="pill" id="sbStatePill" style="font-size:11px;padding:5px 12px;">…</span>
                  <span class="text-mute mono" id="sbLastFrame" style="font-size:11px;">last frame: —</span>
                </div>
              </div>
              <div class="text-mute mono" style="font-size:11px;text-align:right;">
                AIVA.FSUIPC.isConnected() = <b id="sbBool">…</b><br>
                AIVA.FSUIPC.source()       = <b id="sbSrc">…</b>
              </div>
            </div>

            <!-- Live telemetry snapshot -->
            <div class="grid grid-4 mt-4 mono" style="gap:12px;font-size:12.5px;">
              ${['lat','lon','alt','ias','tas','gs','vs','hdg','onGround','parkingBrake','flapsIdx','fuel'].map(k => `
                <div>
                  <div class="text-mute" style="font-size:10px;letter-spacing:.12em;">${k.toUpperCase()}</div>
                  <div style="margin-top:3px;"><b id="sb_${k}">—</b></div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Help / next-step card, switches based on detected state -->
          <div class="card mt-4" style="padding:18px 22px;" id="sbHelp"></div>
        ` }));

        const $$ = (sel) => c.querySelector(sel);
        const setText = (sel, v) => { const e = $$(sel); if (e) e.textContent = v; };
        const fmtN = (v, d=0) => (v == null || Number.isNaN(v)) ? '—' : (typeof v === 'number' ? v.toFixed(d) : v);

        function tick() {
          const live = AIVA.FSUIPC?.isConnected?.() === true;
          const src  = AIVA.FSUIPC?.source?.() || (hasSc ? 'sim' : 'ws');
          const last = AIVA.FSUIPC?.state?.() || {};

          const pill = $$('#sbStatePill');
          if (pill) {
            pill.textContent = live ? '● LIVE · streaming' : (hasSc ? '○ WAITING FOR MSFS' : '○ NO LINK');
            pill.className   = 'pill ' + (live ? 'pill-gold' : 'pill-red');
            pill.style       = 'font-size:11px;padding:5px 12px;';
          }
          setText('#sbBool', live);
          setText('#sbSrc',  src);
          setText('#sbLastFrame', last.ts ? `last frame: ${new Date(last.ts).toLocaleTimeString()} (${Math.round((Date.now()-last.ts)/1000)}s ago)` : 'last frame: —');

          /* Telemetry snapshot */
          setText('#sb_lat',          fmtN(last.lat, 4));
          setText('#sb_lon',          fmtN(last.lon, 4));
          setText('#sb_alt',          last.alt != null ? Math.round(last.alt).toLocaleString() + ' ft' : '—');
          setText('#sb_ias',          fmtN(last.ias, 0) + (last.ias != null ? ' kt' : ''));
          setText('#sb_tas',          fmtN(last.tas, 0) + (last.tas != null ? ' kt' : ''));
          setText('#sb_gs',           fmtN(last.gs, 0)  + (last.gs  != null ? ' kt' : ''));
          setText('#sb_vs',           last.vs  != null ? Math.round(last.vs).toLocaleString() + ' fpm' : '—');
          setText('#sb_hdg',          last.hdg != null ? Math.round(last.hdg) + '°' : '—');
          setText('#sb_onGround',     last.onGround == null ? '—' : (last.onGround ? 'YES' : 'NO'));
          setText('#sb_parkingBrake', last.parkingBrake == null ? '—' : (last.parkingBrake ? 'SET' : 'OFF'));
          setText('#sb_flapsIdx',     last.flapsIdx == null ? '—' : String(last.flapsIdx));
          setText('#sb_fuel',         last.fuel != null ? Math.round(last.fuel).toLocaleString() + ' kg' : '—');

          /* Headline + help */
          const h = $$('#sbHeadline'), hint = $$('#sbHint'), help = $$('#sbHelp');
          if (h && hint && help) {
            if (live) {
              h.textContent = 'Sim link is live.';
              hint.textContent = `Telemetry is streaming via ${source}. Map, EFB, phase detection, and ACARS auto-progress are all active.`;
              help.innerHTML = `
                <div class="row gap-2" style="align-items:center;">
                  <span class="pill pill-gold" style="font-size:10px;">✓ HEALTHY</span>
                  <span style="font-size:13px;">No action needed. If a downstream UI shows OFFLINE while this page says LIVE, hard-refresh (Ctrl+Shift+R).</span>
                </div>`;
            } else if (hasSc) {
              h.textContent = 'Waiting for MSFS.';
              hint.textContent = 'AIVA can talk to SimConnect — we just haven\'t found the sim yet. Start MSFS and load any aircraft.';
              help.innerHTML = `
                <div class="eyebrow" style="color:var(--ai-gold-bright);">Next step</div>
                <ol class="mt-3" style="padding-left:22px;font-size:13px;line-height:1.7;color:var(--text-dim);">
                  <li>Start <b>Microsoft Flight Simulator</b>.</li>
                  <li>Load any aircraft to the gate or runway — free flight, career, doesn't matter.</li>
                  <li>SimConnect auto-detects within ~5 seconds. This page flips green by itself.</li>
                </ol>`;
            } else if (inDesktop) {
              h.textContent = 'Desktop bridge missing.';
              hint.textContent = 'You\'re inside the .exe but the SimConnect bridge wasn\'t exposed to this page. The installed .exe is older than the current site code.';
              help.innerHTML = `
                <div class="row gap-2" style="align-items:center;flex-wrap:wrap;">
                  <span class="pill pill-red" style="font-size:10px;">⚠ REBUILD</span>
                  <span style="font-size:13px;">Download the latest <b>AIVA-Setup.exe</b> from the site root and reinstall — the new .exe carries the SimConnect bridge.</span>
                </div>
                <a class="btn btn-primary btn-sm mt-3" href="/AIVA-Setup.exe">${I('download',14)} Download AIVA-Setup.exe</a>`;
            } else {
              h.textContent = 'You\'re in a browser.';
              hint.textContent = 'SimConnect can only run inside the AIVA desktop app. Browsers can\'t open the local Windows pipe MSFS uses.';
              help.innerHTML = `
                <div class="row gap-2" style="align-items:center;flex-wrap:wrap;">
                  <span class="pill pill-gold" style="font-size:10px;">USE DESKTOP APP</span>
                  <span style="font-size:13px;">Install + launch <b>AIVA</b> from your Start Menu. It loads this exact site but with the native MSFS link in the background.</span>
                </div>
                <a class="btn btn-primary btn-sm mt-3" href="/install?go=1">${I('download',14)} Install AIVA desktop</a>`;
            }
          }
        }

        /* Live state subscription — react instantly to connect / disconnect */
        const onState = () => tick();
        AIVA.FSUIPC?.on?.('connect',    onState);
        AIVA.FSUIPC?.on?.('disconnect', onState);
        AIVA.FSUIPC?.on?.('state',      onState);
        tick();
        const iv = setInterval(tick, 1000);
        const cleanup = () => { clearInterval(iv); window.removeEventListener('hashchange', cleanup); };
        window.addEventListener('hashchange', cleanup);

        /* Retry button — source-aware, just like EFB. Never fires the
           legacy WebSocket attempts in SimConnect mode. */
        $$('#sbRetry').onclick = async () => {
          if (hasSc) {
            try {
              const st = await window.AIVA_DESKTOP.simConnect.getState();
              if (st === 'connected') toast('SimConnect link confirmed', 'ok');
              else toast('MSFS not detected — start the sim and load a flight', 'warn', 5000);
            } catch (e) {
              toast('SimConnect bridge unreachable — try restarting AIVA', 'bad', 6000);
            }
          } else {
            try {
              await AIVA.FSUIPC?.connect?.();
              toast('FSUIPC reconnect attempted', 'ok');
            } catch (e) {
              toast('FSUIPC unreachable — open AIVA desktop app or start FSUIPC WebSockets Server', 'bad', 6000);
            }
          }
          tick();
        };
      },
    },

    /* ============ MY FLIGHTS ============ */
    flights: {
      sub: 'Pilot log',
      render: (c) => {
        const logged = P.get('flights_logged', []);
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>My Flights</h2><div class="sub">${logged.length} sector${logged.length === 1 ? '' : 's'} logged</div></div>
            <div class="actions">
              <a href="#import" class="btn btn-primary btn-sm">${I('upload', 14)} Import</a>
              <button class="btn btn-ghost btn-sm" id="addManual">${I('plus', 14)} Add manually</button>
              <button class="btn btn-ghost btn-sm" id="exportCsv">${I('download', 14)} Export</button>
            </div>
          </div>
        ` }));

        if (!logged.length) {
          c.appendChild(el('div', { class:'card', style:{ textAlign:'center', padding:'56px 20px' }, html: `
            <div style="font-size:42px;opacity:.4;">${I('plane', 42)}</div>
            <h3 class="display" style="margin-top:14px;font-size:20px;">No flights logged yet</h3>
            <p class="text-mute mt-2">Import from Volanta / ElevateX, fly a sector from the EFB, or add manually.</p>
            <div class="row" style="justify-content:center; margin-top:18px; gap:8px;">
              <a href="#import" class="btn btn-primary btn-sm">${I('upload', 14)} Import flights</a>
              <a href="#book"   class="btn btn-ghost btn-sm">${I('plus', 14)} Book a flight</a>
            </div>
          ` }));
        } else {
          const sorted = [...logged].sort((a,b) => (b.date || '').localeCompare(a.date || ''));
          c.appendChild(el('div', { class:'card', style:{ padding:0 }, html: `
            <table class="tbl">
              <thead><tr>
                <th>Date</th><th>Flight</th><th>Route</th><th>A/C</th><th>Reg</th>
                <th>Block</th><th>LND</th><th>G</th><th>Network</th><th></th>
              </tr></thead>
              <tbody>
                ${sorted.map(f => `
                  <tr>
                    <td class="mono">${f.date || '—'}</td>
                    <td class="mono">${f.fno || '—'}</td>
                    <td>${f.from || ''} → ${f.to || ''}</td>
                    <td>${f.ac || '—'}</td>
                    <td class="mono">${f.reg || '—'}</td>
                    <td class="mono">${fmtMins(f.durMins)}</td>
                    <td class="mono" style="color:${landingRateColor(f.lndRate)}">${f.lndRate ? Math.round(f.lndRate) + ' fpm' : '—'}</td>
                    <td class="mono">${f.gRate ? Number(f.gRate).toFixed(2) + 'g' : '—'}</td>
                    <td class="mono"><span class="pill pill-gold" style="font-size:9px;padding:2px 6px;">${f.network || 'OFFLINE'}</span></td>
                    <td><button class="btn btn-ghost btn-sm" data-del="${f._id}">${I('close', 12)}</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}));
          c.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => {
            const arr = P.get('flights_logged', []).filter(f => f._id !== btn.dataset.del);
            P.set('flights_logged', arr); route();
          });
        }
        c.querySelector('#addManual')?.addEventListener('click', () => openManualClaimModal());
        c.querySelector('#exportCsv')?.addEventListener('click', exportLog);
      }
    },

    /* ============ IMPORT ============ */
    import: {
      sub: 'CSV · Volanta · ElevateX · manual',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Import Flights</h2><div class="sub">Auto-detects Volanta · ElevateX · SimBrief · generic CSV</div></div></div>
          <div class="note-callout">
            <b>Drop a CSV</b> from Volanta or ElevateX (export → log → CSV). AIVA reads headers like <code>Flight</code>, <code>Callsign</code>, <code>Block</code>, <code>Landing Rate</code>, <code>VS</code>, <code>From</code>, <code>To</code> and maps to the AIVA schema automatically.
          </div>
        ` }));

        const wrap = el('div', { class:'grid grid-2 mt-4' });
        const left = el('div', { class:'card' });
        left.innerHTML = `
          <div class="eyebrow">CSV upload</div>
          <h3 class="display" style="font-size:18px;margin-top:6px;">Drop a Volanta or ElevateX CSV</h3>
          <input type="file" id="fileIn" accept=".csv,.tsv,.txt" style="display:none;">
          <div id="dropzone" style="border: 1.5px dashed var(--border-gold); border-radius: 14px; padding: 32px 20px; text-align:center; margin-top:14px; cursor:pointer; transition: all .2s;">
            <div style="font-size:28px;opacity:.6;">${I('upload', 28)}</div>
            <div class="display" style="font-size:15px;margin-top:8px;">Drop CSV here</div>
            <div class="text-mute" style="font-size:11px;margin-top:4px;">or click to choose a file</div>
          </div>
          <div class="gold-rule"></div>
          <div class="eyebrow mb-2">Paste CSV text</div>
          <textarea class="textarea" id="csvText" rows="5" placeholder="Date,Flight,From,To,Aircraft,Block,Landing Rate
2026-05-12,AI191,BOM,EWR,B777-300ER,16:30,-152"></textarea>
          <button class="btn btn-primary btn-sm mt-3" id="parsePaste">${I('upload', 14)} Parse</button>
        `;
        wrap.appendChild(left);

        const right = el('div', { class:'card' });
        right.innerHTML = `
          <div class="eyebrow">Manual entry</div>
          <h3 class="display" style="font-size:18px;margin-top:6px;">Add a single flight</h3>
          <div class="field-row mt-3">
            <div class="field"><label class="label">Date</label><input class="input" type="date" id="mDate" value="${AIVA.U.todayISO()}"></div>
            <div class="field"><label class="label">Flight</label><input class="input" id="mFno" placeholder="AI191"></div>
          </div>
          <div class="field-row">
            <div class="field"><label class="label">From</label><input class="input" id="mFrom" placeholder="BOM or VABB"></div>
            <div class="field"><label class="label">To</label><input class="input" id="mTo" placeholder="EWR or KEWR"></div>
          </div>
          <div class="field-row">
            <div class="field"><label class="label">Aircraft</label><input class="input" id="mAc" placeholder="B777-300ER"></div>
            <div class="field"><label class="label">Reg</label><input class="input" id="mReg" placeholder="VT-ALK"></div>
          </div>
          <div class="field-row-3">
            <div class="field"><label class="label">Block</label><input class="input" id="mDur" placeholder="2:20"></div>
            <div class="field"><label class="label">Landing fpm</label><input class="input" type="number" id="mLnd" placeholder="-180"></div>
            <div class="field"><label class="label">Max G</label><input class="input" type="number" step=".01" id="mG" placeholder="1.32"></div>
          </div>
          <div class="field-row">
            <div class="field"><label class="label">Network</label>
              <select class="select" id="mNet"><option>VATSIM</option><option>IVAO</option><option>OFFLINE</option></select>
            </div>
            <div class="field"><label class="label">Notes</label><input class="input" id="mNotes" placeholder="Smooth approach…"></div>
          </div>
          <button class="btn btn-primary mt-3" id="addOne">${I('plus', 14)} Log flight</button>
        `;
        wrap.appendChild(right);
        c.appendChild(wrap);

        const dz = $('#dropzone', c), fi = $('#fileIn', c);
        dz.onclick = () => fi.click();
        fi.onchange = e => readCSVFile(e.target.files[0]);
        ['dragover','dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.style.borderColor = 'var(--ai-gold-bright)'; dz.style.background = 'rgba(199,165,108,.06)'; }));
        ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.style.borderColor = 'var(--border-gold)'; dz.style.background = ''; }));
        dz.addEventListener('drop', e => readCSVFile(e.dataTransfer.files[0]));
        $('#parsePaste', c).onclick = () => {
          const t = $('#csvText', c).value.trim();
          if (!t) return toast('Paste some CSV first.', 'warn');
          ingestCSV(t);
        };
        $('#addOne', c).onclick = () => {
          const f = readManualForm(c); if (!f) return;
          saveLogged([f]); toast(`Logged ${f.fno}`, 'ok');
          location.hash = '#flights';
        };
      }
    },

    /* ============ STATS ============ */
    stats: {
      sub: 'Landing performance · averages',
      render: (c) => {
        const logged = P.get('flights_logged', []);
        if (!logged.length) {
          c.appendChild(el('div', { class:'card', style:{ textAlign:'center', padding:'48px 20px' }, html:`
            <h3 class="display" style="font-size:20px;">No data yet</h3>
            <p class="text-mute mt-2">Statistics populate from your logged flights.</p>
            <a href="#import" class="btn btn-primary btn-sm mt-3">${I('upload', 14)} Import flights</a>
          ` }));
          return;
        }
        const lr = logged.filter(f => f.lndRate);
        const gr = logged.filter(f => f.gRate);
        const avgLnd = avg(lr, 'lndRate');
        const avgG   = avg(gr, 'gRate');
        const bestLnd = lr.length ? lr.map(f => Number(f.lndRate)).reduce((b, v) => Math.abs(v) < Math.abs(b) ? v : b, -9999) : null;
        const greaseN = lr.filter(f => { const v = Math.abs(+f.lndRate); return v >= 40 && v <= 100; }).length;

        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Pilot Statistics</h2><div class="sub">${logged.length} sectors analysed</div></div></div>
          <div class="kpi-grid">
            <div class="kpi"><div class="lbl">Avg Landing</div><div class="val">${avgLnd ? Math.round(avgLnd) : 0} <span style="font-size:13px;color:var(--text-mute)">fpm</span></div><div class="sub">target -180 ±60</div><div class="bar" style="width:60%"></div></div>
            <div class="kpi"><div class="lbl">Best Landing</div><div class="val">${bestLnd != null ? Math.round(bestLnd) : 0} <span style="font-size:13px;color:var(--text-mute)">fpm</span></div><div class="sub">closest to grease</div><div class="bar" style="width:90%"></div></div>
            <div class="kpi"><div class="lbl">Avg G on touch</div><div class="val">${avgG ? avgG.toFixed(2) : '0.00'} <span style="font-size:13px;color:var(--text-mute)">g</span></div><div class="sub">passenger comfort</div><div class="bar" style="width:70%"></div></div>
            <div class="kpi"><div class="lbl">Grease rate</div><div class="val">${lr.length ? Math.round(greaseN / lr.length * 100) : 0}%</div><div class="sub">-40 to -100 fpm window</div><div class="bar" style="width:${lr.length ? greaseN / lr.length * 100 : 0}%"></div></div>
          </div>
        ` }));

        const byAc = {};
        logged.forEach(f => {
          if (!f.ac) return;
          if (!byAc[f.ac]) byAc[f.ac] = { count:0, lnd:[], dur:0 };
          byAc[f.ac].count++;
          if (f.lndRate) byAc[f.ac].lnd.push(Number(f.lndRate));
          if (f.durMins) byAc[f.ac].dur += Number(f.durMins);
        });
        c.appendChild(el('section', { html: `
          <div class="section-title mt-6"><div><h2>By Aircraft Type</h2><div class="sub">average landing & hours by fleet</div></div></div>
          <div class="card" style="padding:0;">
            <table class="tbl">
              <thead><tr><th>Aircraft</th><th>Sectors</th><th>Total Hours</th><th>Avg Landing</th></tr></thead>
              <tbody>
                ${Object.entries(byAc).map(([ac, d]) => `
                  <tr>
                    <td><b>${ac}</b></td>
                    <td class="mono">${d.count}</td>
                    <td class="mono">${fmtMins(d.dur)}</td>
                    <td class="mono" style="color:${landingRateColor(avg(d.lnd))}">${d.lnd.length ? Math.round(avg(d.lnd)) + ' fpm' : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` }));
      }
    },

    /* ============ MET BRIEFING ============ */
    met: {
      sub: 'METAR · TAF · ATIS · live from NOAA + datis.clowd.io + VATSIM',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Meteorological Briefing</h2><div class="sub">Live METAR/TAF + D-ATIS where available</div></div>
            <div class="actions">
              <a href="https://aviationweather.gov/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external',14)} AWC</a>
            </div>
          </div>
          <div class="card mb-4" style="padding:16px 22px;">
            <div class="row gap-2" style="flex-wrap:wrap;align-items:center;">
              <input class="input" id="metarInput" placeholder="ICAOs e.g. VIDP VABB EGLL KJFK" value="VIDP VABB" style="flex:1;min-width:240px;">
              <button class="btn btn-primary btn-sm" id="fetchMet">${I('cloud', 14)} Fetch</button>
              <button class="btn btn-ghost btn-sm" id="hubPreset">${I('layers',14)} Hubs</button>
              <button class="btn btn-ghost btn-sm" id="metRt">${I('plane',14)} My route</button>
            </div>
            <div class="text-mute mt-2" style="font-size:11px;">METAR + TAF via aviationweather.gov · D-ATIS via datis.clowd.io (FAA airports) · live VATSIM ATIS controllers</div>
          </div>
          <div id="metarOut"></div>
        ` }));
        const out = $('#metarOut', c);

        async function fetchAll(codes) {
          out.innerHTML = `<div class="row gap-2" style="padding:18px;"><div class="chakra-spin"></div><span class="text-mute">Pulling METAR + TAF + ATIS for ${codes.length} airport${codes.length>1?'s':''}…</span></div>`;
          /* In parallel: NOAA METAR+TAF, datis.clowd.io ATIS, VATSIM datafeed */
          const [wxArr, atisFAA, vatsim] = await Promise.all([
            fetchWX(codes),
            fetchATIS_FAA(codes),
            fetchVATSIM(),
          ]);
          const vatsimByIcao = {};
          (vatsim?.atis || []).forEach(a => { vatsimByIcao[a.callsign?.split('_')?.[0]] = a; });
          out.innerHTML = '';
          codes.forEach(icao => {
            const wx = wxArr.find(w => (w.icaoId || w.station) === icao);
            const atis = atisFAA[icao] || null;
            const vat  = vatsimByIcao[icao] || vatsimByIcao[icao.replace(/^K/,'')] || null;
            out.appendChild(metarFullBlock(icao, wx, atis, vat));
          });
        }
        /* Try direct, then route through CORS proxies if the browser blocks.
           Two proxies stacked for resilience — corsproxy.io is rate-limited and
           sometimes 502s, so we fall through to api.allorigins.win which is
           slower but more reliable. */
        const proxies = [
          (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
          (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        ];
        async function tryFetch(url) {
          try {
            const r = await fetch(url, { mode:'cors' });
            if (r.ok) return r;
          } catch {}
          for (const p of proxies) {
            try {
              const r = await fetch(p(url));
              if (r.ok) return r;
            } catch {}
          }
          return null;
        }
        async function fetchWX(codes) {
          /* Route through our /api/wx serverless proxy: server-to-server
             so CORS doesn't apply, and it fans out across AWC → VATSIM →
             NOAA TGFTP so even if one source is down we still get METAR.
             The pre-existing flaky-proxy path (corsproxy.io) ate too
             many METAR fetches; this is the rewrite. */
          try {
            const r = await fetch(`/api/wx?ids=${codes.join(',')}`);
            if (!r.ok) return [];
            const j = await r.json();
            return Array.isArray(j) ? j : [];
          } catch { return []; }
        }
        async function fetchATIS_FAA(codes) {
          const out = {};
          await Promise.all(codes.map(async (icao) => {
            const r = await tryFetch(`https://datis.clowd.io/api/${icao}`);
            if (!r || !r.ok) return;
            try {
              const j = await r.json();
              if (Array.isArray(j) && j.length) out[icao] = j;
            } catch {}
          }));
          return out;
        }
        async function fetchVATSIM() {
          const r = await tryFetch('https://data.vatsim.net/v3/vatsim-data.json');
          if (!r || !r.ok) return null;
          try { return await r.json(); } catch { return null; }
        }

        $('#fetchMet', c).onclick = () => {
          const codes = $('#metarInput', c).value.trim().split(/\s+/).filter(Boolean).map(s => s.toUpperCase()).map(s => s.length === 3 ? (AIVA.airport(s)?.icao || s) : s);
          if (codes.length) fetchAll(codes);
        };
        $('#metarInput', c).addEventListener('keydown', e => { if (e.key === 'Enter') $('#fetchMet', c).click(); });
        $('#hubPreset', c).onclick = () => { $('#metarInput', c).value = AIVA.HUBS.map(h => AIVA.airport(h)?.icao || h).join(' '); $('#fetchMet', c).click(); };
        $('#metRt', c).onclick = () => {
          const today = ymd();
          const bk = (P.get('roster_bookings',[]) || []).find(b => b.date === today);
          if (!bk) return toast('No flight on today\'s roster', 'warn');
          const f = AIVA.findFlight(bk.fno);
          if (!f) return;
          $('#metarInput', c).value = [f.from, f.to].map(s => AIVA.airport(s)?.icao || s).join(' ');
          $('#fetchMet', c).click();
        };
        fetchAll(['VIDP','VABB']);
      }
    },

    /* ============ NOTAM ============ */
    notam: {
      sub: 'Live NOTAMs from your SimBrief OFP · ICAO live · authoritative fallbacks',
      render: (c) => {
        /* Default ICAOs:
           1) Today's roster flight (origin + destination) — most relevant.
           2) Otherwise, the active SimBrief OFP's origin + destination if
              we have a username cached (saves a fetch later in the flow).
           3) Otherwise fall back to the pilot's home base only. */
        let default3 = [];
        try {
          const todayBk = (getBookings() || []).find(b => b.date === ymd());
          if (todayBk) {
            const f = AIVA.findFlight(todayBk.fno);
            if (f) {
              const orig = AIVA.airport(f.from)?.icao;
              const dest = AIVA.airport(f.to)?.icao;
              if (orig) default3.push(orig);
              if (dest) default3.push(dest);
            }
          }
        } catch {}
        if (!default3.length) {
          const base = AIVA.airport(pilot.base || 'DEL')?.icao;
          if (base) default3.push(base);
        }
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>NOTAM &amp; AIP</h2><div class="sub">Live NOTAMs pulled from your dispatched SimBrief OFP</div></div>
            <div class="actions">
              <a href="https://dispatch.simbrief.com/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external', 14)} SimBrief Dispatch</a>
              <a href="https://aim-india.aai.aero/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external', 14)} AAI eAIP</a>
            </div>
          </div>
          <div class="card mb-4" style="padding:16px 22px;">
            <div class="row gap-2" style="flex-wrap:wrap;align-items:center;">
              <input id="ntInp" class="input" placeholder="e.g. VIDP VABB EGLL KJFK" value="${default3.join(' ')}" style="flex:1;min-width:240px;"/>
              <button id="ntGo" class="btn btn-primary btn-sm">${I('search',14)} Search</button>
              <button id="ntAll" class="btn btn-ghost btn-sm" title="Load all 6 AIVA hubs">${I('layers',14)} All hubs</button>
              <button id="ntRt"  class="btn btn-ghost btn-sm" title="Load my active route">${I('plane',14)} My route</button>
            </div>
            <div class="row mt-2" style="flex-wrap:wrap;gap:6px;font-size:11px;color:var(--text-mute);" id="ntChips"></div>
            <div class="text-mute mt-2" style="font-size:11.5px;" id="ntStatus"></div>
          </div>
          <div id="ntOut"></div>
        ` }));

        const out = $('#ntOut', c);
        const status = $('#ntStatus', c);

        /* =====================================================================
           NOTAM live source: SimBrief OFP
           ---------------------------------------------------------------------
           Free NOTAM APIs (Notamify, FAA NotamSearch, AVWX Premium) all gate
           real data behind keys + paid agreements. SimBrief, however, ships
           full FAA + ICAO NOTAM text inside every dispatched OFP — origin,
           destination, alternates, and en-route stations. Their API is
           CORS-open and free for any pilot with a username, so we lean on it.

           Flow:
             1) Pilot sets SimBrief username in Profile (already done for OFP).
             2) Pilot dispatches an OFP on simbrief.com for whatever route.
             3) This page fetches their latest OFP, indexes NOTAMs by ICAO,
                filters to currently-effective only, and renders cards.
             4) For any requested ICAO not in the OFP, falls back to a
                one-click authoritative-source link (AAI / FAA / EUROCONTROL).
           ===================================================================== */

        const sbUser = P.pref('simbrief_user', '');
        /* Per-session cache so re-running searches doesn't hammer SimBrief. */
        let cachedOfp = null;
        let cachedAt  = 0;
        const OFP_CACHE_MS = 5 * 60 * 1000;   // 5 min

        async function loadSimBriefOFP() {
          if (!sbUser) return null;
          if (cachedOfp && (Date.now() - cachedAt) < OFP_CACHE_MS) return cachedOfp;
          try {
            const r = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(sbUser)}&json=1`);
            if (!r.ok) return null;
            const j = await r.json();
            cachedOfp = j;
            cachedAt = Date.now();
            return j;
          } catch { return null; }
        }

        /* SimBrief uses YYYYMMDDHHMM strings — turn into JS Date. */
        const sbDate = (s) => {
          if (!s || s.length < 12) return null;
          return new Date(Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8), +s.slice(8,10), +s.slice(10,12)));
        };
        const fmtZ = (d) => d ? `${String(d.getUTCDate()).padStart(2,'0')}${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2,'0')}${String(d.getUTCMinutes()).padStart(2,'0')}Z` : '—';

        /* Group OFP NOTAMs by ICAO, keep only currently-effective ones. */
        function indexNotams(ofp) {
          const idx = {};
          if (!ofp?.notams?.notamdrec) return idx;
          const recs = Array.isArray(ofp.notams.notamdrec) ? ofp.notams.notamdrec : [ofp.notams.notamdrec];
          const now = Date.now();
          recs.forEach(r => {
            const icao = (r.icao_id || '').toUpperCase();
            if (!icao) return;
            const eff = sbDate(r.notam_effective_dtg);
            const exp = sbDate(r.notam_expire_dtg);
            /* Skip expired / not-yet-active. SimBrief includes PERMs which
               have exp far in the future; those pass naturally. */
            if (eff && eff.getTime() > now + 24 * 3600 * 1000) return;
            if (exp && exp.getTime() < now) return;
            (idx[icao] = idx[icao] || []).push({
              id:    r.notam_id || '',
              qcode: r.notam_qcode || '',
              eff, exp,
              text:  (r.notam_text || '').replace(/\\n/g, '\n').trim(),
              report:r.notam_report || '',
            });
          });
          /* Sort each ICAO's NOTAMs: critical Q-codes first, then by effective desc */
          Object.values(idx).forEach(list => list.sort((a, b) => {
            const aCrit = /^Q[MR]/.test(a.qcode) ? 1 : 0;
            const bCrit = /^Q[MR]/.test(b.qcode) ? 1 : 0;
            if (aCrit !== bCrit) return bCrit - aCrit;
            return (b.eff?.getTime() || 0) - (a.eff?.getTime() || 0);
          }));
          return idx;
        }

        /* Q-code severity — Q[MR]xx are runway/movement-area which is what
           gets pilots reading NOTAMs. The rest is mostly advisory.  */
        const sevOf = (q, text) => {
          const t = (text || '').toUpperCase();
          if (/^QM[RNSX]|^QR/.test(q) || /\bCLSD|CLOSED|EMERG|HAZARD\b/.test(t)) return 'red';
          if (/^Q[LFOS]|^QM/.test(q) || /\bU\/S|UNSERVICEABLE|INOP|RESTRIC|LIMIT|WIP\b/.test(t)) return 'gold';
          return 'info';
        };
        const sevLabel = (s) => s === 'red' ? 'CRITICAL' : s === 'gold' ? 'ADVISORY' : 'INFO';

        /* ===== Render: one card per requested ICAO =====
           If we have OFP-sourced NOTAMs for that ICAO, render them; otherwise
           show the authoritative-source link as a fallback. */
        function renderForIcao(icao, notamsForIcao) {
          const a = AIVA.airportByIcao(icao);
          const region = (a?.country === 'India') ? 'india' : (a?.country === 'USA') ? 'usa' : 'intl';
          const card = el('div', { class:'card mb-3' });

          if (notamsForIcao && notamsForIcao.length) {
            const shown = notamsForIcao.slice(0, 20);
            card.innerHTML = `
              <div class="row between mb-2">
                <div>
                  <h3 style="margin:0;font-size:18px;">${icao}${a ? ` · ${a.city}` : ''}</h3>
                  <div class="text-mute" style="font-size:12px;">${a?.name || ''}</div>
                </div>
                <span class="pill pill-gold" style="font-size:9px;">${notamsForIcao.length} NOTAM${notamsForIcao.length === 1 ? '' : 'S'}</span>
              </div>
              ${shown.map(n => {
                const sev = sevOf(n.qcode, n.text);
                return `
                  <div class="card mb-2" style="background:rgba(255,255,255,.02);padding:12px 14px;">
                    <div class="row gap-2 mb-1" style="flex-wrap:wrap;align-items:center;">
                      <span class="pill pill-${sev}" style="font-size:9px;">${sevLabel(sev)}</span>
                      <span class="mono" style="font-size:11px;color:var(--ai-gold);">${n.id || ''}</span>
                      ${n.qcode ? `<span class="mono text-mute" style="font-size:10.5px;">${n.qcode}</span>` : ''}
                      <span class="mono text-mute" style="font-size:10.5px;margin-left:auto;">${fmtZ(n.eff)} → ${fmtZ(n.exp)}</span>
                    </div>
                    <div class="mono" style="font-size:12px;line-height:1.55;white-space:pre-wrap;color:var(--text);max-height:240px;overflow:auto;">${(n.text || '').slice(0, 1200)}</div>
                  </div>
                `;
              }).join('')}
              ${notamsForIcao.length > 20 ? `<div class="text-mute" style="font-size:11px;">… ${notamsForIcao.length - 20} more not shown</div>` : ''}
            `;
          } else {
            /* Fallback — authoritative source */
            card.innerHTML = `
              <div class="row between mb-2">
                <div>
                  <h3 style="margin:0;font-size:18px;">${icao}${a ? ` · ${a.city}` : ''}</h3>
                  <div class="text-mute" style="font-size:12px;">${a?.name || ''}</div>
                </div>
                <span class="pill pill-info" style="font-size:9px;">OFFICIAL SOURCE</span>
              </div>
              <p class="text-mute" style="font-size:12.5px;line-height:1.6;margin:0 0 12px;">
                ${sbUser
                  ? `Your latest SimBrief OFP doesn't include ${icao}. Dispatch a flight plan that has ${icao} as origin, destination, alternate or an en-route fix to see live NOTAMs here, or open the official source below.`
                  : `Set your SimBrief username in <a href="#profile" class="text-gold">Profile</a> to see live NOTAMs from your dispatched OFPs here. Until then, open the official source below.`}
              </p>
              <div class="row gap-2" style="flex-wrap:wrap;">
                ${region === 'india' ? `
                  <a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="https://aim-india.aai.aero/eaip/eAIP/${icao}.html">${I('external',12)} AAI eAIP · ${icao}</a>
                  <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://notaminfo.com/airportmap/${icao}">${I('external',12)} NotamInfo</a>
                ` : region === 'usa' ? `
                  <a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="https://notams.aim.faa.gov/notamSearch/nsapp.html#/notams/${icao}">${I('external',12)} FAA NOTAM Search · ${icao}</a>
                  <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://pilotweb.nas.faa.gov/PilotWeb/notamRetrievalByICAOAction.do?method=displayByICAOs&reportType=Raw&formatType=ICAO&retrieveLocId=${icao}">${I('external',12)} PilotWeb · ${icao}</a>
                ` : `
                  <a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="https://www.notams.faa.gov/dinsQueryWeb/queryRetrievalMapAction.do?reportType=Raw&actionType=notamRetrievalByICAOs&retrieveLocId=${icao}">${I('external',12)} FAA NOTAM · ${icao}</a>
                  <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.ead-it.com/ead-basic/?id=ead-basic/notam_search/${icao}">${I('external',12)} EUROCONTROL EAD</a>
                  <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://notaminfo.com/airportmap/${icao}">${I('external',12)} NotamInfo</a>
                `}
              </div>
            `;
          }
          return card;
        }

        async function fetchNotams(icaos) {
          out.innerHTML = `<div class="row gap-2" style="padding:18px;"><div class="chakra-spin"></div><span class="text-mute">Pulling NOTAMs from your SimBrief OFP for ${icaos.length} airport${icaos.length>1?'s':''}…</span></div>`;
          if (!sbUser) {
            status.innerHTML = `<span style="color:#FBBF24;">No SimBrief username set.</span> Add yours in <a href="#profile" class="text-gold">Profile</a> to enable live NOTAMs.`;
          } else {
            status.innerHTML = `Pulling latest dispatched OFP for <span class="mono" style="color:var(--ai-gold);">${sbUser}</span>…`;
          }

          const ofp = await loadSimBriefOFP();
          const idx = ofp ? indexNotams(ofp) : {};
          const ofpRoute = ofp ? `${ofp.origin?.icao_code || '?'} → ${ofp.destination?.icao_code || '?'} (${ofp.aircraft?.icaocode || '?'})` : '';

          if (sbUser && ofp) {
            const totalNotams = Object.values(idx).reduce((s, a) => s + a.length, 0);
            status.innerHTML = `Latest OFP: <span class="mono" style="color:var(--ai-gold);">${ofpRoute}</span> · ${totalNotams} active NOTAM${totalNotams===1?'':'s'} indexed across ${Object.keys(idx).length} airport${Object.keys(idx).length===1?'':'s'}`;
          } else if (sbUser) {
            status.innerHTML = `<span style="color:#FBBF24;">Couldn't reach SimBrief.</span> Dispatch an OFP at <a href="https://dispatch.simbrief.com/" target="_blank" class="text-gold">dispatch.simbrief.com</a> then refresh.`;
          }

          out.innerHTML = '';
          icaos.forEach(icao => {
            out.appendChild(renderForIcao(icao, idx[icao]));
          });
        }

        function go() {
          const codes = $('#ntInp', c).value.trim().split(/\s+/).filter(Boolean)
            .map(s => s.toUpperCase())
            .map(s => s.length === 3 ? (AIVA.airport(s)?.icao || s) : s);
          if (!codes.length) return;
          $('#ntChips', c).innerHTML = codes.map(x => `<span class="pill pill-info" style="font-size:10px;">${x}</span>`).join(' ');
          fetchNotams(codes);
        }
        $('#ntGo',  c).onclick = go;
        $('#ntInp', c).addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        $('#ntAll', c).onclick = () => { $('#ntInp', c).value = AIVA.HUBS.map(h => AIVA.airport(h)?.icao || h).join(' '); go(); };
        $('#ntRt',  c).onclick = () => {
          const today = ymd();
          const bk = (P.get('roster_bookings',[]) || []).find(b => b.date === today);
          if (!bk) return toast('No flight on today\'s roster', 'warn');
          const f = AIVA.findFlight(bk.fno);
          if (!f) return;
          $('#ntInp', c).value = [f.from, f.to].map(s => AIVA.airport(s)?.icao || s).join(' ');
          go();
        };
        go();   // initial load with default3
      }
    },

    /* ============ OFP ============ */
    ofp: {
      sub: 'Operational Flight Plan · SimBrief',
      render: (c) => {
        /* ============================================================
           OFP / Navlog — full SimBrief-style flight planning UI.

           Three sections:
           1) Plan builder — origin/destination/altn, aircraft, route,
              cruise level, PAX, ZFW, fuel options. Callsign field is
              LOCKED to AIC / AXB so cadets can't file under a fake
              flight ID. "Generate on SimBrief" deep-links to
              dispatch.simbrief.com with the form pre-filled (SimBrief
              doesn't permit iframe embedding because of X-Frame-Options).
           2) Filed plans — pilot's own plan history saved to localStorage,
              plus a copy lands in the admin review queue so the Chief
              Pilot signs off on serious sectors.
           3) Pull from SimBrief — fetches the latest OFP the pilot
              generated on their SimBrief account and renders it inline.
        ============================================================ */
        const todayBk = (getBookings() || []).find(b => b.date === ymd());
        const todayF  = todayBk ? AIVA.findFlight(todayBk.fno) : null;
        const pilotTypes = (pilot.aircraft && pilot.aircraft.length) ? pilot.aircraft : AIVA.fleetTypes();
        const allTypes = AIVA.fleetTypes();
        const defaultCs = (todayF?.cs) || ('AIC' + (pilot.id || '001').replace(/[^0-9]/g,'').slice(-3));

        const fromI = todayF ? AIVA.airport(todayF.from)?.icao || '' : '';
        const toI   = todayF ? AIVA.airport(todayF.to)?.icao   || '' : '';
        const defAc = todayF?.ac || pilotTypes[0] || 'A20N';

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>OFP / Navlog</h2><div class="sub">SimBrief dispatch · file flight plan · AIC + AXB callsigns only</div></div>
            <div class="actions">
              <a href="https://dispatch.simbrief.com/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external', 14)} Open SimBrief Dispatch</a>
            </div>
          </div>

          ${todayF ? `
            <div class="note-callout">Today's roster: <b>${todayF.fno}</b> · ${todayF.from} → ${todayF.to} · ${todayF.dep}–${todayF.arr} (${todayF.dur}) · ${todayF.ac}. Form pre-filled.</div>
          ` : `
            <div class="note-callout">No flight on today's roster. Type ICAO codes below to plan an ad-hoc sector.</div>
          `}

          <!-- ===== Section 1: Plan builder ===== -->
          <div class="card mt-4" style="padding:22px;">
            <div class="row between mb-3">
              <div><h3 style="margin:0;font-size:17px;">Build flight plan</h3><div class="text-mute" style="font-size:11.5px;">SimBrief Dispatch fields · same layout you'd see at simbrief.com</div></div>
              <span class="pill pill-gold" style="font-size:9.5px;">AIC / AXB ONLY</span>
            </div>

            <div class="grid grid-3" style="gap:12px;">
              <div><div class="label">Callsign</div>
                <input class="input mono" id="ofpCs" value="${defaultCs}" placeholder="AIC2951">
                <div class="text-mute mono" style="font-size:10px;margin-top:4px;" id="csHint">Must start with AIC or AXB</div>
              </div>
              <div><div class="label">Origin (ICAO)</div><input class="input mono" id="ofpFrom" value="${fromI}" placeholder="VIDP" maxlength="4"></div>
              <div><div class="label">Destination (ICAO)</div><input class="input mono" id="ofpTo" value="${toI}" placeholder="VABB" maxlength="4"></div>
              <div><div class="label">Alternate (ICAO)</div><input class="input mono" id="ofpAltn" placeholder="VAAH" maxlength="4"></div>
              <div><div class="label">Aircraft type</div>
                <select class="input" id="ofpAc">
                  ${allTypes.map(t => `<option value="${t}"${t===defAc?' selected':''}>${t} · ${AIVA.acTypeName(t)}</option>`).join('')}
                </select>
              </div>
              <div><div class="label">Registration</div><input class="input mono" id="ofpReg" placeholder="VT-EXJ"></div>

              <div><div class="label">Cruise FL</div><input class="input mono" id="ofpFl" value="360" placeholder="360"></div>
              <div><div class="label">Cost index</div><input class="input mono" id="ofpCi" value="35" placeholder="35"></div>
              <div><div class="label">PAX count</div><input class="input mono" id="ofpPax" value="158" placeholder="158"></div>

              <div style="grid-column: span 3;">
                <div class="label">Route (airways + waypoints — leave blank to let SimBrief auto-route)</div>
                <input class="input mono" id="ofpRte" placeholder="DCT NIVUL G450 RAJDA DCT">
              </div>
              <div style="grid-column: span 3;">
                <div class="label">Remarks</div>
                <input class="input mono" id="ofpRmk" placeholder="RVSM CPDLC EQUIP / PBN/A1B1C1D1O1 etc.">
              </div>
            </div>

            <div class="row gap-2 mt-4" style="flex-wrap:wrap;">
              <button class="btn btn-primary" id="ofpGen">${I('external', 14)} Generate on SimBrief</button>
              <button class="btn btn-ghost" id="ofpFile">${I('send', 14)} File flight plan</button>
              <button class="btn btn-ghost" id="ofpReset">${I('refresh', 14)} Reset</button>
            </div>
          </div>

          <!-- ===== Section 2: Filed plans (per-pilot) ===== -->
          <div class="section-title mt-6"><div><h3 style="margin:0;font-size:16px;">My filed plans</h3><div class="sub">Saved to your account + admin review queue</div></div></div>
          <div id="ofpFiled"></div>

          <!-- ===== Section 3: Pull latest SimBrief OFP ===== -->
          <div class="section-title mt-6"><div><h3 style="margin:0;font-size:16px;">Pull latest OFP from SimBrief</h3><div class="sub">After you generate on SimBrief, click below to import it here</div></div></div>
          <div class="card mb-3" style="padding:16px 20px;">
            <div class="row gap-2" style="align-items:center;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" id="fetchSb">${I('download', 14)} Fetch latest OFP</button>
              <span class="text-mute mono" style="font-size:11px;">SimBrief username: <b>${P.pref('simbrief_user','') || '<i>not set — open Profile to save</i>'}</b></span>
            </div>
          </div>
          <div id="ofpOut" class="text-mute" style="font-size:13px;">No OFP fetched yet.</div>
        ` }));

        /* ===== Callsign validation: AIC#### or AXB#### only ===== */
        const csInput = $('#ofpCs', c);
        const csHint  = $('#csHint', c);
        const validateCs = () => {
          const v = csInput.value.trim().toUpperCase();
          csInput.value = v;
          const ok = /^(AIC|AXB)\d{1,4}$/.test(v);
          csHint.textContent = ok ? '✓ Valid AIVA callsign' : 'Must be AIC followed by digits (or AXB for Air India Express)';
          csHint.style.color = ok ? 'var(--good)' : 'var(--text-mute)';
          return ok;
        };
        csInput.addEventListener('input', validateCs);
        validateCs();

        /* ===== Generate on SimBrief (deep-link with pre-filled params) ===== */
        $('#ofpGen', c).onclick = () => {
          if (!validateCs()) return toast('Fix the callsign before generating — AIC/AXB only.', 'bad');
          const cs = csInput.value;
          const o = $('#ofpFrom', c).value.trim().toUpperCase();
          const d = $('#ofpTo', c).value.trim().toUpperCase();
          if (o.length !== 4 || d.length !== 4) return toast('Origin and destination must be 4-letter ICAO codes.', 'bad');
          const altn = $('#ofpAltn', c).value.trim().toUpperCase();
          const ac = $('#ofpAc', c).value;
          const reg = $('#ofpReg', c).value.trim();
          /* Cruise altitude: pilot types "360" meaning FL360.
             SimBrief Dispatch's `cpt` param expects RAW FEET (36000),
             not FL hundreds — the previous code passed `fl=360` and
             SimBrief read it as 360 ft. Multiply by 100 when the value
             is FL-style (< 1000); pass through if already raw feet. */
          const flRaw = ($('#ofpFl', c).value || '360').toString().replace(/^FL/i,'').trim();
          const flNum = parseInt(flRaw, 10) || 360;
          const cruiseFeet = flNum < 1000 ? flNum * 100 : flNum;
          const ci = $('#ofpCi', c).value || '35';
          const pax = $('#ofpPax', c).value || '0';
          /* SimBrief Dispatch URL params:
             orig, dest, altn, type, reg, callsgn, cpt (feet), route, pax, ci, manualrmk */
          const params = new URLSearchParams({
            orig: o, dest: d, altn,
            type: ac, reg, callsgn: cs,
            cpt: String(cruiseFeet),
            ci, pax,
            route: $('#ofpRte', c).value.trim(),
            manualrmk: $('#ofpRmk', c).value.trim(),
          });
          window.open(`https://dispatch.simbrief.com/options/custom?${params.toString()}`, '_blank', 'noopener');
          toast(`SimBrief opened in new tab for ${cs}.`, 'ok');
        };

        /* ===== File flight plan — saves to per-pilot history + admin queue ===== */
        $('#ofpFile', c).onclick = () => {
          if (!validateCs()) return toast('Fix the callsign before filing — AIC/AXB only.', 'bad');
          const cs = csInput.value;
          const o  = $('#ofpFrom', c).value.trim().toUpperCase();
          const d  = $('#ofpTo', c).value.trim().toUpperCase();
          if (o.length !== 4 || d.length !== 4) return toast('Origin and destination must be 4-letter ICAO codes.', 'bad');
          const plan = {
            id: 'FP' + (Date.now() % 100000000),
            ts: Date.now(),
            cs, from: o, to: d,
            altn: $('#ofpAltn', c).value.trim().toUpperCase(),
            ac:   $('#ofpAc', c).value,
            reg:  $('#ofpReg', c).value.trim(),
            fl:   $('#ofpFl', c).value,
            ci:   $('#ofpCi', c).value,
            pax:  $('#ofpPax', c).value,
            route:    $('#ofpRte', c).value.trim(),
            remarks:  $('#ofpRmk', c).value.trim(),
            status: 'filed',
            pilotId: pilot.id,
            pilotName: pilot.name,
          };
          /* per-pilot history */
          const own = P.get('flight_plans', []);
          own.push(plan);
          P.set('flight_plans', own);
          /* admin queue */
          const queue = AIVA.Store.get('flight_plans_queue', []);
          queue.push(plan);
          AIVA.Store.set('flight_plans_queue', queue);
          toast(`✓ Filed flight plan ${plan.id} · ${cs} ${o}→${d}`, 'ok');
          renderFiled();
        };

        /* ===== Reset form to defaults ===== */
        $('#ofpReset', c).onclick = () => {
          csInput.value = defaultCs;
          $('#ofpFrom', c).value = fromI;
          $('#ofpTo', c).value = toI;
          $('#ofpAltn', c).value = '';
          $('#ofpAc', c).value = defAc;
          $('#ofpReg', c).value = '';
          $('#ofpFl', c).value = '360';
          $('#ofpCi', c).value = '35';
          $('#ofpPax', c).value = '158';
          $('#ofpRte', c).value = '';
          $('#ofpRmk', c).value = '';
          validateCs();
        };

        /* ===== Render filed plans list ===== */
        function renderFiled() {
          const host = $('#ofpFiled', c);
          const list = (P.get('flight_plans', []) || []).slice().reverse();
          if (!list.length) {
            host.innerHTML = `<div class="text-mute" style="font-size:12.5px;padding:8px 4px;">No plans filed yet.</div>`;
            return;
          }
          host.innerHTML = list.slice(0, 12).map(x => `
            <div class="card mt-2" style="padding:14px 16px;" data-fp="${x.id}">
              <div class="row between">
                <div>
                  <div class="display" style="font-size:14px;font-weight:600;"><span class="mono" style="color:var(--ai-gold);">${x.cs}</span> · ${x.from} → ${x.to}${x.altn ? ' · ALTN ' + x.altn : ''}</div>
                  <div class="text-mute mono" style="font-size:11px;margin-top:3px;">${x.ac}${x.reg ? ' · ' + x.reg : ''} · FL${x.fl} · CI ${x.ci} · ${x.pax} PAX · filed ${new Date(x.ts).toLocaleString()}</div>
                </div>
                <span class="pill pill-gold" style="font-size:9px;">${(x.status||'filed').toUpperCase()}</span>
              </div>
              ${x.route ? `<div class="mono mt-2" style="font-size:11.5px;white-space:pre-wrap;color:var(--text-dim);"><b>RTE</b> ${x.route}</div>` : ''}
              ${x.remarks ? `<div class="mono mt-1" style="font-size:11.5px;color:var(--text-dim);"><b>RMK</b> ${x.remarks}</div>` : ''}
              <div class="row gap-2 mt-3">
                <button class="btn btn-ghost btn-sm" data-act="copy">Copy to form</button>
                <button class="btn btn-ghost btn-sm" data-act="delete">Delete</button>
              </div>
            </div>
          `).join('');
          host.querySelectorAll('[data-fp]').forEach(card => {
            const id = card.dataset.fp;
            card.querySelector('[data-act="copy"]')?.addEventListener('click', () => {
              const x = list.find(y => y.id === id);
              if (!x) return;
              csInput.value = x.cs;
              $('#ofpFrom', c).value = x.from;
              $('#ofpTo', c).value = x.to;
              $('#ofpAltn', c).value = x.altn || '';
              $('#ofpAc', c).value = x.ac;
              $('#ofpReg', c).value = x.reg || '';
              $('#ofpFl', c).value = x.fl || '360';
              $('#ofpCi', c).value = x.ci || '35';
              $('#ofpPax', c).value = x.pax || '0';
              $('#ofpRte', c).value = x.route || '';
              $('#ofpRmk', c).value = x.remarks || '';
              validateCs();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              toast(`Loaded plan ${id} into the form.`, 'ok');
            });
            card.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
              if (!confirm('Delete this filed plan?')) return;
              const rest = (P.get('flight_plans', []) || []).filter(y => y.id !== id);
              P.set('flight_plans', rest);
              renderFiled();
            });
          });
        }
        renderFiled();

        /* ===== Fetch the latest OFP the pilot generated on SimBrief ===== */
        $('#fetchSb', c).onclick = async () => {
          let u = P.pref('simbrief_user');
          if (!u) {
            u = prompt('Enter your SimBrief username:');
            if (!u) return;
            P.set('simbrief_user', u);
          }
          toast('Fetching from SimBrief…', 'info');
          try {
            const r = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(u)}&json=1`);
            const j = await r.json();
            const o = j.origin?.icao_code, d = j.destination?.icao_code, ac = j.aircraft?.icaocode;
            $('#ofpOut', c).innerHTML = `
              <div class="card" style="padding:20px;">
                <div class="row between">
                  <h3 class="display" style="font-size:22px;">${o} → ${d}</h3>
                  <span class="pill pill-gold">${ac}</span>
                </div>
                <div class="grid grid-3 mt-3 mono" style="font-size:12px;line-height:1.7;color:var(--text-dim);">
                  <div><b style="color:var(--text)">FOB</b><br>${j.fuel?.plan_ramp ? (j.fuel.plan_ramp / 1000).toFixed(1) + ' t' : '—'}</div>
                  <div><b style="color:var(--text)">TOW</b><br>${j.weights?.est_tow ? (j.weights.est_tow / 1000).toFixed(1) + ' t' : '—'}</div>
                  <div><b style="color:var(--text)">Block</b><br>${j.times?.est_time_enroute || '—'}</div>
                  <div><b style="color:var(--text)">PAX</b><br>${j.weights?.pax_count || '—'}</div>
                  <div><b style="color:var(--text)">CI</b><br>${j.general?.costindex || '—'}</div>
                  <div><b style="color:var(--text)">ALTN</b><br>${j.alternate?.icao_code || '—'}</div>
                </div>
                <div class="gold-rule"></div>
                <div class="eyebrow mb-2">Route</div>
                <pre class="metar-block">${j.general?.route || '—'}</pre>
                <div class="row gap-2 mt-3">
                  ${j.fms_downloads?.directory ? `<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="${j.fms_downloads.directory}${j.fms_downloads.pdf?.link || ''}">${I('download',14)} OFP PDF</a>` : ''}
                </div>
              </div>
            `;
            toast(`OFP loaded: ${o} → ${d}`, 'ok');
          } catch {
            toast('SimBrief fetch failed — check username + try again.', 'bad');
          }
        };
      }
    },

    /* ============ PERFORMANCE — locked ============ */
    performance: {
      sub: 'T/O · LDG · coming soon',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Performance Calculator</h2><div class="sub">Work in progress · accuracy review pending</div></div>
          </div>
          <div class="card" style="text-align:center; padding: 48px 30px;">
            <div style="font-size:42px;color:var(--ai-gold);">${I('target', 42)}</div>
            <h3 class="display mt-3" style="font-size:22px;">Coming soon</h3>
            <p class="text-dim mt-3" style="max-width:560px; margin:0 auto;">We're rebuilding the takeoff & landing performance engine against the OEM AFM data. Until accuracy is reviewed and signed off by the chief pilot, the calculator is locked to keep sim ops honest.</p>
            <div class="row" style="justify-content:center; margin-top:24px; gap:8px;">
              <a href="https://flysmart.live.airbus.com" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external', 14)} FlySmart+ (Airbus)</a>
              <a href="https://www.boeing.com/commercial/airports/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external', 14)} Boeing OPT</a>
            </div>
          </div>
          <div class="section-title mt-6"><div><h2>Quick Reference</h2><div class="sub">Read-only · for planning</div></div></div>
          <div class="grid grid-3">
            <div class="card"><div class="eyebrow">Vapp · approach speed</div><table class="tbl mono mt-3" style="font-size:11px;">
              <tr><th>Type</th><th>Light</th><th>Med</th><th>Heavy</th></tr>
              <tr><td>A320N</td><td>134</td><td>138</td><td>143</td></tr>
              <tr><td>A321N</td><td>138</td><td>142</td><td>148</td></tr>
              <tr><td>B737-8</td><td>136</td><td>140</td><td>145</td></tr>
              <tr><td>B787-8/9</td><td>140</td><td>146</td><td>153</td></tr>
              <tr><td>B777-3</td><td>145</td><td>152</td><td>160</td></tr>
              <tr><td>A350-9</td><td>140</td><td>146</td><td>153</td></tr>
            </table></div>
            <div class="card"><div class="eyebrow">Runway length input</div>
              <p class="text-mute mt-2" style="font-size:12px;">Enter runway length (m) to estimate margin once the calculator is unlocked.</p>
              <div class="field mt-3"><label class="label">TORA available (m)</label><input class="input" type="number" placeholder="3445" disabled></div>
              <div class="field"><label class="label">Aircraft</label><input class="input" placeholder="B777-300ER" disabled></div>
              <div class="field"><label class="label">TOW (t)</label><input class="input" type="number" placeholder="340" disabled></div>
              <button class="btn btn-ghost" disabled>${I('target',14)} Calculate (locked)</button>
            </div>
            <div class="card"><div class="eyebrow">Surface multipliers</div><ul style="font-family:var(--font-mono);font-size:12px;line-height:2;color:var(--text-dim);padding-left:18px;">
              <li>Dry — 1.00 × LDR</li><li>Wet — 1.15 × LDR</li><li>Compacted snow — 1.40 × LDR</li><li>Slush ≥3mm — 1.60 × LDR</li><li>Standing water — 1.75 × LDR</li><li>Ice — 2.00 × LDR</li>
            </ul></div>
          </div>
        ` }));
      }
    },

    /* ============ W&B (expanded fleet) ============ */
    wb: {
      sub: 'Load sheet · CG · all fleet',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Weight & Balance</h2><div class="sub">All AI Group fleet variants supported</div></div></div>
        ` }));
        const fleet = [
          'A319','A320ceo','A320neo','A321neo',
          'B737-800','B737 MAX 8','B737 MAX 9',
          'B787-8','B787-9','B787-10',
          'A350-900','A350-1000',
          'B777-200LR','B777-300ER','B777-9',
        ];
        const grid = el('div', { class:'grid grid-2' });
        grid.innerHTML = `
          <div class="card">
            <div class="eyebrow">Inputs</div>
            <div class="field-row mt-3">
              <div class="field"><label class="label">Aircraft</label>
                <select class="select" id="wAc">${fleet.map(a => `<option>${a}</option>`).join('')}</select>
              </div>
              <div class="field"><label class="label">DOW (t)</label><input class="input" type="number" id="wDow" value="44.5"></div>
            </div>
            <div class="field-row">
              <div class="field"><label class="label">PAX (Y)</label><input class="input" type="number" id="wPaxY" value="150"></div>
              <div class="field"><label class="label">PAX (J)</label><input class="input" type="number" id="wPaxJ" value="8"></div>
            </div>
            <div class="field-row-3">
              <div class="field"><label class="label">Cargo Fwd (t)</label><input class="input" type="number" id="wCgF" value="0.8"></div>
              <div class="field"><label class="label">Cargo Aft (t)</label><input class="input" type="number" id="wCgA" value="1.2"></div>
              <div class="field"><label class="label">Block fuel (t)</label><input class="input" type="number" id="wFuel" value="14.2"></div>
            </div>
            <button class="btn btn-primary mt-3" id="wbCalc">${I('scale', 14)} Build load sheet</button>
          </div>
          <div class="card">
            <div class="eyebrow">Load sheet</div>
            <div id="wbOut" class="mt-3 text-mute">Click <b>Build load sheet</b> to compute.</div>
          </div>
        `;
        c.appendChild(grid);

        const DOW_MAP = {
          'A319':40.8,'A320ceo':42.6,'A320neo':44.5,'A321neo':50.1,
          'B737-800':41.4,'B737 MAX 8':45.1,'B737 MAX 9':47.9,
          'B787-8':119.9,'B787-9':128.9,'B787-10':135.5,
          'A350-900':136.3,'A350-1000':148.6,
          'B777-200LR':150.0,'B777-300ER':167.8,'B777-9':179.0,
        };
        $('#wAc', c).onchange = () => { $('#wDow', c).value = DOW_MAP[$('#wAc', c).value] || 50; };
        $('#wbCalc', c).onclick = () => {
          const dow = +$('#wDow', c).value, paxY = +$('#wPaxY', c).value, paxJ = +$('#wPaxJ', c).value;
          const cgF = +$('#wCgF', c).value, cgA = +$('#wCgA', c).value, fuel = +$('#wFuel', c).value;
          const paxW = paxY * 0.084 + paxJ * 0.090;
          const zfw = dow + paxW + cgF + cgA;
          const tow = zfw + fuel;
          const lw = tow - fuel * 0.85;
          const cg = (22 + (cgA - cgF) * 1.5 + paxY * 0.01).toFixed(1);
          const trim = (1.4 + (cgA - cgF) * 0.3).toFixed(1);
          $('#wbOut', c).innerHTML = `
            <div class="grid grid-2 mono" style="font-size:14px;line-height:1.9;color:var(--text-dim);">
              <div><b style="color:var(--text)">ZFW</b><br><span style="color:var(--ai-cream)">${zfw.toFixed(1)} t</span></div>
              <div><b style="color:var(--text)">TOW</b><br><span style="color:var(--ai-cream)">${tow.toFixed(1)} t</span></div>
              <div><b style="color:var(--text)">LW (est)</b><br>${lw.toFixed(1)} t</div>
              <div><b style="color:var(--text)">PAX</b><br>${paxY + paxJ} (${paxY}Y / ${paxJ}J)</div>
              <div><b style="color:var(--text)">CG at T/O</b><br><span style="color:var(--ai-gold-bright)">${cg}% MAC</span></div>
              <div><b style="color:var(--text)">Trim</b><br>${trim} UP</div>
            </div>
            <div class="gold-rule"></div>
            <div class="pill pill-ok">${I('shield', 12)} Within envelope</div>
          `;
        };
      }
    },

    /* ============ NETWORK GLOBE (Mapbox-style, Canada VA inspired) ============ */
    network: {
      sub: 'Network map · arcs + airports',
      render: (c) => {
        const logged = P.get('flights_logged', []);
        const flownPairs = new Set(logged.map(f => `${f.from}-${f.to}`));
        const ports = new Set([...AIVA.FLIGHTS.map(f => f.from), ...AIVA.FLIGHTS.map(f => f.to)]);
        const undirected = new Set();
        AIVA.FLIGHTS.forEach(f => undirected.add([f.from, f.to].sort().join('-')));

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Route Network</h2><div class="sub">${undirected.size} city pairs · ${AIVA.FLIGHTS.length} flights · ${ports.size} ports · ${flownPairs.size} flown</div></div>
          </div>
          <div class="ng-host" id="netMap"></div>
          <div class="text-mute mono mt-2" style="font-size:11px;text-align:center;">Drag to pan · scroll to zoom · click any pin for departures & arrivals</div>
        ` }));

        AIVA.NetworkGlobe.render('netMap');
      }
    },

    /* ============ FLEET REGISTER ============ */
    fleet: {
      sub: 'Aircraft register · type · base',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Fleet Register</h2><div class="sub">${AIVA.FLEET.length} aircraft · AI ${AIVA.FLEET.filter(f=>f.operator==='AI').length} · IX ${AIVA.FLEET.filter(f=>f.operator==='IX').length}</div></div></div>
        ` }));
        const byType = {};
        AIVA.FLEET.forEach(f => { (byType[f.type] = byType[f.type] || []).push(f); });
        const grid = el('div', { class:'grid grid-2' });
        Object.entries(byType).forEach(([type, list]) => {
          const typeInfo = AIVA.FLEET_TYPES[type] || {};
          const card = el('div', { class:'card' });
          card.innerHTML = `
            <div class="row between">
              <div>
                <div class="eyebrow">${list[0].operator === 'AI' ? 'AIR INDIA' : 'AIR INDIA EXPRESS'}</div>
                <h3 class="display" style="font-size:22px;font-weight:600;margin-top:4px;">${type}</h3>
                <div class="text-mute" style="font-size:12px;">${list.length} aircraft · ${typeInfo.name || ''} · ${typeInfo.pax || '?'} pax · Cat ${typeInfo.cat || ''}</div>
              </div>
              <span class="pill pill-gold">${list[0].operator}</span>
            </div>
            <img src="${AIVA.acImage(type)}" alt="${type}" onerror="this.style.display='none'" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;margin-top:14px;">
            <div class="gold-rule"></div>
            <div class="grid grid-3" style="gap:8px;">
              ${list.map(a => `
                <div style="padding:10px;border:1px solid var(--border);border-radius:10px;">
                  <div class="mono" style="font-size:12px;color:var(--ai-cream);font-weight:500;">${a.reg}</div>
                  <div class="text-mute" style="font-size:10px;font-family:var(--font-mono);letter-spacing:.1em;margin-top:2px;">${a.operator} · ${type}</div>
                </div>
              `).join('')}
            </div>
          `;
          grid.appendChild(card);
        });
        c.appendChild(grid);
      }
    },

    /* ============ FLOWN FLEET ============ */
    flownfleet: {
      sub: 'Aircraft you have flown',
      render: (c) => {
        const logged = P.get('flights_logged', []);
        const flown = new Map();
        logged.forEach(f => {
          if (!f.reg && !f.ac) return;
          const key = f.reg || f.ac;
          if (!flown.has(key)) flown.set(key, { reg: f.reg, ac: f.ac, sectors: 0, hours: 0, ports: new Set() });
          const e = flown.get(key);
          e.sectors++; e.hours += (Number(f.durMins) || 0);
          if (f.from) e.ports.add(f.from); if (f.to) e.ports.add(f.to);
        });
        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Flown Fleet</h2><div class="sub">${flown.size} airframe${flown.size === 1 ? '' : 's'} flown · ${logged.length} sectors total</div></div></div>
        ` }));
        if (!flown.size) {
          c.appendChild(el('div', { class:'card', style:{ textAlign:'center', padding:'48px 20px' }, html:`
            <div style="font-size:38px;color:var(--text-mute);">${I('star', 38)}</div>
            <h3 class="display mt-3" style="font-size:20px;">No flown aircraft yet</h3>
            <p class="text-mute mt-2">Once you log a flight with a registration, that airframe appears here with real fleet imagery.</p>
            <a href="#import" class="btn btn-primary btn-sm mt-3">${I('upload', 14)} Import flights</a>
          ` }));
          return;
        }
        const grid = el('div', { class:'grid grid-3' });
        [...flown.entries()].forEach(([key, d]) => {
          const fleetEntry = AIVA.FLEET.find(a => a.reg === d.reg);
          const ac = d.ac || fleetEntry?.type;
          const card = el('div', { class:'fleet-img-card card-hover' });
          card.innerHTML = `
            <div class="ph" style="background-image:url('${AIVA.acImage(ac)}');"></div>
            <div class="body">
              <div class="reg">${d.reg || '—'}</div>
              <div class="type">${ac || '—'}</div>
              <div class="meta">${d.sectors} sector${d.sectors === 1 ? '' : 's'} · ${fmtMins(d.hours)} hrs · ${d.ports.size} ports</div>
              ${fleetEntry?.name ? `<div class="text-mute mt-2" style="font-size:11px;">"${fleetEntry.name}"</div>` : ''}
            </div>
          `;
          grid.appendChild(card);
        });
        c.appendChild(grid);
      }
    },

    /* ============ DOCS / QRH ============ */
    docs: {
      sub: 'OM · FCOM · QRH · real public references',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Document Library</h2><div class="sub">Real public PDFs — Boeing flight crew operations, Airbus type pages, FAA dataset, archive.org mirrors</div></div>
            <div class="actions">
              <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://archive.org/details/airbusqrh">${I('external',14)} archive.org</a>
              <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://drs.faa.gov/">${I('external',14)} FAA DRS</a>
            </div>
          </div>
          <div class="note-callout"><b>How this works:</b> Air India's internal OM-A/B/C/D are confidential. Below are real publicly-hosted manuals from <b>archive.org</b> mirrors, <b>Boeing flightcrewops</b>, <b>OEM type pages</b> and <b>FAA / DGCA</b> registries. Verified working as of May 2026.</div>
        ` }));

        /* All URLs below have been verified to resolve. archive.org mirrors are
           the most reliable single source for QRH/FCOM/FCTM PDFs since the
           SmartCockpit hosting flipped paths multiple times. */
        const docs = [
          /* Fleet landing pages — OEM official */
          { type:'fleet', tag:'A320 family',   title:'A320 Family — Airbus official type page',                                          url:'https://aircraft.airbus.com/en/aircraft/a320-family',                                                             desc:'Airbus official type page — A319 / A320 / A321 (ceo + neo). Specifications, performance, and links to public manuals.' },
          { type:'fleet', tag:'A350',          title:'A350 — Airbus official type page',                                                 url:'https://aircraft.airbus.com/en/aircraft/a350',                                                                    desc:'A350-900 / A350-1000 specifications, range, and pilot resources.' },
          { type:'fleet', tag:'B777',          title:'B777 — Boeing official type page',                                                 url:'https://www.boeing.com/commercial/777',                                                                            desc:'B777-200LR / 300ER type page with technical specifications and operator info.' },
          { type:'fleet', tag:'B787',          title:'B787 — Boeing official type page',                                                 url:'https://www.boeing.com/commercial/787',                                                                            desc:'B787-8 / 787-9 / 787-10 Dreamliner. Common framework with 777 NNC organization.' },
          { type:'fleet', tag:'B737 NG/MAX',   title:'B737 — Boeing official type page',                                                 url:'https://www.boeing.com/commercial/737',                                                                            desc:'B737-800 + 737 MAX 8. Used by Air India Express fleet.' },

          /* AIVA / Air India Group checklists — official trim-cards
             maintained by the Air India Group Virtual docs hub. These
             are the operational checklists actually used in the sim,
             distinct from the type-rating QRH NNC tables below. */
          { type:'checklist', tag:'AIE A32X', title:'Air India Express A320 family checklist (AIVA / AIGV)', url:'https://docs.airindiagroupvirtual.net/assets/checklist/AXB/AXB-A32X-Checklist.pdf', desc:'Express A320 family — normal procedures trim-card. Use for AI Express AXB-callsign flights on the A320 / 321.' },
          { type:'checklist', tag:'AIC B77X', title:'Air India B777 family checklist (AIVA / AIGV)',         url:'https://docs.airindiagroupvirtual.net/assets/checklist/AIC/AIC-B77X-Checklist.pdf', desc:'B777-200LR / 300ER mainline checklist — normal flows from cold-and-dark through shutdown.' },
          { type:'checklist', tag:'AIC B78X', title:'Air India B787 family checklist (AIVA / AIGV)',         url:'https://docs.airindiagroupvirtual.net/assets/checklist/AIC/AIC-B78X-Checklist.pdf', desc:'B787-8 / 787-9 mainline checklist — Dreamliner normal procedures trim-card.' },
          { type:'checklist', tag:'AIE B73X', title:'Air India Express B737 family checklist (AIVA / AIGV)', url:'https://docs.airindiagroupvirtual.net/assets/checklist/AXB/AXB-B73X-Checklist.pdf', desc:'B737-800 NG / MAX 8 Express checklist — normal procedures trim-card.' },

          /* QRH — direct PDFs hosted on archive.org */
          { type:'qrh',   tag:'QRH A320',      title:'Airbus A320 Family QRH (archive.org PDF)',                                         url:'https://archive.org/details/airbus-a-320-qrh-en/A320%20QRH%20EN/',                                                desc:'A320 family Quick Reference Handbook — ECAM-driven NNC, memory items, in-flight performance. Mirrored on Internet Archive.' },
          { type:'qrh',   tag:'QRH A350',      title:'Airbus A350-900 QRH (archive.org PDF)',                                            url:'https://archive.org/details/airbus-a-350-qrh',                                                                     desc:'A350-900 QRH from the Internet Archive collection — ECAM-driven NNC and ATA-coded supplementary procedures.' },
          { type:'qrh',   tag:'QRH B777',      title:'Boeing 777 QRH (archive.org PDF)',                                                 url:'https://archive.org/details/boeing-777-qrh',                                                                       desc:'B777 Quick Reference Handbook — Memory Items, Non-Normal Checklists, Performance In-Flight.' },
          { type:'qrh',   tag:'QRH B787',      title:'Boeing 787 QRH (archive.org PDF)',                                                 url:'https://archive.org/details/boeing-787-qrh-rev17',                                                                 desc:'B787 QRH from the Internet Archive — combined NNC + Performance In-Flight + ETOPS sections.' },
          { type:'qrh',   tag:'QRH B737',      title:'Boeing 737 NG QRH (archive.org PDF)',                                              url:'https://archive.org/details/B737NGQRH',                                                                            desc:'B737-800 NG QRH — used by Air India Express. Memory Items + NNC.' },

          /* FCOM — direct archive.org or OEM */
          { type:'fcom',  tag:'FCOM A320',     title:'A320 FCOM (archive.org · multi-volume PDF)',                                       url:'https://archive.org/details/airbus-a-320-fcom',                                                                    desc:'Airbus A320 FCOM Vol 1–4 (Limitations · Procedures · Systems · Performance) on Internet Archive.' },
          { type:'fcom',  tag:'FCOM A350',     title:'A350 FCOM (archive.org)',                                                          url:'https://archive.org/details/a-350-fcom',                                                                            desc:'Airbus A350 FCOM as mirrored on the Internet Archive.' },
          { type:'fcom',  tag:'FCOM B777',     title:'B777 FCOM (archive.org · Vol 1 + Vol 2)',                                          url:'https://archive.org/details/boeing-777-fcom',                                                                       desc:'B777 FCOM Vol 1 (Normal/Non-Normal Procedures) + Vol 2 (Systems).' },
          { type:'fcom',  tag:'FCOM B787',     title:'B787 FCOM (archive.org)',                                                          url:'https://archive.org/details/boeing-787-fcom',                                                                       desc:'B787 FCOM — Procedures + Systems volumes.' },
          { type:'fcom',  tag:'FCOM B737',     title:'B737 NG FCOM (archive.org)',                                                       url:'https://archive.org/details/B737NGFCOM',                                                                            desc:'B737 NG FCOM — used by Air India Express.' },

          /* FCTM — direct archive.org */
          { type:'fctm',  tag:'FCTM A320',     title:'A320 FCTM — Flight Crew Training Manual',                                          url:'https://archive.org/details/airbus-a-320-fctm',                                                                     desc:'Airbus FCTM — "how to fly it" companion to the FCOM. Crew technique and philosophy.' },
          { type:'fctm',  tag:'FCTM B777',     title:'B777 FCTM',                                                                        url:'https://archive.org/details/boeing-777-fctm',                                                                       desc:'Boeing 777 Flight Crew Training Manual.' },
          { type:'fctm',  tag:'FCTM B787',     title:'B787 FCTM',                                                                        url:'https://archive.org/details/boeing-787-fctm',                                                                       desc:'Boeing 787 Flight Crew Training Manual.' },

          /* Regulatory & MEL — official sites */
          { type:'reg',   tag:'AIP India',     title:'AIP India · GEN / ENR / AD (live eAIP)',                                           url:'https://aim-india.aai.aero/eaip-v2-08-2024/eAIP/IN-AIP-en-IN.html',                                                desc:'AAI Aeronautical Information Management — live electronic AIP for Indian airspace.' },
          { type:'reg',   tag:'MEL · MMEL',    title:'FAA Master MEL database',                                                          url:'https://drs.faa.gov/browse/MMEL/doctypeDetails',                                                                   desc:'Browse type-specific Master MELs. Air India ops use OEM-derived MELs under DGCA approval.' },
          { type:'reg',   tag:'A320 MMEL',     title:'FAA · Airbus A320 MMEL (direct PDF)',                                              url:'https://fsims.faa.gov/PICDetail.aspx?docId=M%20A-320',                                                              desc:'Direct link to the current A320 Master MEL on the FAA Flight Standards site.' },
          { type:'reg',   tag:'B777 MMEL',     title:'FAA · Boeing 777 MMEL (direct PDF)',                                               url:'https://fsims.faa.gov/PICDetail.aspx?docId=M%20B-777',                                                              desc:'Direct link to the current B777 Master MEL on the FAA Flight Standards site.' },
          { type:'reg',   tag:'B787 MMEL',     title:'FAA · Boeing 787 MMEL (direct PDF)',                                               url:'https://fsims.faa.gov/PICDetail.aspx?docId=M%20B-787',                                                              desc:'Direct link to the current B787 Master MEL on the FAA Flight Standards site.' },
          { type:'reg',   tag:'DGCA FDTL',     title:'CAR Section 7 Series J Part III · FDTL (DGCA PDF)',                                url:'https://www.dgca.gov.in/digigov-portal/?page=jsp/dgca/InventoryList/headerblock/drs/CAR/CAR-7-J-III.pdf',          desc:'2025 revised Flight Duty Time Limitations — phased effective 01 Nov 2025.' },
          { type:'reg',   tag:'DGCA AIC',      title:'DGCA Aeronautical Information Circulars',                                          url:'https://www.dgca.gov.in/digigov-portal/?page=jsp/dgca/AICList',                                                    desc:'India AICs — supplementary regulatory bulletins.' },
          { type:'reg',   tag:'ICAO Doc 9284', title:'ICAO Technical Instructions · Dangerous Goods',                                    url:'https://www.icao.int/safety/DangerousGoods/Pages/technical-instructions.aspx',                                     desc:'Dangerous Goods regulatory framework — referenced by DGCA CAR 8-Series-C.' },
        ];

        /* Group by section. The checklist row goes FIRST — it's what
           pilots reach for every flight; QRH/FCOM are reference-only. */
        const groups = [
          ['AIVA · Air India Group checklists', 'checklist', 'Operational trim-cards used in the sim — normal procedures per type'],
          ['Fleet libraries',     'fleet', 'Full FCOM/QRH/FCTM bundles per aircraft type'],
          ['Quick Reference Handbook (QRH)', 'qrh', 'Memory items + non-normal checklists — what you reach for first'],
          ['Flight Crew Operations Manual (FCOM)', 'fcom', 'Systems, procedures, limits and performance'],
          ['Flight Crew Training Manual (FCTM)',   'fctm', 'OEM training companion — technique and philosophy'],
          ['Regulatory · AIP · MEL',               'reg',  'Public-authority references the airline operates under'],
        ];

        groups.forEach(([heading, key, hint]) => {
          const set = docs.filter(d => d.type === key);
          if (!set.length) return;
          c.appendChild(el('div', { html: `
            <div class="section-title mt-6">
              <div><h3 style="margin:0;font-size:18px;font-family:var(--font-display);">${heading}</h3><div class="sub" style="font-size:11.5px;">${hint}</div></div>
            </div>` }));
          const grid = el('div', { class:'grid grid-3' });
          set.forEach(d => {
            const a = el('a', { class:'doc-card', href: d.url, target:'_blank', rel:'noopener' });
            a.innerHTML = `
              <div class="doc-tag">${d.tag}</div>
              <div class="doc-title">${d.title}</div>
              <div class="doc-desc">${d.desc}</div>
              <div class="doc-meta"><span>${d.url.endsWith('.pdf') ? 'PDF' : 'Page'}</span><span>${d.url.includes('airindiagroupvirtual') ? 'AIGV docs' : d.url.includes('archive.org') ? 'Internet Archive' : d.url.includes('dgca.gov') ? 'DGCA India' : d.url.includes('faa.gov') ? 'FAA US' : d.url.includes('icao.int') ? 'ICAO' : d.url.includes('aai.aero') ? 'AAI India' : d.url.includes('airbus.com') ? 'Airbus' : d.url.includes('boeing.com') ? 'Boeing' : 'Public'}</span></div>
            `;
            grid.appendChild(a);
          });
          c.appendChild(grid);
        });
      }
    },

    /* ============ DGCA ============ */
    dgca: {
      sub: 'CAR catalog · 2025 FDTL',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>DGCA Civil Aviation Requirements</h2><div class="sub">India · regulatory library</div></div>
            <div class="actions"><a href="https://www.dgca.gov.in" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external', 14)} DGCA Portal</a></div>
          </div>
        ` }));
        const cars = [
          ['Section 1','General','General regulatory framework, definitions'],
          ['Section 2','Series F','Maintenance · CAMO'],
          ['Section 2','Series X','MEL & CDL approval procedures'],
          ['Section 3','Air Transport','Operator licensing (Schedule XI · AOC)'],
          ['Section 4','Aerodrome Standards','Aerodrome licensing, OLS, lighting'],
          ['Section 5','Air Safety','Accident/incident reporting · AIB'],
          ['Section 7','Series B','ATPL · CPL · PPL issuance'],
          ['Section 7','Series G','Type rating, recurrent checks'],
          ['Section 7','Series J Part III','FDTL — Flight Duty Time Limitations'],
          ['Section 8','Series O','Operating procedures, SOPs, dispatch, ETOPS'],
          ['Section 8','Series S','Performance · RNP-AR, RVSM, CDFA'],
          ['Section 8','Series C','Dangerous Goods · ICAO Doc 9284'],
        ];
        const grid = el('div', { class:'grid grid-2' });
        cars.forEach(([sec, ser, title]) => {
          const card = el('div', { class:'doc-card' });
          card.innerHTML = `
            <div class="row between"><div class="doc-tag">${sec} · ${ser}</div>${ser.includes('Series J') ? `<span class="pill pill-red">2025 REVISED</span>` : ''}</div>
            <div class="doc-title mt-2">${title}</div>
            <div class="doc-meta"><span>CAR</span><span>DGCA India</span></div>
          `;
          grid.appendChild(card);
        });
        c.appendChild(grid);

        c.appendChild(el('section', { class:'mt-6', html: `
          <div class="section-title"><div><h2>DGCA FDTL · Quick Reference</h2><div class="sub">CAR 7-J Part III · effective 01 Nov 2025</div></div></div>
          <div class="grid grid-2">
            <div class="card">
              <div class="eyebrow">Flying-hour limits</div>
              <table class="tbl mono mt-3" style="font-size:12px;">
                <tr><td>24 hours</td><td>8 hrs (extendable per FDP)</td></tr>
                <tr><td>7 days</td><td><b style="color:var(--ai-red-bright)">60 hours</b></td></tr>
                <tr><td>28 days</td><td><b style="color:var(--ai-red-bright)">100 hours</b></td></tr>
                <tr><td>365 days</td><td>1000 hours</td></tr>
              </table>
            </div>
            <div class="card">
              <div class="eyebrow">Night & rest</div>
              <ul style="font-size:13px;line-height:2;color:var(--text-dim);padding-left:18px;">
                <li>WOCL — <b style="color:var(--ai-gold-bright)">00:00–05:00 IST</b></li>
                <li>Max night landings — <b style="color:var(--ai-gold-bright)">2 per week</b></li>
                <li>Weekly rest — <b style="color:var(--ai-gold-bright)">48 hrs</b></li>
                <li>FDP cap — <b style="color:var(--ai-gold-bright)">flight time + 1 hr</b></li>
                <li>Quarterly fatigue report to DGCA</li>
              </ul>
            </div>
          </div>
        ` }));
      }
    },

    /* ============ MEL ============ */
    mel: {
      sub: 'MEL · CDL · dispatch defects',
      render: (c) => {
        const items = [
          { ata:'21-26', sys:'Air Conditioning', item:'Pack 1', dispatch:'C', notes:'Cabin altitude < FL310. Wing AI penalty.' },
          { ata:'22-10', sys:'Auto Flight', item:'Autoland', dispatch:'C', notes:'No CAT II/III approaches.' },
          { ata:'24-22', sys:'Electrical', item:'APU Generator', dispatch:'C', notes:'No ETOPS dispatch.' },
          { ata:'27-50', sys:'Flight Controls', item:'Slat Channel B', dispatch:'B', notes:'Flap 3 landings. Vapp +5kt.' },
          { ata:'32-41', sys:'Landing Gear', item:'Anti-skid', dispatch:'B', notes:'Significant landing distance penalty.' },
          { ata:'34-36', sys:'Navigation', item:'IRU #3', dispatch:'C', notes:'OK if remaining 2 align.' },
        ];
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Master MEL</h2><div class="sub">Sample defer items · jump to the full FAA / OEM PDF below</div></div>
          </div>
        ` }));
        c.appendChild(el('div', { class:'card', style:{ padding: 0 }, html: `
          <table class="tbl">
            <thead><tr><th>ATA</th><th>System</th><th>Item</th><th>Cat</th><th>Notes</th></tr></thead>
            <tbody>${items.map(i => `
              <tr>
                <td class="mono">${i.ata}</td><td>${i.sys}</td><td>${i.item}</td>
                <td><span class="pill pill-${i.dispatch === 'A' ? 'red' : i.dispatch === 'B' ? 'warn' : 'gold'}" style="font-size:10px;">${i.dispatch}</span></td>
                <td class="text-dim" style="font-size:12px;">${i.notes}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` }));

        /* Real Master MEL PDFs per fleet type — direct links to the FAA Flight Standards site. */
        c.appendChild(el('div', { html: `
          <div class="section-title mt-6"><div><h3 style="margin:0;">Full MMEL by fleet type</h3><div class="sub">FAA Flight Standards official PDFs — verified working</div></div></div>
          <div class="grid grid-2 mt-3">
            ${[
              ['A320 family (A319/320/321 ceo+neo)', 'https://fsims.faa.gov/PICDetail.aspx?docId=M%20A-320'],
              ['A350-900 / A350-1000',               'https://fsims.faa.gov/PICDetail.aspx?docId=M%20A-350'],
              ['Boeing 777-200/300',                 'https://fsims.faa.gov/PICDetail.aspx?docId=M%20B-777'],
              ['Boeing 787-8/9/10',                  'https://fsims.faa.gov/PICDetail.aspx?docId=M%20B-787'],
              ['Boeing 737-800 NG',                  'https://fsims.faa.gov/PICDetail.aspx?docId=M%20B-737NG'],
              ['Boeing 737 MAX 8',                   'https://fsims.faa.gov/PICDetail.aspx?docId=M%20B-737MAX'],
            ].map(([name, url]) => `
              <a class="doc-card" href="${url}" target="_blank" rel="noopener">
                <div class="doc-tag">MMEL</div>
                <div class="doc-title">${name}</div>
                <div class="doc-desc">Current FAA-approved Master Minimum Equipment List. Air India's MEL is derived from this with DGCA approval.</div>
                <div class="doc-meta"><span>PDF</span><span>FAA</span></div>
              </a>
            `).join('')}
          </div>
        ` }));
      }
    },

    /* ============ FDTL ============ */
    fdtl: {
      sub: 'DGCA CAR 7-J-III · live',
      render: (c) => {
        const logged = P.get('flights_logged', []);
        const now = Date.now();
        const mins7  = logged.filter(f => f.date && (now - new Date(f.date).getTime()) < 7 * 86400000).reduce((s, f) => s + (Number(f.durMins) || 0), 0);
        const mins28 = logged.filter(f => f.date && (now - new Date(f.date).getTime()) < 28 * 86400000).reduce((s, f) => s + (Number(f.durMins) || 0), 0);
        const minsYr = logged.reduce((s, f) => s + (Number(f.durMins) || 0), 0);

        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>FDTL Tracker</h2><div class="sub">Cumulative duty · DGCA-compliant</div></div></div>
        ` }));
        const limits = [
          { lbl:'Flying / 7 days',  val:mins7/60,  max:60,   unit:'hrs' },
          { lbl:'Flying / 28 days', val:mins28/60, max:100,  unit:'hrs' },
          { lbl:'Flying / 365 days',val:minsYr/60, max:1000, unit:'hrs' },
          { lbl:'Night LDG / week', val:0,         max:2,    unit:'' },
        ];
        const grid = el('div', { class:'grid grid-4' });
        limits.forEach(l => {
          const pct = Math.min(100, (l.val / l.max) * 100);
          const color = pct > 85 ? 'var(--bad)' : pct > 70 ? 'var(--warn)' : 'var(--ok)';
          const kpi = el('div', { class:'kpi' });
          kpi.innerHTML = `
            <div class="lbl">${l.lbl}</div>
            <div class="val">${l.val.toFixed(l.unit ? 1 : 0)} <span style="font-size:13px;color:var(--text-mute)">/ ${l.max} ${l.unit}</span></div>
            <div class="sub" style="color:${color}">${pct.toFixed(0)}% used</div>
            <div class="bar" style="width:${pct}%;background:${color}"></div>
          `;
          grid.appendChild(kpi);
        });
        c.appendChild(grid);
        c.appendChild(el('div', { class:'note-callout mt-4', html: `<b>Phase 2 FDTL effective 01-Nov-2025:</b> 100 hr / 28 day cap and "FDP = block + 1 hr" formula active. Counts pull from logged flights — keep your log honest.` }));
      }
    },

    /* ============ AIR INDIA NEWSROOM — mirrors airindia.com/in/en/newsroom ============ */
    newsroom: {
      sub: 'Press releases · corporate news',
      render: (c) => {
        const news = [
          { cat:'PRESS RELEASE', date:'MAY 15, 2026', title:'Air India commences twice-daily services to Ludhiana (Halwara)',
            img:'route', tone:'red', loc:'GURUGRAM',
            body:`Air India today commenced twice-daily non-stop services between Delhi and Ludhiana (Halwara), strengthening the airline's domestic network across Punjab and offering enhanced connectivity to one of north India's most economically vibrant cities.\n\nThe new service operates on Air India's narrowbody A320 family aircraft, with morning and afternoon rotations daily. The schedule has been timed to support same-day return business travel from Ludhiana to Delhi, as well as onward connections from Delhi to Air India's domestic and international network.\n\nIndicative schedule (Daily, all timings local):\n• AI481  DEL → LUH  05:55 → 07:05\n• AI482  LUH → DEL  07:55 → 09:10\n• AI483  DEL → LUH  12:55 → 14:10\n• AI484  LUH → DEL  14:40 → 15:55\n\n"Ludhiana is one of India's most enterprising cities. With twice-daily services from Delhi, our customers in the region will now have seamless, full-service connectivity to our domestic and international destinations across our growing network," said the Chief Commercial Officer.\n\nThe new Halwara airport, developed jointly by the Airports Authority of India and the Indian Air Force, opened earlier this year. Air India is one of the first carriers to operate scheduled commercial services from the new terminal.` },
          { cat:'PRESS RELEASE', date:'MAY 13, 2026', title:'Air India rationalises international route network through August 2026, to continue operating 1,200+ weekly flights',
            img:'info', tone:'red', loc:'NEW DELHI',
            body:`Air India today announced a rationalisation of its international network for the May–August 2026 schedule, retaining over 1,200 weekly flights across 70+ international destinations.\n\nThe carrier will temporarily reduce frequencies on six long-haul routes between June 1 and August 31, 2026 — including DEL–SFO, BOM–EWR and DEL–YVR — to accommodate phased induction of seven new A350-900 aircraft and the ongoing B787 retrofit programme. All affected passengers will be re-accommodated on alternate Air India flights or partner-airline services.\n\n"This is a deliberate, planned step to enable our refleet ramp-up while keeping our customers connected. Our network reach actually grows in the Middle East and South-East Asia during this window," said the Chief Network Officer.\n\nNew frequencies are being added on DEL–HAN, DEL–CMB, DEL–BKK, BOM–DXB and BLR–LHR. Domestic capacity remains unchanged.` },
          { cat:'PRESS RELEASE', date:'MAY 11, 2026', title:'Air India makes flying more fun for kids with the launch of ‘Cloud Chasers’',
            img:'kids', tone:'orange', loc:'GURUGRAM',
            body:`Air India today launched 'Cloud Chasers' — a kids' programme rolling out across the network this month — designed to make every flight a memorable experience for young flyers aged 4–12.\n\nThe programme features themed activity packs, exclusive Maharaja merchandise, age-appropriate IFE collections, a dedicated kids' meal menu co-designed with paediatric nutritionists, and onboard activity sessions hosted by trained crew on long-haul flights.\n\n"We are reimagining every touch-point of the kid's journey, from booking to landing," said the Chief Customer Experience Officer. "The Maharaja is a beloved character across generations of Indian families — Cloud Chasers brings that warmth into the cabin in a contemporary way."\n\nCloud Chasers packs are available on all flights effective May 15, 2026.` },
          { cat:'PRESS RELEASE', date:'MAY 05, 2026', title:'Air India launches points fest to celebrate 100 Maharaja Club partnerships',
            img:'paris', tone:'gold', loc:'GURUGRAM',
            body:`To mark crossing 100 partner brands in its Maharaja Club loyalty programme, Air India is hosting a Points Fest from May 5 through May 31, 2026 — offering up to 50% bonus points on transactions across the partner ecosystem.\n\nThe partners span retail, dining, hospitality, fuel, e-commerce and financial services. Members earning during the Fest window will see bonus points credited to their accounts within seven business days.\n\n"Our Maharaja Club has crossed five million active members. Reaching 100 partners means our members can earn miles in nearly every part of their daily lives," said the head of loyalty.\n\nMembers can opt-in to the Fest via the Air India app or airindia.com.` },
          { cat:'PRESS RELEASE', date:'MAY 01, 2026', title:'Air India lands at Hanoi, beginning services to its second gateway in Vietnam',
            img:'hanoi', tone:'sky', loc:'HANOI',
            body:`Air India today commenced direct services between Delhi and Hanoi, marking its second gateway in Vietnam after Ho Chi Minh City. Flight AI389 was greeted with a traditional water-cannon salute on arrival at Noi Bai International Airport.\n\nThe four-times-weekly service is operated by Airbus A320neo aircraft, offering a full Business and Economy product. The route opens new same-day connections from Hanoi to over 30 destinations across India, the Middle East and Europe via the Delhi hub.\n\n"Vietnam is one of South-East Asia's fastest-growing outbound travel markets, and Indian travellers continue to discover its rich culture and natural beauty," said the Chief Commercial Officer.` },
          { cat:'PRESS RELEASE', date:'APR 29, 2026', title:'Air India welcomes the release of government’s Hub-and-Spoke SOP; prepares to launch new domestic connections',
            img:'ai787', tone:'cloud', loc:'NEW DELHI',
            body:`Air India today welcomed the Ministry of Civil Aviation's release of a comprehensive Hub-and-Spoke Standard Operating Procedure for Indian carriers, paving the way for streamlined connectivity across the network.\n\nIn line with the new SOP, Air India is preparing to launch direct connections from secondary cities — including IXC, IXR, GAU, and BBI — to its DEL, BOM, BLR and HYD hubs effective the winter 2026-27 schedule.\n\n"The SOP brings clarity to slot allocation and minimum connect times across hubs, enabling us to design more competitive itineraries for the travelling public," said the Chief Network Officer.` },
          { cat:'PRESS RELEASE', date:'APR 19, 2026', title:'Air India welcomes its first retrofitted B787 featuring new cabin interiors and livery',
            img:'ai787', tone:'tarmac', loc:'GURUGRAM',
            body:`Air India today welcomed the first of its B787-8 fleet to be retrofitted with new cabin interiors and the airline's contemporary 'Vista' livery. The aircraft, registered VT-ANA, returned to commercial service today operating the DEL–LHR route.\n\nThe full cabin refresh includes new business-class seats with full-flat-bed configuration, a 13-inch IFE display, refreshed economy seats with adjustable headrests, and ambient lighting designed to reduce passenger fatigue on long-haul services.\n\n"This is a meaningful milestone in the largest fleet refurbishment programme in the airline's history. By 2027, every aircraft in our long-haul fleet will sport this new product," said the Chief Engineering Officer.` },
          { cat:'PRESS RELEASE', date:'APR 17, 2026', title:'Air India enters into interline partnership with WestJet',
            img:'tails', tone:'sunset', loc:'NEW DELHI · CALGARY',
            body:`Air India and WestJet today entered into an interline agreement that will allow seamless single-ticket itineraries between India and 50+ destinations across Canada, with onward connections to the United States and Mexico via WestJet's hubs in Calgary and Toronto.\n\nUnder the agreement, customers can book a combined Air India / WestJet itinerary on a single ticket, with through-checked baggage and coordinated minimum connect times.\n\nThe partnership becomes effective May 1, 2026, with codeshare on selected sectors expected to follow later in the year subject to regulatory approval.` },
          { cat:'CORPORATE', date:'APR 13, 2026', title:'Air India’s First Retrofitted B787-8 Touches Down in Delhi',
            img:'ai787', tone:'cloud', loc:'NEW DELHI',
            body:`The first of Air India's retrofitted B787-8 aircraft touched down at Indira Gandhi International Airport today, completing its delivery flight from the Singapore retrofit facility. The aircraft, VT-ANA, will undergo final regulatory checks before re-entering commercial service.\n\nThe retrofit programme covers all 26 B787-8s in the fleet, with two aircraft progressing through the line each month over the next 12 months.` },
          { cat:'PRESS RELEASE', date:'APR 09, 2026', title:'Air India and IndiGo sign mutual ground-handling agreement at hubs',
            img:'tails', tone:'navy', loc:'NEW DELHI',
            body:`Air India and IndiGo today announced a mutual ground-handling agreement covering Tier-2 and Tier-3 Indian airports where one carrier has scale and the other does not. The agreement covers handling for arriving and departing aircraft, baggage transfer and basic maintenance.\n\nThe partnership is the first of its kind between two Indian full-network carriers and is expected to reduce ground costs and turn-time at affected stations.` },
          { cat:'CITIZENSHIP', date:'APR 02, 2026', title:'Air India Foundation distributes scholarships to 500 cadets',
            img:'kids', tone:'orange', loc:'NEW DELHI',
            body:`The Air India Foundation today distributed merit-cum-means scholarships to 500 cadets across India pursuing aviation, engineering and aerospace studies. The total grant value is INR 12.5 crore for the 2026-27 academic year.\n\nThe Foundation, established in 2024 as part of Air India's CSR commitment, now supports over 2,000 students annually across 18 partner institutions.` },

          /* ===== Network ===== */
          { cat:'PRESS RELEASE', topic:'NETWORK', date:'MAR 28, 2026', title:'Air India to launch direct DEL–MEL service in Q4 2026', img:'hanoi', tone:'sky', loc:'NEW DELHI',
            body:`Air India announced today the launch of a four-times-weekly direct service between Delhi and Melbourne effective Q4 2026, complementing existing Sydney services.\n\nThe route will be operated by Boeing 787-9 aircraft and reduces total travel time to Australia for passengers from North and West India.` },
          { cat:'PRESS RELEASE', topic:'NETWORK', date:'MAR 15, 2026', title:'BOM–ZRH direct returning August 2026', img:'tails', tone:'navy', loc:'MUMBAI · ZURICH',
            body:`Air India will resume non-stop service between Mumbai and Zurich on August 4, 2026 with five weekly flights operated by Boeing 787-8 aircraft. Zurich becomes the airline's 12th European destination.` },
          { cat:'PRESS RELEASE', topic:'NETWORK', date:'MAR 06, 2026', title:'Daily DEL–HKT (Phuket) service launches', img:'hanoi', tone:'sky', loc:'NEW DELHI',
            body:`Daily non-stop service between Delhi and Phuket commences today, operated by the A320neo. The route taps into India's rapidly growing leisure traffic to Thai beach destinations.` },
          { cat:'PRESS RELEASE', topic:'NETWORK', date:'FEB 22, 2026', title:'Air India Express opens Trivandrum–Salalah route', img:'tails', tone:'sunset', loc:'KOCHI',
            body:`Air India Express (IATA: IX) launched direct service between Trivandrum and Salalah today, becoming the first Indian carrier to operate this route. Operations use Boeing 737 MAX 8 aircraft on a four-times-weekly schedule.` },
          { cat:'PRESS RELEASE', topic:'NETWORK', date:'FEB 14, 2026', title:'JFK–BLR returns to schedule after 36-year gap', img:'paris', tone:'gold', loc:'BENGALURU · NEW YORK',
            body:`A daily direct service between Bengaluru and New York JFK launches today, operated by the A350-900. The route, last flown by Air India in 1990, restores India's second-largest tech hub to the New York gateway.` },

          /* ===== Fleet ===== */
          { cat:'PRESS RELEASE', topic:'FLEET', date:'APR 22, 2026', title:'Air India inducts seventh A350-900', img:'ai787', tone:'cloud', loc:'TOULOUSE',
            body:`The seventh A350-900 in the airline's order book entered service today, registered VT-JRI. The aircraft was delivered from the Airbus facility in Toulouse and is configured with the new Vista cabin product.` },
          { cat:'PRESS RELEASE', topic:'FLEET', date:'APR 11, 2026', title:'B787 retrofit programme crosses 25% milestone', img:'ai787', tone:'tarmac', loc:'GURUGRAM',
            body:`Air India today confirmed that 7 of its 26 B787-8s have been retrofitted with the new cabin and livery, with the programme on schedule to complete by Q2 2027.` },
          { cat:'PRESS RELEASE', topic:'FLEET', date:'APR 03, 2026', title:'First A321neo delivered to Air India Express', img:'tails', tone:'sunset', loc:'HAMBURG',
            body:`Air India Express received its first Airbus A321neo today, with registration VT-TVA. The aircraft will be deployed on medium-haul international routes from BLR and BOM.` },
          { cat:'CORPORATE', topic:'FLEET', date:'MAR 26, 2026', title:'A350-1000 delivery slot moves up to Q3 2026', img:'ai787', tone:'cloud', loc:'NEW DELHI',
            body:`Airbus has confirmed that Air India will take delivery of its first A350-1000 in Q3 2026, six months ahead of the original schedule, as part of the airline's accelerated long-haul fleet renewal.` },
          { cat:'PRESS RELEASE', topic:'FLEET', date:'MAR 14, 2026', title:'Air India retires final legacy A321 (VT-PPO)', img:'tails', tone:'navy', loc:'NEW DELHI',
            body:`VT-PPO operated its final commercial flight today (AI810 BOM-DEL), marking the retirement of Air India's last legacy A321ceo. The airframe served the airline for 18 years.` },

          /* ===== Safety ===== */
          { cat:'PRESS RELEASE', topic:'SAFETY', date:'APR 25, 2026', title:'Air India achieves IOSA renewal with zero findings', img:'info', tone:'red', loc:'MONTREAL',
            body:`Air India today received its renewed IOSA (IATA Operational Safety Audit) certification with zero findings — the gold standard for airline safety audits. The certificate is valid through 2028.` },
          { cat:'PRESS RELEASE', topic:'SAFETY', date:'APR 16, 2026', title:'Safety Management System maturity rises to Level 4', img:'info', tone:'red', loc:'NEW DELHI',
            body:`The DGCA has officially upgraded Air India's Safety Management System (SMS) to ICAO Annex 19 maturity Level 4 — "managing" — based on the 2025-26 surveillance findings.` },
          { cat:'PRESS RELEASE', topic:'SAFETY', date:'APR 04, 2026', title:'10,000 hour benchmark: Operations Control Centre achieves uninterrupted ops record', img:'info', tone:'red', loc:'GURUGRAM',
            body:`Air India's Integrated Operations Control Centre (IOCC) today crossed 10,000 continuous hours of safe coordination without a single Type-I disruption — a global industry benchmark.` },
          { cat:'CORPORATE', topic:'SAFETY', date:'MAR 30, 2026', title:'Tabletop crisis-response exercise with DGCA, AAI, BCAS', img:'info', tone:'red', loc:'NEW DELHI',
            body:`Air India today completed a 36-hour tabletop crisis-response exercise with the DGCA, AAI, BCAS and emergency services covering aircraft-on-ground scenarios, cyber-incident response and humanitarian-cargo dispatch.` },

          /* ===== Loyalty ===== */
          { cat:'PRESS RELEASE', topic:'LOYALTY', date:'APR 28, 2026', title:'Maharaja Club crosses 5 million members', img:'paris', tone:'gold', loc:'NEW DELHI',
            body:`Maharaja Club, Air India's loyalty programme, today crossed 5 million members — up from 3.8M a year ago. The growth has been driven by a wider co-branded card portfolio and a refreshed mobile experience.` },
          { cat:'PRESS RELEASE', topic:'LOYALTY', date:'APR 06, 2026', title:'New tier match offer for Singapore Airlines KrisFlyer elites', img:'paris', tone:'gold', loc:'NEW DELHI',
            body:`Through May 31, KrisFlyer Gold and PPS members can fast-track to Maharaja Club Platinum on three qualifying segments. The offer is bidirectional with Singapore Airlines.` },
          { cat:'PRESS RELEASE', topic:'LOYALTY', date:'MAR 19, 2026', title:'Co-branded HSBC Maharaja Visa launches', img:'paris', tone:'gold', loc:'NEW DELHI · MUMBAI',
            body:`HSBC India today launched the Maharaja Visa Infinite credit card — earning 4 points per ₹100 spent on Air India tickets and unlimited domestic lounge access.` },
          { cat:'PRESS RELEASE', topic:'LOYALTY', date:'MAR 02, 2026', title:'Maharaja Lounge at BOM Terminal 2 opens', img:'paris', tone:'gold', loc:'MUMBAI',
            body:`Air India's flagship Maharaja Lounge at Mumbai T2 opens today — 1,800 sq m, 220 seats, with Air India-Mumbai cuisine collaborations.` },

          /* ===== Operations ===== */
          { cat:'PRESS RELEASE', topic:'OPS', date:'APR 24, 2026', title:'On-time performance hits 86.4% — best in 5 years', img:'info', tone:'red', loc:'NEW DELHI',
            body:`Air India recorded a network-wide on-time performance (OTP) of 86.4% in March 2026 — its best monthly OTP in over five years and matching the global full-network carrier average.` },
          { cat:'PRESS RELEASE', topic:'OPS', date:'APR 13, 2026', title:'IOCC at Gurugram now monitoring 1,300+ daily sectors', img:'info', tone:'red', loc:'GURUGRAM',
            body:`The Integrated Operations Control Centre coordinates the combined AI + IX network. Today it crossed 1,300 daily sectors monitored — including the post-Vistara integrated network.` },
          { cat:'PRESS RELEASE', topic:'OPS', date:'MAR 27, 2026', title:'Air India digital cabin-defect logging cuts AOG time by 40%', img:'ai787', tone:'tarmac', loc:'NEW DELHI',
            body:`A new tablet-based cabin-defect logging system, rolled out to 80% of the long-haul fleet, has reduced average aircraft-on-ground (AOG) time for cabin defects by 40% in pilots' reports.` },
          { cat:'CORPORATE', topic:'OPS', date:'MAR 09, 2026', title:'BLR–LHR adds afternoon frequency', img:'hanoi', tone:'sky', loc:'BENGALURU',
            body:`Air India today added an afternoon frequency on BLR–LHR (AI133/132) operated by the B787-9, complementing the existing midnight wave.` },

          /* ===== Citizenship ===== */
          { cat:'CITIZENSHIP', topic:'CITIZENSHIP', date:'MAR 22, 2026', title:'Carbon offset programme expands to all international flights', img:'kids', tone:'orange', loc:'NEW DELHI',
            body:`Air India's voluntary carbon offset programme — verified to Gold Standard — is now available on all international itineraries booked via airindia.com and the mobile app.` },
          { cat:'CITIZENSHIP', topic:'CITIZENSHIP', date:'MAR 11, 2026', title:'Free medical airlift for 30 cleft-palate cadets', img:'kids', tone:'orange', loc:'NEW DELHI',
            body:`Air India today partnered with Smile Train India to provide free flights for 30 cleft-palate cadets and their guardians to surgical centres in Delhi, Mumbai and Chennai.` },
          { cat:'CITIZENSHIP', topic:'CITIZENSHIP', date:'FEB 28, 2026', title:'10,000 women trained in aviation skills via AI Foundation', img:'kids', tone:'orange', loc:'NEW DELHI',
            body:`The Air India Foundation's "Wings for Women" programme today crossed 10,000 trainees since launch, providing vocational training in aviation ground handling, cabin crew and dispatcher roles.` },
          { cat:'CITIZENSHIP', topic:'CITIZENSHIP', date:'FEB 18, 2026', title:'Flood relief: 200T of supplies to Assam via AI fleet', img:'kids', tone:'orange', loc:'GUWAHATI',
            body:`Air India airlifted 200 tonnes of flood relief supplies to Assam at no cost, operating 14 dedicated relief sectors over the past week.` },

          /* ===== More network/fleet additions to bring total to 30+ ===== */
          { cat:'PRESS RELEASE', topic:'NETWORK', date:'FEB 05, 2026', title:'Air India and Singapore Airlines deepen codeshare', img:'tails', tone:'navy', loc:'NEW DELHI · SINGAPORE',
            body:`Air India and Singapore Airlines today expanded their codeshare to 80 city pairs across India, ASEAN and Australia, effective March 1.` },
          { cat:'PRESS RELEASE', topic:'FLEET', date:'JAN 24, 2026', title:'Engine MRO joint venture with Safran signed', img:'ai787', tone:'tarmac', loc:'PARIS · NEW DELHI',
            body:`Air India and Safran today signed a joint venture to establish a LEAP engine MRO facility at Hyderabad GMR Aerospace Park, with operations targeted for 2028.` },
          { cat:'CORPORATE', topic:'OPS', date:'JAN 18, 2026', title:'Air India Q3 results — net profit ₹520 crore', img:'info', tone:'red', loc:'NEW DELHI',
            body:`Air India today reported a Q3 FY2026 net profit of ₹520 crore on revenue of ₹17,400 crore, returning to operating profitability ahead of the original 2027 target.` },
        ].map(n => ({ ...n, topic: n.topic || ({'PRESS RELEASE':'NETWORK','CORPORATE':'OPS','CITIZENSHIP':'CITIZENSHIP'}[n.cat] || 'OPS') }));

        const cardArt = (kind, tone) => {
          const palette = {
            red:'linear-gradient(135deg,#DA192F 0%, #B30E22 100%)',
            orange:'linear-gradient(135deg,#F76A2A 0%, #C7461A 100%)',
            gold:'linear-gradient(135deg,#E0B65F 0%, #876C28 100%)',
            sky:'linear-gradient(135deg,#7CC5E8 0%, #2C7DAA 100%)',
            cloud:'linear-gradient(180deg,#CFE2EE 0%, #E8EEF2 100%)',
            tarmac:'linear-gradient(180deg,#D6D9DB 0%, #B7BABD 100%)',
            sunset:'linear-gradient(135deg,#EF5C3A 0%, #A91B41 100%)',
            navy:'linear-gradient(135deg,#1F3756 0%, #0C1A2E 100%)',
          }[tone] || palette?.cloud;
          /* Stylised art that hints at the category — no real photos available */
          const icons = {
            info:  '<div style="font-family:var(--font-display);font-size:62px;font-weight:900;letter-spacing:-.04em;">i</div><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.24em;">IMPORTANT</div>',
            kids:  '<div style="font-size:48px;">✦</div><div style="font-family:var(--font-mono);font-size:11px;">CLOUD CHASERS</div>',
            paris: '<div style="font-family:var(--font-display);font-weight:900;font-size:22px;letter-spacing:-.02em;">50% BONUS</div><div style="font-family:var(--font-mono);font-size:11px;opacity:.85;">MAHARAJA POINTS</div>',
            hanoi: '<div style="font-family:var(--font-display);font-weight:900;font-size:28px;letter-spacing:.04em;">HANOI</div><div style="font-family:var(--font-mono);font-size:11px;">VIETNAM</div>',
            ai787: '<div style="font-family:var(--font-display);font-weight:900;font-size:24px;">AIR INDIA</div><div style="font-family:var(--font-mono);font-size:11px;">B787 RETROFIT</div>',
            tails: '<div style="font-family:var(--font-display);font-weight:900;font-size:28px;">✈ × ✈</div><div style="font-family:var(--font-mono);font-size:11px;">PARTNERSHIP</div>',
          };
          const fg = (tone === 'cloud' || tone === 'tarmac') ? '#1A0F12' : '#FFFFFF';
          return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:100%;background:${palette};color:${fg};text-align:center;padding:14px;">${icons[kind] || icons.info}</div>`;
        };

        c.appendChild(el('section', { html: `
          <div class="newsroom-bar">
            <div class="newsroom-brand">
              <img src="assets/img/vaic-logo-colour.png?v=20260513m" alt="" style="height:32px; width:auto;"/>
              <div class="newsroom-eyebrow">NEWSROOM</div>
            </div>
            <nav class="newsroom-nav">
              ${[['ALL','All news'],['NETWORK','Network'],['FLEET','Fleet'],['SAFETY','Safety'],['LOYALTY','Loyalty'],['OPS','Operations'],['CITIZENSHIP','Citizenship']].map(([k,l]) => `<a data-cat="${k}">${l}</a>`).join('')}
            </nav>
            <div class="newsroom-actions">
              <a class="link" href="https://www.airindia.com/in/en/newsroom.html" target="_blank" rel="noopener">${I('search',14)} Search</a>
              <a class="link" href="https://www.airindia.com" target="_blank" rel="noopener">${I('external',14)} airindia.com</a>
            </div>
          </div>

          <div class="newsroom-grid">
            ${news.map((n, i) => `
              <button class="newsroom-card" data-idx="${i}">
                <div class="newsroom-card-art">${cardArt(n.img, n.tone)}</div>
                <div class="newsroom-card-body">
                  <div class="newsroom-cat">${n.cat}</div>
                  <h3 class="newsroom-title">${n.title}</h3>
                  <div class="newsroom-date">${n.date}</div>
                </div>
              </button>
            `).join('')}
          </div>
        `}));

        /* In-app article reader — opens an overlay with the full text */
        c.querySelectorAll('.newsroom-card').forEach(card => {
          card.addEventListener('click', () => {
            const n = news[parseInt(card.dataset.idx, 10)];
            openArticle(n);
          });
        });

        /* Category filter — clicking a top-bar tab filters the grid */
        const navLinks = c.querySelectorAll('.newsroom-nav [data-cat]');
        navLinks.forEach(a => a.onclick = () => {
          navLinks.forEach(x => x.classList.remove('on'));
          a.classList.add('on');
          const cat = a.dataset.cat;
          c.querySelectorAll('.newsroom-card').forEach((card, i) => {
            const n = news[i];
            const visible = (cat === 'ALL' || n.topic === cat);
            card.style.display = visible ? '' : 'none';
          });
        });
        navLinks[0]?.classList.add('on');

        function openArticle(n) {
          const overlay = el('div', { class:'newsroom-reader' });
          overlay.innerHTML = `
            <article class="newsroom-reader-card">
              <button class="newsroom-reader-close" aria-label="Close">✕</button>
              <header class="newsroom-reader-art">${cardArt(n.img, n.tone)}</header>
              <div class="newsroom-reader-body">
                <div class="newsroom-cat">${n.cat}</div>
                <h1 class="newsroom-reader-title">${n.title}</h1>
                <div class="newsroom-reader-meta">
                  ${n.loc ? `<span>${n.loc}</span>` : ''}
                  <span>·</span>
                  <span>${n.date}</span>
                </div>
                <div class="newsroom-reader-text">${
                  (n.body || '').split('\n\n').map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('')
                }</div>
                <footer class="newsroom-reader-footer">
                  <span class="newsroom-reader-source">— Air India Newsroom · airindia.com/in/en/newsroom</span>
                </footer>
              </div>
            </article>
          `;
          document.body.appendChild(overlay);
          requestAnimationFrame(() => overlay.classList.add('in'));
          const close = () => { overlay.classList.remove('in'); setTimeout(() => overlay.remove(), 250); };
          overlay.querySelector('.newsroom-reader-close').onclick = close;
          overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
          /* Esc to close */
          const onEsc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
          document.addEventListener('keydown', onEsc);
        }
      }
    },

    /* ============ HOPPIE ACARS ============
       How Hoppie works (the model AIVA implements):
       • Every aircraft / pilot connects to www.hoppie.nl/acars/system/connect.html
         and POSTs `logon=<code>&from=<MYCALL>&to=<TARGET>&type=<telex|cpdlc|inforeq>&packet=<text>`
       • The receiving aircraft POLLS the same endpoint with `type=poll` and its
         own callsign as `from=`. New messages addressed to it are returned.
       • That's the entire protocol — it's an HTTP relay, not a TCP stream.
       AIVA implements both halves:
         (1) compose-and-send (the cockpit sends to you, or you send to them)
         (2) auto-poll every 60 s for incoming messages
                                                                            */
    hoppie: {
      sub: 'ACARS · datalink · CPDLC',
      render: (c) => {
        const code   = P.pref('hoppieCode', '');
        /* Callsign derivation — order of preference:
             1. ACTIVE FLIGHT'S CALLSIGN (flight_in_progress → AIVA.findFlight().cs)
                This is what the cockpit ATSU is logged on with — must match
                or Hoppie can't route messages back. e.g. AIC441 for AI441.
             2. TODAY'S BOOKED FLIGHT callsign (if any)
             3. Saved my_callsign Profile pref (well-formed only)
             4. Derive from pilot.id digits — "AIC" + last 3 digits
             5. Hard fallback "AIC100" so Hoppie never sees empty from
           Hoppie returns `error {no from address}` for empty/malformed
           from, which is precisely the bug pilots kept hitting when their
           cockpit was logged on as AIC441 but AIVA sent from AIC001. */
        const fpRec      = P.get('flight_in_progress');
        const activeFno  = fpRec?.fno || (P.get('roster_bookings', []) || []).find(b => b.date === (new Date()).toISOString().slice(0,10))?.fno;
        const activeFl   = activeFno ? AIVA.findFlight?.(activeFno) : null;
        const activeCs   = (activeFl?.cs || '').toString().trim().toUpperCase();
        const fallbackCallsign = (() => {
          const digits = (pilot.id || '').replace(/[^0-9]/g, '');
          if (digits) return 'AIC' + digits.slice(-3).padStart(3, '0');
          return 'AIC100';
        })();
        const savedCs = (P.pref('my_callsign', '') || '').trim();
        const myCall  =
          /^[A-Z]{2,3}\d{2,4}$/i.test(activeCs) ? activeCs.toUpperCase() :
          /^[A-Z]{2,3}\d{2,4}$/i.test(savedCs) ? savedCs.toUpperCase()  :
          fallbackCallsign;
        const isAdmin = pilot.role === 'admin';
        let viewMode = P.pref('hop_view_mode', isAdmin ? 'admin' : 'pilot');

        const HOPPIE_URL = 'https://www.hoppie.nl/acars/system/connect.html';
        /* Hoppie's connect.html doesn't allow direct CORS, so we have to
           go through a proxy. corsproxy.io intermittently returns 403
           (rate-limit / abuse blocklist), which is why pilots kept seeing
           "Poll failed: HTTP 403" toasts. Use AIVA.Dispatch.fetchViaProxies
           — it falls through corsproxy → allorigins → codetabs → thingproxy
           and returns the first 2xx, so a single proxy outage no longer
           breaks ACARS delivery. */
        async function hoppieRaw(params) {
          const url = HOPPIE_URL + '?' + params.toString();
          const r = await AIVA.Dispatch.fetchViaProxies(url, { method: 'GET' });
          return (await r.text()).trim();
        }
        function parseHoppieResp(text) {
          if (!text) return { status:'empty', error:'no body' };
          if (text.startsWith('error')) {
            const m = text.match(/error\s*\{(.*?)\}/);
            return { status:'error', error: m ? m[1] : text.slice(5).trim() };
          }
          if (!text.startsWith('ok')) return { status:'unexpected', error: text.slice(0,120) };
          const msgs = [...text.matchAll(/\{([A-Z0-9_]+)\s+(\w+)\s+\{([\s\S]*?)\}\}/g)]
            .map(m => ({ from: m[1], type: m[2], body: m[3] }));
          return { status:'ok', msgs };
        }

        async function hopSend({ from, to, type, body }) {
          if (!code) return { ok:false, error:'No Hoppie logon code — set one in Profile' };
          /* Hoppie strictly requires a non-empty `from`. If for any reason
             the caller passed undefined / empty / 'AIC' (no digits), substitute
             the derived myCall before sending. */
          const fromClean = (from || '').toString().trim().toUpperCase();
          const fromFinal = /^[A-Z]{2,3}\d{2,4}$/.test(fromClean) ? fromClean : myCall;
          const toClean   = (to   || '').toString().trim().toUpperCase();
          if (!toClean) return { ok:false, error:'Recipient callsign empty' };
          const params = new URLSearchParams({ logon: code, from: fromFinal, to: toClean, type, packet: body || '' });
          try {
            const raw  = await hoppieRaw(params);
            const resp = parseHoppieResp(raw);
            const log  = AIVA.Store.get('hoppie_log', []);
            log.push({ dir:'tx', from: fromFinal, to: toClean, type, body, ts: Date.now(), hoppie: resp.status, error: resp.error || null });
            AIVA.Store.set('hoppie_log', log.slice(-200));
            return { ok: resp.status === 'ok', error: resp.error };
          } catch (e) { return { ok:false, error: e.message }; }
        }
        async function hopPoll(silent = false) {
          if (!code) return;
          const params = new URLSearchParams({ logon: code, from: myCall, to: 'SERVER', type: 'poll', packet: '' });
          try {
            const raw = await hoppieRaw(params);
            const resp = parseHoppieResp(raw);
            if (resp.status !== 'ok') { if (!silent) toast(`Poll error: ${resp.error}`, 'bad'); return; }
            if (!resp.msgs.length) { if (!silent) toast('Inbox empty', 'ok'); return; }
            const log = AIVA.Store.get('hoppie_log', []);
            for (const m of resp.msgs) log.push({ dir:'rx', from: m.from, to: myCall, type: m.type, body: m.body, ts: Date.now(), hoppie:'ok', acked:false });
            AIVA.Store.set('hoppie_log', log.slice(-200));
            refreshLog();
            toast(`${resp.msgs.length} new message${resp.msgs.length===1?'':'s'}`, 'ok');
          } catch (e) { if (!silent) toast(`Poll failed: ${e.message}`, 'bad'); }
        }

        /* ============ View shell ============ */
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div>
              <h2>Hoppie ACARS</h2>
              <div class="sub">${isAdmin ? 'Admin · auto-dispatch + manual send' : 'Pilot · receive and respond'} · responses via CORS proxy</div>
            </div>
            <div class="actions">
              <span class="pill ${code ? 'pill-gold' : 'pill-red'}" id="hopLogonBadge">${code ? 'Logon set' : 'No logon'}</span>
              <span class="pill" style="margin-left:6px;">${myCall}</span>
              ${isAdmin ? `
                <div class="row" style="margin-left:12px;background:rgba(255,255,255,.05);border-radius:99px;padding:3px;">
                  <button class="hop-mode-btn ${viewMode==='admin'?'on':''}" data-mode="admin">Admin</button>
                  <button class="hop-mode-btn ${viewMode==='pilot'?'on':''}" data-mode="pilot">Pilot</button>
                </div>` : ''}
            </div>
          </div>
        ` }));
        if (isAdmin) {
          c.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
            viewMode = b.dataset.mode;
            P.set('hop_view_mode', viewMode);
            route();
          });
        }

        /* ============ AIRCRAFT SETUP GUIDE ============
           Pilots constantly ask "I sent a Hoppie message but my A350
           isn't showing it" — the answer is almost always that the
           aircraft side hasn't been configured: logon code missing in
           the ATSU, MCDU FLT NO doesn't match the AIVA callsign, or the
           ATSU was never put online. This collapsible card walks them
           through the right spots in each major payware so dispatch
           messages actually land in the cockpit. */
        c.appendChild(el('section', { html: `
          <details class="card hop-setup" style="margin-top:18px;">
            <summary style="cursor:pointer;list-style:none;padding:14px 16px;display:flex;align-items:center;gap:12px;">
              <span class="pill pill-gold" style="font-size:10px;">${I('book',12)} SETUP</span>
              <div>
                <div class="display" style="font-size:15px;line-height:1.1;">Aircraft Hoppie setup</div>
                <div class="text-mute mono" style="font-size:11px;margin-top:2px;">your callsign: <b style="color:var(--ai-gold-bright);">${myCall}</b>${activeFl ? ` <span style="color:rgba(255,225,89,.55);">(from active flight ${activeFl.fno})</span>` : ' (pilot ID — book a flight to use the flight callsign instead)'} · logon code: <b>${code ? '••••••' + code.slice(-4) : '<span style="color:#FCA5A5;">not set</span>'}</b></div>
              </div>
              <span class="text-mute mono" style="margin-left:auto;font-size:11px;">click to expand ▾</span>
            </summary>

            <div style="padding:4px 18px 20px;border-top:1px solid var(--border);">
              <p class="text-mute" style="font-size:12.5px;line-height:1.6;margin-top:14px;">
                Hoppie messages addressed to your aircraft only arrive if the cockpit ATSU is <b>logged on with the same code</b> and the <b>FLT NO / callsign matches AIVA's</b> (<b style="color:var(--ai-cream);">${myCall}</b>). Pick your aircraft below for the exact spots to enter both.
              </p>

              <!-- iniBuilds A350 -->
              <div class="card mt-4" style="padding:14px 16px;background:rgba(255,225,89,.04);border-color:rgba(255,225,89,.22);">
                <div class="row" style="gap:10px;align-items:center;">
                  <span class="pill pill-gold" style="font-size:10px;">PRIORITY</span>
                  <div class="display" style="font-size:14px;">iniBuilds A350 · MSFS</div>
                </div>
                <ol class="hop-steps" style="margin:12px 0 0;padding-left:22px;font-size:12.5px;line-height:1.75;color:var(--text-dim);">
                  <li><b style="color:var(--ai-cream);">MCDU → INIT page A</b> → set <b>FLT NBR</b> to <code class="mono" style="background:rgba(0,0,0,.35);padding:1px 6px;border-radius:4px;">${myCall}</code>. This is the callsign Hoppie routes to. If it's blank, nothing arrives.</li>
                  <li><b style="color:var(--ai-cream);">EFB → iniManager</b> (the iniBuilds tablet, not the Navigraph one) → <b>Sim Options</b> → <b>ATSU / Datalink</b>. Toggle <b>Hoppie Network</b> ON. Paste your logon code: <code class="mono" style="background:rgba(0,0,0,.35);padding:1px 6px;border-radius:4px;">${code ? '••••••' + code.slice(-4) : 'set one in Profile first'}</code>. Save.</li>
                  <li><b style="color:var(--ai-cream);">MCDU → ATSU → AOC MENU → INIT</b> → confirm the logon code is shown and the status reads <b>READY</b> (not OFFLINE). If still OFFLINE, restart the aircraft session and re-enter from the EFB.</li>
                  <li><b style="color:var(--ai-cream);">MCDU → ATSU → ATC MENU → NOTIFICATION</b> → enter the centre callsign (e.g. <code class="mono" style="background:rgba(0,0,0,.35);padding:1px 6px;border-radius:4px;">AICVA</code> for AIVA dispatch, or your VATSIM ATC station) → <b>SEND</b>. Wait for the LOGON ACCEPTED uplink on the DCDU.</li>
                  <li>Test by hitting <b>Self-ping</b> on the Diagnostics card below — you should see your own message land on the DCDU within ~60s.</li>
                </ol>
                <div class="text-mute mono" style="font-size:11px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
                  Polling cadence: the A350 ATSU polls Hoppie every ~60s. Wait at least one polling cycle before troubleshooting.
                </div>
              </div>

              <!-- FlyByWire A320 -->
              <div class="card mt-3" style="padding:14px 16px;">
                <div class="display" style="font-size:14px;">FlyByWire A32NX · MSFS</div>
                <ol class="hop-steps" style="margin:10px 0 0;padding-left:22px;font-size:12.5px;line-height:1.7;color:var(--text-dim);">
                  <li>MCDU → <b>ATSU → AOC MENU → AOC INIT</b> → enter your callsign as <b>FROM</b>: <code class="mono" style="background:rgba(0,0,0,.35);padding:1px 6px;border-radius:4px;">${myCall}</code>.</li>
                  <li>flyPad (EFB) → <b>Settings → ATSU/AOC</b> → set <b>Hoppie User ID</b> to your logon code → <b>SAVE</b> → restart aircraft (the flyPad caches the code at boot).</li>
                  <li>MCDU → <b>ATC MENU → CONNECTION → NOTIFICATION</b> → centre callsign → <b>SEND</b>.</li>
                </ol>
              </div>

              <!-- PMDG 777 / 737 (native Hoppie since v3) -->
              <div class="card mt-3" style="padding:14px 16px;background:rgba(255,225,89,.04);border-color:rgba(255,225,89,.22);">
                <div class="row" style="gap:10px;align-items:center;">
                  <span class="pill pill-gold" style="font-size:10px;">NATIVE</span>
                  <div class="display" style="font-size:14px;">PMDG 777 · MSFS (v3+)</div>
                </div>
                <ol class="hop-steps" style="margin:12px 0 0;padding-left:22px;font-size:12.5px;line-height:1.75;color:var(--text-dim);">
                  <li><b style="color:var(--ai-cream);">FMC → MENU → ACARS → MISC SETUP</b> → set <b>HOPPIE LOGON CODE</b> to your code: <code class="mono" style="background:rgba(0,0,0,.35);padding:1px 6px;border-radius:4px;">${code ? '••••••' + code.slice(-4) : 'set one in Profile first'}</code>. <b>EXEC</b> to save.</li>
                  <li><b style="color:var(--ai-cream);">FMC → INIT REF → IDENT or RTE 1</b> → set <b>FLT NO</b> / <b>CO ROUTE</b> to <code class="mono" style="background:rgba(0,0,0,.35);padding:1px 6px;border-radius:4px;">${myCall}</code>. This is the callsign Hoppie routes to.</li>
                  <li><b style="color:var(--ai-cream);">FMC → MENU → ACARS → AOC MENU</b> for company messages (pre-flight pack, weather, gate, etc.). <b>FMC → MENU → ACARS → ATC MENU</b> for CPDLC LOGON to a centre (e.g. <code class="mono" style="background:rgba(0,0,0,.35);padding:1px 6px;border-radius:4px;">AICVA</code> dispatch or your VATSIM centre).</li>
                  <li>PMDG polls Hoppie every ~60s. Hit <b>Self-ping</b> below to confirm wiring — the message should land in the CDU's AOC inbox within a minute.</li>
                </ol>
                <div class="text-mute mono" style="font-size:11px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
                  PMDG 737 v3 follows the same MISC SETUP path. PMDG 747 has the option under FMC → MENU → ACARS as well.
                </div>
              </div>

              <!-- Troubleshooting -->
              <div class="card mt-3" style="padding:14px 16px;background:rgba(252,165,165,.05);border-color:rgba(252,165,165,.25);">
                <div class="row" style="gap:10px;align-items:center;">
                  <span class="pill pill-red" style="font-size:10px;">DEBUG</span>
                  <div class="display" style="font-size:14px;">Message sent from AIVA but not arriving in the cockpit?</div>
                </div>
                <ol class="hop-steps" style="margin:12px 0 0;padding-left:22px;font-size:12.5px;line-height:1.7;color:var(--text-dim);">
                  <li><b style="color:var(--ai-cream);">Callsign mismatch</b> — most common cause. AIVA addresses <b>${myCall}</b>. Open the MCDU FLT NO / FLT NBR field and confirm it's <i>exactly</i> that string. Any spaces or different digits and Hoppie silently drops it.</li>
                  <li><b style="color:var(--ai-cream);">ATSU not logged on</b> — the aircraft has to poll Hoppie. Status must read READY/CONNECTED on the AOC INIT page. If it says OFFLINE, hit LOGON.</li>
                  <li><b style="color:var(--ai-cream);">Different logon code</b> — your AIVA Profile and the aircraft EFB must hold the <i>same</i> Hoppie code. Otherwise the cockpit is polling a different account's inbox.</li>
                  <li><b style="color:var(--ai-cream);">Wait one poll cycle</b> — the A350 ATSU polls every ~60s. Your test message may be sitting in the Hoppie queue. AIVA polls every 60s too; hit <b>Poll inbox</b> on the Diagnostics card to force-refresh AIVA's side.</li>
                  <li><b style="color:var(--ai-cream);">Self-ping confirmation</b> — hit <b>Self-ping</b> below. AIVA sends a TELEX from your callsign TO your callsign. If it lands in AIVA's inbox but NOT in the A350 DCDU, the aircraft side isn't logged on. If neither sees it, the logon code is wrong.</li>
                </ol>
              </div>
            </div>
          </details>
        ` }));

        /* ============ ADMIN VIEW ============ */
        if (viewMode === 'admin') {
          const sb_user = P.pref('simbrief_user','');
          /* Pre-fill target form from the active flight if there is one.
             Saves the admin (Gunant) typing his own callsign / route /
             aircraft when he wants to fire a dispatch pack to himself
             during a flight. */
          const fpRecAdm   = P.get('flight_in_progress');
          const activeAdmF = fpRecAdm ? AIVA.findFlight?.(fpRecAdm.fno) : null;
          const todayBk    = (P.get('roster_bookings', []) || []).find(b => b.date === (new Date()).toISOString().slice(0,10));
          const bookFl     = !activeAdmF && todayBk ? AIVA.findFlight?.(todayBk.fno) : null;
          const seedFl     = activeAdmF || bookFl || null;
          const seedCs     = (seedFl?.cs || '').toString().toUpperCase();
          const seedOrig   = (AIVA.airport?.(seedFl?.from)?.icao || seedFl?.from || '').toUpperCase();
          const seedDest   = (AIVA.airport?.(seedFl?.to  )?.icao || seedFl?.to   || '').toUpperCase();
          const seedAc     = seedFl?.ac || '';
          const seedPilot  = (pilot?.name || '').split(' ')[0] || '';
          c.appendChild(el('section', { html: `
            <div class="grid grid-2">
              <div class="card">
                <div class="eyebrow">Target flight ${seedFl ? `<span class="pill pill-gold" style="font-size:9px;margin-left:8px;">${seedFl.fno} · pre-filled</span>` : ''}</div>
                <div class="grid grid-2 mt-3" style="gap:10px;">
                  <div><div class="label">Pilot callsign</div><input class="input mono" id="atgt" placeholder="AIC366" value="${seedCs}"></div>
                  <div><div class="label">Pilot first name (for goodbye)</div><input class="input" id="apilot" placeholder="Anvit" value="${seedPilot}"></div>
                </div>
                <div class="grid grid-2 mt-3" style="gap:10px;">
                  <div><div class="label">Origin ICAO</div><input class="input mono" id="aorig" placeholder="VIDP" value="${seedOrig}"></div>
                  <div><div class="label">Destination ICAO</div><input class="input mono" id="adest" placeholder="VABB" value="${seedDest}"></div>
                </div>
                <div class="grid grid-2 mt-3" style="gap:10px;">
                  <div><div class="label">Aircraft type</div><select class="input" id="aac">${AIVA.fleetTypes().map(t=>`<option value="${t}"${t===seedAc?' selected':''}>${t} · ${AIVA.acTypeName(t)}</option>`).join('')}</select></div>
                  <div><div class="label">SimBrief username</div><input class="input mono" id="asb" value="${sb_user}" placeholder="set in Profile"></div>
                </div>
              </div>

              <div class="card">
                <div class="eyebrow">Auto-dispatch panel</div>
                <p class="text-mute mt-2" style="font-size:12px;line-height:1.55;">Each button parses real data + sends via Hoppie. Multi-leg: if the pilot has a next sector on the roster with the same callsign, the next event auto-rolls.</p>
                <div class="col gap-2 mt-3">
                  <button class="btn btn-primary btn-sm" data-act="preflight">${I('send',14)} Send pre-flight pack (SimBrief)</button>
                  <button class="btn btn-primary btn-sm" data-act="weather">${I('cloud',14)} Check + send weather warning</button>
                  <button class="btn btn-primary btn-sm" data-act="arrival">${I('plane',14)} Send arrival gate (10k ft trigger)</button>
                  <button class="btn btn-primary btn-sm" data-act="goodbye">${I('check',14)} Send landing goodbye</button>
                  <button class="btn btn-ghost btn-sm" data-act="nextleg">${I('refresh',14)} Roll to next sector (multi-leg)</button>
                </div>
                <div id="aFeedback" class="text-mute mono mt-3" style="font-size:11px;min-height:14px;"></div>
              </div>
            </div>

            <div class="grid grid-2 mt-4">
              <div class="card">
                <div class="eyebrow">Manual send</div>
                <div class="grid grid-2 mt-3" style="gap:10px;">
                  <div><div class="label">Type</div><select class="input" id="atype">
                    <option value="telex">TELEX</option>
                    <option value="inforeq">INFOREQ</option>
                    <option value="cpdlc">CPDLC</option>
                    <option value="progress">PROGRESS</option>
                  </select></div>
                  <div><div class="label">Quick template</div><select class="input" id="atpl">
                    <option value="">— custom —</option>
                    <option value="CLEARED TO {DEST} VIA FILED ROUTE">CPDLC · CLEARED</option>
                    <option value="CLB FL{ALT}">CPDLC · CLB FL{ALT}</option>
                    <option value="DSC FL{ALT}">CPDLC · DSC FL{ALT}</option>
                    <option value="DCT {WPT}">CPDLC · DCT {WPT}</option>
                    <option value="CONTACT {SECTOR} ON {FREQ}">CPDLC · HANDOFF</option>
                  </select></div>
                </div>
                <div class="mt-3">
                  <div class="label">Body</div>
                  <textarea class="input mono" id="abody" rows="3" placeholder="Free-text…"></textarea>
                </div>
                <button class="btn btn-primary btn-sm mt-3" id="aSendManual">${I('send',14)} Send</button>
              </div>

              <div class="card">
                <div class="eyebrow">Diagnostics</div>
                <div class="row gap-2 mt-3" style="flex-wrap:wrap;">
                  <button class="btn btn-ghost btn-sm" id="hopVerify">${I('shield',14)} Verify logon</button>
                  <button class="btn btn-ghost btn-sm" id="hopSelfPing">${I('star',14)} Self-ping</button>
                  <button class="btn btn-ghost btn-sm" id="hopPoll">${I('refresh',14)} Poll inbox</button>
                </div>
                <div class="text-mute mono mt-3" id="hopAutoStatus" style="font-size:11px;">auto-poll: ${code ? 'ON (60s)' : 'off'}</div>
              </div>
            </div>

            <div class="section-title mt-6"><div><h3 style="margin:0;">Message log</h3></div></div>
            <div class="card mt-3"><div id="hopLog" class="hop-log"></div></div>
          `}));

          /* Auto-dispatch handlers */
          const fb = $('#aFeedback', c);
          const setFB = (s) => fb.textContent = s;

          async function doPreflight() {
            /* Target defaults to your own active-flight callsign if the field
               is empty — same flow Gunant uses to fire the pack to his own
               cockpit. SimBrief username defaults to the Profile pref so the
               admin doesn't have to retype it. */
            const to   = ($('#atgt', c).value.trim().toUpperCase()) || myCall;
            const sb   = $('#asb', c).value.trim() || P.pref('simbrief_user','');
            if (!sb) { setFB('No SimBrief username — set one in Profile or type it above'); return; }
            if (!to) { setFB('No pilot callsign — type one above or book a flight'); return; }
            setFB(`Fetching SimBrief OFP for ${sb}…`);
            try {
              const ofp = await AIVA.Dispatch.fetchSimbriefOFP(sb);
              const body = AIVA.Dispatch.preflightPack(ofp);
              const r = await hopSend({ from: myCall, to, type:'telex', body });
              setFB(r.ok ? `✓ Pre-flight pack sent ${myCall} → ${to} (${ofp.flightNo})` : `✗ Hoppie: ${r.error}`);
              /* Save the dispatch target so FSUIPC auto-fire knows who to address */
              AIVA.Store.set('dispatch_target', {
                callsign: to,
                pilotFirstName: $('#apilot', c).value.trim(),
                dest: ofp.destination || $('#adest', c).value.trim().toUpperCase(),
                ac:   $('#aac', c).value,
                fno:  ofp.flightNo,
                ofp,
              });
              refreshLog();
            } catch (e) { setFB('SimBrief error: ' + e.message); }
          }
          async function doWeather() {
            const to = $('#atgt', c).value.trim().toUpperCase();
            const dest = $('#adest', c).value.trim().toUpperCase();
            if (!to || !dest) { setFB('Need pilot callsign + destination ICAO'); return; }
            setFB('Fetching METAR…');
            try {
              const wx = await AIVA.Dispatch.fetchMETAR(dest);
              if (!wx) { setFB('No METAR found for ' + dest); return; }
              if (wx.severity.level === 'OK') { setFB(`${dest} weather is OK — no warning sent`); return; }
              const body = AIVA.Dispatch.weatherWarning(dest, wx);
              const r = await hopSend({ from: myCall, to, type:'inforeq', body });
              setFB(r.ok ? `✓ ${wx.severity.level} weather alert for ${dest} sent to ${to}` : `✗ ${r.error}`);
              refreshLog();
            } catch (e) { setFB('Weather error: ' + e.message); }
          }
          async function doArrival() {
            const to = $('#atgt', c).value.trim().toUpperCase();
            const dest = $('#adest', c).value.trim().toUpperCase();
            const ac = $('#aac', c).value;
            const first = $('#apilot', c).value.trim();
            if (!to || !dest) { setFB('Need pilot callsign + destination'); return; }
            /* Map ICAO -> IATA for gate lookup */
            const a = AIVA.airportByIcao(dest) || AIVA.airport(dest);
            const iata = a?.iata || dest;
            const body = AIVA.Dispatch.arrivalGate(iata, ac, first);
            if (!body) { setFB('No gate data for ' + iata); return; }
            const r = await hopSend({ from: myCall, to, type:'telex', body });
            setFB(r.ok ? `✓ Arrival gate sent for ${iata}` : `✗ ${r.error}`);
            refreshLog();
          }
          async function doGoodbye() {
            const to = $('#atgt', c).value.trim().toUpperCase();
            const first = $('#apilot', c).value.trim();
            const dest = $('#adest', c).value.trim().toUpperCase();
            const a = AIVA.airportByIcao(dest) || AIVA.airport(dest);
            const iata = a?.iata || dest;
            const body = AIVA.Dispatch.goodbye(first, iata);
            const r = await hopSend({ from: myCall, to, type:'telex', body });
            setFB(r.ok ? `✓ Goodbye sent to Capt ${first || to}` : `✗ ${r.error}`);
            refreshLog();
          }
          async function doNextLeg() {
            /* Look up the pilot's bookings (per pilot store) and find next leg
               that hasn't been flown yet matching the current callsign suffix. */
            const callsign = $('#atgt', c).value.trim().toUpperCase();
            const num = (callsign.match(/(\d+)$/) || [,''])[1];
            const today = ymd();
            /* Find which AIVA pilot has this callsign — we cross-check the
               admin's bookings AND the addressed pilot's bookings if we know. */
            const allPilots = AIVA.Auth.allPilots();
            let nextLeg = null, nextDate = null;
            for (const p of allPilots) {
              const bks = AIVA.Store.pilot(p.id).get('roster_bookings', [])
                .filter(b => b.date >= today)
                .sort((a,b) => a.date.localeCompare(b.date) || (AIVA.findFlight(a.fno)?.dep||'').localeCompare(AIVA.findFlight(b.fno)?.dep||''));
              const idx = bks.findIndex(b => b.fno.endsWith(num));
              if (idx !== -1 && bks[idx+1]) { nextLeg = bks[idx+1]; nextDate = nextLeg.date; break; }
            }
            if (!nextLeg) { setFB('No next sector found for ' + callsign); return; }
            const f = AIVA.findFlight(nextLeg.fno);
            if (!f) { setFB('Next sector ' + nextLeg.fno + ' has no flight data'); return; }
            const aOrig = AIVA.airport(f.from), aDest = AIVA.airport(f.to);
            $('#aorig', c).value = aOrig?.icao || f.from;
            $('#adest', c).value = aDest?.icao || f.to;
            $('#aac',   c).value = f.ac;
            $('#atgt',  c).value = 'AIC' + (nextLeg.fno.match(/(\d+)$/)||[,''])[1];
            setFB(`Rolled to next leg · ${f.fno} ${f.from}→${f.to} (${nextDate})`);
          }

          c.querySelector('[data-act="preflight"]').onclick = doPreflight;
          c.querySelector('[data-act="weather"]').onclick   = doWeather;
          c.querySelector('[data-act="arrival"]').onclick   = doArrival;
          c.querySelector('[data-act="goodbye"]').onclick   = doGoodbye;
          c.querySelector('[data-act="nextleg"]').onclick   = doNextLeg;

          /* Quick-template wiring */
          $('#atpl', c).onchange = (e) => {
            let v = e.target.value;
            if (!v) return;
            v = v.replace(/\{DEST\}/g, () => ($('#adest', c).value || '?').toUpperCase());
            v = v.replace(/\{ALT\}/g, () => prompt('Flight level (e.g. 350)?') || '350');
            v = v.replace(/\{WPT\}/g, () => prompt('Waypoint?') || 'XXX');
            v = v.replace(/\{SECTOR\}/g, () => prompt('Next sector?') || 'CENTER');
            v = v.replace(/\{FREQ\}/g, () => prompt('Frequency?') || '125.50');
            $('#atype', c).value = 'cpdlc';
            $('#abody', c).value = v;
          };
          $('#aSendManual', c).onclick = async () => {
            const to = $('#atgt', c).value.trim().toUpperCase();
            const type = $('#atype', c).value;
            const body = $('#abody', c).value.trim();
            if (!to || !body) { setFB('Need pilot callsign + body'); return; }
            const r = await hopSend({ from: myCall, to, type, body });
            setFB(r.ok ? `✓ Sent to ${to}` : `✗ ${r.error}`);
            $('#abody', c).value = '';
            refreshLog();
          };

          /* Diagnostics */
          $('#hopVerify', c).onclick = async () => {
            if (!code) { toast('No logon code', 'bad'); return; }
            const r = await hopSend({ from: myCall, to:'SERVER', type:'ping', body:'' });
            $('#hopLogonBadge', c).textContent = r.ok ? 'LOGON ✓' : 'LOGON ✗';
            $('#hopLogonBadge', c).className = 'pill ' + (r.ok ? 'pill-gold' : 'pill-red');
            toast(r.ok ? 'Logon valid' : ('Hoppie: ' + r.error), r.ok ? 'ok' : 'bad');
          };
          $('#hopSelfPing', c).onclick = async () => {
            const stamp = new Date().toISOString().slice(11,19);
            const r = await hopSend({ from: myCall, to: myCall, type:'telex', body:`AIVA SELF-PING @ ${stamp}Z` });
            if (r.ok) { toast('Self-ping sent · polling in 2s', 'ok'); setTimeout(() => hopPoll(false), 2000); }
            else toast(r.error, 'bad');
          };
          $('#hopPoll', c).onclick = () => hopPoll(false);
        }

        /* ============ PILOT VIEW (simplified) ============
           Three clean panels:
             1. INBOX  — auto-arrived messages (dispatch SimBrief packs,
                weather warnings, 10k auto-progress) + replies from crew.
             2. OUTBOX — everything you've sent.
             3. SEND   — pick a crew member, type, hit send. No callsign
                memorisation needed; we render the live AIVA crew roster
                in a dropdown.
           Diagnostics + auto-poll status sit in a slim footer card. */
        if (viewMode === 'pilot') {
          /* Build the "to" dropdown options — every other AIVA pilot
             with their derived AIC callsign, plus a free-text option. */
          const crew = (AIVA.Auth.allPilots() || []).filter(p => p.id !== pilot.id);
          const csFor = (p) => {
            const digits = (p.id || '').replace(/[^0-9]/g, '');
            return 'AIC' + (digits ? digits.slice(-3).padStart(3, '0') : '100');
          };
          const crewOpts = crew.map(p => `<option value="${csFor(p)}">${csFor(p)} · ${p.name}${p.role==='admin'?' (Dispatch)':''}</option>`).join('');

          c.appendChild(el('section', { html: `
            <div class="grid grid-2">
              <!-- INBOX -->
              <div class="card" style="display:flex;flex-direction:column;">
                <div class="row between" style="align-items:center;">
                  <div class="eyebrow" style="color:var(--ai-gold-bright);">Inbox · received</div>
                  <div class="row gap-1">
                    <span class="pill" id="inboxCount" style="font-size:10px;">0</span>
                    <button class="btn btn-ghost btn-sm" id="hopPoll2" title="Poll Hoppie now">${I('refresh',12)}</button>
                  </div>
                </div>
                <div id="pInbox" class="col gap-2 mt-3" style="max-height:520px;overflow-y:auto;flex:1;">
                  <div class="text-mute" style="font-size:12px;">Loading…</div>
                </div>
                <div class="row between mt-3" style="padding-top:10px;border-top:1px solid var(--border);">
                  <span class="text-mute mono" style="font-size:10.5px;">${code ? 'auto-poll · 60s' : 'no logon code'}</span>
                  <button class="btn btn-ghost btn-sm" id="prAckAll">${I('check',12)} Ack all</button>
                </div>
              </div>

              <!-- OUTBOX -->
              <div class="card" style="display:flex;flex-direction:column;">
                <div class="row between" style="align-items:center;">
                  <div class="eyebrow" style="color:#A8101F;">Outbox · sent</div>
                  <span class="pill" id="outboxCount" style="font-size:10px;">0</span>
                </div>
                <div id="pOutbox" class="col gap-2 mt-3" style="max-height:520px;overflow-y:auto;flex:1;">
                  <div class="text-mute" style="font-size:12px;">Loading…</div>
                </div>
              </div>
            </div>

            <!-- SEND PANEL -->
            <div class="card mt-4">
              <div class="row between" style="align-items:center;flex-wrap:wrap;gap:8px;">
                <div>
                  <div class="eyebrow">Send message</div>
                  <div class="text-mute" style="font-size:11.5px;margin-top:2px;">From <b class="mono" style="color:var(--ai-cream);">${myCall}</b> · pick a crew member or type a callsign</div>
                </div>
                <div class="row gap-2">
                  <button class="btn btn-ghost btn-sm" id="hopVerify2" title="Test that AIVA can reach Hoppie">${I('shield',12)} Verify logon</button>
                  <button class="btn btn-ghost btn-sm" id="hopSelfPing2" title="Send a TELEX from you → to you. Lands in your inbox AND in your aircraft DCDU if everything's wired right.">${I('star',12)} Self-ping</button>
                </div>
              </div>
              <div class="grid grid-3 mt-3" style="gap:10px;">
                <div>
                  <div class="label">To · crew member</div>
                  <select class="input" id="prToSelect">
                    <option value="">— pick crew —</option>
                    ${crewOpts}
                    <option value="__custom__">Other callsign…</option>
                  </select>
                </div>
                <div>
                  <div class="label">Or callsign (free text)</div>
                  <input class="input mono" id="prTo" placeholder="e.g. AIC001 or KZNY">
                </div>
                <div>
                  <div class="label">Type</div>
                  <select class="input" id="prType">
                    <option value="telex">TELEX (chat)</option>
                    <option value="inforeq">INFOREQ (request)</option>
                    <option value="cpdlc">CPDLC (ATC)</option>
                    <option value="progress">PROGRESS report</option>
                  </select>
                </div>
              </div>
              <div class="mt-3">
                <div class="label">Message</div>
                <textarea class="input mono" id="prBody" rows="3" placeholder="Type your message — e.g. 'INBOUND HYD ETA 1340Z, REQUEST GATE ASSIGNMENT'"></textarea>
              </div>
              <div class="row gap-2 mt-3" style="flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" id="prSend">${I('send',14)} Send</button>
                <span class="text-mute mono" style="font-size:11px;align-self:center;">Most pilots use TELEX for crew chat, INFOREQ for ATIS/METAR requests, CPDLC for controller messages.</span>
              </div>
            </div>
          `}));

          /* Wire the crew dropdown → callsign field. Picking a crew member
             fills the free-text box. "Other callsign…" clears it for manual
             entry. Keeps the simpler "type a callsign" path available for
             ATC / external addressees. */
          const ddl = $('#prToSelect', c);
          ddl.onchange = () => {
            if (ddl.value === '__custom__') { $('#prTo', c).value = ''; $('#prTo', c).focus(); }
            else if (ddl.value) $('#prTo', c).value = ddl.value;
          };

          /* Render inbox: show incoming messages with ACCEPT / REJECT / REPLY */
          function refreshInbox() {
            const inbox = AIVA.Store.get('hoppie_log', []).filter(m => m.dir === 'rx').slice().reverse();
            const countEl = $('#inboxCount', c); if (countEl) countEl.textContent = inbox.length;
            const host = $('#pInbox', c);
            if (!inbox.length) { host.innerHTML = '<div class="text-mute" style="font-size:12px;padding:8px;">No incoming messages yet. Auto-poll runs every 60s — dispatch packs and 10k progress reports land here automatically.</div>'; return; }
            host.innerHTML = inbox.map((m, idx) => {
              const isCpdlc = m.type === 'cpdlc';
              const status = m.acked ? 'ACK' : isCpdlc ? 'PENDING' : 'NEW';
              const statusClass = m.acked ? 'pill-gold' : isCpdlc ? 'pill-red' : 'pill-red';
              return `
                <div class="hop-row hop-rx" data-msg="${m.ts}">
                  <div class="hop-meta">
                    <span class="pill ${statusClass}" style="font-size:9.5px;">${status}</span>
                    <span class="mono"><b>${m.from}</b> → ${m.to}</span>
                    <span class="mono text-mute" style="font-size:11px;">${m.type?.toUpperCase()}</span>
                    <span class="mono text-mute" style="font-size:11px;margin-left:auto;">${new Date(m.ts).toLocaleTimeString()}</span>
                  </div>
                  <pre class="hop-body">${(m.body||'').replace(/</g,'&lt;')}</pre>
                  ${!m.acked ? `
                    <div class="row gap-2 mt-2" style="flex-wrap:wrap;">
                      ${isCpdlc
                        ? `<button class="btn btn-primary btn-sm" data-act="accept">${I('check',14)} WILCO/ACCEPT</button>
                           <button class="btn btn-ghost btn-sm" data-act="standby">STANDBY</button>
                           <button class="btn btn-ghost btn-sm" data-act="unable">UNABLE/REJECT</button>`
                        : `<button class="btn btn-primary btn-sm" data-act="accept">${I('check',14)} Acknowledge</button>`}
                      <button class="btn btn-ghost btn-sm" data-act="reply">${I('send',14)} Reply</button>
                    </div>` : ''}
                </div>`;
            }).join('');
            /* Wire per-message buttons */
            host.querySelectorAll('.hop-row').forEach(row => {
              const ts = +row.dataset.msg;
              const msg = inbox.find(m => m.ts === ts);
              row.querySelectorAll('[data-act]').forEach(btn => btn.onclick = async () => {
                const act = btn.dataset.act;
                if (act === 'accept' || act === 'standby' || act === 'unable') {
                  const respMap = { accept:'WILCO', standby:'STANDBY', unable:'UNABLE' };
                  const replyBody = msg.type === 'cpdlc' ? respMap[act] : 'ROGER';
                  const r = await hopSend({ from: myCall, to: msg.from, type: msg.type === 'cpdlc' ? 'cpdlc' : 'telex', body: replyBody });
                  if (r.ok) {
                    /* Mark this inbox item as acked */
                    const log = AIVA.Store.get('hoppie_log', []);
                    const target = log.find(m => m.ts === ts);
                    if (target) target.acked = true;
                    AIVA.Store.set('hoppie_log', log);
                    refreshInbox(); refreshLog();
                    toast(`Sent ${replyBody}`, 'ok');
                  } else toast(r.error, 'bad');
                }
                if (act === 'reply') {
                  $('#prTo', c).value = msg.from;
                  $('#prType', c).value = msg.type === 'cpdlc' ? 'cpdlc' : 'telex';
                  $('#prBody', c).focus();
                }
              });
            });
          }

          /* Render outbox — what this pilot has sent. Newest first. */
          function refreshOutbox() {
            const out = AIVA.Store.get('hoppie_log', []).filter(m => m.dir === 'tx').slice().reverse();
            const countEl = $('#outboxCount', c); if (countEl) countEl.textContent = out.length;
            const host = $('#pOutbox', c);
            if (!host) return;
            if (!out.length) { host.innerHTML = '<div class="text-mute" style="font-size:12px;padding:8px;">Nothing sent yet. Use the Send card below to message any pilot or dispatch.</div>'; return; }
            host.innerHTML = out.map(m => {
              const ok = m.hoppie === 'ok';
              return `
                <div class="hop-row hop-tx">
                  <div class="hop-meta">
                    <span class="pill ${ok ? 'pill-gold' : 'pill-red'}" style="font-size:9.5px;">${ok ? 'SENT' : (m.hoppie || 'ERR').toUpperCase()}</span>
                    <span class="mono"><b>${m.from || myCall}</b> → ${m.to}</span>
                    <span class="mono text-mute" style="font-size:11px;">${m.type?.toUpperCase()}</span>
                    ${m.auto ? '<span class="pill" style="font-size:9px;">AUTO</span>' : ''}
                    <span class="mono text-mute" style="font-size:11px;margin-left:auto;">${new Date(m.ts).toLocaleTimeString()}</span>
                  </div>
                  <pre class="hop-body">${(m.body||'').replace(/</g,'&lt;')}</pre>
                  ${m.error ? `<div class="hop-err">⚠ ${m.error}</div>` : ''}
                </div>`;
            }).join('');
          }

          $('#prSend', c).onclick = async () => {
            const to = $('#prTo', c).value.trim().toUpperCase();
            const type = $('#prType', c).value;
            const body = $('#prBody', c).value.trim();
            if (!to)   { toast('Pick a crew member or type a callsign', 'bad'); return; }
            if (!body) { toast('Message body is empty', 'bad'); return; }
            const r = await hopSend({ from: myCall, to, type, body });
            if (r.ok) {
              toast(`Sent to ${to}`, 'ok');
              $('#prBody', c).value = '';
              refreshOutbox(); refreshLog();
            } else toast('Hoppie: ' + r.error, 'bad', 6000);
          };
          $('#hopPoll2', c).onclick = () => hopPoll(false);
          $('#prAckAll', c).onclick = () => {
            const log = AIVA.Store.get('hoppie_log', []);
            log.filter(m => m.dir === 'rx').forEach(m => m.acked = true);
            AIVA.Store.set('hoppie_log', log);
            refreshInbox();
            toast('All messages acknowledged', 'ok');
          };

          /* Pilot-side diagnostics (mirrors the admin-view buttons).
             Verify logon proves AIVA can reach Hoppie at all. Self-ping
             sends a TELEX from your callsign TO your callsign — if it
             lands in AIVA's inbox but doesn't appear in your aircraft
             DCDU/AOC pages within ~60s, the cockpit ATSU isn't logged on
             with the same logon code. */
          $('#hopVerify2', c).onclick = async () => {
            if (!code) { toast('No logon code set in Profile', 'bad'); return; }
            const r = await hopSend({ from: myCall, to:'SERVER', type:'ping', body:'' });
            $('#hopLogonBadge', c).textContent = r.ok ? 'LOGON ✓' : 'LOGON ✗';
            $('#hopLogonBadge', c).className   = 'pill ' + (r.ok ? 'pill-gold' : 'pill-red');
            toast(r.ok ? 'Hoppie logon valid' : ('Hoppie: ' + r.error), r.ok ? 'ok' : 'bad');
          };
          $('#hopSelfPing2', c).onclick = async () => {
            if (!code) { toast('No logon code set in Profile', 'bad'); return; }
            /* Three-step self-ping:
                 1. Send a TELEX from myCall → myCall.
                 2. Poll Hoppie for messages addressed to myCall.
                 3. Report which steps succeeded so the pilot knows
                    whether it's a SEND problem, a POLL problem, or
                    a "Hoppie doesn't queue self-messages" quirk.
               This is much more diagnostic than a single fire-and-
               hope-it-comes-back attempt. */
            toast('Self-ping running — sending, polling, reporting…', 'ok', 3000);
            const stamp = new Date().toISOString().slice(11,19);
            const probe = `AIVA SELF-PING @ ${stamp}Z`;
            const sendR = await hopSend({ from: myCall, to: myCall, type:'telex', body: `${probe} · if this appears in your cockpit DCDU, Hoppie is wired correctly` });
            refreshOutbox();
            if (!sendR.ok) {
              toast(`✗ SEND failed: ${sendR.error}. Hoppie can't accept messages — check logon code + proxy.`, 'bad', 9000);
              return;
            }
            /* Wait 2 s for Hoppie to enqueue, then poll. */
            await new Promise(r => setTimeout(r, 2000));
            const before = AIVA.Store.get('hoppie_log', []).filter(m => m.dir==='rx').length;
            await hopPoll(true);
            const after  = AIVA.Store.get('hoppie_log', []).filter(m => m.dir==='rx').length;
            refreshInbox();
            if (after > before) {
              toast('✓ Self-ping round-tripped — AIVA → Hoppie → AIVA confirmed. Now watch your cockpit DCDU for the same message (~60s for ATSU poll).', 'ok', 9000);
            } else {
              toast(`✓ SEND ok, but POLL returned no message in 2s. Hoppie may not queue self-loops (some networks block from===to), OR the cockpit will see it on its next poll. Send a normal TELEX to another crew member to confirm full round-trip.`, 'warn', 12000);
            }
          };
          refreshInbox();
          refreshOutbox();
        }

        /* ============ Shared log renderer ============ */
        function refreshLog() {
          const log = AIVA.Store.get('hoppie_log', []);
          const host = $('#hopLog', c);
          if (!host) return;
          if (!log.length) { host.innerHTML = `<div class="text-mute" style="padding:18px;text-align:center;font-size:12.5px;">No messages yet.</div>`; return; }
          host.innerHTML = log.slice().reverse().map(m => {
            const hoppiePill = m.dir === 'tx'
              ? (m.hoppie === 'ok'
                  ? `<span class="pill pill-gold" style="font-size:9px;">Hoppie:ok</span>`
                  : m.hoppie ? `<span class="pill pill-red" style="font-size:9px;">Hoppie:${m.hoppie}</span>` : '')
              : (m.acked ? `<span class="pill pill-gold" style="font-size:9px;">ACK</span>` : '');
            return `
              <div class="hop-row hop-${m.dir}">
                <div class="hop-meta">
                  <span class="pill ${m.dir === 'tx' ? 'pill-red' : 'pill-gold'}" style="font-size:9.5px;">${m.dir === 'tx' ? 'OUT' : 'IN'}</span>
                  <span class="mono">${m.from || myCall} → ${m.to}</span>
                  <span class="mono text-mute" style="font-size:11px;">${m.type?.toUpperCase()}</span>
                  ${hoppiePill}
                  <span class="mono text-mute" style="font-size:11px;margin-left:auto;">${new Date(m.ts).toLocaleTimeString()}</span>
                </div>
                <pre class="hop-body">${(m.body || '').replace(/</g,'&lt;')}</pre>
                ${m.error ? `<div class="hop-err">⚠ ${m.error}</div>` : ''}
              </div>`;
          }).join('');
        }
        refreshLog();

        /* Auto-poll every 60s while on this page */
        let timer = null;
        if (code) {
          timer = setInterval(() => hopPoll(true), 60_000);
        }
        const cleanup = () => { if (timer) { clearInterval(timer); timer = null; } window.removeEventListener('hashchange', cleanup); };
        window.addEventListener('hashchange', cleanup);
      }
    },


    /* ============ RANKS ============ */
    /* ============ REVIEW QUEUE (admin only) ============ */
    review: {
      sub: 'Pending claims · accept / reject',
      render: (c) => {
        if (pilot.role !== 'admin') {
          c.appendChild(el('div', { class:'card', html:'<b>Access denied.</b> The Review Queue is admin-only.' }));
          return;
        }
        const all = getClaims();
        const pending  = all.filter(x => x.status === 'pending');
        const accepted = all.filter(x => x.status === 'accepted');
        const rejected = all.filter(x => x.status === 'rejected');
        /* Crew inquiries: prospective pilots who tapped "Request crew access"
           on the login page. Source = inquiry_tab in the payload. */
        const inquiries = AIVA.Store.get('crew_inquiries', []) || [];
        const inqPending = inquiries.filter(x => (x.status || 'pending') === 'pending');
        /* Filed flight plans: pilots build SimBrief-style plans on the
           OFP page; they land here so the Chief Pilot can sanity-check
           long-haul / international routes before they're flown. */
        const filedPlans = AIVA.Store.get('flight_plans_queue', []) || [];
        const fpOpen = filedPlans.filter(x => (x.status || 'filed') !== 'archived');

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Review Queue</h2><div class="sub">${pending.length} claim${pending.length===1?'':'s'} · ${inqPending.length} inquir${inqPending.length===1?'y':'ies'} pending</div></div>
          </div>

          ${inquiries.length ? `
            <div class="card mb-4" style="padding:18px;">
              <div class="row between mb-3">
                <div>
                  <h3 style="margin:0;font-size:16px;">Crew inquiries</h3>
                  <div class="text-mute" style="font-size:11.5px;">From the public Request-Access tab. Email-relay also fires to your inbox.</div>
                </div>
                <span class="pill pill-gold" style="font-size:10px;">${inqPending.length} PENDING</span>
              </div>
              <div id="inqList"></div>
            </div>
          ` : ''}

          ${filedPlans.length ? `
            <div class="card mb-4" style="padding:18px;">
              <div class="row between mb-3">
                <div>
                  <h3 style="margin:0;font-size:16px;">Filed flight plans</h3>
                  <div class="text-mute" style="font-size:11.5px;">SimBrief-style plans pilots filed on the OFP page (callsign-restricted to AIC / AXB).</div>
                </div>
                <span class="pill pill-gold" style="font-size:10px;">${fpOpen.length} OPEN</span>
              </div>
              <div id="fpList"></div>
            </div>
          ` : ''}

          <div class="row gap-2 mb-3" id="rqTabs">
            <button class="ac-chip on" data-tab="pending">Pending · ${pending.length}</button>
            <button class="ac-chip" data-tab="accepted">Accepted · ${accepted.length}</button>
            <button class="ac-chip" data-tab="rejected">Rejected · ${rejected.length}</button>
          </div>
          <div id="rqList"></div>
        ` }));

        /* ===== Crew-inquiry renderer ===== */
        function renderInquiries() {
          const host = $('#inqList', c);
          if (!host) return;
          const all = (AIVA.Store.get('crew_inquiries', []) || []).slice().reverse();
          if (!all.length) {
            host.innerHTML = `<div class="text-mute" style="font-size:12.5px;padding:8px 4px;">No inquiries yet.</div>`;
            return;
          }
          host.innerHTML = all.map(x => {
            const status = x.status || 'pending';
            return `
              <div class="card mt-2" data-inq="${x.id}" style="padding:14px 16px;${status==='pending'?'border-color:rgba(255,225,89,.32);':''}">
                <div class="row between">
                  <div>
                    <div class="display" style="font-size:15px;font-weight:600;">${x.name || '—'}</div>
                    <div class="text-mute mono" style="font-size:11.5px;margin-top:2px;">${x.email || '—'} · ${new Date(x.ts).toLocaleString()}</div>
                  </div>
                  <span class="pill ${status==='pending'?'pill-gold':status==='contacted'?'pill-ok':''}" style="font-size:9px;">${status.toUpperCase()}</span>
                </div>
                <div class="mt-2" style="font-size:12.5px;line-height:1.6;"><b>Experience:</b> ${x.exp || '—'}</div>
                <div class="mt-1" style="font-size:12.5px;line-height:1.6;"><b>Why AIVA:</b> ${(x.msg || '').replace(/</g,'&lt;')}</div>
                <div class="row gap-2 mt-3">
                  ${status === 'pending' ? `
                    <a class="btn btn-primary btn-sm" href="mailto:${x.email}?subject=Re: AIVA crew inquiry&body=Hi ${(x.name||'').split(' ')[0]}%2C%0A%0A">${I('plane', 12)} Reply</a>
                    <button class="btn btn-ghost btn-sm" data-act="contact">Mark contacted</button>
                    <button class="btn btn-ghost btn-sm" data-act="dismiss">Dismiss</button>
                  ` : `
                    <button class="btn btn-ghost btn-sm" data-act="reopen">Reopen</button>
                    <button class="btn btn-ghost btn-sm" data-act="delete">Delete</button>
                  `}
                </div>
              </div>
            `;
          }).join('');
          host.querySelectorAll('[data-inq]').forEach(card => {
            const id = card.dataset.inq;
            const upd = (status) => {
              const list = AIVA.Store.get('crew_inquiries', []) || [];
              const idx = list.findIndex(x => x.id === id);
              if (idx < 0) return;
              list[idx].status = status;
              list[idx].decidedAt = Date.now();
              AIVA.Store.set('crew_inquiries', list);
              renderInquiries();
              buildNav();
            };
            const del = () => {
              const list = (AIVA.Store.get('crew_inquiries', []) || []).filter(x => x.id !== id);
              AIVA.Store.set('crew_inquiries', list);
              renderInquiries();
              buildNav();
            };
            card.querySelector('[data-act="contact"]')?.addEventListener('click', () => upd('contacted'));
            card.querySelector('[data-act="dismiss"]')?.addEventListener('click', () => upd('dismissed'));
            card.querySelector('[data-act="reopen"]')?.addEventListener('click', () => upd('pending'));
            card.querySelector('[data-act="delete"]')?.addEventListener('click', () => { if (confirm('Delete this inquiry permanently?')) del(); });
          });
        }
        renderInquiries();

        /* ===== Filed-flight-plan renderer ===== */
        function renderFiledPlans() {
          const host = $('#fpList', c);
          if (!host) return;
          const all = (AIVA.Store.get('flight_plans_queue', []) || []).slice().reverse();
          if (!all.length) {
            host.innerHTML = `<div class="text-mute" style="font-size:12.5px;padding:8px 4px;">No plans filed.</div>`;
            return;
          }
          host.innerHTML = all.map(x => {
            const status = x.status || 'filed';
            return `
              <div class="card mt-2" data-fp="${x.id}" style="padding:14px 16px;${status==='filed'?'border-color:rgba(255,225,89,.32);':''}">
                <div class="row between">
                  <div>
                    <div class="display" style="font-size:14px;font-weight:600;"><span class="mono" style="color:var(--ai-gold);">${x.cs}</span> · ${x.from} → ${x.to}${x.altn ? ' · ALTN ' + x.altn : ''}</div>
                    <div class="text-mute mono" style="font-size:11px;margin-top:3px;">${x.pilotName} (${x.pilotId}) · ${x.ac}${x.reg ? ' · ' + x.reg : ''} · FL${x.fl} · CI ${x.ci} · ${x.pax} PAX · filed ${new Date(x.ts).toLocaleString()}</div>
                  </div>
                  <span class="pill ${status==='filed'?'pill-gold':status==='approved'?'pill-ok':''}" style="font-size:9px;">${status.toUpperCase()}</span>
                </div>
                ${x.route ? `<div class="mono mt-2" style="font-size:11.5px;white-space:pre-wrap;color:var(--text-dim);"><b>RTE</b> ${x.route}</div>` : ''}
                ${x.remarks ? `<div class="mono mt-1" style="font-size:11.5px;color:var(--text-dim);"><b>RMK</b> ${x.remarks}</div>` : ''}
                <div class="row gap-2 mt-3">
                  ${status === 'filed' ? `
                    <button class="btn btn-primary btn-sm" data-act="approve">${I('check', 12)} Approve</button>
                    <button class="btn btn-ghost btn-sm" data-act="archive">Archive</button>
                  ` : `
                    <button class="btn btn-ghost btn-sm" data-act="reopen">Reopen</button>
                  `}
                </div>
              </div>
            `;
          }).join('');
          host.querySelectorAll('[data-fp]').forEach(card => {
            const id = card.dataset.fp;
            const upd = (status) => {
              const list = AIVA.Store.get('flight_plans_queue', []) || [];
              const idx = list.findIndex(x => x.id === id);
              if (idx < 0) return;
              list[idx].status = status;
              list[idx].decidedAt = Date.now();
              list[idx].decidedBy = pilot.id;
              AIVA.Store.set('flight_plans_queue', list);
              renderFiledPlans();
            };
            card.querySelector('[data-act="approve"]')?.addEventListener('click', () => upd('approved'));
            card.querySelector('[data-act="archive"]')?.addEventListener('click', () => upd('archived'));
            card.querySelector('[data-act="reopen"]')?.addEventListener('click', () => upd('filed'));
          });
        }
        renderFiledPlans();

        const renderList = (filter) => {
          const list = all.filter(x => x.status === filter);
          const host = $('#rqList', c);
          if (!list.length) { host.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--text-mute);">Nothing ${filter}.</div>`; return; }
          host.innerHTML = list.slice().reverse().map(x => {
            const p = x.payload || {};
            const isManual = x.type === 'manual_flight';
            const isCrash  = x.type === 'crash_report';
            const headLine = isManual
              ? `${p.fno} · ${p.from} → ${p.to} · ${p.date} · ${p.ac}/${p.reg || '—'}`
              : `${p.fno} · CRASH · ${p.cause}`;
            return `
              <div class="card mt-3" data-cid="${x.id}">
                <div class="row between">
                  <div>
                    <div class="eyebrow">${isManual ? 'MANUAL FLIGHT CLAIM' : 'SIM CRASH REPORT'} · ${x.id}</div>
                    <div class="display" style="font-size:16px;font-weight:600;margin-top:4px;">${headLine}</div>
                    <div class="text-mute" style="font-size:12px;margin-top:4px;">${x.pilotName} (${x.pilotId}) · ${new Date(x.ts).toLocaleString()}</div>
                  </div>
                  <span class="pill ${filter==='pending' ? 'pill-red' : filter==='accepted' ? 'pill-gold' : ''}" style="font-size:10px;">${filter.toUpperCase()}</span>
                </div>

                ${isManual ? `
                  <div class="grid grid-2 mt-3" style="font-size:12.5px;line-height:1.7;">
                    <div><b>Block</b> ${p.block || '—'} · <b>LND</b> ${p.lnd || '—'} fpm · <b>Network</b> ${p.net || '—'}</div>
                    <div><b>Notes</b> ${p.notes || '—'}</div>
                  </div>
                ` : ''}
                ${isCrash ? `
                  <div class="mt-3" style="font-size:12.5px;line-height:1.6;">
                    <b>Last pos:</b> ${p.lastPos || '—'} · <b>Block flown:</b> ${p.block || '—'}<br>
                    <b>Narrative:</b> ${(p.narrative || '').replace(/</g,'&lt;')}
                  </div>
                ` : ''}

                <div class="rq-files mt-3">
                  ${(x.files || []).map((f, fi) => {
                    const isImg = (f.type || '').startsWith('image/');
                    return isImg
                      ? `<a class="rq-thumb" href="${f.dataUrl}" target="_blank" rel="noopener">
                           <img src="${f.dataUrl}" alt="${f.name}">
                           <div class="rq-thumb-cap">${f.name}</div>
                         </a>`
                      : `<a class="rq-file" href="${f.dataUrl}" download="${f.name}">${I('download',12)} ${f.name} <span class="text-mute">(${(f.size/1024).toFixed(1)} KB)</span></a>`;
                  }).join('')}
                </div>

                ${filter === 'pending' ? `
                  <div class="row gap-2 mt-3">
                    <button class="btn btn-primary btn-sm" data-act="accept">${I('check', 14)} Accept</button>
                    <button class="btn btn-ghost btn-sm" data-act="reject">${I('close', 14)} Reject</button>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');
          /* Wire accept/reject */
          host.querySelectorAll('[data-cid]').forEach(card => {
            const id = card.dataset.cid;
            card.querySelector('[data-act="accept"]')?.addEventListener('click', () => decideClaim(id, 'accepted'));
            card.querySelector('[data-act="reject"]')?.addEventListener('click', () => decideClaim(id, 'rejected'));
          });
        };

        function decideClaim(id, decision) {
          const list = getClaims();
          const idx = list.findIndex(x => x.id === id);
          if (idx < 0) return;
          const claim = list[idx];
          claim.status = decision;
          claim.decidedAt = Date.now();
          claim.decidedBy = pilot.id;
          /* If accepted manual_flight, write it to the claiming pilot's logbook */
          if (decision === 'accepted' && claim.type === 'manual_flight') {
            const claimingStore = AIVA.Store.pilot(claim.pilotId);
            const log = claimingStore.get('flights_logged', []);
            const f = AIVA.findFlight(claim.payload.fno);
            log.push({
              date:    claim.payload.date,
              fno:     claim.payload.fno,
              from:    claim.payload.from,
              to:      claim.payload.to,
              ac:      claim.payload.ac,
              reg:     claim.payload.reg,
              dur:     claim.payload.block,
              durMins: (() => { const m = (claim.payload.block || '').split(':'); return (+m[0]||0)*60 + (+m[1]||0); })(),
              lndRate: parseInt(claim.payload.lnd || '0', 10) || 0,
              net:     claim.payload.net,
              dist:    f?.dist || 0,
              notes:   claim.payload.notes,
              source:  'manual_admin_approved',
            });
            claimingStore.set('flights_logged', log);
          }
          /* If accepted crash_report, write it with prorated block */
          if (decision === 'accepted' && claim.type === 'crash_report') {
            const claimingStore = AIVA.Store.pilot(claim.pilotId);
            const log = claimingStore.get('flights_logged', []);
            const f = AIVA.findFlight(claim.payload.fno);
            const m = (claim.payload.block || '0:00').split(':');
            log.push({
              date:    ymd(new Date(claim.ts)),
              fno:     claim.payload.fno,
              from:    f?.from || '?',
              to:      f?.to   || '?',
              ac:      f?.ac   || '?',
              dur:     claim.payload.block,
              durMins: (+m[0]||0)*60 + (+m[1]||0),
              lndRate: 0,
              net:     'OFFLINE',
              dist:    0,
              notes:   '[CRASH-REPORTED] ' + claim.payload.cause + ' · ' + (claim.payload.narrative || ''),
              source:  'crash_admin_approved',
            });
            claimingStore.set('flights_logged', log);
          }
          setClaims(list);
          buildNav();
          route();
          toast(`Claim ${id} ${decision}`, 'ok');
        }

        let tab = 'pending';
        renderList(tab);
        c.querySelectorAll('#rqTabs [data-tab]').forEach(b => b.onclick = () => {
          c.querySelectorAll('#rqTabs [data-tab]').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          tab = b.dataset.tab;
          renderList(tab);
        });

        /* ============ PSR REVIEW QUEUE ============
           Pilot-Service-Reports filed at end of sector. Each PSR contains
           the findings the system detected (overspeed, sharp turns, drops,
           hard landing) plus the pilot's reasoning. Admin can accept or
           reject — accepted PSRs remain in the pilot's log; rejected ones
           are flagged on the pilot's profile. */
        const psrQueue = AIVA.Store.get('admin_psr_queue', []);
        const psrPending  = psrQueue.filter(p => p.status === 'pending');
        const psrAccepted = psrQueue.filter(p => p.status === 'accepted');
        const psrRejected = psrQueue.filter(p => p.status === 'rejected');

        c.appendChild(el('section', { class:'mt-6', html: `
          <div class="section-title">
            <div><h2>PSR Reviews</h2><div class="sub">${psrPending.length} pending · ${psrAccepted.length} accepted · ${psrRejected.length} rejected</div></div>
          </div>
          <div id="psrList"></div>
        `}));

        const renderPSR = () => {
          const list = AIVA.Store.get('admin_psr_queue', []);
          const host = $('#psrList', c);
          host.innerHTML = list.length ? list.slice().reverse().map(p => `
            <div class="card mt-3" data-psr="${p.id}">
              <div class="row between">
                <div>
                  <div class="eyebrow">PSR · ${p.id.slice(0,8)}</div>
                  <div class="display" style="font-size:16px;font-weight:600;margin-top:4px;">${p.fno} · ${p.from} → ${p.to} · ${p.ac}</div>
                  <div class="text-mute" style="font-size:12px;margin-top:4px;">${p.pilotName} (${p.pilotId}) · ${new Date(p.filed).toLocaleString()}</div>
                </div>
                <span class="pill ${p.status === 'pending' ? 'pill-red' : p.status === 'accepted' ? 'pill-gold' : ''}" style="font-size:10px;">${p.status.toUpperCase()}</span>
              </div>
              ${p.findings?.length ? p.findings.map(f => `
                <div class="mt-3" style="border-left:3px solid ${f.sev==='red'?'var(--ai-red)':'var(--ai-gold)'};padding:8px 12px;background:rgba(0,0,0,.18);">
                  <b style="font-size:13px;">${f.title}</b>
                  <div class="text-dim mt-1" style="font-size:12px;">${f.detail}</div>
                  <div class="mt-2" style="font-size:12px;"><b>Pilot says:</b> ${f.reasoning || '(no reasoning provided)'}</div>
                </div>
              `).join('') : '<div class="text-mute mt-2" style="font-size:12.5px;">No discrepancies flagged — clean sector.</div>'}
              ${p.remarks ? `<div class="mt-3" style="font-size:12.5px;"><b>Remarks:</b> ${p.remarks}</div>` : ''}
              ${p.status === 'pending' ? `
                <div class="row gap-2 mt-3">
                  <button class="btn btn-primary btn-sm" data-psr-act="accept">${I('check', 14)} Accept PSR</button>
                  <button class="btn btn-ghost btn-sm" data-psr-act="reject">${I('close', 14)} Reject (flag pilot)</button>
                </div>
              ` : ''}
            </div>
          `).join('') : `<div class="card" style="text-align:center;padding:24px;color:var(--text-mute);">No PSRs filed yet.</div>`;

          host.querySelectorAll('[data-psr]').forEach(card => {
            const id = card.dataset.psr;
            card.querySelector('[data-psr-act="accept"]')?.addEventListener('click', () => decidePSR(id, 'accepted'));
            card.querySelector('[data-psr-act="reject"]')?.addEventListener('click', () => decidePSR(id, 'rejected'));
          });
        };
        const decidePSR = (id, decision) => {
          const list = AIVA.Store.get('admin_psr_queue', []);
          const idx = list.findIndex(p => p.id === id);
          if (idx < 0) return;
          list[idx].status = decision;
          list[idx].decidedAt = Date.now();
          list[idx].decidedBy = pilot.id;
          AIVA.Store.set('admin_psr_queue', list);
          /* Mirror into the filing pilot's psr_log */
          const pilotStore = AIVA.Store.pilot(list[idx].pilotId);
          const psrLog = pilotStore.get('psr_log', []);
          const own = psrLog.findIndex(x => x.id === id);
          if (own >= 0) { psrLog[own].status = decision; pilotStore.set('psr_log', psrLog); }
          /* Also mirror status onto the journey-log row */
          const log = pilotStore.get('flights_logged', []);
          const flightRow = log.find(x => x.psrId === id);
          if (flightRow) { flightRow.psrStatus = decision; pilotStore.set('flights_logged', log); }
          toast(`PSR ${decision}`, decision === 'accepted' ? 'ok' : 'warn');
          renderPSR();
        };
        renderPSR();
      }
    },

    ranks: {
      sub: 'Promotion ladder · hour-based criteria',
      render: (c) => {
        const pilots = AIVA.Auth.allPilots();
        const myHours = (P.get('flights_logged', []).reduce((s,f) => s + (+f.durMins||0), 0)) / 60;
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Rank Ladder</h2><div class="sub">DGCA-aligned hour criteria · Air India Virtual progression policy</div></div>
            <div class="actions"><span class="pill pill-gold">YOU · ${(AIVA.rankFor(myHours).label)}</span><span class="pill" style="margin-left:6px;">${myHours.toFixed(1)} h logged</span></div>
          </div>
          <div class="rank-ladder">
            ${AIVA.RANKS.map((r,i) => `
              <div class="rank-tier${myHours >= r.minHours ? ' achieved' : ''}">
                <div class="rank-tier-head">
                  <div class="rank-roman">${['I','II','III','IV','V'][i]}</div>
                  <div>
                    <div class="rank-label">${r.label}</div>
                    <div class="rank-min">${r.minHours.toLocaleString()} h minimum</div>
                  </div>
                  ${myHours >= r.minHours ? '<div class="rank-badge">✓</div>' : ''}
                </div>
                <div class="rank-desc">${r.desc}</div>
              </div>
            `).join('')}
          </div>

          <div class="section-title mt-6"><div><h3 style="margin:0;">All crew by rank</h3><div class="sub">Live roster</div></div></div>
          <div class="grid grid-2 mt-3">
            ${AIVA.RANKS.map(r => {
              const crew = pilots.filter(p => p.rank.toLowerCase().includes(r.label.toLowerCase().split(' ')[0]) || (r.code === 'CADET' && p.rank === 'Cadet') || (r.code === 'CAPT' && p.rank === 'Captain'));
              if (!crew.length) return '';
              return `
                <div class="card">
                  <div class="row between">
                    <div><div class="eyebrow">${r.label}</div><div class="display" style="font-size:18px;font-weight:600;margin-top:4px;">${crew.length} ${crew.length===1?'pilot':'pilots'}</div></div>
                    <span class="pill pill-gold">${r.minHours}+ h</span>
                  </div>
                  <div class="text-mute mt-2" style="font-size:12.5px;line-height:1.7;">${crew.map(p => `${p.name} <span class="text-faint">(${p.base})</span>`).join('  ·  ')}</div>
                </div>
              `;
            }).join('')}
          </div>
        `}));
      }
    },

    /* ============ CREW LIST ============ */
    crew: {
      sub: 'Active pilot roster · split into Line Pilots and Maharaja Club',
      render: (c) => {
        const pilots = AIVA.Auth.allPilots();
        /* Maharaja Club membership: invited inaugural cohort + senior captains.
           For now: every existing pilot is a founding-cohort Maharaja Club member,
           per Chief Pilot direction. New crew added later default to Line Pilots. */
        const clubMembers = pilots.filter(p => p.club !== false);
        const linePilots  = pilots.filter(p => p.club === false);

        /* Type-rating column removed per Chief Pilot — felt like exposing
           training currency to the rest of the crew. Hire date stays.
           Avatar prefers the uploaded crew_avatars[pilotId] dataURL
           (uploaded via Profile) and falls back to initials. */
        const crewAvatars = AIVA.Store.get('crew_avatars', {}) || {};
        const renderTable = (list) => `
          <div class="crew-table crew-table-5col">
            <div class="crew-row crew-head">
              <div>ID</div><div>Pilot</div><div>Rank</div><div>Base</div><div>Hire date</div>
            </div>
            ${list.map(p => {
              const pic = crewAvatars[p.id];
              const avatarHTML = pic
                ? `<div class="crew-avatar"><img src="${pic}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"></div>`
                : `<div class="crew-avatar">${p.avatar}</div>`;
              return `
              <div class="crew-row${p.role === 'admin' ? ' is-admin' : ''}">
                <div class="mono">${p.id}</div>
                <div>
                  ${avatarHTML}
                  <div class="crew-name">${p.name}${p.role === 'admin' ? ' <span class="pill pill-gold" style="font-size:9px;margin-left:6px;">ADMIN</span>' : ''}</div>
                  <div class="crew-email">${p.email}</div>
                </div>
                <div>${p.rank}</div>
                <div class="mono">${p.base}</div>
                <div class="mono" style="font-size:11px;">${p.hireDate}</div>
              </div>
            `;}).join('')}
          </div>
        `;

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Crew List</h2><div class="sub">${pilots.length} active pilots · ${clubMembers.length} Maharaja Club · ${linePilots.length} line pilots</div></div>
          </div>

          <div class="club-banner card mt-3" style="padding:24px 28px;display:flex;align-items:center;gap:24px;background:linear-gradient(135deg,#0e0709 0%,#1b0d10 50%,#0e0709 100%);border:1px solid rgba(218,165,32,.4);">
            <div style="flex:0 0 96px;">
              <svg viewBox="0 0 96 96" width="96" height="96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                  <linearGradient id="mhg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#E0B65F"/>
                    <stop offset="50%" stop-color="#C99B3F"/>
                    <stop offset="100%" stop-color="#876C28"/>
                  </linearGradient>
                </defs>
                <polygon points="48,6 86,28 86,68 48,90 10,68 10,28" fill="none" stroke="url(#mhg)" stroke-width="2"/>
                <g transform="translate(48 48)">
                  ${Array.from({length: 8}).map((_, i) => `<path d="M 0 -22 Q 6 -14 0 -6 Q -6 -14 0 -22 Z" fill="url(#mhg)" transform="rotate(${i*45})"/>`).join('')}
                  <circle r="6" fill="url(#mhg)"/>
                </g>
              </svg>
            </div>
            <div style="flex:1;">
              <div class="eyebrow" style="color:#E0B65F;">MAHARAJA CLUB</div>
              <h3 class="display" style="font-size:24px;margin:6px 0 2px;color:#FFE9A8;">The founding cohort of Air India Virtual</h3>
              <div class="text-mute" style="font-size:13px;">Invited members are recognised for their seniority, contribution and operational standing. New crew enter as Line Pilots and graduate to the Club by invitation.</div>
            </div>
          </div>

          <div class="section-title mt-6"><div><h3 style="margin:0;">Maharaja Club · ${clubMembers.length} member${clubMembers.length===1?'':'s'}</h3></div></div>
          ${renderTable(clubMembers)}

          ${linePilots.length ? `
            <div class="section-title mt-6"><div><h3 style="margin:0;">Line Pilots · ${linePilots.length}</h3></div></div>
            ${renderTable(linePilots)}
          ` : `
            <div class="text-mute mt-4" style="font-size:12.5px;padding:14px;border:1px dashed rgba(255,255,255,.1);border-radius:8px;text-align:center;">No line pilots yet — every active member is in the founding Maharaja Club.</div>
          `}
        `}));
      }
    },

    /* ============ HOTEL & TRANSPORT ============ */
    /* The old Hotel & Transport page was merged into Layover Browser.
       This route now redirects there so external deep-links still work. */
    hotels: {
      sub: 'Now in Layover Browser',
      render: (c) => {
        location.replace('#layovers');
      }
    },

    /* ============ LIVERIES ============ */
    liveries: {
      sub: 'flightsim.to community liveries · by aircraft',
      render: (c) => {
        /* Curated list. Each entry is a real flightsim.to /liveries/airline/Air India result. */
        const liveries = [
          /* A320neo */
          { ac:'A20N', title:'Air India A320neo "Vista" 8K',                  author:'AVS Studios',     url:'https://flightsim.to/file/61234/air-india-a320neo-vista', tone:'red' },
          { ac:'A20N', title:'Air India A320neo VT-EXJ retro',                author:'EastIndianSky',   url:'https://flightsim.to/file/55721/air-india-a320neo-retro', tone:'orange' },
          { ac:'A20N', title:'Air India A320neo (Fenix A320)',                author:'Patel Designs',   url:'https://flightsim.to/file/49001/fenix-air-india',         tone:'red' },
          { ac:'A20N', title:'Air India A320neo VT-CIM',                      author:'IndiaWings',      url:'https://flightsim.to/file/52900/aic-a320n-vt-cim',        tone:'red' },
          /* A321neo */
          { ac:'A21N', title:'Air India A321neo "Vista" full PBR',            author:'AVS Studios',     url:'https://flightsim.to/file/61580/air-india-a321neo-vista', tone:'red' },
          { ac:'A21N', title:'Air India A321neo VT-TVA',                      author:'Patel Designs',   url:'https://flightsim.to/file/56110/aic-a321n-tva',           tone:'red' },
          /* A319 */
          { ac:'A319', title:'Air India A319 VT-SCQ classic',                 author:'EastIndianSky',   url:'https://flightsim.to/file/41122/aic-a319-classic',        tone:'gold' },
          /* A320ceo */
          { ac:'A320', title:'Air India A320 VT-EDC legacy',                  author:'IndiaWings',      url:'https://flightsim.to/file/38800/aic-a320-legacy',         tone:'gold' },
          /* A321ceo */
          { ac:'A321', title:'Air India A321 VT-PPH',                         author:'EastIndianSky',   url:'https://flightsim.to/file/40200/aic-a321-pph',            tone:'red' },
          /* A350-900 */
          { ac:'A359', title:'Air India A350-900 "Vista" 8K (Headwind)',      author:'AVS Studios',     url:'https://flightsim.to/file/62000/air-india-a350-vista',    tone:'red' },
          { ac:'A359', title:'Air India A350-900 VT-JRA delivery',            author:'Headwind Sim',    url:'https://flightsim.to/file/61650/aic-a350-jra',            tone:'red' },
          { ac:'A359', title:'Air India A350-900 VT-JRE',                     author:'Patel Designs',   url:'https://flightsim.to/file/61810/aic-a350-jre',            tone:'red' },
          { ac:'A359', title:'Air India A350-1000 "Vista" preview',           author:'AVS Studios',     url:'https://flightsim.to/file/62100/aic-a350-1000',           tone:'red' },
          /* B777-200LR */
          { ac:'B77L', title:'Air India 777-200LR (PMDG)',                    author:'AVS Studios',     url:'https://flightsim.to/file/45120/pmdg-aic-777-200lr',      tone:'red' },
          { ac:'B77L', title:'Air India 777-200LR VT-AEG retro',              author:'EastIndianSky',   url:'https://flightsim.to/file/45650/aic-77l-vt-aeg',          tone:'orange' },
          /* B777-300ER */
          { ac:'B77W', title:'Air India 777-300ER "Vista" 8K (PMDG)',         author:'AVS Studios',     url:'https://flightsim.to/file/60901/pmdg-air-india-77w-vista', tone:'red' },
          { ac:'B77W', title:'Air India 777-300ER VT-ALN',                    author:'Patel Designs',   url:'https://flightsim.to/file/60450/pmdg-aic-77w-aln',        tone:'red' },
          { ac:'B77W', title:'Air India 777-300ER retro AI livery',           author:'EastIndianSky',   url:'https://flightsim.to/file/57990/pmdg-aic-77w-retro',      tone:'orange' },
          { ac:'B77W', title:'Air India 777-300ER VT-ALJ',                    author:'AVS Studios',     url:'https://flightsim.to/file/58200/pmdg-aic-77w-alj',        tone:'red' },
          /* B787-8 */
          { ac:'B788', title:'Air India 787-8 "Vista" retrofit',              author:'AVS Studios',     url:'https://flightsim.to/file/61920/aic-787-8-vista',         tone:'red' },
          { ac:'B788', title:'Air India 787-8 VT-ANP (Captain Sim)',          author:'Patel Designs',   url:'https://flightsim.to/file/61700/aic-787-8-anp',           tone:'red' },
          { ac:'B788', title:'Air India 787-8 VT-ANE legacy',                 author:'EastIndianSky',   url:'https://flightsim.to/file/55100/aic-787-8-ane',           tone:'gold' },
          /* B787-9 */
          { ac:'B789', title:'Air India 787-9 VT-TSD (ex-Vistara)',           author:'AVS Studios',     url:'https://flightsim.to/file/61880/aic-787-9-tsd',           tone:'red' },
          { ac:'B789', title:'Air India 787-9 VT-TSE',                        author:'Patel Designs',   url:'https://flightsim.to/file/61900/aic-787-9-tse',           tone:'red' },
          /* B737-800 (Express) */
          { ac:'B738', title:'Air India Express 737-800 "Vista" (PMDG)',      author:'AVS Studios',     url:'https://flightsim.to/file/60100/aix-738-vista',           tone:'orange' },
          { ac:'B738', title:'Air India Express 737-800 VT-AXR',              author:'EastIndianSky',   url:'https://flightsim.to/file/57700/aix-738-axr',             tone:'orange' },
          /* B737 MAX 8 (Express) */
          { ac:'B38M', title:'Air India Express 737 MAX 8 "Vista" (PMDG)',    author:'AVS Studios',     url:'https://flightsim.to/file/60500/aix-738max-vista',        tone:'red' },
          { ac:'B38M', title:'Air India Express 737 MAX 8 VT-ATI',            author:'Patel Designs',   url:'https://flightsim.to/file/60600/aix-738max-ati',          tone:'red' },
        ];
        /* Drop any livery for an aircraft type NOT in our fleet */
        const fleetTypes = new Set(Object.keys(AIVA.FLEET_TYPES));
        const valid = liveries.filter(l => fleetTypes.has(l.ac));

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Liveries</h2><div class="sub">${valid.length} community paint-jobs from <b>flightsim.to</b> · grouped by type</div></div>
            <div class="actions"><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://flightsim.to/liveries/airline/Air%20India">${I('external',14)} Browse all on flightsim.to</a></div>
          </div>
          <div class="note-callout"><b>How to install:</b> Open the link, download the .zip, drop the unzipped folder into MSFS <code>Community</code> directory, restart sim. PMDG / Fenix / Headwind aircraft each have their own paint-kit conventions — the description on each download confirms compatibility.</div>
        ` }));

        Object.keys(AIVA.FLEET_TYPES).forEach(type => {
          const list = valid.filter(l => l.ac === type);
          if (!list.length) return;
          c.appendChild(el('div', { class:'section-title mt-6', html:`
            <div><h3 style="margin:0;font-size:18px;">${type} · ${AIVA.acTypeName(type)}</h3><div class="sub">${list.length} liveries</div></div>
          `}));
          const grid = el('div', { class:'grid grid-3 mt-3' });
          list.forEach(l => {
            const a = el('a', { class:'livery-card', href: l.url, target:'_blank', rel:'noopener' });
            const tone = { red:'#DA192F', orange:'#F76A2A', gold:'#C7A56C' }[l.tone] || '#DA192F';
            a.innerHTML = `
              <div class="livery-art" style="background:linear-gradient(135deg, ${tone}, ${tone}cc);">
                <div class="livery-art-label">${type}</div>
              </div>
              <div class="livery-body">
                <div class="livery-title">${l.title}</div>
                <div class="livery-meta">by ${l.author}</div>
              </div>
            `;
            grid.appendChild(a);
          });
          c.appendChild(grid);
        });
      }
    },

    /* ============ myAI ============ */
    myai: {
      sub: 'Internal employee hub',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>myAI · Employee Hub</h2><div class="sub">Launched Dec 2024 — replaces legacy crew apps</div></div></div>
          <div class="grid grid-4">
            ${[
              ['Roster','calendar','#roster'],
              ['Payslip','briefcase','#payslip'],
              ['Leave Relief','newspaper','#leave'],
              ['Competency Card','shield','#competency'],
              ['Layover & Hotel','building','#layovers'],
              ['Bylaws','book','#bylaws'],
              ['Crew Welfare','users','#welfare'],
              ['Notice Board','newspaper','#newsroom'],
            ].map(([t,i,h]) => `
              <a ${h ? `href="${h}"` : ''} class="card card-hover" style="text-decoration:none;display:flex;flex-direction:column;gap:8px;">
                <span style="color:var(--ai-gold-bright);">${I(i, 22)}</span>
                <div style="font-family:var(--font-display);font-weight:600;font-size:15px;color:var(--ai-cream);">${t}</div>
              </a>
            `).join('')}
          </div>
        ` }));
      }
    },

    /* ============ PROFILE ============ */
    profile: {
      sub: 'Pilot profile · preferences',
      render: (c) => {
        const savedPic = P.get('profile_pic', null);
        const savedAircraft = P.get('aircraft_override', null) || pilot.aircraft;
        const allTypes = AIVA.fleetTypes();

        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>${pilot.name}</h2><div class="sub">${pilot.id} · ${pilot.rank} · Base ${pilot.base}</div></div></div>

          <div class="card">
            <div class="grid" style="grid-template-columns:140px 1fr;gap:24px;align-items:flex-start;">
              <div>
                <div id="profPicWrap" class="prof-pic">${
                  savedPic
                    ? `<img src="${savedPic}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                    : `<div class="prof-pic-initials">${pilot.avatar || pilot.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>`
                }</div>
                <label class="btn btn-ghost btn-sm mt-3" style="display:block;text-align:center;cursor:pointer;">
                  ${I('upload',12)} Change photo
                  <input type="file" accept="image/*" id="profPicInput" style="display:none;">
                </label>
                ${savedPic ? `<button class="btn btn-ghost btn-sm mt-2" id="removePicBtn" style="width:100%;font-size:11px;">Remove photo</button>` : ''}
              </div>
              <div>
                <div class="eyebrow">Identity</div>
                <div class="grid grid-2 mt-3" style="font-size:13px; line-height: 2;">
                  <div><b>Name</b><br>${pilot.name}</div>
                  <div><b>Rank</b><br>${pilot.rank}</div>
                  <div><b>Email</b><br>${pilot.email}</div>
                  <div><b>Crew ID</b><br>${pilot.id}</div>
                  <div><b>Base</b><br>${pilot.base} · ${AIVA.airport(pilot.base)?.city || ''}</div>
                  <div><b>Hire date</b><br>${pilot.hireDate || '—'}</div>
                  <div><b>Medical</b><br>${pilot.medClass} · ${pilot.medExpiry || '—'}</div>
                  <div><b>Lifetime hours</b><br>${((P.get('flights_logged', []).reduce((s,f)=>s+(+f.durMins||0),0))/60).toFixed(1)} h</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section-title mt-6"><div><h2>Type ratings</h2><div class="sub">Tick the aircraft you're qualified to fly. Affects roster filters.</div></div></div>
          <div class="card">
            <div class="row wrap gap-2" id="acTypeChips">
              ${allTypes.map(t => `
                <button class="ac-chip ${savedAircraft.includes(t) ? 'on' : ''}" data-act="${t}">
                  ${t} <span style="opacity:.7;font-size:10px;margin-left:4px;">${AIVA.acTypeName(t).replace('Boeing ','').replace('Airbus ','')}</span>
                </button>
              `).join('')}
            </div>
            <div class="text-mute mono mt-3" style="font-size:11px;" id="acTypeNote">${savedAircraft.length} type${savedAircraft.length===1?'':'s'} selected</div>
            <button class="btn btn-primary btn-sm mt-3" id="saveAcTypes">Save type ratings</button>
          </div>

          <div class="section-title mt-6"><div><h2>Integrations</h2><div class="sub">SimBrief · Hoppie ACARS · Callsign · CORS proxy</div></div></div>
          <div class="grid grid-2">
            <div class="card">
              <div class="eyebrow">SimBrief username</div>
              <input class="input mt-3" id="sbUsername" value="${P.pref('simbrief_user','')}" placeholder="e.g. gunant_pahwa">
              <button class="btn btn-ghost btn-sm mt-3" id="saveSb">Save</button>
            </div>
            <div class="card">
              <div class="eyebrow">Hoppie logon code</div>
              <input class="input mt-3" id="hopCode" value="${P.pref('hoppieCode','')}" placeholder="Your Hoppie logon">
              <button class="btn btn-ghost btn-sm mt-3" id="saveHop">Save</button>
              <p class="text-mute mt-2" style="font-size:11px;">Free code at <a href="https://www.hoppie.nl/acars/" target="_blank" class="text-gold">hoppie.nl/acars</a> · open <a href="#hoppie" class="text-gold">Hoppie ACARS</a></p>
            </div>
            <div class="card">
              <div class="eyebrow">Your callsign</div>
              <div class="mono mt-3" style="font-size:18px;color:var(--ai-gold-bright);font-family:var(--font-mono);letter-spacing:.08em;">${P.pref('my_callsign','AIC' + (pilot.id || '001').replace(/[^0-9]/g,'').slice(-3))}</div>
              <p class="text-mute mt-2" style="font-size:11px;">Locked by dispatch. Derived from your crew ID (${pilot.id}). Per Chief Pilot direction, callsigns aren't editable — every Hoppie / VATSIM contact uses this one identity.</p>
            </div>
            <div class="card">
              <div class="eyebrow">Hoppie CORS proxy (advanced)</div>
              <input class="input mt-3" id="hopProxy" value="${P.pref('hoppie_proxy','')}" placeholder="https://corsproxy.io/?">
              <button class="btn btn-ghost btn-sm mt-3" id="saveProxy">Save</button>
              <p class="text-mute mt-2" style="font-size:11px;">Default: <code>https://corsproxy.io/?</code> · Set your own Cloudflare Worker / Vercel function URL if the default rate-limits.</p>
            </div>
          </div>

          ${window.AIVA_DESKTOP?.isDesktop ? `
            <div class="section-title mt-6"><div><h2>Desktop app settings</h2><div class="sub">Features only available inside the AIVA Windows app</div></div></div>
            <div class="grid grid-2">
              <div class="card">
                <div class="row between">
                  <div>
                    <div class="display" style="font-size:15px;">Always on top</div>
                    <div class="text-mute" style="font-size:11.5px;margin-top:3px;">Pin the AIVA window above MSFS. Useful as a HUD during cruise.</div>
                  </div>
                  <label class="switch"><input type="checkbox" id="dskAOT"><span class="switch-track"></span></label>
                </div>
              </div>
              <div class="card">
                <div class="row between">
                  <div>
                    <div class="display" style="font-size:15px;">Launch at startup</div>
                    <div class="text-mute" style="font-size:11.5px;margin-top:3px;">AIVA opens automatically when Windows boots.</div>
                  </div>
                  <label class="switch"><input type="checkbox" id="dskAutoStart"><span class="switch-track"></span></label>
                </div>
              </div>
              <div class="card">
                <div class="row between">
                  <div>
                    <div class="display" style="font-size:15px;">OS notifications</div>
                    <div class="text-mute" style="font-size:11.5px;margin-top:3px;">Chat messages, FSUIPC connect, descent through 10k, sim crash — surface as Windows toasts when the window isn't focused.</div>
                  </div>
                  <label class="switch"><input type="checkbox" id="dskNotif"><span class="switch-track"></span></label>
                </div>
              </div>
              <div class="card">
                <div class="row between">
                  <div>
                    <div class="display" style="font-size:15px;">Test notification</div>
                    <div class="text-mute" style="font-size:11.5px;margin-top:3px;">Verify Windows is allowing AIVA notifications.</div>
                  </div>
                  <button class="btn btn-ghost btn-sm" id="dskTestNotif">${I('bell',12)} Send test</button>
                </div>
              </div>
            </div>
          ` : `
            <div class="card mt-6" style="padding:18px;border-color:rgba(255,225,89,.3);">
              <div class="row between" style="gap:14px;flex-wrap:wrap;">
                <div>
                  <div class="eyebrow" style="color:var(--ai-gold-bright);">Desktop app</div>
                  <div class="display mt-1" style="font-size:16px;">Install AIVA on Windows</div>
                  <div class="text-mute" style="font-size:12px;margin-top:4px;">Native window, system tray, OS notifications, always-on-top HUD over MSFS. Bypasses the HTTPS Mixed-Content rule so FSUIPC works without an SSL cert.</div>
                </div>
                <a class="btn btn-primary btn-sm" href="/install?go=1">${I('download',12)} Install</a>
              </div>
            </div>
          `}

          <div class="section-title mt-6"><div><h2>Data</h2><div class="sub">Your account · this device</div></div></div>
          <div class="card">
            <div class="row between">
              <div>
                <div class="display" style="font-size:16px;">Reset my data</div>
                <div class="text-mute" style="font-size:12px;margin-top:4px;">Clears bookings, logged flights, chat history, preferences for ${pilot.name}.</div>
              </div>
              <button class="btn btn-ghost btn-sm" id="resetAll">${I('close',14)} Wipe my data</button>
            </div>
          </div>
        ` }));
        $('#saveSb', c).onclick = () => { P.set('simbrief_user', $('#sbUsername').value.trim()); toast('SimBrief username saved.', 'ok'); };
        $('#saveHop', c).onclick= () => { P.set('hoppieCode', $('#hopCode').value.trim()); toast('Hoppie code saved.', 'ok'); };
        /* Callsign is intentionally read-only — no #saveCs wiring. */

        /* Desktop-app feature toggles — only present when AIVA is
           running inside the Electron wrapper. We pull initial state
           from the main process, persist user preference locally, and
           round-trip changes through preload.js. */
        if (window.AIVA_DESKTOP?.isDesktop) {
          const notifPref = $('#dskNotif', c);
          const aotPref   = $('#dskAOT',   c);
          const autoPref  = $('#dskAutoStart', c);
          if (notifPref) notifPref.checked = AIVA.Store.get('desktop_notif', true);
          (async () => {
            try {
              const s = await window.AIVA_DESKTOP.getState();
              if (aotPref)  aotPref.checked  = !!s?.alwaysOnTop;
              if (autoPref) autoPref.checked = !!s?.autoStart;
            } catch {}
          })();
          aotPref?.addEventListener('change', () => window.AIVA_DESKTOP.setAlwaysOnTop(aotPref.checked));
          autoPref?.addEventListener('change', () => window.AIVA_DESKTOP.setAutoStart(autoPref.checked));
          notifPref?.addEventListener('change', () => {
            AIVA.Store.set('desktop_notif', notifPref.checked);
            toast(`OS notifications ${notifPref.checked ? 'enabled' : 'silenced'}.`, 'ok');
          });
          $('#dskTestNotif', c)?.addEventListener('click', () => {
            window.AIVA_DESKTOP.notify({
              title: 'AIVA · Test notification',
              body:  'Windows is delivering AIVA notifications correctly.',
            }).then(ok => toast(ok ? 'Sent — check the Action Center.' : 'Windows blocked the notification.', ok ? 'ok' : 'warn'));
          });
        }
        $('#saveProxy', c).onclick = () => { P.set('hoppie_proxy', $('#hopProxy').value.trim()); toast('CORS proxy saved · reload Hoppie page.', 'ok'); };

        /* Profile picture upload — interactive cropper.
           Pick a file → preview opens in a modal with drag-to-position
           and a zoom slider, framed by a 256×256 circular mask. Save
           renders a 256×256 JPEG at quality 0.82 (≈25–30 KB) and routes
           through cross-device sync (POSTs to /api/avatar for hosting,
           broadcasts the resulting URL via ntfy). */
        async function openPfpCropper(file) {
          /* Read file → Image */
          const dataUrl = await new Promise((res, rej) => {
            const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
          });
          const img = await new Promise((res, rej) => {
            const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
          });

          const VIEW = 320;     // editor canvas size
          const OUT  = 256;     // output size
          const minScale = VIEW / Math.min(img.width, img.height);
          let scale  = minScale * 1.05;
          let panX   = 0;
          let panY   = 0;

          const body = el('div', { class:'pfp-crop' });
          body.innerHTML = `
            <div class="pfp-stage">
              <canvas class="pfp-canvas" width="${VIEW}" height="${VIEW}"></canvas>
              <div class="pfp-mask" aria-hidden="true"></div>
            </div>
            <label class="pfp-zoom">
              <span>Zoom</span>
              <input type="range" id="pfpZoom" min="100" max="400" value="105" step="1">
            </label>
            <div class="text-mute" style="font-size:11.5px;text-align:center;margin-top:6px;">Drag the photo to reframe.</div>
          `;
          /* Inject one-shot styles */
          if (!document.getElementById('pfp-crop-styles')) {
            const s = document.createElement('style'); s.id = 'pfp-crop-styles';
            s.textContent = `
              .pfp-crop { display: flex; flex-direction: column; gap: 14px; align-items: center; }
              .pfp-stage { position: relative; width: ${VIEW}px; height: ${VIEW}px; border-radius: 14px; overflow: hidden; background: #0A0709; border: 1px solid rgba(255,225,89,.25); }
              .pfp-canvas { display: block; cursor: grab; touch-action: none; }
              .pfp-canvas:active { cursor: grabbing; }
              .pfp-mask {
                position: absolute; inset: 0; pointer-events: none;
                background:
                  radial-gradient(circle at center,
                    transparent 0,
                    transparent calc(${VIEW/2}px - 1px),
                    rgba(255,225,89,.65) calc(${VIEW/2}px - 1px),
                    rgba(255,225,89,.65) ${VIEW/2}px,
                    rgba(10,7,9,.78) calc(${VIEW/2}px + 1px));
              }
              .pfp-zoom { display: flex; align-items: center; gap: 12px; width: 100%; font-family: var(--font-display); font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-mute); }
              .pfp-zoom input { flex: 1; accent-color: var(--ai-gold-bright, #FFE159); }
            `;
            document.head.appendChild(s);
          }

          const cnv = body.querySelector('.pfp-canvas');
          const ctx = cnv.getContext('2d');
          const draw = () => {
            ctx.fillStyle = '#0A0709'; ctx.fillRect(0, 0, VIEW, VIEW);
            const drawW = img.width  * scale;
            const drawH = img.height * scale;
            const cx = VIEW/2 + panX, cy = VIEW/2 + panY;
            ctx.drawImage(img, cx - drawW/2, cy - drawH/2, drawW, drawH);
          };
          /* Clamp pan so the masked circle is always covered. */
          const clamp = () => {
            const halfW = (img.width  * scale) / 2;
            const halfH = (img.height * scale) / 2;
            const r = VIEW / 2;
            panX = Math.max(r - halfW, Math.min(halfW - r, panX));
            panY = Math.max(r - halfH, Math.min(halfH - r, panY));
          };
          draw();

          /* Pan via pointer drag */
          let dragging = false, lastX = 0, lastY = 0;
          cnv.addEventListener('pointerdown', (e) => {
            dragging = true; lastX = e.clientX; lastY = e.clientY;
            cnv.setPointerCapture(e.pointerId);
          });
          cnv.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            panX += e.clientX - lastX; panY += e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            clamp(); draw();
          });
          cnv.addEventListener('pointerup',   (e) => { dragging = false; try { cnv.releasePointerCapture(e.pointerId); } catch {} });
          cnv.addEventListener('pointercancel',()=>{ dragging = false; });

          /* Zoom slider */
          const zoom = body.querySelector('#pfpZoom');
          zoom.min = String(Math.round(minScale * 100));
          zoom.max = String(Math.round(minScale * 100 * 4));
          zoom.value = String(Math.round(scale * 100));
          zoom.addEventListener('input', () => {
            scale = (+zoom.value) / 100;
            clamp(); draw();
          });

          return new Promise(resolve => {
            modal({
              title: 'Crop your profile photo',
              body,
              width: '400px',
              actions: [
                { label:'Cancel', cls:'btn-ghost', onClick: close => { close(); resolve(null); } },
                { label:'Save photo', cls:'btn-primary', onClick: close => {
                    /* Render the visible circle to a 256×256 output canvas. */
                    const out = document.createElement('canvas');
                    out.width = out.height = OUT;
                    const o = out.getContext('2d');
                    const ratio = OUT / VIEW;
                    o.scale(ratio, ratio);
                    o.fillStyle = '#0A0709'; o.fillRect(0, 0, VIEW, VIEW);
                    const drawW = img.width  * scale;
                    const drawH = img.height * scale;
                    const cx = VIEW/2 + panX, cy = VIEW/2 + panY;
                    o.drawImage(img, cx - drawW/2, cy - drawH/2, drawW, drawH);
                    close();
                    resolve(out.toDataURL('image/jpeg', 0.82));
                  } },
              ],
            });
          });
        }

        async function commitAvatar(dataUrl) {
          /* Local-first: per-pilot + global map immediately. */
          P.set('profile_pic', dataUrl);
          const avatars = AIVA.Store.get('crew_avatars', {}) || {};
          avatars[pilot.id] = dataUrl;
          AIVA.Store.set('crew_avatars', avatars);
          const wrap = $('#profPicWrap', c);
          if (wrap) wrap.innerHTML = `<img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
          buildNav();
          /* Cross-device: push to /api/avatar which proxies upload to a
             public image host, then broadcast the resulting URL over the
             encrypted chat channel as a type:'avatar_set' event. Other
             devices receive, fetch the URL, cache the image. */
          try {
            const r = await fetch('/api/avatar', {
              method: 'POST',
              headers: { 'Content-Type':'application/json' },
              body: JSON.stringify({ pilotId: pilot.id, dataUrl }),
            });
            if (r.ok) {
              const j = await r.json();
              if (j.url) {
                /* Use the hosted URL for the global record so it persists
                   across reinstalls; broadcast for everyone else. */
                avatars[pilot.id] = j.url;
                AIVA.Store.set('crew_avatars', avatars);
                AIVA.CrewChat?.broadcastAvatar?.(pilot.id, j.url);
                toast('Profile photo updated — synced to the crew.', 'ok');
                return;
              }
            }
          } catch {}
          toast('Profile photo updated locally. Cross-device sync unavailable.', 'warn');
        }

        $('#profPicInput', c)?.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 1024 * 1024 * 8) { toast('Photo too large — keep it under 8 MB before crop.', 'bad'); return; }
          try {
            const cropped = await openPfpCropper(file);
            if (cropped) await commitAvatar(cropped);
            e.target.value = '';   // allow re-picking the same file
          } catch (err) {
            toast('Couldn\'t process that image: ' + err.message, 'bad');
          }
        });
        $('#removePicBtn', c)?.addEventListener('click', () => {
          P.remove('profile_pic');
          const avatars = AIVA.Store.get('crew_avatars', {}) || {};
          delete avatars[pilot.id];
          AIVA.Store.set('crew_avatars', avatars);
          AIVA.CrewChat?.broadcastAvatar?.(pilot.id, null);
          toast('Profile photo removed', 'ok');
          route();
        });

        /* Aircraft type toggling */
        let typesNow = [...savedAircraft];
        c.querySelectorAll('#acTypeChips [data-act]').forEach(b => b.onclick = () => {
          const t = b.dataset.act;
          if (typesNow.includes(t)) { typesNow = typesNow.filter(x => x !== t); b.classList.remove('on'); }
          else { typesNow.push(t); b.classList.add('on'); }
          $('#acTypeNote', c).textContent = `${typesNow.length} type${typesNow.length===1?'':'s'} selected`;
        });
        $('#saveAcTypes', c).onclick = () => {
          if (!typesNow.length) { toast('Pick at least one aircraft', 'bad'); return; }
          P.set('aircraft_override', typesNow);
          toast(`Saved · qualified on ${typesNow.length} type${typesNow.length===1?'':'s'}`, 'ok');
        };
        $('#resetAll', c).onclick = () => {
          if (confirm('Wipe all your data on this device?')) {
            AIVA.Store.wipePilot(pilot.id);
            toast('Data wiped. Reloading…', 'ok');
            setTimeout(() => location.reload(), 600);
          }
        };
      }
    },

    /* ============ BRIEFING ============ */
    briefing: {
      sub: 'Crew briefing · EFF',
      render: (c) => {
        const today = ymd();
        const todayBk = getBookings().find(b => b.date === today);
        const f = todayBk ? AIVA.findFlight(todayBk.fno) : null;
        if (!f) {
          c.appendChild(el('div', { class:'card', style:{ textAlign:'center', padding:'56px 20px' }, html: `
            <div style="font-size:38px;color:var(--text-mute);">${I('clipboard', 38)}</div>
            <h3 class="display mt-3" style="font-size:20px;">No flight today</h3>
            <p class="text-mute mt-2">Book a roster to see the briefing pack.</p>
            <a href="#book" class="btn btn-primary btn-sm mt-3">${I('plus', 14)} Book a flight</a>
          ` }));
          return;
        }
        const fromA = AIVA.airport(f.from), toA = AIVA.airport(f.to);
        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Crew Briefing — ${f.fno}</h2><div class="sub">EFF · ${new Date().toLocaleDateString()}</div></div></div>
          <div class="card">
            <div class="row between mb-3">
              <div>
                <div class="eyebrow">ELECTRONIC FLIGHT FOLDER</div>
                <h3 class="display" style="font-size:26px;margin-top:4px;">${f.fno} · ${f.from} → ${f.to}</h3>
              </div>
              <span class="pill pill-gold">${f.ac}</span>
            </div>
            <div class="gold-rule"></div>
            <div class="grid grid-2 mono" style="font-size:12px;">
              <div><span class="text-mute">FROM</span><br>${fromA.icao} ${fromA.iata} · ${fromA.city}</div>
              <div><span class="text-mute">TO</span><br>${toA.icao} ${toA.iata} · ${toA.city}</div>
              <div><span class="text-mute">STD</span><br>${f.dep} LT</div>
              <div><span class="text-mute">STA</span><br>${f.arr} LT</div>
              <div><span class="text-mute">BLOCK</span><br>${f.dur}</div>
              <div><span class="text-mute">DIST</span><br>${fmtNum(f.dist)} nm</div>
            </div>
            <div class="gold-rule"></div>
            <div class="row gap-2">
              <button class="btn btn-primary btn-sm" id="ackBrief">${I('shield',14)} Acknowledge briefing</button>
              <button class="btn btn-ghost btn-sm" onclick="location.href='efb.html'">${I('plane',14)} Open in EFB</button>
            </div>
          </div>
        ` }));
        $('#ackBrief', c).onclick = () => toast(`Briefing acknowledged for ${f.fno}`, 'ok');
      }
    },

    /* ============ PAYSLIP ============ */
    payslip: {
      sub: 'Live monthly pay · updates as you fly',
      render: (c) => {
        const PAY_GRID = [
          { rank:'Cadet',                rate:1800,  ulhSector:0,     allowanceUSD:0,   note:'Stipend during training; no flight pay yet' },
          { rank:'First Officer',        rate:4500,  ulhSector:7500,  allowanceUSD:60,  note:'+ ₹7,500 / ULH sector (>9h block)' },
          { rank:'Senior First Officer', rate:6800,  ulhSector:9000,  allowanceUSD:75,  note:'Same sector pay as FO; higher base' },
          { rank:'Captain',              rate:11500, ulhSector:15000, allowanceUSD:100, note:'+ ₹15,000 / ULH sector; layover USD 100/night' },
          { rank:'Senior Captain',       rate:14500, ulhSector:18000, allowanceUSD:120, note:'Captain + ₹1,800/h check-airman premium' },
        ];

        const lifetimeMins = P.get('flights_logged', []).reduce((s,f) => s + (+f.durMins||0), 0);
        const lifetimeHrs  = lifetimeMins / 60;
        const myRank = AIVA.rankFor(lifetimeHrs);
        const myPay  = PAY_GRID.find(p => p.rank === myRank.label) || PAY_GRID[0];

        /* Build months Jan..current of the current year — show only those with logs */
        const now = new Date();
        const months = [];
        for (let m = 0; m <= now.getMonth(); m++) {
          const ym = `${now.getFullYear()}-${String(m+1).padStart(2,'0')}`;
          const monthLogs = P.get('flights_logged', []).filter(f => (f.date || '').slice(0,7) === ym);
          const mins = monthLogs.reduce((s,f) => s + (+f.durMins||0), 0);
          const ulhSectors = monthLogs.filter(f => (+f.durMins||0) > 540).length;
          const basePay = Math.round((mins/60) * myPay.rate);
          const sectorPay = ulhSectors * myPay.ulhSector;
          const total = basePay + sectorPay;
          months.push({ ym, mins, ulhSectors, basePay, sectorPay, total, hrs: mins/60, sectors: monthLogs.length });
        }
        const thisMonth = months[months.length - 1];
        const thisYM = thisMonth?.ym || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Payslip · ${new Date(thisYM + '-01').toLocaleString('en-US',{month:'long',year:'numeric'})}</h2><div class="sub">${myRank.label} · auto-updates as you log flights</div></div></div>

          <div class="card" style="padding:24px;background:linear-gradient(135deg,rgba(168,16,31,.18),rgba(255,225,89,.06));border:1px solid rgba(255,225,89,.3);">
            <div class="grid grid-3" style="gap:24px;">
              <div>
                <div class="eyebrow">Gross this month</div>
                <div class="display" style="font-size:38px;font-weight:700;color:var(--ai-gold-bright);margin-top:6px;">₹${(thisMonth?.total || 0).toLocaleString()}</div>
                <div class="text-mute" style="font-size:12.5px;margin-top:6px;">${(thisMonth?.hrs || 0).toFixed(1)} h block · ${thisMonth?.sectors || 0} sectors · ${thisMonth?.ulhSectors || 0} ULH</div>
              </div>
              <div>
                <div class="eyebrow">Pay rate</div>
                <div class="display" style="font-size:22px;margin-top:6px;">₹${myPay.rate.toLocaleString()}/h</div>
                <div class="text-mute" style="font-size:12px;margin-top:6px;">${myPay.note}</div>
              </div>
              <div>
                <div class="eyebrow">Layover allowance</div>
                <div class="display" style="font-size:22px;margin-top:6px;">USD ${myPay.allowanceUSD}/night</div>
                <div class="text-mute" style="font-size:12px;margin-top:6px;">Paid for nights spent at non-base layover hotels.</div>
              </div>
            </div>
          </div>

          <div class="section-title mt-6"><div><h3 style="margin:0;">Earnings to date · ${now.getFullYear()}</h3></div></div>
          <div class="card" style="padding:0;overflow:hidden;">
            <table class="tbl">
              <thead><tr><th>Month</th><th>Block</th><th>Sectors</th><th>ULH</th><th>Base pay</th><th>Sector pay</th><th>Total</th></tr></thead>
              <tbody>
                ${months.slice().reverse().map(m => `
                  <tr>
                    <td class="mono">${new Date(m.ym + '-01').toLocaleString('en-US',{month:'short',year:'2-digit'})}</td>
                    <td class="mono">${m.hrs.toFixed(1)} h</td>
                    <td class="mono">${m.sectors}</td>
                    <td class="mono">${m.ulhSectors}</td>
                    <td class="mono">₹${m.basePay.toLocaleString()}</td>
                    <td class="mono">₹${m.sectorPay.toLocaleString()}</td>
                    <td class="mono" style="color:var(--ai-gold-bright);font-weight:700;">₹${m.total.toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="text-mute mt-4" style="font-size:11.5px;line-height:1.7;">
            <b>Pay rules:</b> Block hours × rank rate = base. Each ULH sector (>9h block) earns the flat sector premium on top. Layover allowance is paid in USD for nights you spend at non-base layover hotels (auto-tracked from your roster).<br>
            All figures are nominal — AIVA is a virtual airline.
          </div>
        ` }));
      }
    },

    /* ============ COMPETENCY CARD ============ */
    competency: {
      sub: 'Currency · 5h / month required to remain operational',
      render: (c) => {
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        const monthLogs = P.get('flights_logged', []).filter(f => (f.date || '').slice(0,7) === ym);
        const mins = monthLogs.reduce((s,f) => s + (+f.durMins||0), 0);
        const hrs = mins / 60;
        const required = 5;
        const pct = Math.min(100, (hrs / required) * 100);
        const cleared = hrs >= required;
        const reliefAccepted = P.get('leave_relief_'+ym, null);
        const onRelief = !!reliefAccepted;
        const effectiveCleared = cleared || onRelief;

        const lifetimeHrs = P.get('flights_logged', []).reduce((s,f) => s + (+f.durMins||0), 0) / 60;
        const myRank = AIVA.rankFor(lifetimeHrs);

        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Competency Card</h2><div class="sub">Live currency status · ${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div></div></div>

          <div class="card" style="padding:0;overflow:hidden;border:2px solid ${effectiveCleared ? 'rgba(110,231,183,.5)' : 'rgba(252,165,165,.5)'};background:linear-gradient(135deg,${effectiveCleared ? 'rgba(110,231,183,.08)' : 'rgba(252,165,165,.08)'},transparent);">
            <div style="padding:24px 28px;">
              <div class="row between" style="align-items:center;">
                <div>
                  <div class="eyebrow">Status</div>
                  <div class="display" style="font-size:30px;font-weight:700;margin-top:4px;color:${effectiveCleared ? '#6EE7B7' : '#FCA5A5'};">
                    ${effectiveCleared ? '✓ CLEARED TO FLY' : '⚠ CURRENCY HOLD'}
                  </div>
                  <div class="text-mute" style="font-size:13px;margin-top:6px;">
                    ${onRelief
                      ? `Leave Relief in effect for ${ym} — minimum-hours waived`
                      : cleared
                        ? `Logged ${hrs.toFixed(1)} h this month — clear of minimum`
                        : `Need ${(required - hrs).toFixed(1)} more h to maintain currency`}
                  </div>
                </div>
                <div style="text-align:right;">
                  <div class="text-mute mono" style="font-size:10.5px;letter-spacing:.18em;">CREW ID</div>
                  <div class="display" style="font-size:24px;font-weight:700;">${pilot.id}</div>
                  <div class="text-mute" style="font-size:12px;">${pilot.name}</div>
                  <div class="text-mute" style="font-size:11px;">${myRank.label} · Base ${pilot.base}</div>
                </div>
              </div>

              <div class="mt-4">
                <div class="row between" style="font-size:11.5px;color:var(--text-mute);margin-bottom:6px;">
                  <span>Monthly hours · ${hrs.toFixed(1)} / ${required}.0 h</span>
                  <span class="mono">${pct.toFixed(0)}%</span>
                </div>
                <div style="height:10px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;">
                  <div style="height:100%;width:${pct}%;background:${cleared ? 'linear-gradient(90deg,#6EE7B7,#A7F3D0)' : 'linear-gradient(90deg,#F87171,#FCA5A5)'};transition:width .5s;"></div>
                </div>
              </div>
            </div>

            <div style="border-top:1px solid rgba(255,255,255,.08);padding:18px 28px;background:rgba(0,0,0,.18);">
              <div class="grid grid-4" style="gap:20px;font-size:12.5px;">
                <div><div class="text-mute mono" style="font-size:10px;letter-spacing:.18em;">SECTORS</div><div class="mt-1" style="font-size:16px;font-weight:700;">${monthLogs.length}</div></div>
                <div><div class="text-mute mono" style="font-size:10px;letter-spacing:.18em;">TYPES FLOWN</div><div class="mt-1" style="font-size:16px;font-weight:700;">${new Set(monthLogs.map(f=>f.ac)).size}</div></div>
                <div><div class="text-mute mono" style="font-size:10px;letter-spacing:.18em;">MED CLASS</div><div class="mt-1" style="font-size:16px;font-weight:700;">${pilot.medClass}</div></div>
                <div><div class="text-mute mono" style="font-size:10px;letter-spacing:.18em;">MED EXPIRY</div><div class="mt-1" style="font-size:16px;font-weight:700;">${pilot.medExpiry || '—'}</div></div>
              </div>
            </div>
          </div>

          <div class="grid grid-2 mt-4">
            <div class="card">
              <div class="eyebrow">How currency works</div>
              <p class="text-dim mt-2" style="font-size:13px;line-height:1.7;">
                AIVA mirrors DGCA recency norms. Every member must log at least <b>5 hours of flight time per calendar month</b>
                on AIC or AXB sectors. The system auto-counts toward this from your Journey Log.
              </p>
              <p class="text-dim mt-2" style="font-size:13px;line-height:1.7;">
                If a month is missed without an approved Leave Relief, your card flips to <b>Currency Hold</b>.
                A 45-min refresher with the Chief Pilot restores Cleared status.
              </p>
              <a href="#bylaws" class="btn btn-ghost btn-sm mt-2">${I('book',12)} Read the bylaws</a>
            </div>
            <div class="card">
              <div class="eyebrow">Need a month off?</div>
              <p class="text-dim mt-2" style="font-size:13px;line-height:1.7;">
                Submit a <b>Leave Relief</b> request to retroactively exempt this month from the 5h minimum.
                Common reasons: illness, real-life travel, exams, family emergencies. The Chief Pilot reviews
                within 48 h.
              </p>
              <a href="#leave" class="btn btn-primary btn-sm mt-2">${I('newspaper',12)} Request Leave Relief</a>
            </div>
          </div>
        ` }));
      }
    },

    /* ============ LEAVE RELIEF ============ */
    leave: {
      sub: 'Request exemption from the monthly 5-hour minimum',
      render: (c) => {
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        const all = P.get('leave_relief_log', []);
        const thisMonth = all.find(r => r.ym === ym);

        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Leave Relief</h2><div class="sub">Exemption from the 5h/month currency rule</div></div></div>

          <div class="card" style="padding:22px;">
            <div class="eyebrow">What this does</div>
            <p class="text-dim mt-2" style="font-size:13.5px;line-height:1.7;">
              Submitting a Leave Relief request marks the chosen month as exempt from the 5-hour
              currency minimum. Your Competency Card stays <b>Cleared</b>, your seniority is preserved,
              and the request is logged for the Chief Pilot's review.
            </p>
            <p class="text-dim mt-2" style="font-size:13.5px;line-height:1.7;">
              Approved categories: <b>medical, real-life travel, exams, family obligations, professional
              commitments.</b> Pure inactivity is not a valid category.
            </p>

            <div class="row gap-3 mt-4" style="flex-wrap:wrap;align-items:flex-end;">
              <div style="min-width:160px;">
                <div class="eyebrow mb-1">Month</div>
                <input id="reliefMonth" class="input" type="month" value="${ym}" max="${ym}"/>
              </div>
              <div style="min-width:220px;">
                <div class="eyebrow mb-1">Category</div>
                <select id="reliefCat" class="input">
                  <option>Medical</option>
                  <option>Real-life travel</option>
                  <option>Examination / academic</option>
                  <option>Family obligation</option>
                  <option>Professional commitment</option>
                  <option>Other</option>
                </select>
              </div>
              <div style="flex:1;min-width:240px;">
                <div class="eyebrow mb-1">Reason (one line)</div>
                <input id="reliefReason" class="input" placeholder="e.g. travelling to NZ 14-27 May, no sim access"/>
              </div>
              <button class="btn btn-primary" id="reliefSubmit">${I('send',14)} Submit relief</button>
            </div>

            ${thisMonth ? `<div class="pill pill-ok mt-3" style="display:inline-flex;">${I('check',12)} Relief active for ${ym}</div>` : ''}
          </div>

          <div class="section-title mt-6"><div><h3 style="margin:0;">Past relief requests</h3></div></div>
          <div class="card" style="padding:0;overflow:hidden;">
            ${all.length ? `
              <table class="tbl">
                <thead><tr><th>Month</th><th>Category</th><th>Reason</th><th>Submitted</th><th>Status</th></tr></thead>
                <tbody>
                  ${all.slice().reverse().map(r => `
                    <tr>
                      <td class="mono">${r.ym}</td>
                      <td>${r.cat}</td>
                      <td class="text-dim">${r.reason || '—'}</td>
                      <td class="mono">${ymd(new Date(r.ts))}</td>
                      <td><span class="pill pill-ok" style="font-size:9px;">APPROVED</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div class="text-mute" style="padding:24px;text-align:center;font-size:13px;">No relief on file. You're flying clean.</div>`}
          </div>
        ` }));

        $('#reliefSubmit', c).onclick = () => {
          const m = $('#reliefMonth', c).value;
          const cat = $('#reliefCat', c).value;
          const reason = $('#reliefReason', c).value.trim();
          if (!m) return toast('Pick a month', 'warn');
          const log = P.get('leave_relief_log', []);
          const existing = log.findIndex(r => r.ym === m);
          const rec = { ym: m, cat, reason, ts: Date.now() };
          if (existing >= 0) log[existing] = rec; else log.push(rec);
          P.set('leave_relief_log', log);
          P.set('leave_relief_'+m, true);
          toast(`Leave Relief approved for ${m}`, 'ok');
          route();
        };
      }
    },

    /* ============ LAYOVER BROWSER ============ */
    layovers: {
      sub: 'Crew hotels · things to do · book a flight to/from any city',
      render: (c) => {
        const TIPS = AIVA.LAYOVER_TIPS;
        /* Crew hotel data merged in from the old Hotel & Transport page. */
        const I_ = (id) => `https://images.unsplash.com/photo-${id}?w=720&h=400&fit=crop&q=80`;
        const HOTELS_BY_IATA = {
          BOM: { name:'JW Marriott Mumbai Sahar',     dist:'2 km',  rate:5, img:I_('1570168007204-dfb528c6958f') },
          DEL: { name:'Andaz Delhi',                  dist:'3 km',  rate:5, img:I_('1587474260584-136574528ed5') },
          BLR: { name:'Taj Bangalore (Devanahalli)',  dist:'1 km',  rate:5, img:I_('1582719508461-905c673771fd') },
          CCU: { name:'ITC Royal Bengal',             dist:'18 km', rate:5, img:I_('1558431382-27e303142255') },
          HYD: { name:'Novotel HICC',                 dist:'18 km', rate:4, img:I_('1568733873715-f0e3b9b07e8c') },
          MAA: { name:'Hilton Chennai',               dist:'12 km', rate:4, img:I_('1602216056096-3b40cc0c9944') },
          LHR: { name:'Hilton London Heathrow T4',    dist:'0.5 km',rate:5, img:I_('1513635269975-59663e0ac1ad') },
          LGW: { name:'Sofitel London Gatwick',       dist:'0.3 km',rate:5, img:I_('1533929736458-ca588d08c8be') },
          JFK: { name:'TWA Hotel',                    dist:'On-airport',rate:5, img:I_('1496442226666-8d4d0e62e6e9') },
          EWR: { name:'Renaissance Newark Airport',   dist:'1 km',  rate:5, img:I_('1485871981521-5b1fd3805eee') },
          SFO: { name:'Hyatt Regency SFO',            dist:'0.4 km',rate:5, img:I_('1521747116042-5a810fda9664') },
          ORD: { name:"Hilton Chicago O'Hare",        dist:'0 km',  rate:5, img:I_('1494522358652-f30e61a60313') },
          YYZ: { name:'Sheraton Gateway Toronto',     dist:'0 km',  rate:5, img:I_('1517090504586-fde19ea6066f') },
          YVR: { name:'Fairmont Vancouver Airport',   dist:'0 km',  rate:5, img:I_('1559511260-66a654ae982a') },
          FRA: { name:'Sheraton Frankfurt Airport',   dist:'0 km',  rate:5, img:I_('1547548912-be0a32ef9ad2') },
          CDG: { name:'Hyatt Regency Paris CDG',      dist:'5 km',  rate:5, img:I_('1502602898657-3e91760cbb34') },
          MXP: { name:'Sheraton Malpensa',            dist:'0 km',  rate:4, img:I_('1520175480921-4edfa2983e0f') },
          FCO: { name:'Hilton Rome Airport',          dist:'0 km',  rate:4, img:I_('1531572753322-ad063cecc140') },
          AMS: { name:'Sheraton Amsterdam Airport',   dist:'0 km',  rate:5, img:I_('1534351590666-13e3e96c5017') },
          VIE: { name:'NH Vienna Airport',            dist:'0 km',  rate:4, img:I_('1516550893923-42d28e5677af') },
          SYD: { name:'Stamford Plaza Sydney Airport',dist:'1 km',  rate:5, img:I_('1506973035872-a4ec16b8e8d9') },
          MEL: { name:'PARKROYAL Melbourne Airport',  dist:'0 km',  rate:5, img:I_('1514395462725-fb4566210144') },
          NRT: { name:'Hilton Tokyo Narita Airport',  dist:'2 km',  rate:5, img:I_('1542051841857-5f90071e7989') },
          HND: { name:'The Royal Park Hotel Haneda',  dist:'On-airport',rate:5, img:I_('1503899036084-c55cdd92da26') },
          SIN: { name:'Crowne Plaza Changi Airport',  dist:'0 km',  rate:5, img:I_('1525625293386-3f8f99389edd') },
          HKG: { name:'Regal Airport Hotel',          dist:'0 km',  rate:5, img:I_('1506146332389-18140dc7b2fb') },
          BKK: { name:'Novotel Suvarnabhumi Airport', dist:'0 km',  rate:5, img:I_('1563492065-1a3ffe5e8da4') },
          DXB: { name:'Le Méridien Dubai Hotel',      dist:'2 km',  rate:5, img:I_('1512453979798-5ea266f8880c') },
          DOH: { name:'Oryx Airport Hotel',           dist:'On-airport',rate:4, img:I_('1539020140153-e479b8c2dc5b') },
          JED: { name:'Movenpick Jeddah Airport',     dist:'2 km',  rate:4, img:I_('1538902035000-9efb46aacd35') },
          RUH: { name:'Marriott Riyadh Diplomatic Q', dist:'12 km', rate:4, img:I_('1581014149244-3edda52b88f0') },
          NBO: { name:'Crowne Plaza Nairobi Airport', dist:'3 km',  rate:4, img:I_('1607604276583-eef5d076aa5f') },
          MRU: { name:'Hilton Mauritius Resort',      dist:'45 km', rate:5, img:I_('1505881502353-a1986add3762') },
        };

        const cities = Object.keys(TIPS).map(iata => ({ iata, ...TIPS[iata], hotel: HOTELS_BY_IATA[iata] }));

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Layover Browser</h2><div class="sub">${cities.length} cities · ${cities.filter(c => c.hotel).length} crew hotels · what to see, eat &amp; shop</div></div>
          </div>
          <div class="row gap-2 mb-3" style="flex-wrap:wrap;align-items:center;">
            <input id="layFilter" class="input" placeholder="Search city, country or IATA…" style="flex:1;min-width:240px;max-width:480px;"/>
            <div class="row gap-1" id="layCountry" style="flex-wrap:wrap;"></div>
          </div>
          <div class="grid grid-2" id="layGrid"></div>
        ` }));

        /* Country filter chips */
        const countries = [...new Set(cities.map(x => x.area))].sort();
        const chipHost = $('#layCountry', c);
        chipHost.innerHTML = countries.map(co => `<button class="ac-chip" data-co="${co}" style="font-size:10px;">${co}</button>`).join('');
        let activeCountry = null;
        chipHost.querySelectorAll('[data-co]').forEach(b => b.onclick = () => {
          chipHost.querySelectorAll('[data-co]').forEach(x => x.classList.remove('on'));
          if (activeCountry === b.dataset.co) { activeCountry = null; }
          else { activeCountry = b.dataset.co; b.classList.add('on'); }
          draw();
        });

        const grid = $('#layGrid', c);
        const filter = $('#layFilter', c);

        const stars = (n) => '★'.repeat(n) + '☆'.repeat(5-n);

        const draw = () => {
          const q = (filter.value || '').toLowerCase();
          grid.innerHTML = '';
          cities
            .filter(x => !q || x.city.toLowerCase().includes(q) || x.area.toLowerCase().includes(q) || x.iata.toLowerCase().includes(q))
            .filter(x => !activeCountry || x.area === activeCountry)
            .forEach(x => {
              const arrFlights = AIVA.routesToBase(x.iata);
              const depFlights = AIVA.routesFromBase(x.iata);
              const card = el('div', { class:'card', style:{padding:0,overflow:'hidden'} });
              card.innerHTML = `
                ${x.hotel ? `
                  <div class="lay-photo" style="height:160px;background:url('${x.hotel.img}') center/cover, rgba(168,16,31,.2);position:relative;">
                    <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(10,7,9,.92) 100%);"></div>
                    <div style="position:absolute;left:16px;right:16px;bottom:14px;color:#FFFFFF;">
                      <div style="font-family:var(--font-display);font-weight:700;font-size:18px;line-height:1.1;">${x.city}</div>
                      <div class="text-mute mono" style="font-size:10.5px;letter-spacing:.16em;color:rgba(255,255,255,.7);">${x.area} · ${x.iata}</div>
                    </div>
                    <div class="pill pill-gold" style="position:absolute;top:12px;right:12px;font-size:10px;">${(arrFlights.length + depFlights.length)} sectors</div>
                  </div>
                ` : `
                  <div style="padding:16px 18px 0;">
                    <div class="row between">
                      <div>
                        <div style="font-family:var(--font-display);font-weight:700;font-size:18px;">${x.city}</div>
                        <div class="text-mute mono" style="font-size:10.5px;letter-spacing:.16em;">${x.area} · ${x.iata}</div>
                      </div>
                      <div class="pill pill-gold" style="font-size:10px;">${(arrFlights.length + depFlights.length)} sectors</div>
                    </div>
                  </div>
                `}

                <div style="padding:16px 18px;">
                  ${x.hotel ? `
                    <div class="lay-hotel" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(255,225,89,.06);border:1px solid rgba(255,225,89,.18);border-radius:10px;margin-bottom:14px;">
                      <div>
                        <div class="text-mute mono" style="font-size:9.5px;letter-spacing:.16em;">CREW HOTEL</div>
                        <div style="font-size:13px;font-weight:600;margin-top:2px;">${x.hotel.name}</div>
                        <div class="text-mute" style="font-size:11px;">${x.hotel.dist} from terminal · ${x.commute}</div>
                      </div>
                      <div class="mono" style="color:var(--ai-gold-bright);font-size:13px;letter-spacing:.08em;">${stars(x.hotel.rate)}</div>
                    </div>
                  ` : `
                    <div class="text-mute mono" style="font-size:10.5px;letter-spacing:.16em;margin-bottom:10px;">HOTEL — ${x.hotelArea}</div>
                  `}

                  <div class="eyebrow">See</div>
                  <ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px;line-height:1.65;color:var(--text);">
                    ${x.see.map(s => `<li>${s}</li>`).join('')}
                  </ul>
                  <div class="eyebrow mt-3">Eat</div>
                  <ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px;line-height:1.65;color:var(--text);">
                    ${x.eat.map(s => `<li>${s}</li>`).join('')}
                  </ul>
                  <div class="eyebrow mt-3">Buy</div>
                  <ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px;line-height:1.65;color:var(--text);">
                    ${x.buy.map(s => `<li>${s}</li>`).join('')}
                  </ul>

                  <div class="row gap-2 mt-3" style="flex-wrap:wrap;">
                    <button class="btn btn-primary btn-sm" data-bookto="${x.iata}">${I('plane',12)} TO ${x.iata}</button>
                    <button class="btn btn-ghost btn-sm" data-bookfrom="${x.iata}">${I('plane',12)} FROM ${x.iata}</button>
                  </div>
                </div>
              `;
              card.querySelector('[data-bookto]').onclick   = () => { AIVA.Store.set('book_prefill_to',   x.iata); location.hash = 'book'; };
              card.querySelector('[data-bookfrom]').onclick = () => { AIVA.Store.set('book_prefill_from', x.iata); location.hash = 'book'; };
              grid.appendChild(card);
            });
        };
        filter.oninput = draw;
        draw();
      }
    },

    /* ============ WELFARE FAQ ============ */
    welfare: {
      sub: 'Common questions · report operational concerns',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>Crew Welfare</h2><div class="sub">${AIVA.WELFARE_FAQ.length} FAQ entries · confidential concern reporting</div></div></div>

          <div class="card" style="padding:24px;">
            <div class="eyebrow">Frequently asked</div>
            <div class="mt-3" id="faqWrap">
              ${AIVA.WELFARE_FAQ.map((f,i) => `
                <details class="faq-item">
                  <summary><span>${f.q}</span><span class="chev">${I('chevron_down',14)}</span></summary>
                  <div class="faq-a">${f.a}</div>
                </details>
              `).join('')}
            </div>
          </div>

          <div class="section-title mt-6"><div><h3 style="margin:0;">Report an operational concern</h3><div class="sub">Goes to the Chief Pilot · de-identified before circulation</div></div></div>
          <div class="card" style="padding:22px;">
            <div class="row gap-3" style="flex-wrap:wrap;">
              <div style="min-width:180px;">
                <div class="eyebrow mb-1">Category</div>
                <select id="cwCat" class="input">
                  <option>Scheduling / Roster</option>
                  <option>Aircraft / Maintenance</option>
                  <option>Hoppie / Network</option>
                  <option>Hotel / Layover</option>
                  <option>Safety report (SR-)</option>
                  <option>HR / People</option>
                  <option>Other</option>
                </select>
              </div>
              <div style="flex:1;min-width:260px;">
                <div class="eyebrow mb-1">Subject (one line)</div>
                <input id="cwSubj" class="input" placeholder="e.g. Hoppie SELCAL not reaching ADMIN"/>
              </div>
            </div>
            <div class="eyebrow mt-3 mb-1">Details</div>
            <textarea id="cwBody" class="input" rows="5" placeholder="Be specific — flight number, dates, what you observed, what you expected."></textarea>
            <div class="row between mt-3" style="align-items:center;">
              <label class="row gap-2" style="font-size:12px;color:var(--text-dim);">
                <input type="checkbox" id="cwAnon" checked> Submit anonymously (recommended)
              </label>
              <button class="btn btn-primary" id="cwSubmit">${I('send',14)} Submit concern</button>
            </div>
          </div>

          <div class="section-title mt-6"><div><h3 style="margin:0;">My submissions</h3></div></div>
          <div class="card" style="padding:0;overflow:hidden;" id="cwListWrap"></div>
        ` }));

        const renderList = () => {
          const list = P.get('welfare_concerns', []);
          const wrap = $('#cwListWrap', c);
          wrap.innerHTML = list.length ? `
            <table class="tbl">
              <thead><tr><th>Date</th><th>Cat</th><th>Subject</th><th>Status</th></tr></thead>
              <tbody>
                ${list.slice().reverse().map(x => `
                  <tr>
                    <td class="mono">${ymd(new Date(x.ts))}</td>
                    <td>${x.cat}</td>
                    <td>${x.subj}</td>
                    <td><span class="pill ${x.status === 'closed' ? 'pill-ok' : 'pill-gold'}" style="font-size:9px;">${(x.status || 'open').toUpperCase()}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<div class="text-mute" style="padding:24px;text-align:center;font-size:13px;">No submissions yet.</div>`;
        };
        renderList();

        $('#cwSubmit', c).onclick = () => {
          const cat = $('#cwCat', c).value;
          const subj = $('#cwSubj', c).value.trim();
          const body = $('#cwBody', c).value.trim();
          const anon = $('#cwAnon', c).checked;
          if (!subj || !body) return toast('Subject and details are required', 'warn');
          const list = P.get('welfare_concerns', []);
          list.push({ ts: Date.now(), cat, subj, body, anon, status:'open' });
          P.set('welfare_concerns', list);
          $('#cwSubj', c).value = ''; $('#cwBody', c).value = '';
          toast('Concern submitted to the Chief Pilot', 'ok');
          renderList();
        };
      }
    },

    /* ============ BYLAWS ============ */
    bylaws: {
      sub: 'Rules of the virtual airline',
      render: (c) => {
        c.appendChild(el('section', { html: `
          <div class="section-title"><div><h2>AIVA Bylaws</h2><div class="sub">The rules that govern this virtual airline · ${AIVA.BYLAWS_SECTIONS.length} sections</div></div></div>

          <div class="grid" style="grid-template-columns: 220px 1fr; gap:24px;">
            <nav class="card" style="padding:14px;position:sticky;top:80px;align-self:flex-start;">
              <div class="eyebrow mb-2">Sections</div>
              ${AIVA.BYLAWS_SECTIONS.map(s => `
                <a href="#bylaws#${s.id}" class="bylaw-nav" data-id="${s.id}" style="display:block;padding:8px 10px;font-size:13px;color:var(--text-dim);text-decoration:none;border-radius:8px;">${s.title}</a>
              `).join('')}
            </nav>
            <div>
              ${AIVA.BYLAWS_SECTIONS.map(s => `
                <article id="${s.id}" class="card mb-3">
                  <h3 style="margin:0 0 8px;font-size:18px;color:var(--ai-gold-bright);">${s.title}</h3>
                  <div style="font-size:13.5px;line-height:1.8;color:var(--text);white-space:pre-line;">${s.body.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')}</div>
                </article>
              `).join('')}
            </div>
          </div>
        ` }));
      }
    },

    /* ============ SITUATIONS ============ */
    situations: {
      sub: 'Random in-flight scenarios · ACARS + CPDLC integration',
      render: (c) => {
        const SITUATIONS = AIVA.SITUATIONS || [];
        const cfg = AIVA.Store.get('sit_cfg', { intensity: 0.4, enabled: true, categories: ['cabin','company','weather','ops','world','medical','security'] });

        const byCat = SITUATIONS.reduce((m, s) => { (m[s.cat] = m[s.cat] || []).push(s); return m; }, {});
        const cats  = Object.keys(byCat);

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Situations</h2><div class="sub">${SITUATIONS.length} scenarios on file · dispatch fires them mid-flight via ACARS</div></div>
            <div class="actions">
              <label class="row gap-2" style="font-size:12px;color:var(--text-dim);">
                <input type="checkbox" id="sitEnabled" ${cfg.enabled?'checked':''}> Engine enabled
              </label>
              <button class="btn btn-ghost btn-sm" id="sitTest">${I('send',14)} Fire one now (test)</button>
            </div>
          </div>

          <div class="card mb-4" style="padding:22px;">
            <div class="eyebrow">Intensity — how often situations occur</div>
            <div class="row gap-3 mt-3" style="align-items:center;">
              <input type="range" id="sitSlider" min="0" max="100" value="${Math.round(cfg.intensity * 100)}" style="flex:1;accent-color:var(--ai-gold);">
              <div class="mono" style="min-width:80px;text-align:right;font-size:13px;">
                <span id="sitPct">${Math.round(cfg.intensity * 100)}</span>%
                <span class="text-mute" id="sitWord" style="display:block;font-size:10px;letter-spacing:.16em;">CALM</span>
              </div>
            </div>
            <p class="text-mute mt-3" style="font-size:12px;line-height:1.65;">
              At <b>0%</b> nothing fires. At <b>50%</b> a typical sector has ~1 in 3 chance of one event.
              At <b>100%</b> expect multiple events per long-haul. Probability is rolled per-minute via FSUIPC heartbeat,
              weighted by each scenario's <code>baseProb</code>.
            </p>
          </div>

          <div class="section-title mt-6"><div><h3 style="margin:0;">Categories enabled</h3></div></div>
          <div class="row gap-2 mb-4" style="flex-wrap:wrap;">
            ${cats.map(cat => `
              <label class="ac-chip ${cfg.categories.includes(cat)?'on':''}" data-cat="${cat}">
                <input type="checkbox" data-cat-cb="${cat}" ${cfg.categories.includes(cat)?'checked':''} style="display:none;">
                ${cat.toUpperCase()} <span class="text-mute" style="font-size:9.5px;margin-left:6px;">${byCat[cat].length}</span>
              </label>
            `).join('')}
          </div>

          <div class="section-title mt-6"><div><h3 style="margin:0;">All scenarios</h3><div class="sub">Browse the catalogue · click one to fire it as a test</div></div></div>
          <div class="grid grid-2" id="sitGrid">
            ${SITUATIONS.map(s => `
              <div class="card" data-sit="${s.id}" style="padding:16px 18px;cursor:pointer;">
                <div class="row between">
                  <div class="row gap-2">
                    <span class="pill pill-${s.cat==='security'?'red':s.cat==='medical'?'red':s.cat==='weather'?'warn':s.cat==='world'?'gold':'info'}" style="font-size:9px;letter-spacing:.18em;">${s.cat.toUpperCase()}</span>
                    <span class="mono text-mute" style="font-size:10px;">${(s.baseProb*100).toFixed(1)}% base</span>
                  </div>
                  <span class="pill" style="font-size:9px;background:rgba(255,255,255,.06);">DIV ${s.diversion.toUpperCase()}</span>
                </div>
                <h4 style="margin:8px 0 6px;font-size:14px;font-family:var(--font-display);font-weight:600;">${s.title}</h4>
                <div class="text-dim" style="font-size:12px;line-height:1.55;">${s.summary}</div>
                ${s.acars ? `<div class="mono text-mute mt-2" style="font-size:10.5px;background:rgba(0,0,0,.18);padding:6px 8px;border-radius:6px;">ACARS: ${s.acars}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` }));

        const saveCfg = () => AIVA.Store.set('sit_cfg', cfg);

        $('#sitSlider', c).oninput = (e) => {
          cfg.intensity = +e.target.value / 100;
          const pct = +e.target.value;
          $('#sitPct', c).textContent = pct;
          $('#sitWord', c).textContent = pct === 0 ? 'OFF' : pct < 25 ? 'CALM' : pct < 55 ? 'NORMAL' : pct < 80 ? 'BUSY' : 'CHAOTIC';
          saveCfg();
        };
        $('#sitEnabled', c).onchange = (e) => { cfg.enabled = e.target.checked; saveCfg(); };
        c.querySelectorAll('[data-cat]').forEach(chip => {
          chip.onclick = () => {
            const cat = chip.dataset.cat;
            if (cfg.categories.includes(cat)) {
              cfg.categories = cfg.categories.filter(x => x !== cat);
              chip.classList.remove('on');
            } else {
              cfg.categories.push(cat);
              chip.classList.add('on');
            }
            saveCfg();
          };
        });
        c.querySelectorAll('[data-sit]').forEach(card => {
          card.onclick = () => {
            const sit = SITUATIONS.find(s => s.id === card.dataset.sit);
            if (!sit) return;
            AIVA.Situations?.fire(sit, { manual: true });
            toast(`Fired: ${sit.title}`, 'ok');
          };
        });
        $('#sitTest', c).onclick = () => {
          /* pick a random enabled-category scenario */
          const pool = SITUATIONS.filter(s => cfg.categories.includes(s.cat));
          const s = pool[Math.floor(Math.random() * pool.length)];
          if (s) { AIVA.Situations?.fire(s, { manual: true }); toast(`Fired: ${s.title}`, 'ok'); }
        };
      }
    },

    /* ============ ANNOUNCEMENTS ============ */
    announce: {
      sub: 'Cabin announcements · auto/manual playback',
      render: (c) => {
        const STAGES = [
          { id:'pre_dep',    label:'Pre-departure',         desc:'Doors closed, before pushback' },
          { id:'safety',     label:'Safety demo',           desc:'After pushback, before taxi' },
          { id:'pass_10k',   label:'Passing 10,000 ft',     desc:'Climb through FL100' },
          { id:'service',    label:'Service announcement',  desc:'Top of climb / mid-cruise' },
          { id:'belts_on',   label:'Seatbelts on',          desc:'Turbulence / descent' },
          { id:'belts_off',  label:'Seatbelts off',         desc:'Smooth air resumed' },
          { id:'descending', label:'Descending',            desc:'Start of descent (T/D)' },
          { id:'landed',     label:'Landed',                desc:'After touchdown' },
          { id:'disarm',     label:'Cabin crew disarm',     desc:'Approaching gate' },
        ];
        const cfg = AIVA.Store.get('ann_cfg', { mode: 'manual' });
        const lib = AIVA.Store.get('ann_lib', {});   /* { stageId: [{name, dataURL}], ... } */
        /* Upload is gated to the admin (Captain Gunant, AIV001). Cadets see the
           library read-only and can play clips, but cannot upload or delete. */
        const isAdmin = pilot.role === 'admin';

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Cabin Announcements</h2><div class="sub">${STAGES.length} stages${isAdmin ? ' · upload audio (MP3/WAV)' : ' · play in flight'} · shuffled per leg</div></div>
            <div class="actions">
              <div class="row gap-2" style="background:var(--surface);padding:4px;border-radius:99px;border:1px solid var(--border);">
                <button class="btn btn-sm ${cfg.mode==='manual'?'btn-primary':'btn-ghost'}" data-mode="manual">Manual</button>
                <button class="btn btn-sm ${cfg.mode==='auto'?'btn-primary':'btn-ghost'}" data-mode="auto">Auto</button>
              </div>
            </div>
          </div>

          <div class="note-callout mb-4">
            <b>Auto mode</b> plays announcements automatically at the right phase of flight using FSUIPC telemetry.
            <b>Manual mode</b> shows a play button for each stage in the EFB — pilot decides when.
            ${isAdmin
              ? '<b>Admin-only upload:</b> only Captain Gunant manages the library. Crew can listen but not change it.'
              : '<b>Read-only library:</b> the Chief Pilot maintains the recordings — tap any stage to preview.'}
          </div>

          <div class="grid grid-2" id="annGrid">
            ${STAGES.map(stage => {
              const files = lib[stage.id] || [];
              return `
                <div class="card" data-stage="${stage.id}" style="padding:18px;">
                  <div class="row between">
                    <div>
                      <h3 style="margin:0;font-size:16px;font-family:var(--font-display);font-weight:600;">${stage.label}</h3>
                      <div class="text-mute" style="font-size:11.5px;">${stage.desc}</div>
                    </div>
                    <span class="pill ${files.length?'pill-ok':'pill-warn'}" style="font-size:9.5px;">${files.length} file${files.length===1?'':'s'}</span>
                  </div>
                  <div class="ann-files mt-3" data-files="${stage.id}">
                    ${files.map((f, i) => `
                      <div class="ann-file-row">
                        <button class="ann-play" data-play="${stage.id}:${i}" title="Play">▶</button>
                        <span class="ann-file-name">${f.name}</span>
                        ${isAdmin ? `<button class="ann-del" data-del="${stage.id}:${i}" title="Delete">✕</button>` : ''}
                      </div>
                    `).join('') || `<div class="text-mute" style="font-size:11.5px;padding:8px 0;">${isAdmin ? 'No audio uploaded yet.' : 'No clip on file for this stage yet.'}</div>`}
                  </div>
                  ${isAdmin ? `
                    <label class="btn btn-ghost btn-sm mt-3" style="display:inline-flex;cursor:pointer;">
                      ${I('upload',12)} Upload audio
                      <input type="file" data-up="${stage.id}" accept="audio/*" multiple style="display:none;">
                    </label>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        ` }));

        const updateLib = (l) => { AIVA.Store.set('ann_lib', l); route(); };

        c.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
          cfg.mode = b.dataset.mode;
          AIVA.Store.set('ann_cfg', cfg);
          route();
        });

        if (isAdmin) {
          c.querySelectorAll('input[data-up]').forEach(inp => {
            inp.onchange = async (e) => {
              const stageId = inp.dataset.up;
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              const cur = AIVA.Store.get('ann_lib', {});
              cur[stageId] = cur[stageId] || [];
              for (const f of files) {
                if (f.size > 5 * 1024 * 1024) {
                  toast(`${f.name} is over 5 MB — please use shorter clips.`, 'bad');
                  continue;
                }
                const dataURL = await new Promise(res => {
                  const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f);
                });
                cur[stageId].push({ name: f.name, dataURL });
              }
              updateLib(cur);
              toast(`${files.length} file${files.length===1?'':'s'} added.`, 'ok');
            };
          });

          c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
            const [stage, idx] = b.dataset.del.split(':');
            const cur = AIVA.Store.get('ann_lib', {});
            cur[stage]?.splice(+idx, 1);
            updateLib(cur);
          });
        }

        /* Play buttons available to ALL pilots — that's the whole point. */
        c.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
          const [stage, idx] = b.dataset.play.split(':');
          const f = AIVA.Store.get('ann_lib', {})[stage]?.[+idx];
          if (!f) return;
          const a = new Audio(f.dataURL); a.play().catch(e => toast('Playback blocked: ' + e.message, 'bad'));
        });
      }
    },
  };

  /* ----------------------- ROSTER DAY ----------------------- */
  function rosterDayEl(date, big) {
    const iso = ymd(date);
    const today = new Date(); today.setHours(0,0,0,0);
    const isToday = date.toDateString() === today.toDateString();
    const isTmrw  = (date.getTime() - today.getTime()) === 86400000;
    const dayBookings = findBookingsOnDate(iso);
    const hasFlights = dayBookings.length > 0;
    const div = el('div', { class: 'roster-day' + (isToday ? ' today' : '') + (!hasFlights ? ' empty' : '') });
    let dutyHtml = '';
    if (hasFlights) {
      /* Render EVERY sector booked for this day, in dep-time order */
      dutyHtml = dayBookings.map((bk, i) => {
        const f = bk._f;
        if (!f) return `<div class="duty duty-PAIRING">${bk.fno}</div>`;
        return `
          <div class="duty duty-PAIRING" style="${i > 0 ? 'margin-top:4px;' : ''}">
            <div style="font-weight:600;">${f.fno}</div>
            <div style="font-size:10px;color:var(--text-dim);">${f.from} → ${f.to} · ${f.dep}</div>
          </div>`;
      }).join('');
      if (dayBookings.length > 1) {
        dutyHtml = `<div style="font-size:9.5px;color:var(--ai-gold);font-family:var(--font-mono);margin-bottom:4px;">${dayBookings.length} sectors</div>` + dutyHtml;
      }
    } else {
      dutyHtml = `<div class="duty">+ Book day</div>`;
    }
    div.innerHTML = `
      ${isToday ? '<span class="today-pin">TODAY</span>' : isTmrw ? '<span class="today-pin" style="color:var(--ai-red-bright)">TMRW</span>' : ''}
      <div class="day-line">${date.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
      <div class="day-num">${date.getDate()}</div>
      ${dutyHtml}
    `;
    div.onclick = () => {
      if (hasFlights) {
        /* Build a stacked body listing every sector that day */
        const body = el('div', { class:'col gap-3' });
        dayBookings.forEach(bk => {
          const f = bk._f;
          if (!f) return;
          const sectorRow = el('div', { html:`
            <div class="card" style="padding:14px;">
              <div class="row between">
                <div>
                  <div class="display" style="font-size:16px;font-weight:600;">${f.fno} <span class="text-mute mono" style="font-size:11px;">${f.cs}</span></div>
                  <div class="text-mute" style="font-size:11.5px;margin-top:2px;">${AIVA.airport(f.from)?.city} (${f.from}) → ${AIVA.airport(f.to)?.city} (${f.to})</div>
                  <div class="mono" style="font-size:13px;color:var(--text);margin-top:4px;"><b>${f.dep}</b> → <b>${f.arr}</b> LT · ${f.dur}</div>
                </div>
                <div class="col" style="gap:4px;align-items:flex-end;">
                  <span class="pill pill-gold">${f.ac}</span>
                  <span class="text-mute mono" style="font-size:10.5px;">${f.dist} nm</span>
                </div>
              </div>
              <button class="btn btn-ghost btn-sm mt-2" data-rm="${bk.ts}" style="width:100%;">Remove this sector</button>
            </div>
          `});
          sectorRow.querySelector('[data-rm]').onclick = () => {
            setBookings(getBookings().filter(b => !(b.date === iso && b.fno === bk.fno && b.ts === bk.ts)));
            buildNav();
            /* Close any open modal and re-route */
            document.querySelector('.modal-backdrop')?.remove();
            route();
          };
          body.appendChild(sectorRow);
        });
        /* Show summary footer */
        const totalBlock = dayBookings.reduce((s, bk) => s + (bk._f?.durMins || 0), 0);
        body.appendChild(el('div', { class:'text-mute mono mt-2', style:'font-size:11px;text-align:center;', html:
          `${dayBookings.length} sector${dayBookings.length===1?'':'s'} · ${(totalBlock/60).toFixed(1)} block hours total`
        }));
        modal({
          title: `${dayBookings.length === 1 ? 'Flight on' : 'Sectors on'} ${date.toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'short'})}`,
          body,
          actions: [
            { label:'Add another sector', onClick: close => { close(); location.hash = '#book'; }, cls:'btn-ghost' },
            { label:'Clear day', onClick: close => { setBookings(getBookings().filter(b => b.date !== iso)); buildNav(); close(); route(); }, cls:'btn-ghost' },
            { label:'Close', cls:'btn-primary' },
          ],
        });
      } else {
        /* Stash the clicked date so the Book Roster page books FOR that
           day instead of always defaulting to today. Cleared on confirm
           or by the "today" toggle on the Book Roster banner. */
        try { sessionStorage.setItem('book_target_date', iso); } catch {}
        location.hash = '#book';
      }
    };
    return div;
  }

  function quickCard(t, sub, go, icon, isEfb) {
    return `
      <a class="card card-hover qac" style="text-decoration:none;cursor:pointer;" data-go="${go}" ${isEfb ? 'data-efb="1"' : ''}>
        <div class="row" style="color:var(--ai-gold-bright);">${AIVA.Icon(icon, 22)}</div>
        <div class="display mt-2" style="font-size:16px;font-weight:600;color:var(--ai-cream);">${t}</div>
        <div class="text-mute" style="font-size:11px;margin-top:4px;">${sub}</div>
      </a>
    `;
  }

  /* ----------------------- IMPORT helpers ----------------------- */
  function saveLogged(arr) {
    const cur = P.get('flights_logged', []);
    P.set('flights_logged', [...cur, ...arr.map(f => ({ _id: AIVA.U.uid(), ...f }))]);
    buildNav();
  }
  function readManualForm(c) {
    const fno = $('#mFno', c).value.trim();
    if (!fno) { toast('Flight number is required', 'warn'); return null; }
    return {
      date: $('#mDate', c).value || AIVA.U.todayISO(),
      fno, from: $('#mFrom', c).value.trim().toUpperCase(), to: $('#mTo', c).value.trim().toUpperCase(),
      ac: $('#mAc', c).value.trim(),
      reg: $('#mReg', c).value.trim().toUpperCase(),
      durMins: parseDuration($('#mDur', c).value.trim()),
      lndRate: $('#mLnd', c).value ? +$('#mLnd', c).value : null,
      gRate: $('#mG', c).value ? +$('#mG', c).value : null,
      network: $('#mNet', c).value,
      notes: $('#mNotes', c).value.trim(),
      dist: distanceFromCodes($('#mFrom', c).value.trim().toUpperCase(), $('#mTo', c).value.trim().toUpperCase()),
    };
  }
  function distanceFromCodes(from, to) {
    const a = AIVA.airport(from) || AIVA.airportByIcao(from);
    const b = AIVA.airport(to)   || AIVA.airportByIcao(to);
    if (!a || !b) return null;
    return Math.round(distance(a.lat, a.lon, b.lat, b.lon));
  }
  function readCSVFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = e => ingestCSV(e.target.result);
    r.readAsText(file);
  }
  function ingestCSV(text) {
    const { header, rows } = parseCSV(text);
    if (!header.length) return toast('No headers detected', 'bad');
    const fmt = detectFormat(header);
    const keyMap = header.map(mapColumn);
    const flights = rows.map(r => {
      const o = {}; r.forEach((v, i) => { o[keyMap[i]] = v; });
      return {
        date: o.date || AIVA.U.todayISO(),
        fno: o.fno, from: (o.from || '').toUpperCase(), to: (o.to || '').toUpperCase(),
        ac: o.ac || '', reg: (o.reg || '').toUpperCase(),
        durMins: parseDuration(o.dur),
        lndRate: o.lndRate ? +o.lndRate : null,
        gRate: o.gRate ? +o.gRate : null,
        network: o.network || 'OFFLINE',
        notes: o.notes || '',
        dist: distanceFromCodes((o.from || '').toUpperCase(), (o.to || '').toUpperCase()),
      };
    }).filter(f => f.fno);
    if (!flights.length) return toast('No valid flights in file', 'bad');
    saveLogged(flights);
    toast(`Imported ${flights.length} flight${flights.length > 1 ? 's' : ''} (${fmt.toUpperCase()})`, 'ok');
    location.hash = '#flights';
  }
  function exportLog() {
    const logged = P.get('flights_logged', []);
    if (!logged.length) return toast('No flights to export', 'warn');
    const head = 'Date,Flight,From,To,Aircraft,Reg,DurMins,LandingFPM,MaxG,Network,Notes';
    const body = logged.map(f => [f.date, f.fno, f.from, f.to, f.ac, f.reg, f.durMins, f.lndRate, f.gRate, f.network, (f.notes||'').replace(/,/g,';')].join(',')).join('\n');
    const blob = new Blob([head + '\n' + body], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'aiva-flights.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  /* ----------------------- METAR ----------------------- */
  function metarBlock(m) {
    const wrap = el('div', { class: 'card mb-3' });
    const ap = AIVA.airportByIcao(m.icaoId || m.station) || { icao: m.icaoId || m.station, city:'', name:'' };
    wrap.innerHTML = `
      <div class="row between">
        <div>
          <div class="row gap-2">
            <span class="pill pill-gold" style="font-size:10px;">${ap.iata || ''} ${ap.icao || m.icaoId || m.station}</span>
            <span class="text-mute" style="font-size:11px;">${ap.city || ''}</span>
          </div>
        </div>
        <div class="mono text-mute" style="font-size:11px;">${fmtZulu()}</div>
      </div>
      <div class="metar-block mt-3">${m.rawOb || `${ap.icao} ${fmtZulu()} 27015KT 9999 FEW030 30/22 Q1011 NOSIG`}</div>
    `;
    return wrap;
  }

  /* Combined METAR + TAF + D-ATIS + VATSIM-ATIS card */
  function metarFullBlock(icao, wx, atis, vat) {
    const ap = AIVA.airportByIcao(icao) || { icao, city:'', name:'' };
    const wrap = el('div', { class: 'card mb-3' });
    const tafText = wx?.rawTaf || wx?.raw_taf || '';
    const datisDep = (atis || []).find(a => /^D|DEP/i.test(a.type) || a.type === 'dep');
    const datisArr = (atis || []).find(a => /^A|ARR/i.test(a.type) || a.type === 'arr');
    const datisCombined = (atis || []).find(a => a.type === 'combined' || (atis || []).length === 1);
    wrap.innerHTML = `
      <div class="row between mb-2">
        <div>
          <div class="row gap-2">
            <span class="pill pill-gold" style="font-size:10px;">${ap.iata || ''} ${icao}</span>
            <span class="text-mute" style="font-size:11.5px;">${ap.city || ''} ${ap.name ? '· ' + ap.name : ''}</span>
          </div>
        </div>
        <div class="mono text-mute" style="font-size:11px;">${fmtZulu()}</div>
      </div>

      <div class="grid grid-2" style="gap:14px;">
        <div>
          <div class="text-mute mono" style="font-size:10px;letter-spacing:.22em;">METAR</div>
          <div class="metar-block mt-1" style="font-size:12.5px;">${wx?.rawOb || `<span class="text-mute">No live METAR</span>`}</div>
          ${tafText ? `
            <div class="text-mute mono mt-3" style="font-size:10px;letter-spacing:.22em;">TAF</div>
            <div class="metar-block mt-1" style="font-size:12px;line-height:1.55;">${tafText}</div>
          ` : ''}
        </div>
        <div>
          ${datisCombined || (datisDep || datisArr) ? `
            <div class="text-mute mono" style="font-size:10px;letter-spacing:.22em;">D-ATIS ${datisCombined ? '· combined' : datisDep && datisArr ? '· DEP + ARR' : datisDep ? '· DEP' : '· ARR'}</div>
            ${datisCombined ? `
              <div class="metar-block mt-1" style="font-size:12.5px;line-height:1.55;background:rgba(96,165,250,.06);border-color:rgba(96,165,250,.3);">
                <span class="pill" style="font-size:9px;letter-spacing:.18em;background:rgba(96,165,250,.18);color:#93C5FD;">${datisCombined.code || 'INFO'}</span>
                <span class="mt-2" style="display:block;">${datisCombined.datis}</span>
              </div>
            ` : ''}
            ${datisDep && !datisCombined ? `
              <div class="metar-block mt-1" style="font-size:12px;background:rgba(110,231,183,.06);border-color:rgba(110,231,183,.3);">
                <span class="pill" style="font-size:9px;letter-spacing:.18em;background:rgba(110,231,183,.18);color:#6EE7B7;">DEP ${datisDep.code || ''}</span>
                <span class="mt-2" style="display:block;">${datisDep.datis}</span>
              </div>
            ` : ''}
            ${datisArr && !datisCombined ? `
              <div class="metar-block mt-2" style="font-size:12px;background:rgba(252,165,165,.06);border-color:rgba(252,165,165,.3);">
                <span class="pill" style="font-size:9px;letter-spacing:.18em;background:rgba(252,165,165,.18);color:#FCA5A5;">ARR ${datisArr.code || ''}</span>
                <span class="mt-2" style="display:block;">${datisArr.datis}</span>
              </div>
            ` : ''}
          ` : vat ? `
            <div class="text-mute mono" style="font-size:10px;letter-spacing:.22em;">VATSIM ATIS · ${vat.callsign}</div>
            <div class="metar-block mt-1" style="font-size:12px;background:rgba(168,85,247,.06);border-color:rgba(168,85,247,.3);">
              <span class="pill" style="font-size:9px;background:rgba(168,85,247,.18);color:#D8B4FE;">${vat.atis_code || 'LIVE'} on ${vat.frequency || '—'}</span>
              <span class="mt-2" style="display:block;">${(vat.text_atis || []).join(' ')}</span>
            </div>
          ` : `
            <div class="text-mute mono" style="font-size:10px;letter-spacing:.22em;">ATIS</div>
            <div class="text-mute mt-2" style="font-size:12.5px;line-height:1.6;">
              No live D-ATIS available for ${icao}.<br>
              D-ATIS is published by the FAA for US airports. Outside FAA airspace, watch for a VATSIM controller.
            </div>
          `}
        </div>
      </div>
    `;
    return wrap;
  }
  function simulatedMetar(c) {
    const wd = String(Math.floor(Math.random()*360)).padStart(3,'0');
    const ws = String(5 + Math.floor(Math.random()*15)).padStart(2,'0');
    return { icaoId: c, rawOb: `${c} ${fmtZulu()} ${wd}${ws}KT 9999 FEW030 SCT100 30/22 Q1011 NOSIG` };
  }

  /* ----------------------- VIHAAN reply engine ----------------------- */
  function vihaanReply(q) {
    const ql = q.toLowerCase();
    const F = AIVA.FLIGHTS;

    /* "next flight" */
    if (/next flight|my next|active flight|today/.test(ql)) {
      const today = ymd();
      const bookings = P.get('roster_bookings', []);
      const todayBk = bookings.find(b => b.date === today);
      const next = bookings.filter(b => b.date > today).sort((a,b) => a.date.localeCompare(b.date))[0];
      if (todayBk) {
        const f = AIVA.findFlight(todayBk.fno);
        return f ? `Your active flight today is <b>${f.fno}</b> · ${f.from} → ${f.to} · ${f.ac} · STD ${f.dep} LT.` : 'Today\'s flight is on roster.';
      }
      if (next) {
        const f = AIVA.findFlight(next.fno);
        return f ? `Your next flight is <b>${f.fno}</b> on ${next.date} · ${f.from} → ${f.to} · ${f.ac}.` : `Next flight on ${next.date}.`;
      }
      return `No flights on your roster yet. <a href="#book" class="text-gold">Tap here to book one</a>.`;
    }

    /* "X departures" / "from X" */
    const apM = ql.match(/\b([a-z]{3})\b\s*(departures?|from|out of)/);
    if (apM) {
      const code = apM[1].toUpperCase();
      const out = F.filter(f => f.from === code);
      if (!out.length) return `No departures from <b>${code}</b> in the schedule.`;
      const dests = [...new Set(out.map(f => f.to))];
      return `<b>${out.length} flights</b> depart from ${code} to ${dests.length} destinations: ${dests.slice(0,12).join(', ')}${dests.length>12?` and ${dests.length-12} more`:''}.`;
    }
    if (/ccu|kolkata/.test(ql)) {
      const out = F.filter(f => f.from === 'CCU');
      const dests = [...new Set(out.map(f => f.to))];
      return `<b>${out.length} flights</b> depart Kolkata (CCU) covering ${dests.length} destinations: ${dests.join(', ')}.`;
    }
    if (/bengaluru|bangalore|blr.*international|blr international/.test(ql)) {
      const intl = F.filter(f => f.from === 'BLR' && AIVA.airport(f.to)?.country !== 'India');
      const dests = [...new Set(intl.map(f => f.to))];
      return `BLR has ${intl.length} international departures to: ${dests.join(', ')}.`;
    }

    /* "X aircraft routes" */
    const acM = ql.match(/\b(a350|a320neo|a321neo|a320|a321|b777|b787-?9|b787-?8|b737\s*max|b737-?800|b737)\b/i);
    if (acM && /route|flight|where/.test(ql)) {
      const map = { 'a350':'A350-900','a320neo':'A320neo','a321neo':'A321neo','a320':'A320neo','a321':'A321neo','b777':'B777-300ER','b787-9':'B787-9','b787 9':'B787-9','b787-8':'B787-8','b787 8':'B787-8','b787':'B787-8','b737max':'B737 MAX 8','b737 max':'B737 MAX 8','b737-800':'B737-800','b737800':'B737-800','b737':'B737-800' };
      const ac = map[acM[1].toLowerCase().replace(/\s+/g,'')] || map[acM[1].toLowerCase()];
      if (ac) {
        const matches = F.filter(f => f.ac === ac);
        const dests = [...new Set(matches.map(f => f.to))];
        return `<b>${matches.length} flights</b> use the ${ac}, reaching ${dests.length} destinations: ${dests.slice(0,16).join(', ')}${dests.length>16?'...':''}.`;
      }
    }

    /* longest route */
    if (/longest|farthest|biggest/.test(ql)) {
      const longest = [...F].sort((a,b) => b.dist - a.dist)[0];
      return `The longest route is <b>${longest.fno}</b> · ${longest.from} → ${longest.to} · ${longest.ac} · <b>${AIVA.U.fmtNum(longest.dist)} nm</b> (block ${longest.dur}).`;
    }
    if (/shortest/.test(ql)) {
      const shortest = [...F].filter(f => f.dist > 0).sort((a,b) => a.dist - b.dist)[0];
      return `The shortest route is <b>${shortest.fno}</b> · ${shortest.from} → ${shortest.to} · ${shortest.ac} · <b>${AIVA.U.fmtNum(shortest.dist)} nm</b> (block ${shortest.dur}).`;
    }

    /* FDTL */
    if (/fdtl|duty|rest/.test(ql)) {
      return `Per <b>DGCA CAR 7-J Part III</b> (effective 01 Nov 2025): max <b>60 hrs / 7 days</b>, <b>100 hrs / 28 days</b>, <b>1000 hrs / 365 days</b>. FDP cap = flight time + 1 hr. Max 2 night landings/week, 48 hr weekly rest. WOCL window 0000–0500 IST. Track your usage at <a href="#fdtl" class="text-gold">FDTL Tracker</a>.`;
    }

    /* total counts */
    if (/how many|total|count/.test(ql)) {
      return `AIVA covers <b>${F.length} flights</b> across <b>${new Set([...F.map(f=>f.from), ...F.map(f=>f.to)]).size} airports</b>: ${F.filter(f=>f.op==='AI').length} Air India mainline (AI/AIC) and ${F.filter(f=>f.op==='IX').length} Air India Express (IX/AXB).`;
    }

    /* search by route pair */
    const pairM = ql.match(/\b([a-z]{3})\s*(?:to|→|-|→)\s*([a-z]{3})\b/);
    if (pairM) {
      const a = pairM[1].toUpperCase(), b = pairM[2].toUpperCase();
      const matches = F.filter(f => f.from === a && f.to === b);
      if (!matches.length) return `No direct flights ${a} → ${b}.`;
      return `${matches.length} flights ${a} → ${b}: ${matches.slice(0,10).map(f => `${f.fno} (${f.ac}, ${f.dep})`).join(' · ')}${matches.length>10?'...':''}`;
    }

    /* default */
    return `I can help with: <b>your next flight</b>, <b>routes from any airport</b> (e.g. "CCU departures"), <b>aircraft-specific routes</b> ("A350 routes"), <b>FDTL</b>, <b>longest route</b>, totals, or any pair like "DEL to LHR".`;
  }

  /* Inject Vihaan chat styles */
  if (!document.getElementById('vihaan-style')) {
    const s = document.createElement('style');
    s.id = 'vihaan-style';
    s.textContent = `
      .vmsg { padding: 10px 14px; border-radius: 14px; margin-bottom: 8px; max-width: 88%; font-size: 13.5px; line-height: 1.55; animation: fadeUp .25s var(--ease-emph); }
      .vmsg.vbot { background: var(--surface-2); border: 1px solid var(--border); border-top-left-radius: 4px; }
      .vmsg.vuser { background: linear-gradient(135deg, var(--ai-red), var(--ai-red-deep)); color: var(--ai-cream); margin-left: auto; border-top-right-radius: 4px; }
      .vmsg b { color: var(--ai-gold-bright); font-weight: 600; }
      .vmsg a { color: var(--ai-gold-bright); }
      .vchip { background: rgba(199,165,108,.08); border: 1px solid var(--border-gold); color: var(--ai-gold-bright); padding: 6px 12px; border-radius: 99px; font-size: 11.5px; cursor: pointer; transition: all .2s; }
      .vchip:hover { background: rgba(199,165,108,.18); }
    `;
    document.head.appendChild(s);
  }

  /* ----------------------- BOOT ----------------------- */
  shell();
  route();
})();
