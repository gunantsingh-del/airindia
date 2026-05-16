/* =====================================================================
   AIVA · /api/simbrief — server-side SimBrief OFP fetch
   ---------------------------------------------------------------------
   Bypasses the public-CORS-proxy hop that pilots kept hitting:
   corsproxy.io rate-limits aggressively, codetabs mangles `&`-separated
   query params, allorigins is unreliable. By fetching SimBrief from
   AIVA's own Vercel edge instead, we eliminate every proxy in the chain
   — response in ~300-800 ms instead of 5-15 s, and no 403s under load.

   The SimBrief XML endpoint is:
     https://www.simbrief.com/api/xml.fetcher.php?username=X
   It returns the user's most-recent dispatched OFP as XML.

   Request:  GET /api/simbrief?username=<sbUser>
   Response: 200 OK
             - Content-Type: application/xml
             - Body: the raw SimBrief XML, untouched
   Errors:   400 (no username), 404 (user has no OFP), 502 (upstream)

   Cache: no-store. SimBrief OFPs change every time the pilot re-files,
   so caching is actively harmful here.
   ===================================================================== */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  /* CORS open — AIVA is served from airindiavirtual.online, the .exe is
     a different origin via file://, and the iframe-embed scenarios add
     more variants. Keeping it permissive since this endpoint only proxies
     a public read-only SimBrief XML. */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'GET only' });
    return;
  }

  const username = (req.query?.username || '').toString().trim();
  if (!username) {
    res.status(400).json({ error: 'username query param required' });
    return;
  }
  /* Sanitize: SimBrief usernames are alphanumeric + underscore + dot.
     Block anything else so this endpoint can't be abused to fetch
     arbitrary URLs. */
  if (!/^[a-zA-Z0-9_.\-]{1,32}$/.test(username)) {
    res.status(400).json({ error: 'invalid username format' });
    return;
  }

  const url = `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}`;
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'AIVA/1.0 (+https://airindiavirtual.online)' },
    });
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).json({
        error: `SimBrief upstream returned HTTP ${upstream.status}`,
        username,
      });
      return;
    }
    const xml = await upstream.text();
    if (!xml || xml.length < 200 || /<error>/i.test(xml)) {
      res.status(404).json({
        error: 'SimBrief has no OFP for this username — dispatch one on simbrief.com first',
        username,
        bodyPreview: xml.slice(0, 120),
      });
      return;
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(xml);
  } catch (err) {
    res.status(502).json({ error: 'SimBrief unreachable: ' + (err.message || 'fetch failed') });
  }
}
