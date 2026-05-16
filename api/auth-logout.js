/* =====================================================================
   AIVA · /api/auth-logout — clear the session cookie
   POST → expires aiva_session, returns { ok: true }
   ===================================================================== */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'POST only' });
    return;
  }
  res.setHeader('Set-Cookie',
    'aiva_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  res.status(200).json({ ok: true });
}
