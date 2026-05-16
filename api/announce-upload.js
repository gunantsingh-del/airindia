/* =====================================================================
   AIVA · /api/announce-upload — cross-device cabin-announcement sync
   ---------------------------------------------------------------------
   Receives a raw audio body, forwards it to Catbox.moe, returns the
   public URL. Designed to dodge Vercel's default JSON body-parser by
   triggering on a non-JSON Content-Type (audio/*) — Vercel only auto-
   parses application/json bodies, so audio/mpeg posts come through as
   a Buffer in req.body OR as an unread stream.

   Defensive: read req.body if it's already a Buffer/string, else
   stream the request. Log any error in the response body so the
   client can surface it instead of bare 502.

   Request:
     POST /api/announce-upload?stage=safety
     Headers:
       Content-Type:    audio/mpeg | audio/wav | audio/ogg | …
       X-AIVA-Filename: AI A350 safety demo v3.mp3
     Body: raw audio bytes (no base64)

   Response:
     200 { url, stageId, name, size, mime }
     4xx { error }
     500 { error, where } — function crash, surfaces stack location
   ===================================================================== */

const MAX_BYTES = 4 * 1024 * 1024;   // 4 MB — Vercel Hobby body limit

async function readRawBody(req) {
  /* Vercel sometimes pre-parses body into a Buffer for non-JSON
     content types. If req.body is already populated, use it. */
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'binary');
  /* Otherwise read the stream. */
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > MAX_BYTES + 1024) throw new Error('body over 4 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AIVA-Filename');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'POST only' });
    return;
  }

  try {
    const stageId = ((req.query?.stage) || '').toString().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!stageId) { res.status(400).json({ error: 'stage query param required' }); return; }

    const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('audio/')) {
      res.status(400).json({ error: 'Content-Type must be audio/*', got: mime || '<missing>' });
      return;
    }
    const name = (req.headers['x-aiva-filename'] || `clip.${mime.split('/')[1] || 'mp3'}`).toString().slice(0, 120);

    let bin;
    try {
      bin = await readRawBody(req);
    } catch (e) {
      res.status(e.message === 'body over 4 MB' ? 413 : 400)
         .json({ error: e.message || 'read failed', where: 'readRawBody' });
      return;
    }
    if (!bin?.length) {
      res.status(400).json({ error: 'empty body — make sure you POST raw audio bytes, not JSON' });
      return;
    }
    if (bin.length > MAX_BYTES) {
      res.status(413).json({ error: `audio over ${MAX_BYTES / 1024 / 1024} MB — re-encode at lower bitrate` });
      return;
    }

    const ext = (mime.split('/')[1] || 'mp3').replace(/mpeg/i, 'mp3').replace(/[^a-z0-9]/gi, '');
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('userhash', '');
    const blob = new Blob([bin], { type: mime });
    fd.append('fileToUpload', blob, `aiva-ann-${stageId}-${Date.now()}.${ext}`);

    let r;
    try {
      r = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      res.status(502).json({ error: 'catbox unreachable', where: 'fetch', detail: e?.message || String(e) });
      return;
    }
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      res.status(502).json({ error: `catbox returned ${r.status}`, where: 'response', body: errBody.slice(0, 200) });
      return;
    }
    const catUrl = (await r.text()).trim();
    if (!/^https?:\/\/.+/.test(catUrl)) {
      res.status(502).json({ error: 'catbox returned non-URL', where: 'parse', body: catUrl.slice(0, 200) });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ url: catUrl, stageId, name, size: bin.length, mime });
  } catch (e) {
    /* Anything else — surface stack to the client so 502 isn't silent. */
    res.status(500).json({ error: 'function crashed', where: 'handler', detail: e?.message || String(e), stack: (e?.stack || '').split('\n').slice(0, 3).join(' | ') });
  }
}
