/* =====================================================================
   AIVA · /api/announce-upload — cross-device cabin-announcement sync
   ---------------------------------------------------------------------
   Pilots upload safety-demo / pre-departure / pass-10k / etc. audio
   clips from one device (Gunant's MacBook), and the .exe on his
   gaming PC sees them too. Without server storage every device's
   localStorage / IndexedDB was isolated — change on one machine,
   invisible on another.

   Mirror the avatar pattern:
     1. Browser POSTs the audio data URL here.
     2. We upload to Catbox.moe (anonymous, 200 MB cap, no signup).
     3. Return the resulting catbox URL.
     4. The browser broadcasts an `ann_set` event over ntfy with
        { stageId, name, url, size } so other devices cache it.

   Catbox file naming: `aiva-ann-<stageId>-<ts>.<ext>` so the hosted
   files are grep-able if we ever need to clean up.

   Request:  POST /api/announce-upload
             body: {
               stageId: "safety",
               name:    "AI A350 safety demo v3.mp3",
               dataUrl: "data:audio/mpeg;base64,..."
             }
   Response: 200 OK { url, stageId, name, size, mime }
   Errors:   400 (bad input), 413 (too big), 502 (host)
   ===================================================================== */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const stageId = (body.stageId || '').toString().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const name    = (body.name    || 'clip.mp3').toString().slice(0, 80);
  const dataUrl = (body.dataUrl || '').toString();
  if (!stageId) { res.status(400).json({ error: 'stageId required' }); return; }

  const m = dataUrl.match(/^data:(audio\/[a-zA-Z0-9+.\-]+);base64,(.+)$/);
  if (!m) {
    res.status(400).json({ error: 'dataUrl must be a base64 audio/* URI' });
    return;
  }
  const mime = m[1];
  const ext  = (mime.split('/')[1] || 'mp3').replace(/mpeg/i, 'mp3').replace(/[^a-z0-9]/gi, '');
  const bin  = Buffer.from(m[2], 'base64');
  if (bin.length > 8 * 1024 * 1024) {
    res.status(413).json({ error: 'audio too large — 8 MB max' });
    return;
  }

  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('userhash', '');
  const blob = new Blob([bin], { type: mime });
  fd.append('fileToUpload', blob, `aiva-ann-${stageId}-${Date.now()}.${ext}`);

  try {
    const r = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: fd,
      /* Audio upload — give it 30s. Catbox is usually <5s even for 8 MB. */
      signal: AbortSignal.timeout(30_000),
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
    res.status(200).json({ url, stageId, name, size: bin.length, mime });
  } catch (e) {
    res.status(502).json({ error: 'upload failed', detail: e?.message || String(e) });
  }
}
