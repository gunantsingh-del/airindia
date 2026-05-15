/* =====================================================================
   AIVA · /api/avatar — cross-device profile picture sync
   ---------------------------------------------------------------------
   Receives a base64 dataURL from a pilot's browser, uploads it to a
   public anonymous image host (Catbox.moe — no API key, no signup),
   and returns the resulting permanent URL. The pilot's browser then
   broadcasts that URL over the encrypted ntfy chat channel as an
   `avatar_set` event so other crews' browsers cache it.

   Why Catbox: free, anonymous, simple multipart POST, returns a
   direct image URL that any device can fetch without auth. Stores
   files indefinitely. We resize client-side to ~30 KB, so it's a
   minimal load.

   Request:  POST /api/avatar
             body: { pilotId: "AIV008", dataUrl: "data:image/jpeg;base64,..." }
   Response: 200 OK { url: "https://files.catbox.moe/xxxxx.jpg" }
   Errors:   400 (bad input), 502 (host unreachable), 500 (other)
   ===================================================================== */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'POST only' });
    return;
  }
  let body = req.body;
  /* Vercel auto-parses application/json; defensive for raw text. */
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const pilotId = (body.pilotId || '').toString().toUpperCase();
  const dataUrl = (body.dataUrl || '').toString();
  if (!/^AIV\d{3}$/.test(pilotId)) {
    res.status(400).json({ error: 'invalid pilotId' });
    return;
  }
  /* Expect a base64 data URL — extract MIME + payload. */
  const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) {
    res.status(400).json({ error: 'dataUrl must be a base64 image/* URI' });
    return;
  }
  const mime = m[1];
  const ext  = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const bin  = Buffer.from(m[2], 'base64');
  if (bin.length > 250_000) {
    res.status(413).json({ error: 'image too large — keep under 250 KB after client-side resize' });
    return;
  }

  /* Build a multipart form for Catbox. Node 18+ has FormData + Blob
     natively. We name the file `<pilotId>-<ts>.<ext>` for grep-ability
     in Catbox if we ever need to clean up. */
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  /* userhash empty = anonymous upload */
  fd.append('userhash', '');
  const blob = new Blob([bin], { type: mime });
  fd.append('fileToUpload', blob, `${pilotId}-${Date.now()}.${ext}`);

  try {
    const r = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: fd,
      /* 8s — Catbox is usually under 1s but we don't want to hang on a
         bad day. */
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      res.status(502).json({ error: `catbox returned ${r.status}` });
      return;
    }
    const url = (await r.text()).trim();
    if (!/^https?:\/\/.+/.test(url)) {
      res.status(502).json({ error: 'catbox returned non-URL response', body: url.slice(0, 200) });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ url, pilotId });
  } catch (e) {
    res.status(502).json({ error: 'upload failed', detail: e?.message || String(e) });
  }
}
