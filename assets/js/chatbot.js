/* =====================================================================
   AIR INDIA VIRTUAL — Maharaja Chatbot
   • On first login pops up to onboard the new pilot.
   • Persistent corner bubble afterwards.
   • Rule-based reply engine (no LLM dependency).
   • Per-pilot stored chat history.
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.Chatbot = (() => {
  let pilot = null;
  let pStore = null;
  let host, panel, openBtn, body, input;
  let booted = false;

  /* ============================================================
     KNOWLEDGE BASE — Maharaja knows the entire AIVA system.
     Each entry has a regex matcher + a multi-line reply.
     Order matters: more specific patterns first.
     ============================================================ */
  const SCRIPT = [
    /* Welcome tour (first message) */
    { id:'welcome', when:'first', say:[
      "नमस्ते, {rank} {first}! 🙏 I'm the Maharaja — your AIVA concierge.",
      "I know every page of this system. Ask me about **roster**, **bookings**, **the globe**, **FSUIPC**, **Hoppie**, **FDTL**, **ranks**, **pay**, **hotels**, **liveries**, **newsroom**, or any aircraft type.",
      "Quick start: tap **Book Roster** in the sidebar to plan your next trip, or hit **Open EFB** at the bottom-left."
    ]},

    /* --- Booking & roster --- */
    { match:/(generate|auto).*roster|gen.*rotation|build.*pairing/i, say:[
      "**Generate Roster** is the auto-builder. Pick up to 6 cities, your departing base, aircraft (with substitutions allowed), target block hours per day, and how many days (1–4).",
      "AIVA builds a connected pairing day-by-day, always returning to base on the last day. Tap **Accept & add to calendar** and every sector is written to your roster starting today (or tomorrow for multi-day pairings)."
    ]},
    { match:/monthly bid|bid.*month|bid.*line/i, say:[
      "**Monthly Bid** generates 3 bid lines for the whole month: **Heavy** (3–4 leg domestic days), **Layover-friendly** (longhaul rotations), **Balanced** (2-leg days).",
      "Pick base, aircraft type (substitutions allowed via family rules), total hours target (40–100), days flying (10–22), and click days you want OFF in the 31-day grid. Submit any line → every sector goes to your calendar."
    ]},
    { match:/multi.?sector|basket|confirm roster/i, say:[
      "On **Search & Book**, every flight has an **Add sector** button. The bottom panel collects them — I track total block hours and check FDTL (10 h / 6 sector cap) live. Hit **Confirm roster** when it's legal."
    ]},
    { match:/roster|booking|book/i, say:[
      "Open **Book Roster** — three modes:\n• **Search & Book** — globe + From/To filter + multi-sector picker\n• **Generate Roster** — auto-build 1–4 day rotation\n• **Monthly Bid** — bid the whole month with constraints\nSubstitutions are honoured everywhere (A320 family ≈ A319/320/321 NEO+CEO)."
    ]},

    /* --- The globe --- */
    { match:/globe|map|route map|network/i, say:[
      "Two globes: a small one in **Book Roster** (click a pin → see routes from there) and the big **Network Globe** in the sidebar (full network with arcs, hover for airport info, click for live route flights).",
      "Drag to rotate · scroll/pinch to zoom · click a pin to expand its outbound + inbound routes as gold arcs."
    ]},

    /* --- Aircraft / fleet --- */
    { match:/(a320|a321|a319).*(family|substit)/i, say:[
      "The **A320 family** in AIVA = A319 + A320 + A320neo (A20N) + A321 + A321neo (A21N). A pilot rated on any one is qualified across the family for roster filters."
    ]},
    { match:/777|b77w|b77l/i, say:[
      "Air India operates 18 × B777-300ER (B77W) and 5 × B777-200LR (B77L). Mostly North America, LHR, FCO and select ULH. Cross-qualifies pilots onto the 787 (B788/B789) for AIVA bidding."
    ]},
    { match:/787|b788|b789|dreamliner/i, say:[
      "26 × B787-8 (B788) and 7 × B787-9 (B789, ex-Vistara). Used on Europe/SE Asia and Tokyo/Hong Kong. Retrofit programme refreshes interiors + applies the new Vista livery."
    ]},
    { match:/a350|a359|airbus 350/i, say:[
      "6 × A350-900 (A359) with more on order (A350-1000 from Q3 2026). Flagship on DEL-JFK/EWR/LHR. Full type rating only — no cross-qual."
    ]},
    { match:/737|b738|b38m|express/i, say:[
      "**Air India Express** flies 31 × B737-800 (B738) and 19 × B737 MAX 8 (B38M). ICAO **AXB**, R/T 'EXPRESS INDIA'. Hubs at COK, BLR, CCJ, TRV, IXE, CNN."
    ]},
    { match:/fleet|registr|aircraft list/i, say:[
      "**Fleet Register** shows every actual VT-* registration grouped by type. 188 mainline + 51 Express aircraft. Tap any tail for delivery date and base."
    ]},

    /* --- EFB --- */
    { match:/efb|flight bag|ipad/i, say:[
      "The **EFB** is your in-flight iPad. Home is grouped into folders: **Briefing & Planning**, **Weather**, **Performance · Load**, **Networks · ACARS**, **Tracking**, **Crew Portal**.",
      "**Start Flight** (green tile) connects FSUIPC and tracks your sector live. **End Flight** writes the journey log + landing rate to My Flights."
    ]},

    /* --- Integrations --- */
    { match:/fsuipc|tracking|live data/i, say:[
      "AIVA listens for FSUIPC7's WebSocket bridge on `ws://localhost:2048`. Enable **WebSockets → Local server: enabled** in `FSUIPC7.ini`, then **Start Flight** in the EFB. Position, alt, IAS, VS and fuel stream into the journey log."
    ]},
    { match:/hoppie|acars|datalink|cpdlc/i, say:[
      "Hoppie is configured in **EFB → ACARS** with your free logon code from hoppie.nl/acars.\n• Fenix A320: OPC → ATSU → AOC logon\n• PMDG 777/737: CDU → ATC → LOGON\n• FSLabs A320: MCDU INIT → ATSU LOGON\nAIVA acts as a relay so company messages (OFP, weather, dispatch) flow from the portal into the cockpit."
    ]},
    { match:/simbrief|ofp|navlog|flightplan/i, say:[
      "Set your **SimBrief username** in Profile. Then open any booking → **OFP / Navlog** generates a SimBrief plan with your aircraft, route, alternates, and pulls the PDF + FMS files."
    ]},
    { match:/navigraph|charts|jeppesen/i, say:[
      "EFB → Charts uses your Navigraph subscription (token in Profile). Auto-loads the SID/STAR for your filed routing. Offline cache the last viewed chart per airport."
    ]},
    { match:/mapbox|globe.*token/i, say:[
      "We use the open Carto basemap by default. If you want satellite imagery on the globe, drop a Mapbox public token in Profile → Integrations."
    ]},

    /* --- Regulation / FDTL / DGCA --- */
    { match:/dgca|car|civil aviation requirements/i, say:[
      "**DGCA / CAR** lists every Civil Aviation Requirement we operate under: AOC (Section 3), FDTL (Section 7 J-III), Series O (operations), Series S (RNP-AR/RVSM/CDFA), Series C (DG). All links go to the actual DGCA portal."
    ]},
    { match:/fdtl|flight duty|duty limit/i, say:[
      "**FDTL Tracker** is DGCA CAR 7-J-III phased Nov 2025:\n• 60 h / 7-day rolling\n• 100 h / 28-day rolling\n• 1000 h / 365 days\n• Max FDP = block + 1 h, capped at 13 h\nAmber bar at 70%, red at 85%. I'll never let you book illegal pairings."
    ]},
    { match:/mel|cdl|minimum equipment/i, say:[
      "**MEL / CDL** — the deferred-defect list. We link the FAA MMEL database publicly; Air India internal MEL is approved derivative. Open the section to see ATA-coded items, dispatch conditions, and any operational restrictions."
    ]},

    /* --- Imports, stats, history --- */
    { match:/import|csv|xml|sba|volanta|elevatex/i, say:[
      "**Import** auto-detects SBA XML, Volanta CSV, or ElevateX export. I map columns (Block, Landing Rate, From/To) to AIVA's schema, de-dupe against your existing log, and refresh Statistics instantly."
    ]},
    { match:/stats|statistic|landing rate|fpm/i, say:[
      "**Statistics** crunches every logged sector. Hours by month, by aircraft, by route. Landing-rate histogram (target -180 ±60 fpm). Best/worst greases. All data stays local — nothing leaves your device."
    ]},
    { match:/my flights|log|history/i, say:[
      "**My Flights** is your complete logbook. Sortable by date, route, aircraft. Each row expands to show the journey log (FSUIPC stream), OFP, charts viewed, and any photos uploaded."
    ]},

    /* --- Ranks & Pay --- */
    { match:/rank|promot|cadet|captain|first officer/i, say:[
      "5-tier ladder (hours = total AIVA airline hours):\n• **Cadet** — 0 h, in training\n• **First Officer** — 200 h\n• **Senior First Officer** — 1,500 h\n• **Captain** — 3,500 h (PIC qualified)\n• **Senior Captain** — 7,500 h (check-airman)\nSee the **Ranks** page for criteria + current crew at each tier."
    ]},
    { match:/pay|salary|hourly|ctc|wage/i, say:[
      "Pay scales (INR/hour, Air India real-world derived):\n• Cadet  ₹1,800/h (stipend)\n• FO      ₹4,500/h + ULH bonus\n• SFO     ₹6,800/h\n• Capt    ₹11,500/h + ULH ₹15k/sector + USD 100/night layover\n• Sr Capt ₹14,500/h + check-airman premium\nFull table on **Hotel & Transport**."
    ]},

    /* --- Crew / Auth --- */
    { match:/crew list|pilots|roster of pilots|who flies/i, say:[
      "**Crew List** shows all 14 active AIVA pilots: name, rank, base, type rating, hire date. Auth is closed — only the listed pilots can log in. No signup."
    ]},
    { match:/admin|gunant|founder/i, say:[
      "Founder + admin: Captain Gunant Singh Pahwa (AIV001 · DEL base · type rated on B77W/B788/B789/A359/A20N/A21N)."
    ]},

    /* --- Hotels / Layovers --- */
    { match:/hotel|layover|accomod|stay/i, say:[
      "**Hotel & Transport** lists 32 crew-property hotels worldwide, filterable by country. Each shows distance from airport, star rating, and stay type. For 2-day rosters AIVA picks the appropriate downroute hotel automatically."
    ]},
    { match:/transport|pickup|cab|car/i, say:[
      "Airport pickup is standard at every crew property. Confirm timings 24h before via the airline's crew app (Air India: myAirIndia, IX: separate)."
    ]},

    /* --- Newsroom --- */
    { match:/newsroom|news|press|article/i, say:[
      "**Newsroom** mirrors airindia.com/in/en/newsroom. Press releases, corporate news, citizenship updates. Click any card to read in-app (no new tab). Categories: PRESS RELEASE / CORPORATE / CITIZENSHIP."
    ]},

    /* --- Liveries --- */
    { match:/liver|paint|skin|flightsim\.to/i, say:[
      "**Liveries** indexes community paint-jobs from flightsim.to, grouped by aircraft type — only the types we actually fly. Each card links to the flightsim.to download. Drop the unzipped folder in MSFS `Community/`."
    ]},

    /* --- Theming / UI --- */
    { match:/theme|light|dark|mode/i, say:[
      "Toggle light/dark from the topbar (flame icon = light, star = dark). Light mode matches airindia.com's white booking-page aesthetic. Setting persists per pilot."
    ]},
    { match:/maharaja|mascot|brand|vista|logo/i, say:[
      "The **Maharaja** has been Air India's mascot since 1946, created by Bobby Kooka. The 2023 **'Vista'** rebrand by FutureBrand keeps him for heritage moments while introducing the gold **Window of Possibilities** arch — derived from the Jharokha window."
    ]},

    /* --- Express, callsigns --- */
    { match:/express|axb|callsign|rt|radio/i, say:[
      "**Air India Express** — IATA **IX**, ICAO **AXB**, R/T **'EXPRESS INDIA'**. IX309 BOM-DXB files as AXB309.\n**Air India mainline** — IATA **AI**, ICAO **AIC**, R/T **'AIRINDIA'**."
    ]},

    /* --- Substitutions --- */
    { match:/substitut|cross.qual|family/i, say:[
      "Aircraft families allow cross-qualification in roster bidding:\n• **A320 family** ↔ A319/320/321 (CEO + NEO)\n• **787 family** ↔ 787-8 + 787-9\n• **777 family** ↔ 777-200LR/300ER (with 787 cross-qual)\n• **A350** stands alone (full type rating)\n• **737 family** ↔ 737-800 + MAX 8 (Express only)"
    ]},

    /* --- Onboarding --- */
    { match:/onboard|tutor|tour|getting started/i, say:[
      "The first visit to every page pops a Maharaja toast explaining what's there. Tap **Got it** to dismiss this one, or **Don't show again** to skip them all permanently."
    ]},

    /* --- Catch-all: people / hello --- */
    { match:/who are you|what.*you|help|hello|hi|hey|namaste/i, say:[
      "नमस्ते, {first}. I'm the Maharaja — I know every page of this system. Try asking about **roster**, **the globe**, **FSUIPC**, **Hoppie**, **FDTL**, **ranks**, **pay**, **hotels**, **liveries**, **newsroom**, or any aircraft type."
    ]},
  ];

  function reply(text) {
    const first = pilot?.name?.split(' ')[0] || 'Captain';
    const rank  = pilot?.rank || 'Captain';
    const tpl = (s) => s.replace(/{first}/g, first).replace(/{rank}/g, rank);
    if (!text) return [tpl(SCRIPT[0].say[0])];
    for (const r of SCRIPT) {
      if (r.match?.test(text)) return r.say.map(tpl);
    }
    return [tpl(
      "I'm not sure, {first}. Try one of these areas: **roster**, **book**, **globe**, **EFB**, **FSUIPC**, **Hoppie**, **OFP**, **charts**, **FDTL**, **ranks**, **pay**, **hotels**, **liveries**, **newsroom**, **substitutions**, **stats**, **theme**, or any aircraft type (A320, A350, 777, 787, 737)."
    )];
  }

  /* ------------- UI ------------- */
  function mount(pilotObj) {
    pilot = pilotObj;
    pStore = AIVA.Store.pilot(pilot.id);
    if (booted) return;
    booted = true;

    /* Floating launcher button — uses the REAL Maharaja PNG, not an SVG icon */
    openBtn = document.createElement('button');
    openBtn.className = 'mh-launcher';
    openBtn.innerHTML = `<img src="assets/img/maharaja.png?v=20260513m" alt="Maharaja" style="width:48px;height:48px;object-fit:contain;object-position:center top;"/>`;
    openBtn.setAttribute('aria-label','Open Maharaja chat');
    document.body.appendChild(openBtn);

    /* Chat panel */
    host = document.createElement('aside');
    host.className = 'mh-panel';
    host.innerHTML = `
      <header class="mh-head">
        <div class="mh-head-art"><img src="assets/img/maharaja.png?v=20260513m" alt="Maharaja" style="width:56px;height:56px;object-fit:contain;object-position:center top;"/></div>
        <div>
          <div class="mh-title">Maharaja</div>
          <div class="mh-sub">Your in-flight concierge</div>
        </div>
        <button class="mh-close" aria-label="Close">✕</button>
      </header>
      <div class="mh-body" id="mhBody"></div>
      <details class="mh-suggest-wrap" id="mhSuggestWrap">
        <summary>Suggestions</summary>
        <div class="mh-suggest" id="mhSuggest"></div>
      </details>
      <form class="mh-form" id="mhForm">
        <input id="mhInput" class="mh-input" placeholder="Ask the Maharaja…" autocomplete="off">
        <button class="mh-send" type="submit" aria-label="Send">→</button>
      </form>
    `;
    document.body.appendChild(host);

    body = host.querySelector('#mhBody');
    input = host.querySelector('#mhInput');
    const suggest = host.querySelector('#mhSuggest');
    [
      'Show me my roster',
      'How do I book a flight?',
      'Generate a 3-day rotation',
      'How does Monthly Bid work?',
      'How do I import flights?',
      'FSUIPC tracking setup',
      'Hoppie ACARS setup',
      'Where is the EFB?',
      'Light vs dark mode',
      'What is FDTL CAR 7-J?',
      'How is block time computed?',
      'What aircraft can I fly?',
      'How do substitutions work?',
      'What\'s the QRH for the A320?',
      'How do I file a SimBrief OFP?',
      'Walk me through the EFB tools',
    ].forEach(q => {
      const c = document.createElement('button');
      c.className = 'mh-chip'; c.type = 'button'; c.textContent = q;
      c.onclick = () => { input.value = q; host.querySelector('#mhForm').dispatchEvent(new Event('submit')); };
      suggest.appendChild(c);
    });

    /* Events */
    openBtn.onclick = open;
    host.querySelector('.mh-close').onclick = close;
    host.querySelector('#mhForm').addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      addBubble('user', v);
      input.value = '';
      setTimeout(() => reply(v).forEach((t, i) => setTimeout(() => addBubble('bot', t), i * 360)), 220);
      saveHistory();
    });

    /* Restore prior conversation OR boot welcome */
    const prior = pStore.get('chat', null);
    if (prior && prior.length) {
      prior.forEach(m => addBubble(m.role, m.text, true));
    } else {
      const w = SCRIPT[0].say;
      const first = pilot.name.split(' ')[0];
      const rank  = pilot.rank || 'Captain';
      const tpl = (s) => s.replace(/\{first\}/g, first).replace(/\{rank\}/g, rank);
      w.forEach((line, i) => setTimeout(() => addBubble('bot', tpl(line)), 600 + i * 700));
      setTimeout(open, 800);
    }
  }

  function open()  { host.classList.add('open'); openBtn.classList.add('hidden'); input?.focus(); }
  function close() { host.classList.remove('open'); openBtn.classList.remove('hidden'); }

  function addBubble(role, text, silent = false) {
    const b = document.createElement('div');
    b.className = `mh-bubble mh-${role}`;
    b.innerHTML = renderText(text);
    body.appendChild(b);
    body.scrollTop = body.scrollHeight;
    if (!silent) saveHistory();
  }
  function renderText(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  }
  function saveHistory() {
    const msgs = [...body.querySelectorAll('.mh-bubble')].map(b => ({
      role: b.classList.contains('mh-user') ? 'user' : 'bot',
      text: b.innerText,
    }));
    pStore.set('chat', msgs.slice(-50));
  }

  return { mount, open, close };
})();

/* Inject Maharaja chat styles */
(function injectChatCSS() {
  if (document.getElementById('mh-style')) return;
  const css = `
    .mh-launcher {
      /* Bottom-RIGHT cluster — sits to the LEFT of the crew-chat
         launcher. On portal that's right: 96px (clear of viewport edge).
         On EFB, both icons shift inward by 90px so we clear the right
         tile rail. */
      position: fixed; right: 96px; bottom: 22px;
      width: 64px; height: 64px;
      border-radius: 50%;
      background: linear-gradient(135deg, #FFE9A8 0%, #E0B65F 60%, #876C28 100%);
      box-shadow: 0 10px 30px rgba(218,25,47,.35), 0 0 0 6px rgba(199,165,108,.22);
      display:flex;align-items:center;justify-content:center;
      cursor:pointer; z-index: 9000;
      padding: 4px;
      overflow: hidden;
      border: 2px solid rgba(255,255,255,.4);
    }
    body.efb-body .mh-launcher { right: 186px; }   /* EFB: clear the right tile rail */
    .mh-launcher img { display: block; }
    .mh-head-art img { display:block; border-radius: 50%; background:rgba(255,255,255,.06); }
    .mh-launcher.hidden { display: none; }
    .mh-launcher:hover { transform: scale(1.05); }
    .mh-panel {
      position: fixed; right: 96px; bottom: 22px;
      width: 380px; max-width: 92vw;
      height: 580px; max-height: 80vh;
      background: var(--surface-glass);
      backdrop-filter: blur(24px) saturate(140%);
      border: 1px solid var(--border-gold);
      border-radius: 22px;
      box-shadow: 0 28px 80px rgba(0,0,0,.55), 0 0 60px rgba(199,165,108,.08);
      z-index: 9001;
      display: flex; flex-direction: column;
      transform: translateY(20px) scale(.96); opacity: 0;
      pointer-events: none;
      transition: all .28s var(--ease-emph);
      overflow: hidden;
    }
    .mh-panel.open { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }
    .mh-head {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(218,25,47,.18), rgba(74,27,65,.22));
    }
    .mh-head-art { background: rgba(248,241,228,.06); border-radius: 50%; padding: 4px; }
    .mh-title { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--ai-cream); }
    .mh-sub { font-size: 11px; color: var(--text-mute); font-family: var(--font-mono); letter-spacing: .1em; }
    .mh-close {
      margin-left: auto; width: 28px; height: 28px;
      border-radius: 50%; background: rgba(245,240,232,.05);
      display:flex; align-items:center; justify-content:center;
      color: var(--text-dim); font-size: 13px;
    }
    .mh-close:hover { background: rgba(245,240,232,.12); color: var(--text); }
    .mh-body {
      flex: 1; overflow-y: auto; padding: 18px;
      display:flex; flex-direction: column; gap: 10px;
    }
    .mh-bubble {
      max-width: 84%; padding: 10px 14px;
      border-radius: 16px;
      font-size: 13.5px; line-height: 1.5;
      animation: fadeUp .25s var(--ease-emph) both;
    }
    .mh-bubble b { color: var(--ai-gold-bright); font-weight: 600; }
    .mh-bubble code { background: rgba(245,240,232,.06); padding: 1px 6px; border-radius: 5px; font-size: 11.5px; }
    .mh-bot {
      align-self: flex-start;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-top-left-radius: 4px;
      color: var(--text);
    }
    .mh-user {
      align-self: flex-end;
      background: linear-gradient(135deg, var(--ai-red), var(--ai-red-deep));
      color: var(--ai-cream);
      border-top-right-radius: 4px;
    }
    .mh-suggest-wrap {
      border-top: 1px solid var(--border);
      max-height: 38vh; overflow: hidden;
    }
    .mh-suggest-wrap summary {
      cursor: pointer; list-style: none;
      padding: 8px 14px; font-size: 11px;
      letter-spacing: .18em; text-transform: uppercase;
      color: var(--text-mute);
      display: flex; align-items: center; gap: 6px;
    }
    .mh-suggest-wrap summary::-webkit-details-marker { display: none; }
    .mh-suggest-wrap summary::after {
      content: '▾'; margin-left: auto;
      transition: transform .2s ease;
    }
    .mh-suggest-wrap[open] summary::after { transform: rotate(180deg); }
    .mh-suggest-wrap[open] { max-height: 38vh; overflow-y: auto; }
    .mh-suggest {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 4px 14px 10px;
    }
    .mh-chip {
      font-size: 11px; padding: 5px 11px;
      border-radius: 99px;
      background: rgba(199,165,108,.08);
      border: 1px solid var(--border-gold);
      color: var(--ai-gold-bright);
      cursor: pointer;
      transition: all var(--t) var(--ease);
    }
    .mh-chip:hover { background: rgba(199,165,108,.18); }
    .mh-form {
      display: flex; gap: 8px; padding: 12px 14px;
      border-top: 1px solid var(--border);
    }
    .mh-input {
      flex: 1; background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 99px; padding: 10px 16px; font-size: 13px; color: var(--text);
    }
    .mh-input:focus { outline: none; border-color: var(--ai-gold); }
    .mh-send {
      width: 38px; height: 38px; border-radius: 50%;
      background: var(--ai-red); color: var(--ai-cream);
      box-shadow: 0 4px 14px rgba(218,25,47,.4);
    }
    .mh-send:hover { background: var(--ai-red-bright); }
    @media (max-width: 640px) {
      .mh-panel { right: 8px; bottom: 8px; width: calc(100vw - 16px); height: 70vh; }
    }
  `;
  const s = document.createElement('style');
  s.id = 'mh-style'; s.textContent = css;
  document.head.appendChild(s);
})();
