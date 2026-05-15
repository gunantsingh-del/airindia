/* =====================================================================
   AIVA · /api/wx — server-side METAR + TAF proxy
   ---------------------------------------------------------------------
   The previous client-side approach went:
       browser → corsproxy.io → aviationweather.gov
   Two failure modes:
       (a) corsproxy.io rate-limits or 502s (we hit it daily)
       (b) AWC blocks the proxy's IP entirely some weeks
   Result: pilots saw "No live METAR" even when the sim weather was
   nominal.

   This function runs on Vercel's edge — server-to-server, no CORS. It
   tries AWC first (best data — includes TAF, flight category, decoded
   fields). If AWC is down, it falls back to metar.vatsim.net (CORS-
   clean, free, METAR-only) per ICAO. If even that fails, NOAA TGFTP
   static text files.

   Usage from the browser:
       GET /api/wx?ids=VIDP,VABB,KJFK
   Returns: AWC-shape JSON array — [{icaoId, rawOb, rawTaf, ...}, ...]
   ===================================================================== */

const CACHE = new Map();   // ICAO → { ts, data }
const CACHE_MS = 60_000;   // 60s — METARs publish hourly so this is plenty

function pickFromCache(icaos) {
  const fresh = []; const stale = [];
  for (const icao of icaos) {
    const c = CACHE.get(icao);
    if (c && (Date.now() - c.ts) < CACHE_MS) fresh.push(c.data);
    else stale.push(icao);
  }
  return { fresh, stale };
}
function storeCache(items) {
  for (const it of items) {
    if (it && it.icaoId) CACHE.set(it.icaoId, { ts: Date.now(), data: it });
  }
}

/* ---------- Source 1: AWC JSON (best, has TAF) ---------- */
async function fetchAWC(icaos) {
  try {
    const url = `https://aviationweather.gov/api/data/metar?ids=${icaos.join(',')}&format=json&taf=true&hours=3`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'aiva-wx/1.0 (+https://airindiavirtual.online)' },
      signal: AbortSignal.timeout(4500),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j) && j.length) return j;
    return null;
  } catch { return null; }
}

/* ---------- Source 2: VATSIM METAR (CORS-friendly, plain text) ---------- */
async function fetchVATSIM(icao) {
  try {
    const r = await fetch(`https://metar.vatsim.net/${icao}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const txt = (await r.text()).trim().replace(/=$/, '');
    if (txt.length < 10) return null;
    return { icaoId: icao, rawOb: txt, rawTaf: '', source: 'vatsim' };
  } catch { return null; }
}

/* ---------- Source 3: NOAA TGFTP static text (last-resort) ---------- */
async function fetchNOAA(icao) {
  try {
    const [mR, tR] = await Promise.all([
      fetch(`https://tgftp.nws.noaa.gov/data/observations/metar/stations/${icao}.TXT`, { signal: AbortSignal.timeout(3000) }),
      fetch(`https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${icao}.TXT`, { signal: AbortSignal.timeout(3000) }),
    ]);
    let metar = '', taf = '';
    if (mR.ok) {
      const text = await mR.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      /* TGFTP format: line 0 = "YYYY/MM/DD HH:MM", line 1+ = METAR text */
      if (lines.length >= 2) metar = lines.slice(1).join(' ').trim();
    }
    if (tR.ok) {
      const text = await tR.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) taf = lines.slice(1).join(' ').trim();
    }
    if (!metar && !taf) return null;
    return { icaoId: icao, rawOb: metar || '', rawTaf: taf || '', source: 'noaa' };
  } catch { return null; }
}

export default async function handler(req, res) {
  const idsParam = (req.query?.ids || '').toString();
  const icaos = idsParam.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{4}$/.test(s)).slice(0, 8);
  if (!icaos.length) {
    res.status(400).json({ error: 'missing or invalid ids query param (4-letter ICAOs, comma-separated, max 8)' });
    return;
  }

  /* Cache hit fast-path */
  const { fresh, stale } = pickFromCache(icaos);

  if (stale.length) {
    /* Source 1: AWC bulk request for everything missing */
    const awc = await fetchAWC(stale);
    if (awc && awc.length) {
      storeCache(awc);
      fresh.push(...awc);
    }

    /* Source 2 + 3: per-ICAO fallback for whatever AWC missed */
    const got = new Set(fresh.map(x => x.icaoId));
    const still = stale.filter(x => !got.has(x));
    if (still.length) {
      const fallback = await Promise.all(still.map(async (icao) => {
        return (await fetchVATSIM(icao)) || (await fetchNOAA(icao));
      }));
      const ok = fallback.filter(Boolean);
      storeCache(ok);
      fresh.push(...ok);
    }
  }

  /* Re-order to match the caller's request order so the UI renders
     cards in the order the pilot typed them. */
  const byIcao = Object.fromEntries(fresh.map(x => [x.icaoId, x]));
  const ordered = icaos.map(c => byIcao[c]).filter(Boolean);

  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  res.status(200).json(ordered);
}
