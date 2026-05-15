/* =====================================================================
   AIR INDIA VIRTUAL — Auth (hardcoded multi-user, demo only)
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.Auth = (() => {

  /* Roster version — bump when PILOTS_SEED changes so existing browsers
     re-seed from the new locked roster. Naadir Shaikh spelling fix +
     credential rotation (AIV008) → v4. */
  const ROSTER_VERSION = 'v4-naadir-shaikh-2026-05-15';
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
  const currentPilot = () => {
    const s = session();
    if (!s) return null;
    return allPilots().find(p => p.id === s.pilotId) || null;
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
