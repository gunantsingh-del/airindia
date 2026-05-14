/* =====================================================================
   AIVA — FSUIPC live monitor
   Connects to FSUIPC7's WebSocket bridge at ws://localhost:2048 and:
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
  const listeners = { connect:[], disconnect:[], state:[], descent10k:[], landing:[], crash:[] };

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

  async function connect() {
    if (ws) try { ws.close(); } catch(_){}
    return new Promise((resolve, reject) => {
      try { ws = new WebSocket('ws://localhost:2048'); }
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
    /* d is an object keyed by offset hex, but our wrapper normalises to names */
    const state = {
      alt:      d.alt      ?? d[FSUIPC_OFFSETS.alt.offset.toString()],
      gs:       d.gs       ?? d[FSUIPC_OFFSETS.gs.offset.toString()],
      onGround: !!(d.onGround ?? d[FSUIPC_OFFSETS.onGround.offset.toString()]),
      lat:      d.lat      ?? d[FSUIPC_OFFSETS.lat.offset.toString()],
      lon:      d.lon      ?? d[FSUIPC_OFFSETS.lon.offset.toString()],
      ts: Date.now(),
    };
    emit('state', state);
    /* Bookkeeping */
    if (state.alt > topAlt) topAlt = state.alt;
    if (state.alt > 1500 && !state.onGround) inFlight = true;

    /* Descent through 10,000 ft (only after climbing above it, only once per sector) */
    if (arrivalArmed && topAlt > 11000 && lastState.alt > 10000 && state.alt <= 10000 && !state.onGround) {
      arrivalArmed = false;
      emit('descent10k', { ...state, fno: AIVA._activeFlight?.fno });
    }
    /* Landing detection: was airborne, now on ground with low GS */
    if (landingArmed && inFlight && state.onGround && state.gs < 60 && (lastState.gs || 0) > 60) {
      landingArmed = false;
      emit('landing', { ...state, fno: AIVA._activeFlight?.fno });
      /* After landing, reset for next sector */
      setTimeout(() => { resetSector(); }, 30_000);
    }
    lastState = state;
  }

  function resetSector() {
    topAlt = 0; arrivalArmed = true; landingArmed = true; inFlight = false;
  }

  /* Public surface */
  return {
    on, connect,
    isConnected: () => connected,
    state: () => lastState,
    /* Alias used by the EFB progress ribbon and portal dashboard */
    lastTelemetry: () => connected ? lastState : null,
    resetSector,
    /* For UI debugging / manual triggers */
    fireDescent10k: () => emit('descent10k', { fno: AIVA._activeFlight?.fno, sim:false }),
    fireLanding:    () => emit('landing',    { fno: AIVA._activeFlight?.fno, sim:false }),
    fireCrash:      () => emit('crash',      { fno: AIVA._activeFlight?.fno, sim:false }),
  };
})();
