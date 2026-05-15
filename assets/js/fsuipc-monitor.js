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
  const listeners = { connect:[], disconnect:[], state:[], descent10k:[], landing:[], crash:[], phase:[] };
  /* Flight-phase state machine.
     States: GATE → PUSHBACK → TAXI_OUT → TAKEOFF → CLIMB → CRUISE →
             DESCENT → APPROACH → LANDED → TAXI_IN → PARKED
     Each transition emits a 'phase' event with {from, to, state}.
     Announcement triggers (boarding / pushback / takeoff / landing /
     disembark) hook into these. */
  let phase = 'GATE';
  let topAltSeen = 0;
  function detectPhase(s, prev) {
    const og = !!s.onGround;
    const gs = s.gs || 0;
    const alt = s.alt || 0;
    const vs = s.vs || 0;
    const pb = !!s.parkingBrake;
    const eng = !!(s.eng1 || s.eng2);
    /* Ground + brake set + no movement */
    if (og && gs < 1 && pb) {
      /* If we arrived (came from a landed/taxi-in state), it's PARKED.
         Otherwise it's GATE (initial state, pre-departure). */
      if (prev === 'LANDED' || prev === 'TAXI_IN' || prev === 'PARKED') return 'PARKED';
      return 'GATE';
    }
    /* Ground + brake released + slow = pushback or beginning of taxi */
    if (og && gs < 5) {
      if (prev === 'GATE' || prev === 'PUSHBACK') return 'PUSHBACK';
      if (prev === 'LANDED' || prev === 'TAXI_IN') return 'TAXI_IN';
      return prev || 'PUSHBACK';
    }
    /* Ground + moderate ground speed = taxi (out vs in depends on history) */
    if (og && gs >= 5 && gs < 80) {
      if (prev === 'LANDED' || prev === 'TAXI_IN') return 'TAXI_IN';
      return 'TAXI_OUT';
    }
    /* Ground + high speed (takeoff roll) */
    if (og && gs >= 80) return 'TAKEOFF';
    /* Airborne, low + climbing fast = TAKEOFF/INITIAL CLIMB */
    if (!og && alt < 1000 && vs > 500) return 'TAKEOFF';
    /* Airborne, climbing */
    if (!og && vs > 200) return 'CLIMB';
    /* Airborne, descending below 10k = APPROACH */
    if (!og && vs < -200 && alt < 10000) return 'APPROACH';
    /* Airborne, descending above 10k = DESCENT */
    if (!og && vs < -200) return 'DESCENT';
    /* Airborne, low alt, level-ish = APPROACH */
    if (!og && alt < 5000) return 'APPROACH';
    /* Airborne, stable = CRUISE */
    if (!og) return 'CRUISE';
    /* Just touched down */
    if (og && prev && (prev === 'APPROACH' || prev === 'TAKEOFF' || prev === 'CLIMB' || prev === 'CRUISE' || prev === 'DESCENT')) return 'LANDED';
    return prev || 'GATE';
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
      fuel:         d.fuel,
      parkingBrake: d.parkingBrake,
      flapsIdx:     d.flapsIdx,
      flapsPct:     d.flapsPct,
      throttle1:    d.throttle1,
      eng1:         d.eng1,
      eng2:         d.eng2,
      pushback:     d.pushback,
      ts: Date.now(),
    };
    /* Hold the prior frame for delta-based detectors (descent10k, landing)
       BEFORE we overwrite lastState. */
    const prev = lastState;
    lastState = state;
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

  function resetSector() {
    topAlt = 0; arrivalArmed = true; landingArmed = true; inFlight = false;
    phase = 'GATE';
    topAltSeen = 0;
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
    /* Browser / no-desktop fallback — WebSocket auto-detect. */
    setTimeout(startAutoDetect, 200);
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
    /* Auto-send ACARS */
    if (AIVA.Hoppie?.sendDispatch) {
      AIVA.Hoppie.sendDispatch(scenario.acars).catch(()=>{});
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
    const pool = (AIVA.SITUATIONS || []).filter(s =>
      (!cfg.categories?.length || cfg.categories.includes(s.cat)) && !fired.has(s.id)
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
