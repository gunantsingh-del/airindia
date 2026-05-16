/* =====================================================================
   AIVA · PilotSync — cross-device flight state sync
   ---------------------------------------------------------------------
   Pilots can open AIVA on their PC AND on their FSLabs iPad EFB
   browser at the same time. Without sync, each device has its own
   localStorage — the iPad doesn't know the PC has a flight in progress.

   This module broadcasts each pilot's current flight state over a
   per-pilot ntfy topic every 30 seconds (heartbeat) AND immediately
   on state changes. Other devices logged into the same pilot account
   subscribe to the same topic, see the broadcasts, and apply the
   newer state to their local store.

   Broadcast payload (JSON):
     {
       pilotId, ts,
       flight_in_progress: { fno, startedAt } | null,
       active_flight: 'AI2577' | null,
       phase: 'CRUISE' | ...
     }

   Topic name: aiva-pilot-<pilotId>-state
   Public ntfy.sh topic — flight state isn't sensitive (no pax / no PII).
   Uses the same NTFY_HOSTS rotation pattern as crew-chat for ISP
   blocking resilience.
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.PilotSync = (() => {
  const NTFY_HOSTS = [
    'https://ntfy.sh',
    'https://ntfy.envs.net',
    'https://ntfy.jonas-meyer.de',
  ];
  let hostIdx = 0;
  let pollTimer = null;
  let beatTimer = null;
  let lastSent  = null;
  let lastApply = 0;

  function host() { return NTFY_HOSTS[hostIdx]; }
  function rotate() { hostIdx = (hostIdx + 1) % NTFY_HOSTS.length; }

  function topic(pilotId) { return `aiva-pilot-${pilotId}-state`; }

  function snapshot() {
    const p = AIVA.Auth?.currentPilot?.();
    if (!p) return null;
    const ps = AIVA.Store.pilot(p.id);
    return {
      pilotId: p.id,
      ts: Date.now(),
      flight_in_progress: ps.get('flight_in_progress', null),
      active_flight:      ps.get('active_flight',      null),
      phase:              AIVA.FSUIPC?.phase?.() || null,
    };
  }

  async function broadcast() {
    const s = snapshot();
    if (!s) return;
    /* Skip the network round-trip if nothing's changed since last send. */
    const key = JSON.stringify({ f: s.flight_in_progress, a: s.active_flight, p: s.phase });
    if (key === lastSent) return;
    lastSent = key;
    try {
      await fetch(`${host()}/${encodeURIComponent(topic(s.pilotId))}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      });
    } catch (e) {
      /* Network glitch — try next host on the next beat. */
      rotate();
    }
  }

  async function pollLatest() {
    const p = AIVA.Auth?.currentPilot?.();
    if (!p) return;
    try {
      /* Last 5 min of broadcasts on the topic, NDJSON. */
      const r = await fetch(`${host()}/${encodeURIComponent(topic(p.id))}/json?poll=1&since=300s`, {
        cache: 'no-store',
      });
      if (!r.ok) { rotate(); return; }
      const text = await r.text();
      if (!text.trim()) return;
      let latest = null;
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const env = JSON.parse(line);
          if (env.event && env.event !== 'message') continue;
          if (!env.message) continue;
          const state = JSON.parse(env.message);
          if (!latest || state.ts > latest.ts) latest = state;
        } catch {}
      }
      if (latest) apply(latest);
    } catch (e) {
      rotate();
    }
  }

  /* Apply an incoming state IF it's newer than what we just sent. We
     dedupe against THIS device's own broadcasts so we don't bounce
     state back and forth. */
  function apply(s) {
    if (!s || s.pilotId !== AIVA.Auth?.currentPilot?.()?.id) return;
    /* Discard if we applied something newer recently. */
    if (s.ts <= lastApply) return;
    /* Discard if it's older than what we have locally already. */
    const local = snapshot();
    if (local && local.ts > s.ts + 5000) return;
    lastApply = s.ts;
    const ps = AIVA.Store.pilot(s.pilotId);
    /* Only write if the incoming value differs — avoids needless storage
       events / re-renders. */
    const cur = ps.get('flight_in_progress', null);
    if (JSON.stringify(cur) !== JSON.stringify(s.flight_in_progress)) {
      if (s.flight_in_progress) ps.set('flight_in_progress', s.flight_in_progress);
      else ps.remove('flight_in_progress');
      /* Tell any open page to re-render. */
      try { window.dispatchEvent(new CustomEvent('aiva-sync', { detail: { kind: 'flight_in_progress' } })); } catch {}
    }
    const curAct = ps.get('active_flight', null);
    if (s.active_flight && s.active_flight !== curAct) {
      ps.set('active_flight', s.active_flight);
      try { window.dispatchEvent(new CustomEvent('aiva-sync', { detail: { kind: 'active_flight' } })); } catch {}
    }
  }

  function start() {
    if (!AIVA.Auth?.currentPilot?.()) return;
    stop();
    /* Initial pull so a fresh tab catches up to what other devices
       already broadcast. */
    pollLatest();
    /* Heartbeat: broadcast + poll every 30 s. Broadcast is no-op when
       nothing's changed. Poll catches what other devices sent. */
    beatTimer = setInterval(broadcast, 30_000);
    pollTimer = setInterval(pollLatest, 30_000);
    /* Immediate broadcast a few seconds after load so the OTHER device
       sees us quickly. */
    setTimeout(broadcast, 3_000);
  }
  function stop() {
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  function pushNow() { lastSent = null; return broadcast(); }

  return { start, stop, broadcast, pollLatest, pushNow, apply };
})();

/* Auto-start once AIVA.Auth is ready. */
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    /* Small delay so AIVA.Auth has loaded the session. */
    setTimeout(() => AIVA.PilotSync.start(), 500);
  });
}
