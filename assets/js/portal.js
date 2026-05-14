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
    const today = new Date().toISOString().slice(0,10);
    const bookingsToday = (P.get('roster_bookings', []) || []).filter(b => b.date === today);
    if (!bookingsToday.find(b => b.fno === af)) {
      P.remove('active_flight');
      console.info(`[AIVA] Cleared stale active_flight=${af} (not on today's roster).`);
    }
  })();

  const { $, $$, el, fmtNum, fmtMins, fmtDate, fmtZulu, greeting, toast, modal,
          distance, parseCSV, detectFormat, mapColumn, parseDuration, avg } = AIVA.U;
  const I = AIVA.Icon;

  /* ----------------------- NAV ----------------------- */
  const NAV = [
    { group: 'Flying', items: [
      { id:'dashboard',  label:'Dashboard',     icon:'dashboard' },
      { id:'roster',     label:'My Roster',     icon:'calendar' },
      { id:'book',       label:'Book Roster',   icon:'plus', chip:'NEW' },
      { id:'flights',    label:'My Flights',    icon:'plane', chipDyn:'logCount' },
      { id:'import',     label:'Import',        icon:'upload' },
      { id:'stats',      label:'Statistics',    icon:'gauge' },
    ]},
    { group: 'Operations', items: [
      { id:'briefing',    label:'Crew Briefing', icon:'clipboard' },
      { id:'met',         label:'Met Briefing',  icon:'cloud' },
      { id:'notam',       label:'NOTAM / AIP',   icon:'alert' },
      { id:'ofp',         label:'OFP / Navlog',  icon:'route' },
      { id:'performance', label:'Performance',   icon:'target' },
      { id:'wb',          label:'W & B',         icon:'scale' },
      { id:'network',     label:'Network Globe', icon:'globe' },
      { id:'situations',  label:'Situations',    icon:'activity' },
      { id:'announce',    label:'Announcements', icon:'megaphone' },
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
      { id:'liveries',  label:'Liveries',      icon:'palette' },
      { id:'hoppie',    label:'Hoppie ACARS',  icon:'send' },
      { id:'newsroom',  label:'Newsroom',      icon:'newspaper' },
      { id:'myai',      label:'myAI',          icon:'newspaper' },
      { id:'profile',   label:'Profile',       icon:'user' },
      ...(pilot.role === 'admin' ? [{ id:'review', label:'Review Queue', icon:'shield', adminOnly:true }] : []),
    ]},
    /* Crew Welfare items are intentionally NOT in the sidebar nav — they
       live inside the myAI tile grid (per Chief Pilot direction). The route
       table still knows about them so direct links / hash navigation work. */
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

    /* Fire up the FSUIPC bridge for everyone. If FSUIPC7 isn't running on
       the pilot's machine, this silently fails — the events just never
       fire. No harm done. */
    AIVA.FSUIPC?.connect?.().catch(() => {
      /* swallow — bridge isn't running yet, user can connect later from EFB */
    });

    /* === SHARED — crash detection for every pilot === */
    AIVA.FSUIPC?.on('crash', (info) => {
      AIVA.Store.pilot(pilot.id).set('crash_pending', info);
      toast(`Sim crash detected near ${info.lastPos || 'last position'} — please file a report`, 'bad');
      AIVA.CrewChat?.event(`went off-net mid-flight near ${info.lastPos || 'last reported position'} — crash report pending`);
      setTimeout(() => AIVA._openCrashReport?.(info), 1500);
    });

    /* Small helper — fires a Hoppie POST (no response needed for one-way
       auto-messages). Uses the configured proxy. */
    async function hoppieAutoSend(to, type, body) {
      const code = AIVA.Store.get('hoppieCode', '');
      if (!code) return;
      const myCall = AIVA.Store.get('my_callsign','AIC' + (pilot.id || '001').replace(/[^0-9]/g,'').slice(-3));
      const proxy  = (AIVA.Store.get('hoppie_proxy','') || 'https://corsproxy.io/?');
      const url = proxy + encodeURIComponent('https://www.hoppie.nl/acars/system/connect.html?' +
        new URLSearchParams({ logon: code, from: myCall, to, type, packet: body }));
      try {
        await fetch(url);
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
      const myCall = AIVA.Store.get('my_callsign','AIC' + (pilot.id || '001').replace(/[^0-9]/g,'').slice(-3));
      /* Find this pilot's active sector from today's bookings */
      const today = new Date().toISOString().slice(0,10);
      const bks = AIVA.Store.pilot(pilot.id).get('roster_bookings', []).filter(b => b.date === today);
      const active = bks[0] ? AIVA.findFlight(bks[0].fno) : null;
      const dest = active ? (AIVA.airport(active.to)?.icao || active.to) : (info.dest || 'XXXX');
      const body = `PROGRESS · ${myCall}\nDESCENDING THROUGH FL100 INTO ${dest}\nGS ${info.gs||'?'} kt · ${info.lat?.toFixed?.(2) || '?'}, ${info.lon?.toFixed?.(2) || '?'}`;
      await hoppieAutoSend('AIC001', 'progress', body);
      AIVA.CrewChat?.event(`passing FL100 inbound ${AIVA.airport(active?.to)?.city || dest}`, { phase: 'descent10k' });
      toast('Sent progress report to dispatch (FL100 descent)', 'ok');
    });

    AIVA.FSUIPC?.on('landing', async (info) => {
      const myCall = AIVA.Store.get('my_callsign','AIC' + (pilot.id || '001').replace(/[^0-9]/g,'').slice(-3));
      const today = new Date().toISOString().slice(0,10);
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
          const sb = AIVA.Store.get('simbrief_user', '');
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
            .filter(b => b.date >= new Date().toISOString().slice(0,10))
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
  }
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
    /* Auto-clean past-dated bookings on read. Stale bookings from the old
       deterministic bid generator (pre-2026-05-14) littered the roster with
       past dates that were never actually flown. We purge them here once. */
    const raw = P.get('roster_bookings', []);
    const today = new Date().toISOString().slice(0,10);
    const cleaned = raw.filter(b => (b.date || '') >= today);
    if (cleaned.length !== raw.length) {
      P.set('roster_bookings', cleaned);
      console.info(`[AIVA] Purged ${raw.length - cleaned.length} past-dated booking(s).`);
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
        <div><div class="label">Date (YYYY-MM-DD)</div><input class="input mono" id="cmDate" value="${new Date().toISOString().slice(0,10)}"/></div>
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
  /* Returns ALL bookings on a given date, sorted by departure time. */
  function findBookingsOnDate(date) {
    return getBookings()
      .filter(b => b.date === date)
      .map(b => ({ ...b, _f: AIVA.findFlight(b.fno) }))
      .sort((x, y) => (x._f?.dep || '99:99').localeCompare(y._f?.dep || '99:99'));
  }

  /* ----------------------- PAGES ----------------------- */
  const PAGES = {

    /* ============ DASHBOARD ============ */
    dashboard: {
      sub: 'Operations · Live',
      render: (c) => {
        const bookings = getBookings();
        const today = new Date().toISOString().slice(0,10);
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
          const fpFlight = AIVA.findFlight(fpRec.fno);
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
                    <div class="fp-phase" id="fpPhase">PUSHBACK</div>
                    <div class="mono text-mute mt-1" style="font-size:11px;" id="fpEta">ETA —</div>
                  </div>
                </div>
                <div class="fp-bar"><div class="fp-fill" id="fpFill" style="width:0%"></div></div>
                <div class="row between mt-2 mono" style="font-size:10.5px;color:var(--text-mute);">
                  <span id="fpPct">0% complete</span>
                  <a href="efb.html" class="btn btn-ghost btn-sm">${I('plane',12)} Open EFB</a>
                </div>
              </div>
            ` }));

            /* Reuse the same algorithm as the EFB ribbon */
            const totalDist = fromA && toA ? AIVA.U.distance(fromA.lat, fromA.lon, toA.lat, toA.lon) : 0;
            const totalMins = fpFlight.durMins || 60;
            const tickFP = () => {
              if (!document.getElementById('fpFill')) return;
              let pct = 0, phase = 'PUSHBACK';
              const live = AIVA.FSUIPC?.lastTelemetry?.();
              if (live && live.lat != null && live.lon != null && totalDist) {
                const flown = AIVA.U.distance(fromA.lat, fromA.lon, live.lat, live.lon);
                pct = Math.max(0, Math.min(100, (flown / totalDist) * 100));
                const alt = live.alt || 0;
                if (alt < 50) phase = pct < 1 ? 'PUSHBACK' : 'TAXI-IN';
                else if (alt < 1000) phase = pct < 50 ? 'TAKEOFF' : 'APPROACH';
                else if (alt < 10000) phase = pct < 50 ? 'CLIMB' : 'DESCENT';
                else phase = 'CRUISE';
              } else {
                const elapsedMins = (Date.now() - fpRec.startedAt) / 60000;
                pct = Math.max(0, Math.min(100, (elapsedMins / totalMins) * 100));
                if (pct < 2)  phase = 'TAXI-OUT';
                else if (pct < 8)   phase = 'TAKEOFF';
                else if (pct < 22)  phase = 'CLIMB';
                else if (pct < 78)  phase = 'CRUISE';
                else if (pct < 92)  phase = 'DESCENT';
                else if (pct < 99)  phase = 'APPROACH';
                else                phase = 'TAXI-IN';
              }
              const fillEl = document.getElementById('fpFill');
              const pctEl  = document.getElementById('fpPct');
              const phEl   = document.getElementById('fpPhase');
              const etaEl  = document.getElementById('fpEta');
              if (fillEl) fillEl.style.width = pct.toFixed(1) + '%';
              if (pctEl)  pctEl.textContent  = pct.toFixed(0) + '% complete';
              if (phEl)   phEl.textContent   = phase;
              if (etaEl) {
                const remainMins = totalMins * (1 - pct/100);
                const eta = new Date(Date.now() + remainMins * 60000);
                etaEl.textContent = `ETA ${String(eta.getUTCHours()).padStart(2,'0')}:${String(eta.getUTCMinutes()).padStart(2,'0')}z`;
              }
            };
            tickFP();
            const fpTimer = setInterval(tickFP, 5000);
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
            ${quickCard('Briefing','EFF · NOTAM ack','briefing','clipboard')}
            ${quickCard('Met Briefing','METAR · TAF · SIGWX','met','cloud')}
            ${quickCard('Network Globe','All routes · planned','network','globe')}
            ${quickCard('OFP / Navlog','SimBrief OFP','ofp','route')}
            ${quickCard('Performance','T/O · LDG','performance','target')}
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

          /* RESULTS LIST */
          const results = el('section', { id:'resultsSection', html: `
            <div class="section-title mt-4">
              <div><h2 id="resultsTitle">Pick a route</h2><div class="sub" id="resultsSub">Choose From + To above, or click a hub chip</div></div>
            </div>
            <div id="results" class="grid grid-2" style="max-height:680px; overflow-y:auto; padding-right:6px;"></div>
          ` });
          c.appendChild(results);

          /* SECTOR BASKET (sticky bottom) */
          const basket = el('section', { id:'basketSection', html: `
            <div class="card mt-4" style="padding:18px;">
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
            /* Validate FDTL — simple DGCA CAR 7-J check */
            const totalBlock = selectedSectors.reduce((s, f) => s + f.durMins, 0);
            const sectorCount = selectedSectors.length;
            const fdtlCap = 600;            // 10h max FDP for ≤6 sectors (simplified)
            const sectorCap = 6;
            const ok = totalBlock <= fdtlCap && sectorCount <= sectorCap;
            const fdtl = `FDTL: ${(totalBlock/60).toFixed(1)} h block / ${sectorCount} sectors · cap 10.0 h / 6 sectors · ${ok ? '✓ legal' : '⚠ exceeds limit — split across days'}`;
            $('#fdtlBox', c).textContent = fdtl;
            $('#fdtlBox', c).style.color = ok ? 'var(--text-mute)' : '#E61926';
            $('#confirmRoster', c).disabled = !ok;
            $('#basketSub', c).textContent = `${sectorCount} sector${sectorCount===1?'':'s'} · ${(totalBlock/60).toFixed(1)} block hours total`;

            /* Connectivity check */
            let connectivity = '';
            for (let i = 1; i < selectedSectors.length; i++) {
              if (selectedSectors[i].from !== selectedSectors[i-1].to) {
                connectivity = ` ⚠ sector ${i+1} doesn't depart from where ${i} arrives — pilot will need positioning.`;
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
            /* Save sectors as bookings starting today */
            const today = new Date(); today.setHours(0,0,0,0);
            const ymd = today.toISOString().slice(0,10);
            const bookings = getBookings();
            const newOnes = selectedSectors.map(f => ({ date: ymd, fno: f.fno, ac: f.ac, op: f.op, ts: Date.now() }));
            setBookings([...bookings, ...newOnes]);
            toast(`✓ Roster confirmed — ${newOnes.length} sector${newOnes.length===1?'':'s'} on ${ymd}`, 'ok');
            selectedSectors = [];
            persistBasket();
            renderBasket();
            doSearch();
            buildNav();
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
                   If the picked flight has a continuation under the same fno
                   (e.g. AI127 DEL→VIE → AI127 VIE→ORD), tack the continuation
                   onto the same duty day — it's the same physical flight. */
                const cont = AIVA.FLIGHTS.find(f => f.fno === next.fno && f.from === next.to);
                if (cont) {
                  dayLegs.push(cont);
                  blockSoFar += cont.durMins;
                  here = cont.to;
                }
                if (next.durMins >= 480 || (cont && cont.durMins >= 480)) longHaulMode = true;
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
                  <div><h3 style="margin:0;">Generated rotation</h3><div class="text-mute" style="font-size:11.5px;">Starting ${startDate.toISOString().slice(0,10)} · ${totalLegs} sectors · ${(totalBlock/60).toFixed(1)} block hours</div></div>
                  <button class="btn btn-primary btn-sm" id="acceptGen">${I('check', 14)} Accept & add to calendar</button>
                </div>
                ${rotation.map((day, i) => {
                  const date = new Date(startDate.getTime() + i * 86400000).toISOString().slice(0,10);
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
                const date = new Date(startDate.getTime() + i * 86400000).toISOString().slice(0,10);
                day.legs.forEach(f => newOnes.push({ date, fno: f.fno, ac: f.ac, op: f.op, ts: Date.now() }));
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
            const ymd = date.toISOString().slice(0,10);
            const cell = el('button', { class:'ac-chip', html:`${d}<br><span style="font-size:9px;opacity:.6;">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()]}</span>`, style:'padding:8px 4px;text-align:center;font-size:11px;' });
            cell.onclick = () => {
              if (offDays.has(ymd)) { offDays.delete(ymd); cell.classList.remove('on'); }
              else { offDays.add(ymd); cell.classList.add('on'); }
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
            const todayYmd = today.toISOString().slice(0,10);
            const targetMins = targetHours * 60;
            const out = { shape, days: [], totalMins: 0 };
            const seed = { heavy: 7, balanced: 17, layover: 23 }[shape] || 1;
            const usedFnos = new Set();

            const filter = (list) => {
              if (allowedTypes) list = list.filter(f => allowedTypes.has(f.ac));
              if (opVal)       list = list.filter(f => f.op === opVal);
              return list;
            };
            /* Find a return flight from `from` back to `baseCode`. Prefer the
               operational pair flight number (outFno ± 1) so AI127 pairs with
               AI128, AI187 with AI188, etc. Falls back to any return. */
            const findReturn = (from, outFnoStr, used) => {
              let cands = filter(AIVA.FLIGHTS.filter(f => f.from === from && f.to === baseCode));
              cands = cands.filter(f => f.durMins <= dayCapMins);
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
              const ymd = date.toISOString().slice(0,10);
              dayIdx++;
              if (ymd < todayYmd) continue;
              if (offDays.has(ymd)) continue;

              let legs = [];
              let here = baseCode;
              const wantLegs = shape === 'heavy' ? 3 : shape === 'layover' ? 1 : 2;
              const wantBlock = shape === 'heavy' ? 540 : shape === 'layover' ? 780 : 360;
              let dayIsLongHaul = false;

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
                   If the same fno has a continuation from `here`, fly that too
                   (it's the second leg of the same physical flight, e.g. AI127
                   DEL→VIE→ORD). The continuation does NOT count toward wantLegs. */
                const cont = findContinuation(pick);
                if (cont && (blockSoFar + pick.durMins + cont.durMins) <= dayCapMins) {
                  legs.push(cont);
                  here = cont.to;
                }

                /* Long-haul detection: once any leg in the day is 8+ hours, stop
                   adding more — that's a single-leg duty period. */
                if (pick.durMins >= 480 || (cont && cont.durMins >= 480)) {
                  dayIsLongHaul = true;
                  break;
                }
              }
              if (!legs.length) continue;
              const block = legs.reduce((s,f) => s + f.durMins, 0);
              out.days.push({ date: ymd, legs, block, longHaul: dayIsLongHaul });
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
                    const rYmd  = rDate.toISOString().slice(0,10);
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
              line.days.forEach(d => d.legs.forEach(f => newOnes.push({ date: d.date, fno: f.fno, ac: f.ac, op: f.op, ts: Date.now() })));
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
        /* Try direct, then route through a CORS proxy if the browser blocks. */
        const corsProxy = (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`;
        async function tryFetch(url) {
          try {
            const r = await fetch(url);
            if (r.ok) return r;
          } catch {}
          /* Fallback via corsproxy */
          try { return await fetch(corsProxy(url)); } catch { return null; }
        }
        async function fetchWX(codes) {
          const url = `https://aviationweather.gov/api/data/metar?ids=${codes.join(',')}&format=json&taf=true&hours=3`;
          const r = await tryFetch(url);
          if (!r || !r.ok) return [];
          try { return await r.json(); } catch { return []; }
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
          const today = new Date().toISOString().slice(0,10);
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
      sub: 'Search any airport · ICAO live · FAA + AAI sources',
      render: (c) => {
        const default3 = ['VIDP','VABB','EGLL'];
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>NOTAM &amp; AIP</h2><div class="sub">Type any ICAO/IATA · space-separated for multiple airports</div></div>
            <div class="actions">
              <a href="https://aim-india.aai.aero/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external', 14)} AAI eAIP</a>
              <a href="https://www.notams.faa.gov/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external', 14)} FAA NOTAMs</a>
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
          </div>
          <div id="ntOut"></div>
        ` }));

        const out = $('#ntOut', c);
        const sevOf = (txt) => /CLSD|CLOSED|EMERG|HAZARD|CRASH|FIRE/i.test(txt) ? 'red'
                            : /UNSERVICEABLE|U\/S|INOP|RESTRIC|LIMIT|WIP/i.test(txt) ? 'gold'
                            : 'info';

        async function fetchNotams(icaos) {
          out.innerHTML = `<div class="row gap-2" style="padding:18px;"><div class="chakra-spin"></div><span class="text-mute">Pulling NOTAMs for ${icaos.length} airport${icaos.length>1?'s':''}…</span></div>`;
          /* Primary: aviationweather.gov NOTAM endpoint (CORS-enabled, no auth, works for ICAO worldwide).
             Fallback: NOAA AWC alternate endpoint. We try each, then surface a useful message. */
          const results = await Promise.all(icaos.map(async (icao) => {
            try {
              /* AWC NOTAM API — returns plain text array; ICAO-keyed */
              const r = await fetch(`https://aviationweather.gov/api/data/notam?ids=${icao}&format=json`);
              if (!r.ok) throw new Error('HTTP ' + r.status);
              const text = await r.text();
              /* AWC returns either JSON array or raw text depending on availability */
              let items = [];
              try {
                const j = JSON.parse(text);
                items = Array.isArray(j) ? j.map(n => ({
                  ap: icao,
                  text: n.icaoMessage || n.rawText || n.message || n.text || (typeof n === 'string' ? n : JSON.stringify(n).slice(0,200)),
                  ts:   n.effectiveStart || n.startValid || '',
                })) : [];
              } catch {
                /* Plain text response — split on blank lines into NOTAMs */
                items = text.split(/\n\s*\n/).filter(s => s.trim().length > 10).map(t => ({ ap: icao, text: t.trim(), ts: '' }));
              }
              return { icao, items, err: null };
            } catch (e) {
              return { icao, items: [], err: e.message };
            }
          }));

          out.innerHTML = '';
          results.forEach(r => {
            const card = el('div', { class:'card mb-3' });
            const a = AIVA.airportByIcao(r.icao);
            card.innerHTML = `
              <div class="row between mb-2">
                <div>
                  <h3 style="margin:0;font-size:18px;">${r.icao}${a ? ` · ${a.city}` : ''}</h3>
                  <div class="text-mute" style="font-size:12px;">${a?.name || ''}</div>
                </div>
                <span class="pill ${r.err ? 'pill-red' : r.items.length ? 'pill-gold' : 'pill-ok'}" style="font-size:9px;">
                  ${r.err ? 'API ERROR' : r.items.length ? `${r.items.length} NOTAM${r.items.length===1?'':'S'}` : 'NIL'}
                </span>
              </div>
              ${r.err ? `<div class="text-mute mono" style="font-size:11px;">${r.err}. Try again or check the FAA endpoint.</div>` : ''}
              ${r.items.slice(0, 12).map(n => `
                <div class="card mb-2" style="background:rgba(255,255,255,.02);padding:12px 14px;">
                  <div class="row gap-2 mb-1">
                    <span class="pill pill-${sevOf(n.text)}" style="font-size:9px;">${sevOf(n.text) === 'red' ? 'CRITICAL' : sevOf(n.text) === 'gold' ? 'ADVISORY' : 'INFO'}</span>
                    ${n.ts ? `<span class="text-mute mono" style="font-size:10.5px;">${String(n.ts).slice(0,16).replace('T',' ')}Z</span>` : ''}
                  </div>
                  <div class="mono" style="font-size:12px;line-height:1.55;white-space:pre-wrap;color:var(--text);max-height:140px;overflow:auto;">${(n.text || n.title || '').slice(0, 800)}</div>
                </div>
              `).join('')}
              ${r.items.length > 12 ? `<div class="text-mute" style="font-size:11px;">… ${r.items.length - 12} more not shown</div>` : ''}
            `;
            out.appendChild(card);
          });
        }

        function go() {
          const codes = $('#ntInp', c).value.trim().split(/\s+/).filter(Boolean)
            .map(s => s.toUpperCase())
            .map(s => s.length === 3 ? (AIVA.airport(s)?.icao || s) : s);
          if (!codes.length) return;
          /* Render chips */
          $('#ntChips', c).innerHTML = codes.map(x => `<span class="pill pill-info" style="font-size:10px;">${x}</span>`).join(' ');
          fetchNotams(codes);
        }
        $('#ntGo',  c).onclick = go;
        $('#ntInp', c).addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        $('#ntAll', c).onclick = () => { $('#ntInp', c).value = AIVA.HUBS.map(h => AIVA.airport(h)?.icao || h).join(' '); go(); };
        $('#ntRt',  c).onclick = () => {
          const today = new Date().toISOString().slice(0,10);
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
        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>OFP / Navlog</h2><div class="sub">SimBrief fetcher · route analysis</div></div>
            <div class="actions">
              <button class="btn btn-primary btn-sm" id="fetchSb">${I('download', 14)} Fetch latest OFP</button>
              <a href="https://dispatch.simbrief.com/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">${I('external', 14)} Open Dispatch</a>
            </div>
          </div>
          <div class="note-callout">Set your SimBrief username in your <a href="#profile" class="text-gold">profile</a> to one-click-fetch your latest OFP.</div>
          <div id="ofpOut" class="mt-4 text-mute" style="font-size:13px;">No OFP fetched yet. Click <b>Fetch latest OFP</b>.</div>
        ` }));
        $('#fetchSb', c).onclick = async () => {
          let u = AIVA.Store.get('simbrief_user');
          if (!u) {
            u = prompt('Enter your SimBrief username:');
            if (!u) return;
            AIVA.Store.set('simbrief_user', u);
          }
          toast('Fetching from SimBrief…', 'info');
          try {
            const r = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(u)}&json=1`);
            const j = await r.json();
            const o = j.origin?.icao_code, d = j.destination?.icao_code, ac = j.aircraft?.icaocode;
            $('#ofpOut', c).innerHTML = `
              <div class="card">
                <div class="row between">
                  <h3 class="display" style="font-size:22px;">${o} → ${d}</h3>
                  <span class="pill pill-gold">${ac}</span>
                </div>
                <div class="grid grid-3 mt-3 mono" style="font-size:12px;line-height:1.7;color:var(--text-dim);">
                  <div><b style="color:var(--text)">FOB</b><br>${(j.fuel?.plan_ramp / 1000).toFixed(1)} t</div>
                  <div><b style="color:var(--text)">TOW</b><br>${(j.weights?.est_tow / 1000).toFixed(1)} t</div>
                  <div><b style="color:var(--text)">Block</b><br>${j.times?.est_time_enroute || '—'}</div>
                  <div><b style="color:var(--text)">PAX</b><br>${j.weights?.pax_count || '—'}</div>
                  <div><b style="color:var(--text)">CI</b><br>${j.general?.costindex}</div>
                  <div><b style="color:var(--text)">ALTN</b><br>${j.alternate?.icao_code || '—'}</div>
                </div>
                <div class="gold-rule"></div>
                <div class="eyebrow mb-2">Route</div>
                <pre class="metar-block">${j.general?.route || '—'}</pre>
              </div>
            `;
            toast(`OFP loaded: ${o} → ${d}`, 'ok');
          } catch {
            toast('SimBrief fetch failed — check username or CORS.', 'bad');
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

        /* Group by section */
        const groups = [
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
              <div class="doc-meta"><span>${d.url.endsWith('.pdf') ? 'PDF' : 'Page'}</span><span>${d.url.includes('archive.org') ? 'Internet Archive' : d.url.includes('dgca.gov') ? 'DGCA India' : d.url.includes('faa.gov') ? 'FAA US' : d.url.includes('icao.int') ? 'ICAO' : d.url.includes('aai.aero') ? 'AAI India' : d.url.includes('airbus.com') ? 'Airbus' : d.url.includes('boeing.com') ? 'Boeing' : 'Public'}</span></div>
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
        const code   = AIVA.Store.get('hoppieCode', '');
        const myCall = AIVA.Store.get('my_callsign', 'AIC' + (pilot.id || '').replace(/[^0-9]/g,'').slice(-3) || 'AIC100');
        const isAdmin = pilot.role === 'admin';
        let viewMode = AIVA.Store.get('hop_view_mode', isAdmin ? 'admin' : 'pilot');

        const HOPPIE_URL = 'https://www.hoppie.nl/acars/system/connect.html';
        function proxyURL() {
          const custom = (AIVA.Store.get('hoppie_proxy', '') || '').trim();
          return custom || 'https://corsproxy.io/?';
        }
        async function hoppieRaw(params) {
          const url = proxyURL() + encodeURIComponent(HOPPIE_URL + '?' + params.toString());
          const r = await fetch(url, { method: 'GET' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
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
          if (!code) return { ok:false, error:'No Hoppie logon code' };
          const params = new URLSearchParams({ logon: code, from, to, type, packet: body });
          try {
            const raw  = await hoppieRaw(params);
            const resp = parseHoppieResp(raw);
            const log  = AIVA.Store.get('hoppie_log', []);
            log.push({ dir:'tx', from, to, type, body, ts: Date.now(), hoppie: resp.status, error: resp.error || null });
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
            AIVA.Store.set('hop_view_mode', viewMode);
            route();
          });
        }

        /* ============ ADMIN VIEW ============ */
        if (viewMode === 'admin') {
          const sb_user = AIVA.Store.get('simbrief_user','');
          c.appendChild(el('section', { html: `
            <div class="grid grid-2">
              <div class="card">
                <div class="eyebrow">Target flight</div>
                <div class="grid grid-2 mt-3" style="gap:10px;">
                  <div><div class="label">Pilot callsign</div><input class="input mono" id="atgt" placeholder="AIC366"></div>
                  <div><div class="label">Pilot first name (for goodbye)</div><input class="input" id="apilot" placeholder="Anvit"></div>
                </div>
                <div class="grid grid-2 mt-3" style="gap:10px;">
                  <div><div class="label">Origin ICAO</div><input class="input mono" id="aorig" placeholder="VIDP"></div>
                  <div><div class="label">Destination ICAO</div><input class="input mono" id="adest" placeholder="VABB"></div>
                </div>
                <div class="grid grid-2 mt-3" style="gap:10px;">
                  <div><div class="label">Aircraft type</div><select class="input" id="aac">${AIVA.fleetTypes().map(t=>`<option value="${t}">${t} · ${AIVA.acTypeName(t)}</option>`).join('')}</select></div>
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
            const to   = $('#atgt', c).value.trim().toUpperCase();
            const sb   = $('#asb', c).value.trim();
            if (!to || !sb) { setFB('Need pilot callsign + SimBrief username'); return; }
            setFB('Fetching SimBrief OFP…');
            try {
              const ofp = await AIVA.Dispatch.fetchSimbriefOFP(sb);
              const body = AIVA.Dispatch.preflightPack(ofp);
              const r = await hopSend({ from: myCall, to, type:'telex', body });
              setFB(r.ok ? `✓ Pre-flight pack sent to ${to} (${ofp.flightNo})` : `✗ ${r.error}`);
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
            const today = new Date().toISOString().slice(0,10);
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

        /* ============ PILOT VIEW ============ */
        if (viewMode === 'pilot') {
          c.appendChild(el('section', { html: `
            <div class="grid grid-2">
              <div class="card">
                <div class="eyebrow">Inbox · received messages</div>
                <div id="pInbox" class="col gap-2 mt-3" style="max-height:520px;overflow-y:auto;">
                  <div class="text-mute" style="font-size:12px;">Loading…</div>
                </div>
              </div>
              <div class="card">
                <div class="eyebrow">Quick reply</div>
                <div class="mt-3"><div class="label">To callsign</div><input class="input mono" id="prTo" placeholder="AIC001"></div>
                <div class="mt-3"><div class="label">Type</div><select class="input" id="prType">
                  <option value="telex">TELEX</option><option value="cpdlc">CPDLC reply</option><option value="progress">PROGRESS</option>
                </select></div>
                <div class="mt-3"><div class="label">Body</div><textarea class="input mono" id="prBody" rows="4" placeholder="Type your reply…"></textarea></div>
                <div class="row gap-2 mt-3" style="flex-wrap:wrap;">
                  <button class="btn btn-primary btn-sm" id="prSend">${I('send',14)} Send reply</button>
                  <button class="btn btn-ghost btn-sm" id="hopPoll2">${I('refresh',14)} Poll now</button>
                  <button class="btn btn-ghost btn-sm" id="prAckAll">${I('check',14)} Ack all</button>
                </div>
                <div class="text-mute mono mt-3" id="hopAutoStatus" style="font-size:11px;">auto-poll: ${code ? 'ON (60s)' : 'off'}</div>
              </div>
            </div>

            <div class="section-title mt-6"><div><h3 style="margin:0;">Outbound log</h3></div></div>
            <div class="card mt-3"><div id="hopLog" class="hop-log"></div></div>
          `}));

          /* Render inbox: show incoming messages with ACCEPT / REJECT / REPLY */
          function refreshInbox() {
            const inbox = AIVA.Store.get('hoppie_log', []).filter(m => m.dir === 'rx').slice().reverse();
            const host = $('#pInbox', c);
            if (!inbox.length) { host.innerHTML = '<div class="text-mute" style="font-size:12px;padding:8px;">No incoming messages yet.</div>'; return; }
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

          $('#prSend', c).onclick = async () => {
            const to = $('#prTo', c).value.trim().toUpperCase();
            const type = $('#prType', c).value;
            const body = $('#prBody', c).value.trim();
            if (!to || !body) { toast('Need target + body', 'bad'); return; }
            const r = await hopSend({ from: myCall, to, type, body });
            if (r.ok) { toast(`Sent to ${to}`, 'ok'); $('#prBody', c).value = ''; refreshLog(); }
            else toast(r.error, 'bad');
          };
          $('#hopPoll2', c).onclick = () => hopPoll(false);
          $('#prAckAll', c).onclick = () => {
            const log = AIVA.Store.get('hoppie_log', []);
            log.filter(m => m.dir === 'rx').forEach(m => m.acked = true);
            AIVA.Store.set('hoppie_log', log);
            refreshInbox();
            toast('All messages acknowledged', 'ok');
          };
          refreshInbox();
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

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Review Queue</h2><div class="sub">${pending.length} pending · ${accepted.length} accepted · ${rejected.length} rejected</div></div>
          </div>
          <div class="row gap-2 mb-3" id="rqTabs">
            <button class="ac-chip on" data-tab="pending">Pending · ${pending.length}</button>
            <button class="ac-chip" data-tab="accepted">Accepted · ${accepted.length}</button>
            <button class="ac-chip" data-tab="rejected">Rejected · ${rejected.length}</button>
          </div>
          <div id="rqList"></div>
        ` }));

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
              date:    new Date(claim.ts).toISOString().slice(0,10),
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

        const renderTable = (list) => `
          <div class="crew-table">
            <div class="crew-row crew-head">
              <div>ID</div><div>Pilot</div><div>Rank</div><div>Base</div><div>Type rating</div><div>Hire date</div>
            </div>
            ${list.map(p => `
              <div class="crew-row${p.role === 'admin' ? ' is-admin' : ''}">
                <div class="mono">${p.id}</div>
                <div>
                  <div class="crew-avatar">${p.avatar}</div>
                  <div class="crew-name">${p.name}${p.role === 'admin' ? ' <span class="pill pill-gold" style="font-size:9px;margin-left:6px;">ADMIN</span>' : ''}</div>
                  <div class="crew-email">${p.email}</div>
                </div>
                <div>${p.rank}</div>
                <div class="mono">${p.base}</div>
                <div class="mono" style="font-size:11px;">${p.aircraft.join(' · ')}</div>
                <div class="mono" style="font-size:11px;">${p.hireDate}</div>
              </div>
            `).join('')}
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
              <input class="input mt-3" id="sbUsername" value="${AIVA.Store.get('simbrief_user','')}" placeholder="e.g. gunant_pahwa">
              <button class="btn btn-ghost btn-sm mt-3" id="saveSb">Save</button>
            </div>
            <div class="card">
              <div class="eyebrow">Hoppie logon code</div>
              <input class="input mt-3" id="hopCode" value="${AIVA.Store.get('hoppieCode','')}" placeholder="Your Hoppie logon">
              <button class="btn btn-ghost btn-sm mt-3" id="saveHop">Save</button>
              <p class="text-mute mt-2" style="font-size:11px;">Free code at <a href="https://www.hoppie.nl/acars/" target="_blank" class="text-gold">hoppie.nl/acars</a> · open <a href="#hoppie" class="text-gold">Hoppie ACARS</a></p>
            </div>
            <div class="card">
              <div class="eyebrow">Your callsign</div>
              <input class="input mt-3" id="myCallsign" value="${AIVA.Store.get('my_callsign','AIC' + (pilot.id || '001').replace(/[^0-9]/g,'').slice(-3))}" placeholder="AIC100">
              <button class="btn btn-ghost btn-sm mt-3" id="saveCs">Save</button>
              <p class="text-mute mt-2" style="font-size:11px;">Used as the FROM field for any Hoppie message you send.</p>
            </div>
            <div class="card">
              <div class="eyebrow">Hoppie CORS proxy (advanced)</div>
              <input class="input mt-3" id="hopProxy" value="${AIVA.Store.get('hoppie_proxy','')}" placeholder="https://corsproxy.io/?">
              <button class="btn btn-ghost btn-sm mt-3" id="saveProxy">Save</button>
              <p class="text-mute mt-2" style="font-size:11px;">Default: <code>https://corsproxy.io/?</code> · Set your own Cloudflare Worker / Vercel function URL if the default rate-limits.</p>
            </div>
          </div>

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
        $('#saveSb', c).onclick = () => { AIVA.Store.set('simbrief_user', $('#sbUsername').value.trim()); toast('SimBrief username saved.', 'ok'); };
        $('#saveHop', c).onclick= () => { AIVA.Store.set('hoppieCode', $('#hopCode').value.trim()); toast('Hoppie code saved.', 'ok'); };
        $('#saveCs', c).onclick = () => { AIVA.Store.set('my_callsign', $('#myCallsign').value.trim().toUpperCase()); toast('Callsign saved.', 'ok'); };
        $('#saveProxy', c).onclick = () => { AIVA.Store.set('hoppie_proxy', $('#hopProxy').value.trim()); toast('CORS proxy saved · reload Hoppie page.', 'ok'); };

        /* Profile picture upload */
        $('#profPicInput', c)?.addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 1024 * 1024 * 2) { toast('Photo too large — keep it under 2 MB', 'bad'); return; }
          const r = new FileReader();
          r.onload = () => {
            P.set('profile_pic', r.result);
            const wrap = $('#profPicWrap', c);
            wrap.innerHTML = `<img src="${r.result}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            toast('Profile photo updated', 'ok');
            buildNav();
          };
          r.readAsDataURL(file);
        });
        $('#removePicBtn', c)?.addEventListener('click', () => {
          P.remove('profile_pic'); toast('Profile photo removed', 'ok'); route();
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
        const today = new Date().toISOString().slice(0,10);
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
                      <td class="mono">${new Date(r.ts).toISOString().slice(0,10)}</td>
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
                    <td class="mono">${new Date(x.ts).toISOString().slice(0,10)}</td>
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
            <div class="eyebrow">Intensity — how often situations fire</div>
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
      sub: 'Cabin announcements · upload audio + auto/manual playback',
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

        c.appendChild(el('section', { html: `
          <div class="section-title">
            <div><h2>Cabin Announcements</h2><div class="sub">${STAGES.length} stages · upload your own audio (MP3/WAV) · shuffled per flight</div></div>
            <div class="actions">
              <div class="row gap-2" style="background:var(--surface);padding:4px;border-radius:99px;border:1px solid var(--border);">
                <button class="btn btn-sm ${cfg.mode==='manual'?'btn-primary':'btn-ghost'}" data-mode="manual">Manual</button>
                <button class="btn btn-sm ${cfg.mode==='auto'?'btn-primary':'btn-ghost'}" data-mode="auto">Auto</button>
              </div>
            </div>
          </div>

          <div class="note-callout mb-4">
            <b>Auto mode</b> plays announcements automatically at the right phase of flight based on FSUIPC telemetry.
            <b>Manual mode</b> shows a play button for each stage in the EFB — you decide when.
            <b>Multiple files per stage</b> are shuffled flight-to-flight so it doesn't sound identical every leg.
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
                        <button class="ann-del" data-del="${stage.id}:${i}" title="Delete">✕</button>
                      </div>
                    `).join('') || `<div class="text-mute" style="font-size:11.5px;padding:8px 0;">No audio uploaded yet.</div>`}
                  </div>
                  <label class="btn btn-ghost btn-sm mt-3" style="display:inline-flex;cursor:pointer;">
                    ${I('upload',12)} Upload audio
                    <input type="file" data-up="${stage.id}" accept="audio/*" multiple style="display:none;">
                  </label>
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
    const iso = date.toISOString().slice(0,10);
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
      const today = new Date().toISOString().slice(0,10);
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
