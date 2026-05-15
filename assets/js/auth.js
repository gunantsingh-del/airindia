/* =====================================================================
   AIR INDIA VIRTUAL — Auth (hardcoded multi-user, demo only)
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.Auth = (() => {

  /* Roster version — bump when PILOTS_SEED changes so existing browsers
     re-seed from the new locked roster. v5 → Gunant deranked to Cadet
     (rank now computed live from hours; admin role kept), and live-rank
     wiring lands in currentPilot(). */
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

  const login = (email, password) => {
    ensureSeed();
    const p = allPilots().find(p =>
      p.email.toLowerCase().trim() === email.toLowerCase().trim() && p.password === password
    );
    if (!p) return { ok: false, error: 'Invalid email or password.' };
    AIVA.Store.set('session', { pilotId: p.id, ts: Date.now() });
    return { ok: true, pilot: p };
  };

  const logout = () => {
    AIVA.Store.remove('session');
    location.href = 'index.html';
  };

  const session = () => AIVA.Store.get('session');
  const isLoggedIn = () => !!session();
  /* Live pilot decoration: rank is computed from total block hours so it
     stays in sync with progression instead of relying on the seed string,
     and aircraft is merged with the pilot's saved type-rating override
     from Profile so the dashboard reflects whatever they ticked last. */
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

  return { login, logout, session, isLoggedIn, currentPilot, requireAuth, allPilots };
})();
