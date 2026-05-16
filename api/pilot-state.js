/* =====================================================================
   AIVA · /api/pilot-state — cross-device flight state cache
   ---------------------------------------------------------------------
   The FSLabs A321 in-cockpit browser blocks external HTTPS endpoints
   (ntfy.sh + community mirrors all time out). We solve cross-device
   sync by routing through OUR Vercel function on the same origin
   (airindiavirtual.online), which the iPad never blocks.

   POST  /api/pilot-state?pilotId=AIV001   body: { flight_in_progress, … }
       → stores the snapshot in module memory keyed by pilotId
   GET   /api/pilot-state?pilotId=AIV001
       → returns the latest snapshot or { state: null }

   Storage: in-memory Map at module scope. Persists across requests
   within the same warm function instance. Vercel evicts after ~5 min
   of idle. For our use case this is fine — pilots actively flying
   broadcast every 30 s + on every state change, so the cache stays
   warm. Cold-start gap is at most a few minutes between sessions.

   Not authenticated — any logged-in pilot can read any other pilot's
   state. That's acceptable here since the data isn't sensitive (just
   flight number + phase) and the topic name acts as a soft key.
   ===================================================================== */

const STATES = new Map();   // pilotId → { state, ts }
const MAX_KEYS = 64;        // keep last 64 pilots — small safety cap

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const pilotId = ((req.query?.pilotId) || '').toString().toUpperCase();
  if (!/^AIV\d{3}$/.test(pilotId)) {
    res.status(400).json({ error: 'invalid pilotId (expected AIVxxx)' });
    return;
  }

  if (req.method === 'GET') {
    const entry = STATES.get(pilotId);
    if (!entry) { res.status(200).json({ pilotId, state: null }); return; }
    res.status(200).json({ pilotId, state: entry.state, ts: entry.ts });
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    /* Defensive — reject runaway payloads. */
    const serialized = JSON.stringify(body);
    if (serialized.length > 8 * 1024) {
      res.status(413).json({ error: 'payload over 8KB' });
      return;
    }
    STATES.set(pilotId, { state: body, ts: Date.now() });
    /* Evict oldest if we hit cap. */
    if (STATES.size > MAX_KEYS) {
      const oldest = [...STATES.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) STATES.delete(oldest[0]);
    }
    res.status(200).json({ ok: true, pilotId, ts: STATES.get(pilotId).ts });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'GET or POST only' });
}
