/* =====================================================================
   AIVA · PilotSync — cross-device flight state sync
   ---------------------------------------------------------------------
   Goal: pilot logs into AIVA on their PC, opens AIVA EFB on their
   FSLabs A321 in-cockpit browser, and the iPad shows the SAME active
   flight without re-clicking Start.

   v2 — Vercel function instead of ntfy.sh.
   The FSLabs iPad's embedded Chromium blocks external HTTPS hosts
   (ntfy.sh and community mirrors all time out). We solve this by
   routing through OUR /api/pilot-state endpoint on the same origin
   (airindiavirtual.online) — guaranteed reachable from any device
   that can load AIVA at all.

   Cycle:
     • POST /api/pilot-state?pilotId=X  body=snapshot   every 30 s + on change
     • GET  /api/pilot-state?pilotId=X                   every 30 s
   When the GET returns a state newer than ours, apply it locally and
   fire `aiva-sync` so the renderers (portal + EFB) re-render.
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.PilotSync = (() => {
  const ENDPOINT = '/api/pilot-state';
  let pollTimer = null;
  let beatTimer = null;
  let lastSent  = null;
  let lastApply = 0;

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
      device:             /Electron/i.test(navigator.userAgent) ? 'desktop'
                          : /iPad|iPhone|Android/i.test(navigator.userAgent) ? 'mobile'
                          : 'web',
    };
  }

  async function broadcast() {
    const s = snapshot();
    if (!s) return;
    /* Skip if unchanged since last send (dedup on the meaningful keys). */
    const key = JSON.stringify({ f: s.flight_in_progress, a: s.active_flight, p: s.phase });
    if (key === lastSent) return;
    lastSent = key;
    try {
      await fetch(`${ENDPOINT}?pilotId=${encodeURIComponent(s.pilotId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      });
    } catch {
      /* Network glitch — keep lastSent unchanged so we retry next beat */
      lastSent = null;
    }
  }

  async function pollLatest() {
    const p = AIVA.Auth?.currentPilot?.();
    if (!p) return;
    try {
      const r = await fetch(`${ENDPOINT}?pilotId=${encodeURIComponent(p.id)}`, {
        cache: 'no-store',
      });
      if (!r.ok) return;
      const j = await r.json();
      if (j?.state) apply(j.state);
    } catch {}
  }

  /* Apply an incoming snapshot if it's newer than what we have. Also
     skip if it came from THIS device (dedup against our own broadcast
     that came back through the poll). */
  function apply(s) {
    if (!s || s.pilotId !== AIVA.Auth?.currentPilot?.()?.id) return;
    if (s.ts <= lastApply) return;
    lastApply = s.ts;
    const ps = AIVA.Store.pilot(s.pilotId);
    /* flight_in_progress: only write if different from current local. */
    const cur = ps.get('flight_in_progress', null);
    const want = s.flight_in_progress || null;
    if (JSON.stringify(cur) !== JSON.stringify(want)) {
      if (want) ps.set('flight_in_progress', want);
      else ps.remove('flight_in_progress');
      try { window.dispatchEvent(new CustomEvent('aiva-sync', { detail: { kind:'flight_in_progress' } })); } catch {}
    }
    const curAct = ps.get('active_flight', null);
    if (s.active_flight && s.active_flight !== curAct) {
      ps.set('active_flight', s.active_flight);
      try { window.dispatchEvent(new CustomEvent('aiva-sync', { detail: { kind:'active_flight' } })); } catch {}
    }
  }

  function start() {
    if (!AIVA.Auth?.currentPilot?.()) return;
    stop();
    /* Pull immediately so a fresh tab catches up to whatever the OTHER
       device last broadcast. */
    pollLatest();
    /* Heartbeat every 30 s — broadcast (no-op if unchanged) + poll. */
    beatTimer = setInterval(broadcast,  30_000);
    pollTimer = setInterval(pollLatest, 30_000);
    /* First broadcast a few seconds in so the OTHER device sees us
       quickly after we open AIVA. */
    setTimeout(broadcast, 2_500);
  }
  function stop() {
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  function pushNow() { lastSent = null; return broadcast(); }

  return { start, stop, broadcast, pollLatest, pushNow, apply };
})();

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => AIVA.PilotSync.start(), 500);
  });
}
