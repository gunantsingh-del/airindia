/* =====================================================================
   AIVA · /api/auth-me — return current pilot from session cookie
   GET → { pilot } or 401 if no valid cookie
   ===================================================================== */

import { PILOTS, publicPilot, verifyToken, readCookie } from './_pilots.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'GET only' });
    return;
  }
  const token = readCookie(req, 'aiva_session');
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'not authenticated' });
    return;
  }
  const p = PILOTS.find(x => x.id === payload.id);
  if (!p) {
    res.status(401).json({ error: 'pilot not found' });
    return;
  }
  res.status(200).json({ pilot: publicPilot(p), issued: payload.ts });
}
