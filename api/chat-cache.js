/* =====================================================================
   AIVA · /api/chat-cache — crew chat relay on same origin
   ---------------------------------------------------------------------
   ntfy.sh is route-blocked on multiple pilots' networks (Indian ISPs,
   the FSLabs in-cockpit browser). Mirror rotation doesn't help when
   ALL hosts are blocked. Solution: route crew chat through our own
   Vercel function on airindiavirtual.online — same origin, no firewall
   bypass needed.

   POST /api/chat-cache?topic=<topic>   body=<envelope JSON>
       → pushes one message into the topic's ring buffer
   GET  /api/chat-cache?topic=<topic>&since=<ts>
       → returns { messages: [...] } for all envelopes with ts > since

   Storage: per-topic ring buffer in module memory (Map keyed by topic).
   Persists within a warm Vercel function (~5 min). Each topic capped at
   200 messages. Cold-start gap is fine — pilots actively chatting
   repopulate the buffer within seconds.

   Topic format: same as the ntfy chat topic
   ("aiva-crew-b8f3xK9p7Q2mR5tNwE1cD6vY") so existing wire format works.
   ===================================================================== */

const TOPICS = new Map();   // topic → array of { ts, body }
const MAX_PER_TOPIC = 200;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const topic = ((req.query?.topic) || '').toString();
  if (!/^[a-zA-Z0-9_\-]{3,80}$/.test(topic)) {
    res.status(400).json({ error: 'invalid topic' });
    return;
  }

  if (req.method === 'GET') {
    const since = Number(req.query?.since || 0);
    const list = TOPICS.get(topic) || [];
    const messages = list
      .filter(m => m.ts > since)
      .map(m => ({ ts: m.ts, message: m.body }));
    res.status(200).json({ topic, messages, now: Date.now() });
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (Buffer.isBuffer(body)) body = body.toString('utf-8');
    if (typeof body === 'object' && body !== null) body = JSON.stringify(body);
    body = (body || '').toString();
    if (!body || body.length > 12 * 1024) {
      res.status(400).json({ error: 'empty or >12KB body' });
      return;
    }
    const list = TOPICS.get(topic) || [];
    list.push({ ts: Date.now(), body });
    /* Trim to last MAX_PER_TOPIC. */
    if (list.length > MAX_PER_TOPIC) list.splice(0, list.length - MAX_PER_TOPIC);
    TOPICS.set(topic, list);
    res.status(200).json({ ok: true, ts: list[list.length - 1].ts });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'GET or POST only' });
}
