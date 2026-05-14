/* =====================================================================
   AIR INDIA VIRTUAL — Persistence
   • Global keys:  aiva.<key>
   • Per-pilot:    aiva.<pilotId>.<key>   (used after login for any pilot data)
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.Store = (() => {
  const NS = 'aiva.';

  const get = (key, fallback = null) => {
    try { const raw = localStorage.getItem(NS + key); return raw == null ? fallback : JSON.parse(raw); }
    catch { return fallback; }
  };
  const set = (key, value) => {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
    catch { return false; }
  };
  const remove = (key) => localStorage.removeItem(NS + key);

  /* Per-pilot scope. Use this for any data that belongs to a specific pilot
     (logged flights, bookings, preferences, etc.) so multiple accounts on the
     same browser keep their data separate. */
  const pilot = (pilotId) => ({
    get: (k, fb = null) => get(`${pilotId}.${k}`, fb),
    set: (k, v) => set(`${pilotId}.${k}`, v),
    remove: (k) => remove(`${pilotId}.${k}`),
  });

  const wipeAll = () => Object.keys(localStorage).filter(k => k.startsWith(NS)).forEach(k => localStorage.removeItem(k));
  const wipePilot = (pilotId) => Object.keys(localStorage).filter(k => k.startsWith(NS + pilotId + '.')).forEach(k => localStorage.removeItem(k));

  return { get, set, remove, pilot, wipeAll, wipePilot };
})();

/* ---------- Pilot roster (closed) ----------
   Only these 14 named pilots can log in. Auth is hardcoded — no signup,
   no password reset, no enumeration. Cadet rank by default; admins
   can promote via the Ranks page in-app.                                */
AIVA.PILOTS_SEED = [
  /* Founder / admin */
  { id:'AIV001', name:'Gunant Singh Pahwa',  email:'gunant.pahwa@aiv.in',     password:'Falcon-77W#42',  rank:'Captain',      base:'DEL', aircraft:['B77W','B788','B789','A359','A20N','A21N'], hireDate:'2026-01-01', medClass:'Class 1', medExpiry:'2027-05-12', avatar:'GP', role:'admin' },
  /* Cadets */
  { id:'AIV002', name:'Anvit Deshpande',     email:'anvit.deshpande@aiv.in',  password:'Spitfire-94$kn', rank:'Cadet',        base:'BOM', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'AD', role:'pilot' },
  { id:'AIV003', name:'Eshan Parmar',        email:'eshan.parmar@aiv.in',     password:'Lightning-23@uq',rank:'Cadet',        base:'BOM', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'EP', role:'pilot' },
  { id:'AIV004', name:'Aarush Pal',          email:'aarush.pal@aiv.in',       password:'Cirrus-58!rg',   rank:'Cadet',        base:'DEL', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'AP', role:'pilot' },
  { id:'AIV005', name:'Anshul Dutta',        email:'anshul.dutta@aiv.in',     password:'Mistral-31&mo',  rank:'Cadet',        base:'DEL', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'AD', role:'pilot' },
  { id:'AIV006', name:'Rajvardhan Pandey',   email:'rajvardhan.pandey@aiv.in',password:'Concord-77#jp',  rank:'Cadet',        base:'BLR', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'RP', role:'pilot' },
  { id:'AIV007', name:'Siddharth Lambore',   email:'siddharth.lambore@aiv.in',password:'Tempest-12$rk',  rank:'Cadet',        base:'BOM', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'SL', role:'pilot' },
  { id:'AIV008', name:'Naadir Sheikh',       email:'naadir.sheikh@aiv.in',    password:'Stratos-46@bv',  rank:'Cadet',        base:'HYD', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'NS', role:'pilot' },
  { id:'AIV009', name:'Neer Sarwal',         email:'neer.sarwal@aiv.in',      password:'Cumulus-83!wt',  rank:'Cadet',        base:'DEL', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'NS', role:'pilot' },
  { id:'AIV010', name:'Kuldeep Singh Saini', email:'kuldeep.saini@aiv.in',    password:'Pegasus-59#xm',  rank:'Cadet',        base:'DEL', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'KS', role:'pilot' },
  { id:'AIV011', name:'Udaiveer Singh Sandhu',email:'udaiveer.sandhu@aiv.in', password:'Vulcan-37&qz',   rank:'Cadet',        base:'DEL', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'US', role:'pilot' },
  { id:'AIV012', name:'Brick',               email:'brick@aiv.in',            password:'Hurricane-71$la',rank:'Cadet',        base:'BOM', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'B',  role:'pilot' },
  { id:'AIV013', name:'Siddhant',            email:'siddhant@aiv.in',         password:'Comet-44!nf',    rank:'Cadet',        base:'CCU', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'S',  role:'pilot' },
  { id:'AIV014', name:'Akshat Tiwari',       email:'akshat.tiwari@aiv.in',    password:'Skyhawk-29@ye',  rank:'Cadet',        base:'BLR', aircraft:['A20N'],          hireDate:'2026-05-01', medClass:'Class 1', medExpiry:'2028-05-01', avatar:'AT', role:'pilot' },
];

/* ---------- Rank ladder ----------
   Source: Air India / Indian commercial carrier hour-criteria mapped to
   ICAO/DGCA progression. Hours = total airline hours logged in AIVA.    */
AIVA.RANKS = [
  { code:'CADET',   label:'Cadet',          minHours:0,    desc:'Newly recruited pilot under training. Must complete Type Rating + 200 sim hours before line release.' },
  { code:'FO',      label:'First Officer',  minHours:200,  desc:'Type-rated and line-released. Operates right-hand seat under captain supervision.' },
  { code:'SFO',     label:'Senior First Officer', minHours:1500, desc:'Eligible for left-seat (PIC) sim sessions. Often command-upgrade candidates.' },
  { code:'CAPT',    label:'Captain',        minHours:3500, desc:'PIC qualified. Released as line captain after command upgrade course + supervised line training.' },
  { code:'SRCAPT',  label:'Senior Captain', minHours:7500, desc:'Designated check-airman or training captain. May conduct line-checks and instruct in the sim.' },
];
AIVA.rankFor = (hours) => {
  hours = +hours || 0;
  let r = AIVA.RANKS[0];
  for (const x of AIVA.RANKS) if (hours >= x.minHours) r = x;
  return r;
};
