/* =====================================================================
   AIVA — FSUIPC live monitor
   Connects to FSUIPC7's WebSocket bridge at ws://localhost:2048/fsuipc/ and:
     • emits events on threshold crossings (10,000 ft descent, landing)
     • detects sim crashes (connection dropped mid-flight)
   The Hoppie auto-dispatch hooks into these events to send messages
   without you clicking anything.
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.FSUIPC = (() => {
  let ws = null;
  let connected = false;
  let pollTimer = null;
  let lastState = { alt:null, gs:null, lat:null, lon:null, onGround:null, ts:0 };
  let topAlt = 0;                 /* highest altitude reached this sector */
  let arrivalArmed = true;        /* fire the 10k ft event once per sector */
  let landingArmed = true;        /* fire the landing event once per sector */
  let inFlight = false;
  const listeners = { connect:[], disconnect:[], state:[], descent10k:[], landing:[], crash:[], phase:[], event:[] };
  /* Flight-phase state machine.
     States: GATE → PUSHBACK → TAXI_OUT → TAKEOFF → CLIMB → CRUISE →
             DESCENT → APPROACH → LANDED → TAXI_IN → PARKED
     Each transition emits a 'phase' event with {from, to, state}.
     Announcement triggers (boarding / pushback / takeoff / landing /
     disembark) hook into these. */
  let phase = 'GATE';
  let topAltSeen = 0;
  const AIR_PHASES = new Set(['TAKEOFF','CLIMB','CRUISE','DESCENT','APPROACH']);
  function detectPhase(s, prev) {
    const og = !!s.onGround;
    const gs = s.gs || 0;
    const alt = s.alt || 0;
    const vs = s.vs || 0;
    const pb = !!s.parkingBrake;

    /* === GROUND BRANCH ===
       Any time on-ground is true, the phase MUST be one of:
       GATE / PARKED / PUSHBACK / TAXI_OUT / TAXI_IN / TAKEOFF.
       Never CLIMB/CRUISE/DESCENT/APPROACH while on ground — the
       previous "return prev" fallback was sticking on airborne
       phases when a pilot re-spawned cold-and-dark at the next
       sector. */
    if (og) {
      /* Coming from an airborne phase + currently on ground = touchdown.
         Either we transitioned through landing detection (state machine
         already at LANDED) or we re-spawned at a new airport (state
         machine inherited the old CLIMB/CRUISE). Either way, reset to
         the ground-side equivalent. */
      const wasAirborne = AIR_PHASES.has(prev);
      if (gs < 1 && pb) {
        if (wasAirborne || prev === 'LANDED' || prev === 'TAXI_IN' || prev === 'PARKED') return 'PARKED';
        return 'GATE';
      }
      if (gs < 1) {
        /* Stationary, brake released. If we just arrived from the air,
           treat as PARKED (still on the runway / taxiway short hold). */
        if (wasAirborne) return 'PARKED';
        if (prev === 'GATE') return 'GATE';
        return prev || 'GATE';
      }
      if (gs < 5) {
        /* Very slow ground roll. Pushback or taxi-in finish. */
        if (wasAirborne) return 'TAXI_IN';
        if (prev === 'GATE' || prev === 'PUSHBACK') return 'PUSHBACK';
        if (prev === 'LANDED' || prev === 'TAXI_IN') return 'TAXI_IN';
        return prev || 'PUSHBACK';
      }
      if (gs < 80) {
        /* Taxi speed. Direction (in vs out) decided by recent airborne
           history. */
        if (wasAirborne || prev === 'LANDED' || prev === 'TAXI_IN') return 'TAXI_IN';
        return 'TAXI_OUT';
      }
      /* gs ≥ 80 on the ground = takeoff roll or post-touchdown rollout. */
      if (wasAirborne) return 'LANDED';
      return 'TAKEOFF';
    }

    /* === AIRBORNE BRANCH === */
    if (alt < 1000 && vs > 500) return 'TAKEOFF';
    if (vs > 200) return 'CLIMB';
    if (vs < -200 && alt < 10000) return 'APPROACH';
    if (vs < -200) return 'DESCENT';
    if (alt < 5000) return 'APPROACH';
    return 'CRUISE';
  }
  function maybePhaseChange(state) {
    const next = detectPhase(state, phase);
    if (next !== phase) {
      const from = phase;
      phase = next;
      emit('phase', { from, to: next, state });
    }
  }

  function on(evt, cb) { listeners[evt]?.push(cb); }
  function emit(evt, payload) { (listeners[evt] || []).forEach(cb => { try { cb(payload); } catch(_){} }); }

  /* FSUIPC7's WebSocket protocol uses JSON-RPC-style requests. We subscribe
     to a few offsets and receive periodic state updates. If the user's
     bridge isn't reachable, we silently retry on a long interval. */
  const FSUIPC_OFFSETS = {
    alt:      { offset: 0x3324, length: 4, type:'int' },   // altitude (ft)
    gs:       { offset: 0x02B4, length: 4, type:'int' },   // ground speed (kt)
    onGround: { offset: 0x0366, length: 2, type:'int' },   // sim/on-ground flag
    lat:      { offset: 0x0560, length: 8, type:'double' },// latitude
    lon:      { offset: 0x0568, length: 8, type:'double' },// longitude
  };

  /* Build the candidate WebSocket URLs.
     • If AIVA is served over HTTPS (airindiavirtual.online) the browser
       blocks plain ws:// as Mixed Content even to localhost. Try wss://
       first in that case so the SSL-enabled FSUIPC WebSockets Server
       just works. Fall back to ws:// for users running locally / via
       the Electron .exe / from http://.
     • If AIVA is served over HTTP / file:// (Electron build) plain
       ws:// is allowed and the SSL cert dance is unnecessary, so we
       try ws:// first. */
  function candidateUrls() {
    const isHttps = (typeof location !== 'undefined' && location.protocol === 'https:');
    return isHttps
      ? ['wss://localhost:2048/fsuipc/', 'ws://localhost:2048/fsuipc/']
      : ['ws://localhost:2048/fsuipc/',  'wss://localhost:2048/fsuipc/'];
  }

  async function connect() {
    /* SimConnect-direct (Electron .exe) — main process owns the MSFS
       link. Calling the legacy WebSocket connect here would attempt
       ws://localhost:2048 even though there's no FSUIPC bridge involved,
       producing the stale "Tried both wss:// and ws://" errors. Short-
       circuit so the singleton stays clean. */
    if (typeof window !== 'undefined' && window.AIVA_DESKTOP?.simConnect) {
      return; // SimConnect bridge handles everything
    }
    if (ws) try { ws.close(); } catch(_){}
    /* Try each candidate URL in order. The first one that opens wins. */
    const urls = candidateUrls();
    for (let i = 0; i < urls.length; i++) {
      try { return await connectAt(urls[i]); }
      catch (e) {
        if (i === urls.length - 1) throw e;
        /* fall through to next protocol */
      }
    }
    throw new Error('FSUIPC unreachable on any protocol');
  }

  async function connectAt(url) {
    return new Promise((resolve, reject) => {
      try { ws = new WebSocket(url); }
      catch (e) { return reject(e); }
      ws.onopen = () => {
        connected = true;
        emit('connect');
        /* Subscribe to all offsets */
        ws.send(JSON.stringify({
          command:'offsets.declare',
          name:'aivaSet',
          offsets: Object.values(FSUIPC_OFFSETS),
        }));
        /* Poll every 1s for a fresh frame */
        pollTimer = setInterval(() => {
          if (ws?.readyState === 1) ws.send(JSON.stringify({ command:'offsets.read', name:'aivaSet' }));
        }, 1000);
        resolve();
      };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.success && msg.data) handleFrame(msg.data);
      };
      ws.onerror = () => { reject(new Error('FSUIPC unreachable')); };
      ws.onclose = () => {
        connected = false;
        clearInterval(pollTimer); pollTimer = null;
        emit('disconnect');
        /* If we were mid-flight and lost the bridge, fire a crash candidate */
        if (inFlight && (lastState.alt || 0) > 100 && !(lastState.onGround)) {
          emit('crash', {
            fno: AIVA._activeFlight?.fno,
            lastPos: lastState.lat && lastState.lon ? `${lastState.lat.toFixed(4)}, ${lastState.lon.toFixed(4)}` : '',
            altAtLoss: lastState.alt,
            gsAtLoss: lastState.gs,
            ts: Date.now(),
          });
          inFlight = false;
        }
      };
    });
  }

  function handleFrame(d) {
    /* d is an object keyed by offset hex, but our wrapper normalises to names.
       SimConnect bridge passes extended fields (parkingBrake, flaps, throttle,
       engine combustion, pushback state, tas) that the legacy WS path won't
       supply — pass them through as undefined-safe so consumers can rely on
       presence checks. */
    /* DEFENSIVE: any frame arrival means the bridge is alive. The user
       hit a recurring bug where SimConnect telemetry was streaming into
       the renderer but `connected` stayed false — usually because the
       page reloaded AFTER the 'connected' state event fired, and the
       initial sc.getState() check raced. Now we just trust that any
       frame = live, flip connected + emit 'connect' on first arrival.
       This guarantees the FSUIPC chip, EFB pill, Sim Bridge status,
       and live-map dot all reflect reality. */
    if (!connected) {
      connected = true;
      emit('connect');
    }
    const state = {
      alt:      d.alt      ?? d[FSUIPC_OFFSETS.alt.offset.toString()],
      gs:       d.gs       ?? d[FSUIPC_OFFSETS.gs.offset.toString()],
      onGround: !!(d.onGround ?? d[FSUIPC_OFFSETS.onGround.offset.toString()]),
      lat:      d.lat      ?? d[FSUIPC_OFFSETS.lat.offset.toString()],
      lon:      d.lon      ?? d[FSUIPC_OFFSETS.lon.offset.toString()],
      ias:          d.ias,
      tas:          d.tas,
      vs:           d.vs,
      hdg:          d.hdg,
      agl:          d.agl,
      magvar:       d.magvar,
      fuel:         d.fuel,
      gw:           d.gw,
      gForce:       d.gForce,
      /* Prefer the indicator (boolean) over position (0-1 float). Some
         payware aircraft only set one of the two. */
      parkingBrake: !!(d.parkingBrakeInd ?? d.parkingBrake),
      flapsIdx:     d.flapsIdx,
      flapsPct:     d.flapsPct,
      spoilers:     d.spoilers,
      spoilersArmed: d.spoilersArmed,
      gearHandle:   d.gearHandle,
      gearPct:      d.gearPct,
      throttle1:    d.throttle1,
      n1_1:         d.n1_1,
      n1_2:         d.n1_2,
      eng1:         d.eng1,
      eng2:         d.eng2,
      eng3:         d.eng3,
      eng4:         d.eng4,
      engCount:     d.engCount,
      pushback:     d.pushback,
      apMaster:     d.apMaster,
      autoThrottle: d.autoThrottle,
      apAlt:        d.apAlt,
      apHdg:        d.apHdg,
      lightBeacon:  d.lightBeacon,
      lightNav:     d.lightNav,
      lightStrobe:  d.lightStrobe,
      lightLanding: d.lightLanding,
      lightTaxi:    d.lightTaxi,
      lightLogo:    d.lightLogo,
      xpdrCode:     d.xpdrCode,
      xpdrState:    d.xpdrState,
      stallWarn:    d.stallWarn,
      overspeedWarn:d.overspeedWarn,
      indAlt:       d.indAlt,
      baroInHg:     d.baroInHg,
      /* Extended telemetry — added 2026-06 for the Pegasus-style
         comprehensive Tracker page. All optional; the Tracker
         degrades gracefully if any field is missing (older sim
         bridge versions won't have these). */
      mach:         d.mach,
      aoa:          d.aoa,
      pitch:        d.pitch,
      bank:         d.bank,
      n2_1:         d.n2_1,
      n2_2:         d.n2_2,
      itt_1:        d.itt_1,
      itt_2:        d.itt_2,
      ff_1:         d.ff_1,
      ff_2:         d.ff_2,
      oat:          d.oat,
      windKt:       d.windKt,
      windDir:      d.windDir,
      elevTrim:     d.elevTrim,
      cabinAlt:     d.cabinAlt,
      ts: Date.now(),
    };
    /* Hold the prior frame for delta-based detectors (descent10k, landing)
       BEFORE we overwrite lastState. */
    const prev = lastState;
    lastState = state;
    /* Edge-detect significant state changes into the telemetry event log
       so the Sim Bridge page can render a chronological feed. */
    try { detectEvents(state, prev?.alt != null ? prev : null); } catch {}
    emit('state', state);
    maybePhaseChange(state);
    /* Bookkeeping */
    if (state.alt > topAlt) topAlt = state.alt;
    if (state.alt > 1500 && !state.onGround) inFlight = true;

    /* Descent through 10,000 ft (only after climbing above it, only once per sector) */
    if (arrivalArmed && topAlt > 11000 && (prev?.alt || 0) > 10000 && state.alt <= 10000 && !state.onGround) {
      arrivalArmed = false;
      emit('descent10k', { ...state, fno: AIVA._activeFlight?.fno });
    }
    /* Landing detection: was airborne, now on ground with low GS */
    if (landingArmed && inFlight && state.onGround && state.gs < 60 && (prev?.gs || 0) > 60) {
      landingArmed = false;
      emit('landing', { ...state, fno: AIVA._activeFlight?.fno });
      /* After landing, reset for next sector */
      setTimeout(() => { resetSector(); }, 30_000);
    }
  }

  /* ============ Telemetry event log ============
     Edge-detects significant binary state changes (engine start /
     shutdown, beacon on/off, gear up/down, AP engage/disengage,
     flaps detent change, transponder mode) and pushes one log row
     per change. Sim Bridge page polls getEventLog() every second
     for the chronological feed. Capped at 250 most-recent rows so
     long sectors don't burn memory. */
  const telemetryLog = [];
  let prevSnap = null;
  function pushEvt(label, severity = 'info', extra = '') {
    telemetryLog.push({
      ts: Date.now(),
      label,
      severity, /* info | ok | warn | bad */
      extra,
    });
    if (telemetryLog.length > 250) telemetryLog.splice(0, telemetryLog.length - 250);
    emit('event', telemetryLog[telemetryLog.length - 1]);
  }
  function detectEvents(s, p) {
    if (!p) {
      /* First frame — record initial state without firing events. */
      return;
    }
    /* Engine combustion (1-4) */
    for (let i = 1; i <= 4; i++) {
      const k = 'eng' + i;
      if (s[k] != null && p[k] != null && !!s[k] !== !!p[k]) {
        pushEvt(`ENG ${i} ${s[k] ? 'START' : 'SHUTDOWN'}`, s[k] ? 'ok' : 'info');
      }
    }
    /* Parking brake */
    if (s.parkingBrake != null && p.parkingBrake != null && !!s.parkingBrake !== !!p.parkingBrake) {
      pushEvt(`PARK BRAKE ${s.parkingBrake ? 'SET' : 'RELEASED'}`, 'info');
    }
    /* Pushback state — 0=stopped, 1=pushing back, 2=tug attached, 3=disconnect */
    if (s.pushback != null && p.pushback != null && s.pushback !== p.pushback) {
      const labels = ['STOPPED', 'IN PROGRESS', 'TUG ATTACHED', 'DISCONNECT'];
      pushEvt(`PUSHBACK ${labels[s.pushback] || s.pushback}`, 'info');
    }
    /* Flaps handle index */
    if (s.flapsIdx != null && p.flapsIdx != null && s.flapsIdx !== p.flapsIdx) {
      pushEvt(`FLAPS ${s.flapsIdx} (${Math.round(s.flapsPct || 0)}%)`, 'info');
    }
    /* Gear handle */
    if (s.gearHandle != null && p.gearHandle != null && !!s.gearHandle !== !!p.gearHandle) {
      pushEvt(`GEAR ${s.gearHandle ? 'DOWN' : 'UP'}`, s.gearHandle ? 'ok' : 'info');
    }
    /* Spoilers armed */
    if (s.spoilersArmed != null && p.spoilersArmed != null && !!s.spoilersArmed !== !!p.spoilersArmed) {
      pushEvt(`SPOILERS ${s.spoilersArmed ? 'ARMED' : 'DISARMED'}`, 'info');
    }
    /* Lights */
    [['lightBeacon','BEACON'],['lightNav','NAV LIGHTS'],['lightStrobe','STROBES'],
     ['lightLanding','LANDING LIGHTS'],['lightTaxi','TAXI LIGHTS'],['lightLogo','LOGO LIGHT']
    ].forEach(([k, name]) => {
      if (s[k] != null && p[k] != null && !!s[k] !== !!p[k]) {
        pushEvt(`${name} ${s[k] ? 'ON' : 'OFF'}`, 'info');
      }
    });
    /* Autopilot master */
    if (s.apMaster != null && p.apMaster != null && !!s.apMaster !== !!p.apMaster) {
      pushEvt(`AP ${s.apMaster ? 'ENGAGED' : 'DISENGAGED'}`, s.apMaster ? 'ok' : 'warn');
    }
    /* Autothrottle */
    if (s.autoThrottle != null && p.autoThrottle != null && !!s.autoThrottle !== !!p.autoThrottle) {
      pushEvt(`A/THR ${s.autoThrottle ? 'ENGAGED' : 'DISENGAGED'}`, 'info');
    }
    /* Transponder mode change */
    if (s.xpdrState != null && p.xpdrState != null && s.xpdrState !== p.xpdrState) {
      const xpdrLabels = { 0:'OFF', 1:'STBY', 2:'TEST', 3:'ON', 4:'ALT', 5:'GROUND' };
      pushEvt(`XPDR ${xpdrLabels[s.xpdrState] || s.xpdrState}` + (s.xpdrCode ? ` · ${String(s.xpdrCode).padStart(4,'0')}` : ''), 'info');
    }
    /* On-ground transition */
    if (s.onGround !== p.onGround) {
      pushEvt(s.onGround ? 'TOUCHDOWN' : 'WEIGHT OFF WHEELS', s.onGround ? 'ok' : 'ok');
    }
    /* Warnings */
    if (s.stallWarn && !p.stallWarn)         pushEvt('STALL WARNING', 'bad');
    if (s.overspeedWarn && !p.overspeedWarn) pushEvt('OVERSPEED', 'bad');

    /* ── Phase-specific edges that the Pegasus-style Tracker shows ── */
    /* Takeoff roll: ground + IAS crossing 80 kt */
    if (s.onGround && (p.ias || 0) < 80 && (s.ias || 0) >= 80) {
      pushEvt(`80 KTS — takeoff roll`, 'ok');
    }
    /* Rotation: weight off wheels with IAS > 100 */
    if (!s.onGround && p.onGround && (s.ias || 0) > 100) {
      pushEvt(`AIRBORNE · IAS ${Math.round(s.ias)} kt`, 'ok');
    }
    /* Climb-thrust crossing 10,000 ft going up */
    if (!s.onGround && (p.alt || 0) < 10000 && (s.alt || 0) >= 10000 && (s.vs || 0) > 200) {
      pushEvt(`PASSING 10,000 FT CLIMBING`, 'info');
    }
    /* Top of climb — level off above FL250 */
    if (!s.onGround && Math.abs(s.vs || 0) < 100 && (s.alt || 0) > 25000
        && (p.vs || 0) > 200) {
      pushEvt(`TOP OF CLIMB · FL${Math.round((s.alt || 0) / 100)}`, 'ok');
    }
    /* Top of descent — start of sustained descent above FL150 */
    if (!s.onGround && (p.vs || 0) > -200 && (s.vs || 0) < -500 && (s.alt || 0) > 15000) {
      pushEvt(`TOP OF DESCENT · FL${Math.round((s.alt || 0) / 100)}`, 'info');
    }
    /* Descending through 10,000 ft */
    if (!s.onGround && (p.alt || 0) > 10000 && (s.alt || 0) <= 10000 && (s.vs || 0) < -200) {
      pushEvt(`PASSING 10,000 FT DESCENDING`, 'info');
    }
    /* Touchdown vertical speed — record on transition to ground if airborne previously */
    if (!p.onGround && s.onGround) {
      const ldgFpm = Math.round(p.vs || s.vs || 0);
      pushEvt(`TOUCHDOWN · ${ldgFpm} fpm`, ldgFpm < -800 ? 'bad' : ldgFpm < -300 ? 'warn' : 'ok');
    }
    /* Reverse thrust deployment (throttle1 going negative on ground) */
    if (s.onGround && (p.throttle1 || 0) >= 0 && (s.throttle1 || 0) < -5) {
      pushEvt('REVERSE THRUST DEPLOYED', 'info');
    }
    /* Engine flame-out / shutdown during flight (already covered by eng_) */
    /* Sustained bank > 35° */
    if (Math.abs(s.bank || 0) > 35 && Math.abs(p.bank || 0) <= 35) {
      pushEvt(`STEEP BANK · ${Math.round(s.bank)}°`, 'warn');
    }
  }
  function resetSector() {
    topAlt = 0; arrivalArmed = true; landingArmed = true; inFlight = false;
    phase = 'GATE';
    topAltSeen = 0;
    /* Wipe the previous flight's event log so a new sector starts
       with a clean slate. */
    telemetryLog.length = 0;
  }

  /* ============ AUTO-DETECT loop ============
     "Turn on FSUIPC → AIVA notices and starts tracking" — the seamless
     experience the Chief Pilot asked for. Every 5 seconds we attempt a
     silent connect; the moment FSUIPC's WebSocket Server comes alive,
     the connect handler fires the 'connect' event and the UI flips
     to "● synced". A 1500ms socket timeout keeps each probe cheap.

     The autoStart flag lets a UI screen disable this when the user
     explicitly wants to manage the connection themselves. */
  let autoStart = true;
  let autoTimer = null;
  function probe() {
    if (connected || !autoStart) return;
    /* Probe BOTH protocols simultaneously so we don't add latency when
       one is blocked by mixed content and the other works. The first one
       to open wins; we close it and let connect() reopen the real socket. */
    const urls = candidateUrls();
    let resolved = false;
    urls.forEach(url => {
      let test;
      try { test = new WebSocket(url); } catch { return; }
      const killTimer = setTimeout(() => { try { test.close(); } catch {} }, 1500);
      test.onopen = () => {
        clearTimeout(killTimer);
        try { test.close(); } catch {}
        if (resolved) return;
        resolved = true;
        connect().catch(() => {});
      };
      test.onerror = () => { clearTimeout(killTimer); };
    });
  }
  function startAutoDetect() {
    autoStart = true;
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(probe, 5000);
    probe();   // immediate first attempt on script load
  }
  function stopAutoDetect() {
    autoStart = false;
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }
  /* ============ SimConnect direct-source bridge ============
     If we're running inside the AIVA desktop wrapper AND its main
     process exposes a SimConnect link to MSFS, we prefer that source
     over the WebSocket-FSUIPC fallback. Pilots running the .exe get
     a true one-app experience: no FSUIPC bridge utility, no port
     2048, no Mixed-Content gotchas.

     The bridge feeds telemetry through the SAME handleFrame() pipe
     that the WebSocket source uses, so every downstream consumer
     (descent10k / landing / crash events, EFB progress bar, topbar
     chip) keeps working unchanged. */
  let simSource = 'ws';      // 'ws' = WebSocket-FSUIPC; 'sim' = SimConnect direct
  if (window.AIVA_DESKTOP?.simConnect) {
    const sc = window.AIVA_DESKTOP.simConnect;
    simSource = 'sim';
    /* Don't run the WebSocket probe loop — SimConnect is authoritative. */
    autoStart = false;
    sc.onState((state) => {
      const wasConnected = connected;
      if (state === 'connected' && !wasConnected) {
        connected = true;
        emit('connect');
      } else if (state !== 'connected' && wasConnected) {
        connected = false;
        emit('disconnect');
        /* If we were mid-flight, fire crash same as WS path. */
        if (inFlight && (lastState.alt || 0) > 100 && !(lastState.onGround)) {
          emit('crash', {
            fno: AIVA._activeFlight?.fno,
            lastPos: lastState.lat && lastState.lon ? `${lastState.lat.toFixed(4)}, ${lastState.lon.toFixed(4)}` : '',
            altAtLoss: lastState.alt,
            gsAtLoss: lastState.gs,
            ts: Date.now(),
          });
          inFlight = false;
        }
      }
    });
    sc.onTelemetry((t) => {
      /* SimConnect frame → reuse the existing per-frame logic, which
         drives state/descent10k/landing detection. Field names already
         match (lat, lon, alt, ias, gs, vs, hdg, onGround, fuel). */
      handleFrame(t);
    });
    /* Pull the current state once at boot in case main process is
       already connected to MSFS. */
    sc.getState().then(state => {
      if (state === 'connected' && !connected) {
        connected = true;
        emit('connect');
      }
    }).catch(() => {});

    /* === BELT-AND-SUSPENDERS POLL ===
       IPC events can race across renderer reloads — the user hits Ctrl+
       Shift+R or the ↻ button after MSFS is already connected, and the
       state='connected' event from main has already fired before the new
       listener registered. Telemetry also can be missed if main only
       sends on change. Poll getLast() once a second as a safety net so
       even if events are silent, we still pull the latest frame and feed
       it through handleFrame (which now flips connected=true on any
       frame arrival). Net effect: SimConnect status reflects reality
       within ~1 s regardless of IPC race conditions. */
    let pollTimer2 = null;
    const startScPoll = () => {
      if (pollTimer2) return;
      pollTimer2 = setInterval(async () => {
        try {
          const last = await sc.getLast();
          if (!last) return;
          /* Only handle if it's a different frame than the one we already
             saw (compare timestamps) — avoid double-feeding the same
             frame through descent10k/landing detectors. */
          if (last.ts && last.ts !== lastState.ts) {
            handleFrame(last);
          } else if (!connected && last.ts) {
            /* Even an old frame from main proves the bridge is alive —
               flip connected so the chip turns gold immediately. */
            connected = true;
            emit('connect');
          }
        } catch {}
      }, 1000);
    };
    startScPoll();
  } else {
    /* Browser / no-desktop fallback — WebSocket auto-detect.
       Skip on mobile (iPad / phone) — there's no FSUIPC on a tablet,
       so the probe just spams console errors every 5 s. The pilot's
       PC will run the probe instead. The FSLabs in-cockpit browser
       also shouldn't try to reach a non-existent localhost FSUIPC. */
    const isMobile = /iPad|iPhone|Android|FSLabs|MSFS/i.test(navigator.userAgent || '')
      || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    if (!isMobile) {
      setTimeout(startAutoDetect, 200);
    }
  }

  /* ============ Tracker bootstrap ============
     Writes the initial fingerprint events that the Pegasus-style
     Tracker page expects at the top of the log: AIVA version, OS,
     sim source, addon (from booking), aircraft type, livery, reg.
     Pulls aircraft details from the currently-active flight + booking
     so the row text matches what the pilot sees on dispatch.
     Called by the Tracker page on mount. Safe to call multiple times —
     dedup happens via the `kind` field. */
  const seededKinds = new Set();
  function seedTrackerEvents(activeFno) {
    const seedOnce = (kind, label, severity = 'info') => {
      if (seededKinds.has(kind)) return;
      seededKinds.add(kind);
      pushEvt(label, severity);
    };
    const ua = navigator.userAgent || '';
    const osName =
      /Windows NT 11/.test(ua) || /Windows NT 10/.test(ua) ? 'Windows' :
      /Mac OS X/.test(ua)      ? 'macOS' :
      /Linux/.test(ua)         ? 'Linux' :
      /iPad|iPhone/.test(ua)   ? 'iPadOS / iOS' :
      'Unknown';
    seedOnce('aiva', `AIVA ${window.AIVA_VERSION || '2026.06.05'}`, 'ok');
    seedOnce('os',   `OS: ${osName}`);
    seedOnce('src',  simSource === 'sim'
      ? `Simulator Connection: SimConnect (AIVA Desktop)`
      : `Simulator Connection: FSUIPC WebSocket`);
    seedOnce('sim',  `Simulator: Microsoft Flight Simulator`);
    /* Aircraft details derived from the active booking, since string
       SimVars aren't yet wired through the bridge. */
    const fl = AIVA.findFlight?.(activeFno);
    if (fl) {
      const addon = (() => {
        const t = (fl.ac || '').toUpperCase();
        if (t === 'B77W') return 'PMDG Boeing 777-300ER';
        if (t === 'B789') return 'PMDG Boeing 787-9';
        if (t === 'A20N') return 'Fenix A320 / FBW A320';
        if (t === 'A21N') return 'Fenix A321';
        if (t === 'A359') return 'FBW A350-900';
        if (t === 'A388') return 'iniBuilds A380-800';
        return fl.acName || t;
      })();
      seedOnce('addon',  `Addon: ${addon}`);
      seedOnce('actype', `Aircraft: ${fl.acName || fl.ac}`);
      seedOnce('atype',  `Aircraft Type: ${fl.ac}`);
      /* Reg + livery from booking if pilot picked them. */
      const today = (new Date()).toISOString().slice(0, 10);
      const bk = (AIVA.Store?.pilot?.(AIVA.Auth?.currentPilot?.()?.id)?.get('roster_bookings', []) || [])
        .find(b => b.fno === activeFno && b.date === today);
      if (bk?.reg) {
        seedOnce('reg',     `Registration: ${bk.reg}`);
        seedOnce('livery',  `Aircraft Livery: Air India (${bk.reg} | 2025)`);
      }
    }
    seedOnce('ready', 'Ready to track', 'ok');
  }

  /* Public surface */
  return {
    on, connect,
    isConnected: () => connected,
    state: () => lastState,
    /* Alias used by the EFB progress ribbon and portal dashboard */
    lastTelemetry: () => connected ? lastState : null,
    source: () => simSource,
    phase:  () => phase,
    /* Recent telemetry events — engine start, flaps, gear, lights,
       AP engage/disengage, transponder mode etc. Returns a copy so
       callers can't mutate the internal buffer. */
    getEventLog: () => telemetryLog.slice(),
    clearEventLog: () => { telemetryLog.length = 0; seededKinds.clear(); },
    seedTrackerEvents,
    resetSector,
    startAutoDetect, stopAutoDetect,
    /* For UI debugging / manual triggers */
    fireDescent10k: () => emit('descent10k', { fno: AIVA._activeFlight?.fno, sim:false }),
    fireLanding:    () => emit('landing',    { fno: AIVA._activeFlight?.fno, sim:false }),
    fireCrash:      () => emit('crash',      { fno: AIVA._activeFlight?.fno, sim:false }),
  };
})();

/* =====================================================================
   AIVA.Situations — the random-event engine.

   Public surface:
     fire(scenario, opts)  → trigger a specific scenario now (test or manual)
     start()               → start rolling the dice (called by EFB on flight start)
     stop()                → stop rolling
     active()              → list of scenarios currently active on this flight
     ack(id)               → acknowledge a fired scenario

   Roll cadence: once per minute. Per-scenario chance = baseProb × intensity slider.
   Each scenario fires at most once per flight.
   ===================================================================== */
AIVA.Situations = (() => {
  let timer = null;
  const subs = [];   /* event listeners */
  const fired = new Set();
  let activeList = [];
  const FIRED_KEY = (fno) => `sit_fired_${fno}`;

  function on(cb) { subs.push(cb); }
  function emit(s, opts) { subs.forEach(cb => { try { cb(s, opts); } catch(_){} }); }

  /* Phase gate. A drone sighting near approach shouldn't fire while
     the pilot is taxiing out at the gate — that's the bug pilots hit.
     Each scenario gets a list of valid phases. If the phase doesn't
     match, the dice never rolls. Defaults are conservative: most
     events skip GATE/PARKED. */
  const GROUND_PHASES   = ['GATE','PUSHBACK','TAXI_OUT','TAXI_IN','PARKED','LANDED'];
  const AIRBORNE_PHASES = ['TAKEOFF','CLIMB','CRUISE','DESCENT','APPROACH','LANDED'];
  function validPhases(s) {
    /* Specific overrides keyed by scenario id — the precise mapping that
       matches the real-world circumstances. */
    const map = {
      sec_drone:               ['APPROACH','DESCENT'],
      ops_birds:               ['TAKEOFF','CLIMB'],
      ops_lightning:           ['CLIMB','CRUISE','DESCENT'],
      ops_fuel_pi:             ['CRUISE','CLIMB','DESCENT'],
      wx_turbulence:           ['CRUISE','CLIMB','DESCENT'],
      wx_tafdest:              ['CLIMB','CRUISE','DESCENT'],
      wx_alt_deteriorating:    ['CRUISE','DESCENT','APPROACH'],
      world_airspace:          ['CLIMB','CRUISE','DESCENT'],
      world_volcano:           ['CLIMB','CRUISE','DESCENT'],
      world_geomag:            ['CLIMB','CRUISE','DESCENT'],
      world_gnd_stop:          ['CRUISE','DESCENT','APPROACH'],
      world_curfew:            ['CRUISE','DESCENT','APPROACH'],
      pax_unruly:              AIRBORNE_PHASES,
      pax_medical:             AIRBORNE_PHASES,
      pax_lavatory_smoke:      AIRBORNE_PHASES,
      pax_child:               AIRBORNE_PHASES,
      pax_belt:                ['CRUISE','CLIMB','DESCENT'],
      pax_birth:               AIRBORNE_PHASES,
      pax_lost_item:           [...AIRBORNE_PHASES,'LANDED','TAXI_IN'],
      pax_drunk:               AIRBORNE_PHASES,
      cc_short:                ['GATE','PUSHBACK','TAXI_OUT'],
      galley_fault:            AIRBORNE_PHASES,
      sec_bomb_threat:         ['GATE','TAXI_OUT','CRUISE'],
      sec_pax_aggressive:      AIRBORNE_PHASES,
      pic_incap:               AIRBORNE_PHASES,
      crew_food_pois:          ['CRUISE','CLIMB','DESCENT'],
      co_swap:                 GROUND_PHASES,
      co_vip:                  ['GATE','PUSHBACK','TAXI_OUT'],
      co_minconn:              ['CRUISE','DESCENT','APPROACH'],
      co_dx_change:            GROUND_PHASES,
      co_press:                ['GATE','PUSHBACK'],
      ops_mel:                 GROUND_PHASES,
      eq_radar_inop:           ['CRUISE','CLIMB','DESCENT'],
      eq_ifr_box:              [...AIRBORNE_PHASES,'GATE'],
    };
    if (s.phases) return s.phases;       /* explicit override on scenario */
    if (map[s.id]) return map[s.id];
    /* Fallback: allow all phases EXCEPT idle ground ones. */
    return [...AIRBORNE_PHASES, 'TAXI_OUT'];
  }

  function fire(scenario, opts = {}) {
    if (!scenario) return;
    if (fired.has(scenario.id) && !opts.manual) return;
    fired.add(scenario.id);
    /* Persist to per-flight store so a reload doesn't refire */
    const fno = AIVA._activeFlight?.fno;
    if (fno) {
      try {
        const list = JSON.parse(localStorage.getItem(FIRED_KEY(fno)) || '[]');
        if (!list.find(x => x.id === scenario.id)) {
          list.push({ id: scenario.id, ts: Date.now(), title: scenario.title });
          localStorage.setItem(FIRED_KEY(fno), JSON.stringify(list));
        }
      } catch {}
    }
    activeList.push({ ...scenario, ts: Date.now(), acked: false });

    /* Push to the pilot's cockpit CDU via Hoppie. Previously Situations
       only emitted to EFB toasts — pilots flying the 777 had no way to
       see the scenario fire unless they were watching the EFB. Now the
       ACARS body lands on the AOC inbox of whatever aircraft is logged
       on with the active flight callsign. */
    if (AIVA._hoppieAutoSend && scenario.acars) {
      const callsign = AIVA._activeCallsign?.() || null;
      if (callsign) {
        AIVA._hoppieAutoSend(callsign, 'telex',
          `SITUATION · ${scenario.title.toUpperCase()}\n${scenario.acars}`
        ).catch(()=>{});
      }
    }
    /* Auto-uplink CPDLC if datalink configured + scenario has cpdlc text */
    if (scenario.cpdlc && AIVA.Hoppie?.sendCPDLC) {
      AIVA.Hoppie.sendCPDLC(scenario.cpdlc).catch(()=>{});
    }
    emit(scenario, opts);
    return scenario;
  }
  function rollDice() {
    const cfg = AIVA.Store?.get?.('sit_cfg', { intensity: 0.4, enabled: true, categories: [] });
    if (!cfg.enabled || !cfg.intensity) return;
    /* Read current flight phase from the AIVA.FSUIPC state machine.
       If we can't tell what phase we're in, do nothing — don't risk
       firing inappropriate scenarios. */
    const phase = AIVA.FSUIPC?.phase?.();
    if (!phase) return;
    const pool = (AIVA.SITUATIONS || []).filter(s =>
      (!cfg.categories?.length || cfg.categories.includes(s.cat)) &&
      !fired.has(s.id) &&
      validPhases(s).includes(phase)
    );
    /* Each scenario gets its own per-minute chance = baseProb × intensity × 0.6
       (0.6 calibration so 100% slider = roughly the listed baseProb per minute). */
    for (const s of pool) {
      const chance = s.baseProb * cfg.intensity * 0.6;
      if (Math.random() < chance) {
        fire(s);
        break;   /* one event per minute max */
      }
    }
  }
  function start() {
    stop();
    /* Restore previously-fired list for THIS flight */
    fired.clear(); activeList = [];
    const fno = AIVA._activeFlight?.fno;
    if (fno) {
      try {
        const list = JSON.parse(localStorage.getItem(FIRED_KEY(fno)) || '[]');
        list.forEach(x => fired.add(x.id));
      } catch {}
    }
    timer = setInterval(rollDice, 60_000);   /* once a minute */
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  function active() { return activeList.filter(x => !x.acked); }
  function ack(id) { const a = activeList.find(x => x.id === id); if (a) a.acked = true; }

  return { on, fire, start, stop, active, ack };
})();
