/* =====================================================================
   AIVA · server-side pilot roster
   ---------------------------------------------------------------------
   Source of truth for credentials. Kept OUT of the public JS bundle so
   passwords aren't visible in browser DevTools. The client never sees
   the passwords table — only the result of a server-side compare.

   This file is imported by /api/auth/* handlers only. Vercel functions
   live under /api and aren't served as static assets, so this file is
   private by construction.

   Schema mirrors assets/js/store.js PILOTS_SEED minus password rotation
   metadata. Keep in sync when adding pilots.
   ===================================================================== */

export const PILOTS = [
  { id:'AIV001', name:'Gunant Singh Pahwa',  email:'gunant.pahwa@aiv.in',     password:'Falcon-77W#42',  rank:'Cadet',        base:'DEL', aircraft:['A20N'], hireDate:'2026-01-01', medClass:'Class 1', medExpiry:'2027-05-12', avatar:'GP', role:'admin' },
  { id:'AIV002', name:'Anvit Deshpande',     email:'anvit.deshpande@aiv.in',  password:'Spitfire-94$kn', rank:'Cadet',        base:'BOM', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'AD', role:'pilot' },
  { id:'AIV003', name:'Eshan Parmar',        email:'eshan.parmar@aiv.in',     password:'Lightning-23@uq',rank:'Cadet',        base:'BOM', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'EP', role:'pilot' },
  { id:'AIV004', name:'Aarush Pal',          email:'aarush.pal@aiv.in',       password:'Cirrus-58!rg',   rank:'Cadet',        base:'DEL', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'AP', role:'pilot' },
  { id:'AIV005', name:'Anshul Dutta',        email:'anshul.dutta@aiv.in',     password:'Mistral-31&mo',  rank:'Cadet',        base:'DEL', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'AD', role:'pilot' },
  { id:'AIV006', name:'Rajvardhan Pandey',   email:'rajvardhan.pandey@aiv.in',password:'Concord-77#jp',  rank:'Cadet',        base:'BLR', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'RP', role:'pilot' },
  { id:'AIV007', name:'Siddharth Lambore',   email:'siddharth.lambore@aiv.in',password:'Tempest-12$rk',  rank:'Cadet',        base:'BOM', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'SL', role:'pilot' },
  { id:'AIV008', name:'Naadir Shaikh',       email:'naadir.shaikh@aiv.in',    password:'Monsoon-58@kd',  rank:'Cadet',        base:'HYD', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'NS', role:'pilot' },
  { id:'AIV009', name:'Neer Sarwal',         email:'neer.sarwal@aiv.in',      password:'Cumulus-83!wt',  rank:'Cadet',        base:'DEL', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'NS', role:'pilot' },
  { id:'AIV010', name:'Kuldeep Singh Saini', email:'kuldeep.saini@aiv.in',    password:'Pegasus-59#xm',  rank:'Cadet',        base:'DEL', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'KS', role:'pilot' },
  { id:'AIV011', name:'Udaiveer Singh Sandhu',email:'udaiveer.sandhu@aiv.in', password:'Vulcan-37&qz',   rank:'Cadet',        base:'DEL', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'US', role:'pilot' },
  { id:'AIV012', name:'Brick',               email:'brick@aiv.in',            password:'Hurricane-71$la',rank:'Cadet',        base:'BOM', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'B',  role:'pilot' },
  { id:'AIV013', name:'Siddhant',            email:'siddhant@aiv.in',         password:'Comet-44!nf',    rank:'Cadet',        base:'CCU', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'S',  role:'pilot' },
  { id:'AIV014', name:'Akshat Tiwari',       email:'akshat.tiwari@aiv.in',    password:'Skyhawk-29@ye',  rank:'Cadet',        base:'BLR', aircraft:['A20N'], hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'AT', role:'pilot' },
  { id:'AIV015', name:'Samyo Ghosh',         email:'samyo.ghosh@aiv.in',      password:'Zephyr-45#bg',   rank:'Cadet',        base:'CCU', aircraft:['A20N'], hireDate:'2026-05-15', medClass:'Class 1', medExpiry:'2028-05-15', avatar:'SG', role:'pilot' },
];

/* Strip the password before returning to client. */
export function publicPilot(p) {
  if (!p) return null;
  const { password, ...safe } = p;
  return safe;
}

/* Lightweight HMAC-SHA256 token (compact JWT-ish) so we don't depend on
   a jsonwebtoken package. Format: base64url(payload) + '.' + base64url(hmac).
   Secret pulled from AIVA_AUTH_SECRET env var; falls back to a build-time
   constant so dev still works without Vercel env config. */
import crypto from 'node:crypto';
const SECRET = process.env.AIVA_AUTH_SECRET || 'aiva-dev-secret-9e3f8a-replace-in-vercel-env';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
export function signToken(pilotId) {
  const payload = { id: pilotId, ts: Date.now() };
  const body = b64url(JSON.stringify(payload));
  const sig  = b64url(crypto.createHmac('sha256', SECRET).update(body).digest());
  return `${body}.${sig}`;
}
export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(body).digest());
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf-8'));
    if (!payload?.id) return null;
    if (Date.now() - payload.ts > TOKEN_TTL_MS) return null;
    return payload;
  } catch { return null; }
}

/* Helper: read aiva_session cookie from a Vercel request. */
export function readCookie(req, name) {
  const raw = req.headers?.cookie || '';
  const match = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
