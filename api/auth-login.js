/* =====================================================================
   AIVA · /api/auth-login — server-side credential check + cookie issue
   ---------------------------------------------------------------------
   POST  { email, password }
   On match: sets aiva_session HTTP-only cookie + returns the pilot
   record minus password. On miss: 401.

   30-day TTL on the cookie. SameSite=Lax so cross-origin iframes (EFB
   embedded in FSLabs cockpit browser) still send the cookie.
   ===================================================================== */

import { PILOTS, publicPilot, signToken } from './_pilots.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'POST only' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const email = (body.email || '').toString().toLowerCase().trim();
  const password = (body.password || '').toString();
  if (!email || !password) {
    res.status(400).json({ error: 'email and password required' });
    return;
  }
  const p = PILOTS.find(x => x.email.toLowerCase() === email && x.password === password);
  if (!p) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  const token = signToken(p.id);
  /* HttpOnly so JS can't read the cookie (XSS-resistant). SameSite=Lax
     covers same-origin iframe + normal navigation. Secure since we're
     served over HTTPS (Vercel forces this in production). */
  res.setHeader('Set-Cookie',
    `aiva_session=${token}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`);
  res.status(200).json({ ok: true, pilot: publicPilot(p) });
}
