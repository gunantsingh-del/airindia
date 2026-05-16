/* =====================================================================
   AIVA · /api/plane-photo — planespotters.net photo lookup by reg
   ---------------------------------------------------------------------
   Front-end requests a tail number, gets back a single photo URL +
   photographer credit + click-through link. Same-origin Vercel proxy
   so the FSLabs in-cockpit browser (which blocks external HTTPS hosts)
   still works.

   Planespotters.net offers a free public JSON endpoint:
     https://api.planespotters.net/pub/photos/reg/<REG>
   Returns:
     { photos: [
       { id, thumbnail, thumbnail_large, photographer, link, aircraft_type, ... }
     ]}

   We cache per-reg responses in a Map for 12 h (registrations don't
   change photos that fast). MAX 1024 cached registrations with oldest-
   evict so memory stays bounded.

   Usage: GET /api/plane-photo?reg=VT-CGN  →  { url, link, photographer, aircraft_type }
   ===================================================================== */

const CACHE = new Map();
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_KEYS = 1024;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=43200');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET')      { res.setHeader('Allow', 'GET'); res.status(405).json({ error: 'GET only' }); return; }

  let reg = ((req.query?.reg) || '').toString().toUpperCase().trim().replace(/[^A-Z0-9-]/g, '');
  if (!reg || reg.length < 3 || reg.length > 10) {
    res.status(400).json({ error: 'reg query param required (e.g. ?reg=VT-CGN)' });
    return;
  }

  /* Cache hit */
  const hit = CACHE.get(reg);
  if (hit && (Date.now() - hit.ts) < TTL_MS) {
    res.status(200).json({ ...hit.data, cached: true });
    return;
  }

  try {
    const r = await fetch(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`, {
      headers: { 'User-Agent': 'AIVA/1.0 (+https://airindiavirtual.online)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) {
      res.status(200).json({ reg, url: null, error: `planespotters HTTP ${r.status}` });
      return;
    }
    const j = await r.json();
    const photo = (j?.photos || [])[0];
    if (!photo) {
      const data = { reg, url: null };
      CACHE.set(reg, { ts: Date.now(), data });   // cache the miss too
      res.status(200).json(data);
      return;
    }
    const data = {
      reg,
      url:           photo.thumbnail_large?.src || photo.thumbnail?.src || null,
      thumbnail:     photo.thumbnail?.src || null,
      link:          photo.link || null,
      photographer:  photo.photographer || null,
      aircraft_type: photo.aircraft_type || null,
    };
    CACHE.set(reg, { ts: Date.now(), data });
    if (CACHE.size > MAX_KEYS) {
      const oldest = [...CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) CACHE.delete(oldest[0]);
    }
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: 'planespotters unreachable', detail: e?.message || String(e) });
  }
}
