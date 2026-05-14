/* =====================================================================
   AIVA · Crew Chat
   ---------------------------------------------------------------------
   Group chat shared by all 14 pilots. Cross-tab realtime via the
   BroadcastChannel API. Persists to localStorage so messages survive
   reload. Also surfaces auto-generated CREW UPDATES (took off / passing
   10k / landed / diverted / PSR filed) so the chat doubles as an ops feed.

   Storage shape:
     localStorage['aiva.crew_chat']           → [Message, …]
     localStorage['aiva.crew_chat_presence']  → { pilotId: lastSeen, … }

   Message:
     { id, ts, type: 'msg'|'event', pilotId, pilotName, rank, text, meta? }

   Public surface:
     AIVA.CrewChat.mount(host?, opts?)  → mount the floating widget
     AIVA.CrewChat.send(text)           → send a plain message as the current pilot
     AIVA.CrewChat.event(text, meta)    → push a system event (e.g. "took off")
     AIVA.CrewChat.online()             → array of pilotIds active in last 5 min
     AIVA.CrewChat.clear()              → wipe (admin only)
     AIVA.CrewChat.onMessage(cb)        → subscribe to new messages
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.CrewChat = (() => {
  const KEY        = 'aiva.crew_chat';
  const PRESENCE   = 'aiva.crew_chat_presence';
  const MAX_KEEP   = 500;                  // hard cap so storage stays bounded
  const ONLINE_MS  = 5 * 60 * 1000;        // 5 minutes counts as "online"
  const CH_NAME    = 'aiva-crew-chat';

  const channel = (() => {
    try { return new BroadcastChannel(CH_NAME); } catch { return null; }
  })();
  const listeners = [];

  /* ============ storage helpers ============ */
  function readLog() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }
  function writeLog(arr) {
    /* Cap the log to MAX_KEEP entries — drop oldest */
    const capped = arr.length > MAX_KEEP ? arr.slice(arr.length - MAX_KEEP) : arr;
    try { localStorage.setItem(KEY, JSON.stringify(capped)); } catch {}
  }
  function readPresence() {
    try { return JSON.parse(localStorage.getItem(PRESENCE) || '{}'); }
    catch { return {}; }
  }
  function writePresence(p) {
    try { localStorage.setItem(PRESENCE, JSON.stringify(p)); } catch {}
  }
  function pilot() { return (AIVA.Auth?.currentPilot && AIVA.Auth.currentPilot()) || null; }

  /* ============ presence heartbeat ============ */
  function beat() {
    const p = pilot(); if (!p) return;
    const map = readPresence();
    map[p.id] = Date.now();
    writePresence(map);
  }
  beat();
  setInterval(beat, 60_000);

  /* ============ message push ============ */
  function push(msg) {
    msg.id = msg.id || (Date.now().toString(36) + Math.random().toString(36).slice(2,6));
    msg.ts = msg.ts || Date.now();
    const log = readLog();
    log.push(msg);
    writeLog(log);
    /* Notify same-tab listeners + cross-tab via BroadcastChannel */
    listeners.forEach(cb => { try { cb(msg, log); } catch(_){} });
    if (channel) { try { channel.postMessage({ kind: 'msg', msg }); } catch {} }
    return msg;
  }
  function send(text) {
    const p = pilot();
    if (!p) return null;
    const txt = (text || '').trim();
    if (!txt) return null;
    return push({
      type: 'msg', pilotId: p.id, pilotName: p.name, rank: p.rank, text: txt,
    });
  }
  function event(text, meta = {}) {
    const p = pilot();
    if (!p) return null;
    return push({
      type: 'event', pilotId: p.id, pilotName: p.name, rank: p.rank, text, meta,
    });
  }
  function clear() {
    const p = pilot();
    if (!p || p.role !== 'admin') return false;
    writeLog([]);
    if (channel) { try { channel.postMessage({ kind: 'wiped' }); } catch {} }
    listeners.forEach(cb => { try { cb(null, []); } catch(_){} });
    return true;
  }
  function online() {
    const p = readPresence();
    const cutoff = Date.now() - ONLINE_MS;
    return Object.entries(p).filter(([_, t]) => t > cutoff).map(([id]) => id);
  }
  function onMessage(cb) { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i,1); }; }

  /* React to messages from OTHER tabs */
  if (channel) channel.onmessage = (e) => {
    if (e.data?.kind === 'msg') {
      listeners.forEach(cb => { try { cb(e.data.msg, readLog()); } catch(_){} });
    } else if (e.data?.kind === 'wiped') {
      listeners.forEach(cb => { try { cb(null, []); } catch(_){} });
    }
  };
  /* Also pick up storage events from foreign tabs */
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      const log = readLog();
      const last = log[log.length - 1];
      listeners.forEach(cb => { try { cb(last, log); } catch(_){} });
    }
  });

  /* ============ UI WIDGET ============ */
  let host = null, root = null, drawer = null, mounted = false, lastUnread = 0;
  function mount(parent, opts = {}) {
    if (mounted) return root;
    parent = parent || document.body;
    const compact = !!opts.compact;
    /* Bottom-RIGHT, stacked above the Maharaja launcher.
       The portal's left edge is taken by the sidebar's pilot panel; placing
       the chat launcher there caused it to sit ON the pilot's avatar. */
    root = document.createElement('div');
    root.className = 'cc-root' + (compact ? ' cc-compact' : '');
    root.innerHTML = `
      <button class="cc-launch" id="ccLaunch" aria-label="Open crew chat" title="Crew Chat">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        <span class="cc-badge" id="ccBadge" hidden>0</span>
      </button>
      <aside class="cc-drawer" id="ccDrawer" hidden>
        <header class="cc-head">
          <div>
            <div class="cc-title">Crew Chat</div>
            <div class="cc-sub" id="ccPresence">— online</div>
          </div>
          <div class="cc-actions">
            <button class="cc-icon" id="ccRoster" title="Crew roster">⌘</button>
            <button class="cc-icon" id="ccClose" aria-label="Close">✕</button>
          </div>
        </header>
        <section class="cc-roster" id="ccRosterPanel" hidden></section>
        <section class="cc-body" id="ccBody"></section>
        <form class="cc-form" id="ccForm">
          <input id="ccInput" class="cc-input" placeholder="Message the crew…" autocomplete="off" maxlength="500">
          <button class="cc-send" type="submit" aria-label="Send">→</button>
        </form>
      </aside>
    `;
    parent.appendChild(root);
    drawer = root.querySelector('#ccDrawer');
    host = root;

    const toggle = (forceOpen) => {
      const willOpen = forceOpen != null ? forceOpen : drawer.hidden;
      drawer.hidden = !willOpen;
      root.classList.toggle('cc-open', willOpen);
      if (willOpen) { lastUnread = 0; updateBadge(); renderAll(); scrollBottom(); }
    };
    /* Tapping the launcher toggles. So does the close (✕) button. */
    root.querySelector('#ccLaunch').addEventListener('click', () => toggle());
    root.querySelector('#ccClose').addEventListener('click', () => toggle(false));
    /* Escape key closes the drawer when it's open */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawer.hidden) toggle(false);
    });
    root.querySelector('#ccRoster').addEventListener('click', () => {
      const r = root.querySelector('#ccRosterPanel');
      r.hidden = !r.hidden;
      if (!r.hidden) renderRoster();
    });
    root.querySelector('#ccForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = root.querySelector('#ccInput');
      if (inp.value.trim()) { send(inp.value); inp.value = ''; }
    });

    /* Initial render + live updates */
    renderAll();
    updatePresence();
    onMessage((msg) => {
      renderAll();
      if (drawer.hidden && msg && msg.pilotId !== pilot()?.id) {
        lastUnread++;
        updateBadge();
      }
    });
    setInterval(updatePresence, 30_000);
    mounted = true;
    return root;
  }
  function updateBadge() {
    const b = root?.querySelector('#ccBadge'); if (!b) return;
    if (lastUnread > 0) { b.textContent = lastUnread > 99 ? '99+' : String(lastUnread); b.hidden = false; }
    else b.hidden = true;
  }
  function updatePresence() {
    const ids = online();
    const all = AIVA.Auth?.allPilots?.() || [];
    const names = ids.map(id => (all.find(p => p.id === id)?.name?.split(' ')[0]) || id).slice(0, 4);
    const p = root?.querySelector('#ccPresence');
    if (!p) return;
    p.textContent = ids.length
      ? `${ids.length} online · ${names.join(', ')}${ids.length > 4 ? ` +${ids.length - 4}` : ''}`
      : '— quiet right now';
  }
  function renderRoster() {
    const r = root?.querySelector('#ccRosterPanel');
    if (!r) return;
    const all = AIVA.Auth?.allPilots?.() || [];
    const ids = new Set(online());
    r.innerHTML = `
      <div class="cc-roster-list">
        ${all.map(p => `
          <div class="cc-roster-row ${ids.has(p.id) ? 'on' : ''}">
            <span class="cc-dot ${ids.has(p.id) ? 'on' : ''}"></span>
            <span class="cc-roster-id">${p.avatar || p.id.slice(-3)}</span>
            <span class="cc-roster-name">${p.name}</span>
            <span class="cc-roster-rank">${p.rank}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  function renderAll() {
    const body = root?.querySelector('#ccBody'); if (!body) return;
    const log = readLog().slice(-200);
    const me  = pilot()?.id;
    body.innerHTML = log.length ? log.map(m => msgHTML(m, me)).join('') : `
      <div class="cc-empty">
        <div class="cc-empty-icon">⊝</div>
        <div class="cc-empty-text">No chatter yet. Be the first to greet the crew.</div>
      </div>
    `;
    scrollBottom();
  }
  function msgHTML(m, me) {
    const time = new Date(m.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    if (m.type === 'event') {
      return `
        <div class="cc-event">
          <span class="cc-event-dot"></span>
          <span class="cc-event-text"><b>${escapeHTML(m.pilotName?.split(' ')[0] || 'CREW')}</b> ${escapeHTML(m.text)}</span>
          <span class="cc-event-time">${time}</span>
        </div>
      `;
    }
    const own = m.pilotId === me;
    return `
      <div class="cc-msg ${own ? 'own' : ''}">
        ${!own ? `<div class="cc-msg-head"><b>${escapeHTML(m.pilotName)}</b> <span class="cc-msg-rank">${escapeHTML(m.rank || '')}</span> <span class="cc-msg-time">${time}</span></div>` : ''}
        <div class="cc-msg-bubble">${escapeHTML(m.text)}</div>
        ${own ? `<div class="cc-msg-time own">${time}</div>` : ''}
      </div>
    `;
  }
  function scrollBottom() {
    const body = root?.querySelector('#ccBody');
    if (body) body.scrollTop = body.scrollHeight;
  }
  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  /* ============ inline CSS (injected once) ============ */
  (function injectCSS() {
    if (document.getElementById('cc-styles')) return;
    const css = `
      /* Bottom-RIGHT, sitting to the LEFT of the Maharaja launcher.
         Maharaja lives at right: 22px with a ~64px button → place us at
         right: 96px so we're horizontally adjacent (not stacked above). */
      .cc-root { position: fixed; bottom: 22px; right: 96px; z-index: 92; font-family: var(--font-sans, Inter, system-ui, sans-serif); }
      .cc-root.cc-compact { bottom: 14px; right: 14px; }   /* EFB has no Maharaja so we sit at the corner */
      .cc-launch {
        width: 48px; height: 48px; border-radius: 50%;
        background: linear-gradient(180deg, #C8102E, #8B1A2B);
        color: #FFFFFF; border: 1px solid rgba(255,225,89,.4);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        box-shadow: 0 14px 36px rgba(168,16,31,.42);
        position: relative;
        transition: transform .2s, box-shadow .2s, background .2s;
      }
      .cc-launch:hover { transform: translateY(-2px); box-shadow: 0 20px 48px rgba(168,16,31,.55); }
      /* When the drawer is open, the launcher shows an X so the user knows
         a click will close it (not re-open). */
      .cc-root.cc-open .cc-launch { background: rgba(20,8,12,.92); border-color: rgba(255,225,89,.55); }
      .cc-root.cc-open .cc-launch svg { display: none; }
      .cc-root.cc-open .cc-launch::after {
        content: '✕'; font-size: 18px; color: #FFFFFF; font-weight: 400;
      }
      .cc-badge {
        position: absolute; top: -4px; right: -4px;
        min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 99px; background: #FFE159; color: #1A0F12;
        font-size: 10px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid #0A0709;
      }
      /* The [hidden] HTML attribute defaults to display:none, but our
         .cc-badge rule sets display:flex which won't lose to the default.
         Re-assert display:none for the hidden state. */
      .cc-badge[hidden] { display: none !important; }
      .cc-drawer {
        position: fixed; bottom: 88px; right: 22px;
        width: 380px; max-width: calc(100vw - 44px);
        height: 520px; max-height: calc(100vh - 140px);
        background: rgba(14, 9, 12, .96);
        backdrop-filter: blur(20px) saturate(160%);
        -webkit-backdrop-filter: blur(20px) saturate(160%);
        border: 1px solid rgba(255,225,89,.18);
        border-radius: 18px;
        color: #F8F1E4;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 30px 80px rgba(0,0,0,.6);
        z-index: 93;
      }
      .cc-compact .cc-drawer { bottom: 74px; right: 14px; width: 340px; height: 480px; }
      /* Hide [hidden] drawer reliably */
      .cc-drawer[hidden] { display: none !important; }
      .cc-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(255,255,255,.06);
        background: linear-gradient(180deg, rgba(168,16,31,.18), transparent);
      }
      .cc-title { font-family: var(--font-display, 'Inter Tight'); font-weight: 700; font-size: 15px; color: #FFFFFF; }
      .cc-sub   { font-family: var(--font-mono, 'JetBrains Mono'); font-size: 10.5px; letter-spacing: .14em; color: rgba(248,241,228,.55); margin-top: 2px; }
      .cc-actions { display: flex; gap: 6px; }
      .cc-icon {
        width: 28px; height: 28px; border-radius: 50%;
        background: rgba(255,255,255,.06); border: 0; color: #F8F1E4;
        font-size: 13px; cursor: pointer;
      }
      .cc-icon:hover { background: rgba(255,255,255,.14); }

      .cc-roster {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,.06);
        max-height: 220px; overflow-y: auto;
      }
      .cc-roster-list { display: flex; flex-direction: column; gap: 4px; }
      .cc-roster-row {
        display: grid; grid-template-columns: 12px 28px 1fr auto; gap: 10px;
        align-items: center;
        padding: 6px 8px; border-radius: 8px;
        font-size: 12.5px; color: rgba(248,241,228,.55);
      }
      .cc-roster-row.on { color: #F8F1E4; background: rgba(110,231,183,.06); }
      .cc-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.2); }
      .cc-dot.on { background: #6EE7B7; box-shadow: 0 0 8px #6EE7B7; }
      .cc-roster-id { font-family: var(--font-mono); font-size: 10.5px; color: var(--ai-gold-bright, #FFE159); letter-spacing: .12em; }
      .cc-roster-rank { font-size: 10.5px; color: rgba(248,241,228,.5); font-family: var(--font-mono); }

      .cc-body {
        flex: 1; overflow-y: auto;
        padding: 14px 16px;
        display: flex; flex-direction: column; gap: 14px;
      }
      .cc-empty {
        margin: auto; text-align: center; color: rgba(248,241,228,.4);
        font-size: 13px;
      }
      .cc-empty-icon {
        font-size: 32px; margin-bottom: 6px; color: var(--ai-gold-bright);
        opacity: .5;
      }

      .cc-msg { display: flex; flex-direction: column; gap: 4px; }
      .cc-msg.own { align-items: flex-end; }
      .cc-msg-head { display: flex; align-items: baseline; gap: 8px; font-size: 11px; color: rgba(248,241,228,.55); }
      .cc-msg-head b { color: var(--ai-gold-bright); font-weight: 600; font-family: var(--font-display); font-size: 12.5px; }
      .cc-msg-rank { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .12em; }
      .cc-msg-time { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .08em; }
      .cc-msg-time.own { color: rgba(248,241,228,.4); font-family: var(--font-mono); font-size: 9.5px; padding-right: 2px; }
      .cc-msg-bubble {
        max-width: 80%;
        padding: 9px 13px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.06);
        border-radius: 14px 14px 14px 4px;
        font-size: 13px; line-height: 1.5;
        color: #F8F1E4;
        word-wrap: break-word; overflow-wrap: anywhere;
      }
      .cc-msg.own .cc-msg-bubble {
        background: linear-gradient(180deg, rgba(168,16,31,.55), rgba(168,16,31,.35));
        border-color: rgba(255,225,89,.22);
        border-radius: 14px 14px 4px 14px;
        color: #FFFFFF;
      }

      .cc-event {
        display: flex; align-items: center; gap: 10px;
        padding: 6px 10px;
        font-size: 11.5px;
        color: rgba(248,241,228,.6);
        background: rgba(255,225,89,.06);
        border: 1px solid rgba(255,225,89,.16);
        border-radius: 99px;
        align-self: center;
      }
      .cc-event-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--ai-gold-bright, #FFE159);
        box-shadow: 0 0 6px var(--ai-gold-bright, #FFE159);
        flex-shrink: 0;
      }
      .cc-event-text b { color: var(--ai-gold-bright, #FFE159); font-weight: 600; }
      .cc-event-time { font-family: var(--font-mono); font-size: 9.5px; opacity: .6; }

      .cc-form {
        display: flex; gap: 8px;
        padding: 12px 14px;
        border-top: 1px solid rgba(255,255,255,.06);
      }
      .cc-input {
        flex: 1;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 99px;
        padding: 10px 16px;
        font-size: 13px; color: #F8F1E4;
        font-family: inherit;
      }
      .cc-input:focus {
        outline: none;
        border-color: rgba(255,225,89,.4);
        background: rgba(255,255,255,.1);
      }
      .cc-send {
        width: 38px; height: 38px;
        border: 0; border-radius: 50%;
        background: linear-gradient(180deg, #C8102E, #8B1A2B);
        color: #FFFFFF; font-size: 17px;
        cursor: pointer;
      }
      .cc-send:hover { background: linear-gradient(180deg, #E61926, #A8101F); }

      @media (max-width: 640px) {
        .cc-drawer { left: 12px; right: 12px; width: auto; bottom: 80px; }
        .cc-root { bottom: 16px; right: 16px; }
        .cc-root.cc-open .cc-drawer { bottom: 86px; }
      }
    `;
    const style = document.createElement('style');
    style.id = 'cc-styles'; style.textContent = css;
    document.head.appendChild(style);
  })();

  return { mount, send, event, online, onMessage, clear };
})();
