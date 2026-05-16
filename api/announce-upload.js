/* =====================================================================
   AIVA · /api/announce-upload — cross-device cabin-announcement sync
   ---------------------------------------------------------------------
   Pilots upload safety-demo / pre-departure / pass-10k / etc. audio
   clips from one device, and other devices see them too via this
   Vercel function → Catbox.moe pipeline.

   Vercel body-size limit on Hobby is ~4.5 MB. To get the most room
   we accept the file as RAW BINARY (no base64 wrapper — base64 adds
   33% overhead which would cap practical file size at ~3 MB). Stage
   metadata is sent as URL query string + X-* request headers.

   Request:
     POST /api/announce-upload?stage=safety
     Headers:
       Content-Type:    audio/mpeg | audio/wav | audio/ogg
       X-AIVA-Filename: AI A350 safety demo v3.mp3      (utf-8 safe)
     Body: raw audio bytes (no JSON, no base64)

   Response:
     200 OK { url, stageId, name, size, mime }
     400    { error } — bad input
     413    { error } — over 4 MB
     502    { error } — Catbox unreachable
   ===================================================================== */

export const config = {
  api: {
    /* Disable Vercel's auto JSON body-parser so we get the raw stream.
       Without this, Node tries to parse audio bytes as JSON and 400s. */
    bodyParser: false,
  },
};

const MAX_BYTES = 4 * 1024 * 1024;   // 4 MB

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

  const url = new URL(req.url, `https://${req.headers.host}`);
  const stageId = (url.searchParams.get('stage') || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!stageId) { res.status(400).json({ error: 'stage query param required' }); return; }

  const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!mime.startsWith('audio/')) {
    res.status(400).json({ error: 'Content-Type must be audio/*' });
    return;
  }
  const name = (req.headers['x-aiva-filename'] || `clip.${mime.split('/')[1] || 'mp3'}`).toString().slice(0, 120);

  /* Read the raw stream into a Buffer with a hard cap so a runaway
     client can't OOM the function. */
  const chunks = [];
  let received = 0;
  try {
    for await (const chunk of req) {
      received += chunk.length;
      if (received > MAX_BYTES) {
        res.status(413).json({ error: `audio over ${MAX_BYTES / 1024 / 1024} MB — re-encode at lower bitrate` });
        return;
      }
      chunks.push(chunk);
    }
  } catch (e) {
    res.status(400).json({ error: 'failed to read upload body', detail: e?.message });
    return;
  }
  const bin = Buffer.concat(chunks);
  if (!bin.length) { res.status(400).json({ error: 'empty body' }); return; }

  /* Forward to Catbox as multipart/form-data. */
  const ext = (mime.split('/')[1] || 'mp3').replace(/mpeg/i, 'mp3').replace(/[^a-z0-9]/gi, '');
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('userhash', '');
  const blob = new Blob([bin], { type: mime });
  fd.append('fileToUpload', blob, `aiva-ann-${stageId}-${Date.now()}.${ext}`);

  try {
    const r = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: fd,
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) {
      res.status(502).json({ error: `catbox returned ${r.status}` });
      return;
    }
    const catUrl = (await r.text()).trim();
    if (!/^https?:\/\/.+/.test(catUrl)) {
      res.status(502).json({ error: 'catbox returned non-URL response', body: catUrl.slice(0, 200) });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ url: catUrl, stageId, name, size: bin.length, mime });
  } catch (e) {
    res.status(502).json({ error: 'upload failed', detail: e?.message || String(e) });
  }
}
