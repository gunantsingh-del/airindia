/* =====================================================================
   AIR INDIA VIRTUAL — Utilities
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.U = (() => {

  /* DOM helpers */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k === 'dataset' && typeof v === 'object') Object.entries(v).forEach(([dk, dv]) => n.dataset[dk] = dv);
      else n.setAttribute(k, v);
    });
    children.flat().filter(Boolean).forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };

  /* Math / geo */
  const R = 3440.065; // nm
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const distance = (lat1, lon1, lat2, lon2) => {
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };
  const bearing = (lat1, lon1, lat2, lon2) => {
    const y = Math.sin(toRad(lon2-lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1))*Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(lon2-lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  };
  /* Great-circle interpolated points for arc drawing */
  const greatCircle = (lat1, lon1, lat2, lon2, n = 80) => {
    const d = distance(lat1, lon1, lat2, lon2);
    if (d === 0) return [[lat1, lon1]];
    const points = [];
    const phi1 = toRad(lat1), phi2 = toRad(lat2);
    const lam1 = toRad(lon1), lam2 = toRad(lon2);
    const dRad = d / R;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const A = Math.sin((1 - f) * dRad) / Math.sin(dRad);
      const B = Math.sin(f * dRad) / Math.sin(dRad);
      const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
      const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
      const z = A * Math.sin(phi1) + B * Math.sin(phi2);
      const lat = toDeg(Math.atan2(z, Math.sqrt(x*x + y*y)));
      const lon = toDeg(Math.atan2(y, x));
      points.push([lat, lon]);
    }
    return points;
  };

  /* Format helpers */
  const fmtNum = (n, dp = 0) => n == null ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtMins = (m) => {
    if (m == null) return '—';
    const h = Math.floor(m / 60);
    const min = Math.round(m % 60);
    return `${h}:${String(min).padStart(2, '0')}`;
  };
  const fmtDur = (dur) => dur; // pass-through
  const fmtDate = (d, opts = { weekday: 'short', day: '2-digit', month: 'short' }) => new Date(d).toLocaleDateString('en-GB', opts);
  const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const fmtZulu = (d = new Date()) => {
    const u = new Date(d);
    return String(u.getUTCHours()).padStart(2,'0') + String(u.getUTCMinutes()).padStart(2,'0') + 'Z';
  };

  /* Greeting */
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 5)  return 'Good evening';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  /* Toast */
  const toast = (msg, type = 'info', ms = 3200) => {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = el('div', { id: 'toast-host', style: { position:'fixed', bottom:'24px', right:'24px', zIndex:9999, display:'flex', flexDirection:'column', gap:'8px' } });
      document.body.appendChild(host);
    }
    const t = el('div', { class: `toast toast-${type}`, style: {
      background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text)',
      padding:'12px 18px', borderRadius:'10px', boxShadow:'var(--shadow-lg)',
      animation:'fadeUp .3s var(--ease-emph) both', maxWidth:'360px', fontSize:'13px'
    } });
    if (type === 'ok')   t.style.borderColor = 'rgba(74,222,128,.4)';
    if (type === 'bad')  t.style.borderColor = 'rgba(248,113,113,.4)';
    if (type === 'warn') t.style.borderColor = 'rgba(251,191,36,.4)';
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; }, ms - 320);
    setTimeout(() => t.remove(), ms);
  };

  /* Modal */
  const modal = ({ title = '', body, actions = [], width = '520px' }) => {
    const overlay = el('div', { class: 'aiva-modal-overlay', style: {
      position:'fixed', inset:0, background:'rgba(10,7,8,.78)', backdropFilter:'blur(8px)',
      zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center',
      animation:'fadeIn .25s var(--ease) both'
    }});
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const card = el('div', { class:'card-glass', style:{
      width, maxWidth:'94vw', maxHeight:'88vh', overflow:'auto',
      padding:'24px', animation:'fadeUp .35s var(--ease-emph) both'
    }});
    if (title) {
      const head = el('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' } });
      head.appendChild(el('h3', { class:'h3', text: title }));
      head.appendChild(el('button', { class:'btn btn-ghost btn-sm', onclick: close, text: '✕' }));
      card.appendChild(head);
    }
    if (typeof body === 'string') card.appendChild(el('div', { html: body }));
    else if (body) card.appendChild(body);
    if (actions.length) {
      const bar = el('div', { style:{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'20px' } });
      actions.forEach(a => bar.appendChild(el('button', { class:`btn ${a.cls || 'btn-ghost'}`, onclick: () => a.onClick ? a.onClick(close) : close(), text: a.label })));
      card.appendChild(bar);
    }
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    return { close, overlay };
  };

  /* CSV parsing */
  const parseCSV = (text) => {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (!lines.length) return { header: [], rows: [] };
    const splitLine = (l) => {
      const out = []; let cur = ''; let inQ = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"' && l[i+1] === '"' && inQ) { cur += '"'; i++; continue; }
        if (c === '"') { inQ = !inQ; continue; }
        if ((c === ',' || c === ';' || c === '\t') && !inQ) { out.push(cur); cur=''; continue; }
        cur += c;
      }
      out.push(cur);
      return out.map(s => s.trim());
    };
    const header = splitLine(lines[0]);
    const rows = lines.slice(1).map(splitLine);
    return { header, rows };
  };

  /* Format detection for imported flight CSVs */
  const detectFormat = (header) => {
    const h = header.map(x => x.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const joined = h.join('|');
    if (joined.includes('elevatex') || (joined.includes('callsign') && joined.includes('landingrate'))) return 'elevatex';
    if (joined.includes('volanta') || (joined.includes('flightnumber') && joined.includes('vsfpm'))) return 'volanta';
    if (joined.includes('simbrief')) return 'simbrief';
    if (joined.includes('vatsim'))   return 'vatsim';
    return 'generic';
  };

  /* Map an arbitrary header row to a canonical key */
  const mapColumn = (name) => {
    const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/^(flight|fno|flightnumber|callsign|cs)$/.test(n)) return 'fno';
    if (/^(date|flightdate|departuredate|dep)$/.test(n))   return 'date';
    if (/^(from|origin|dep|depicao|departure)$/.test(n))   return 'from';
    if (/^(to|destination|arr|arricao|arrival)$/.test(n))  return 'to';
    if (/^(aircraft|actype|equipment|type|aircrafttype)$/.test(n)) return 'ac';
    if (/^(reg|registration|tail|aircraftreg)$/.test(n))   return 'reg';
    if (/^(duration|blocktime|flighttime|time|durmins|block|dur)$/.test(n)) return 'dur';
    if (/^(landingrate|lndrate|vsfpm|vs|touchdown)$/.test(n)) return 'lndRate';
    if (/^(grate|gforce|gload|maxg)$/.test(n)) return 'gRate';
    if (/^(route|flightplan|routestr)$/.test(n)) return 'route';
    if (/^(notes|remarks|comments)$/.test(n)) return 'notes';
    if (/^(network|simulator|sim|platform)$/.test(n)) return 'network';
    return name; // keep original if unknown
  };

  /* Helper: parse "1:25" / "85" / "85m" duration to minutes */
  const parseDuration = (s) => {
    if (s == null || s === '') return null;
    s = String(s).trim();
    if (/^\d+:\d+$/.test(s)) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
    if (/^\d+(\.\d+)?h$/i.test(s)) return Math.round(parseFloat(s) * 60);
    if (/^\d+m$/i.test(s)) return parseInt(s);
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      return n < 24 ? Math.round(n * 60) : Math.round(n);
    }
    return null;
  };

  /* Average */
  const avg = (arr, key) => {
    const vals = arr.map(o => Number(key ? o[key] : o)).filter(n => Number.isFinite(n));
    if (!vals.length) return null;
    return vals.reduce((s, n) => s + n, 0) / vals.length;
  };

  /* Debounce */
  const debounce = (fn, ms = 200) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  /* Random ID */
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* Year/month/day helpers */
  const todayISO = () => new Date().toISOString().slice(0,10);
  const isoToDate = (s) => new Date(s + 'T00:00:00');

  return {
    $, $$, el,
    distance, bearing, greatCircle, toRad, toDeg,
    fmtNum, fmtMins, fmtDur, fmtDate, fmtTime, fmtZulu,
    greeting, toast, modal,
    parseCSV, detectFormat, mapColumn, parseDuration,
    avg, debounce, uid, todayISO, isoToDate,
  };
})();
