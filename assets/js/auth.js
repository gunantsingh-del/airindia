/* =====================================================================
   AIR INDIA VIRTUAL — Auth (server-mediated session cookie)
   ---------------------------------------------------------------------
   The cookie path:
     1. Pilot enters email + password on the login page → POST
        /api/auth-login → server sets HttpOnly aiva_session cookie + we
        cache the pilot record in localStorage for offline boots.
     2. On every page load AIVA.Auth.refreshFromServer() pings
        /api/auth-me with the cookie. If 200, we update the cached
        pilot record. If 401, the local session is cleared and we
        redirect to the login page.
     3. AIVA.Auth.logout() POSTs /api/auth-logout to clear the cookie
        + wipes the local cache.

   Fallback: if the network is unreachable (offline, dev mode,
   /api/auth-* not deployed), we still allow login against the cached
   AIVA.PILOTS_SEED in localStorage — same behavior as the old fully-
   client-side auth.
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.Auth = (() => {

  const ROSTER_VERSION = 'v6-add-samyo-2026-05-15';
  const ensureSeed = () => {
    const ver = AIVA.Store.get('roster_version');
    if (ver !== ROSTER_VERSION) {
      AIVA.Store.set('pilots', AIVA.PILOTS_SEED);
      AIVA.Store.set('roster_version', ROSTER_VERSION);
    }
    if (!AIVA.Store.get('flights_logged')) AIVA.Store.set('flights_logged', []);
  };
  ensureSeed();

  const allPilots = () => AIVA.Store.get('pilots', AIVA.PILOTS_SEED);

  /* ---------- session shape ----------
     We keep a tiny session object in localStorage so pages can
     synchronously check who's logged in (avoids flashing the login
     screen on every reload). The HttpOnly cookie is the actual
     authority — server checks it on every /api/auth-me call. */
  const session = () => AIVA.Store.get('session');
  const isLoggedIn = () => !!session();

  /* ---------- server login ---------- */
  async function login(email, password) {
    ensureSeed();
    /* Try server first. */
    try {
      const r = await fetch('/api/auth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j?.pilot) {
          AIVA.Store.set('session', { pilotId: j.pilot.id, ts: Date.now(), source: 'server' });
          /* Also update the cached pilots roster with the server's
             record (in case a profile field changed). */
          const pilots = allPilots();
          const idx = pilots.findIndex(p => p.id === j.pilot.id);
          if (idx >= 0) { pilots[idx] = { ...pilots[idx], ...j.pilot }; AIVA.Store.set('pilots', pilots); }
          return { ok: true, pilot: j.pilot };
        }
      } else if (r.status === 401) {
        return { ok: false, error: 'Invalid email or password.' };
      }
      /* Other status — fall through to local fallback. */
    } catch (_) {
      /* Network unreachable — fall through to local. */
    }
    /* Local fallback (offline, dev). */
    const p = allPilots().find(p =>
      p.email.toLowerCase().trim() === email.toLowerCase().trim() && p.password === password
    );
    if (!p) return { ok: false, error: 'Invalid email or password.' };
    AIVA.Store.set('session', { pilotId: p.id, ts: Date.now(), source: 'local' });
    return { ok: true, pilot: p };
  }

  /* Server-side check — call on every page load to validate the
     cookie hasn't expired and refresh the cached pilot record. */
  async function refreshFromServer() {
    try {
      const r = await fetch('/api/auth-me', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (r.ok) {
        const j = await r.json();
        if (j?.pilot) {
          AIVA.Store.set('session', { pilotId: j.pilot.id, ts: Date.now(), source: 'server' });
          const pilots = allPilots();
          const idx = pilots.findIndex(p => p.id === j.pilot.id);
          if (idx >= 0) { pilots[idx] = { ...pilots[idx], ...j.pilot }; AIVA.Store.set('pilots', pilots); }
          return j.pilot;
        }
      } else if (r.status === 401) {
        /* Cookie expired or invalid — but only clear local session if
           it claims to be server-sourced. A locally-cached login still
           works offline. */
        const s = session();
        if (s?.source === 'server') {
          AIVA.Store.remove('session');
          /* Don't auto-redirect — let the calling page decide. */
        }
      }
    } catch {}
    return null;
  }

  /* ---------- logout ---------- */
  async function logout() {
    try { await fetch('/api/auth-logout', { method: 'POST', credentials: 'include' }); } catch {}
    AIVA.Store.remove('session');
    location.href = 'index.html';
  }

  /* Live pilot decoration: rank is computed from total block hours so
     it stays in sync with progression instead of relying on the seed
     string, and aircraft is merged with the pilot's saved type-rating
     override from Profile so the dashboard reflects whatever they
     ticked last. */
  const currentPilot = () => {
    const s = session();
    if (!s) return null;
    const seed = allPilots().find(p => p.id === s.pilotId);
    if (!seed) return null;
    let hours = 0;
    let acOverride = null;
    try {
      const ps = AIVA.Store.pilot(seed.id);
      const flights = ps.get('flights_logged', []) || [];
      const totalMins = flights.reduce((a, f) => a + (Number(f.durMins) || 0), 0);
      hours = totalMins / 60;
      acOverride = ps.get('aircraft_override', null);
    } catch {}
    const rankLabel = (AIVA.rankFor?.(hours)?.label) || seed.rank;
    return {
      ...seed,
      aircraft: acOverride || seed.aircraft,
      hours,
      rank: rankLabel,
    };
  };

  const requireAuth = () => {
    if (!isLoggedIn()) {
      location.href = 'index.html';
      return null;
    }
    return currentPilot();
  };

  /* Kick off a background server check so the cached session stays
     fresh. Fire-and-forget — page render doesn't wait. */
  if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => refreshFromServer(), 300);
    });
  }

  return { login, logout, session, isLoggedIn, currentPilot, requireAuth, allPilots, refreshFromServer };
})();
