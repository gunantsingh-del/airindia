/* =====================================================================
   AIVA · Crew Chat
   ---------------------------------------------------------------------
   Group chat shared by all 14 pilots.

   Sync layers (all run in parallel; messages dedup by ID):
     1) BroadcastChannel — same browser, cross-tab.
     2) localStorage     — same browser, cross-session.
     3) ntfy.sh relay    — cross-device, cross-pilot, real-time via SSE.
                            Zero signup; a unique unguessable topic acts as
                            the only credential. Configurable via
                            window.AIVA_CHAT_TOPIC or AIVA.Store.set(
                            'crew_chat_topic', '<your-topic>').

   The ntfy layer is what fixes the "Aarush sent a message and Gunant
   didn't get it" bug — localStorage alone is per-browser, so two pilots
   on different machines never sync. Every send POSTs to the ntfy topic;
   every browser subscribes via EventSource so messages arrive in real
   time. If ntfy.sh is unreachable, the local layers still work.

   Message:
     { id, ts, type: 'msg'|'event', pilotId, pilotName, rank, text, meta? }

   Public surface:
     AIVA.CrewChat.mount(host?, opts?)  → mount the floating widget
     AIVA.CrewChat.send(text)           → send a plain message as the current pilot
     AIVA.CrewChat.event(text, meta)    → push a system event (e.g. "took off")
     AIVA.CrewChat.online()             → array of pilotIds active in last 5 min
     AIVA.CrewChat.clear()              → wipe (admin only)
     AIVA.CrewChat.onMessage(cb)        → subscribe to new messages
     AIVA.CrewChat.relayState()         → 'connected' | 'disconnected' | 'off'
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.CrewChat = (() => {
  const KEY        = 'aiva.crew_chat';
  const PRESENCE   = 'aiva.crew_chat_presence';
  const MAX_KEEP   = 500;                  // hard cap so storage stays bounded
  const ONLINE_MS  = 5 * 60 * 1000;        // 5 minutes counts as "online"
  const CH_NAME    = 'aiva-crew-chat';
  /* Sliding-window retention: messages older than 2 h auto-disappear
     on every read so the chat stays as a live ops feed, not a log
     book. Quick-react chatter, no permanent record. */
  const RETENTION_MS = 2 * 60 * 60 * 1000;
  /* Emoji palette for one-tap reactions — fits in the action overlay
     without scrolling. Pilots can tap the same emoji again to remove
     their own reaction. */
  const REACTIONS = ['👍','❤️','😂','🔥','✈️','🙌'];

  /* ============ ntfy.sh realtime relay ============
     Default topic is unguessable but hardcoded so all 14 pilots land on
     the same channel without configuration. Anyone with the topic name
     can read/write — that's fine for our 14-pilot closed VA but DO NOT
     post sensitive info here. The pilot or admin can override via
     window.AIVA_CHAT_TOPIC for extra paranoia. */
  const DEFAULT_TOPIC = 'aiva-crew-b8f3xK9p7Q2mR5tNwE1cD6vY';
  const NTFY_BASE     = 'https://ntfy.sh';
  function chatTopic() {
    if (typeof window.AIVA_CHAT_TOPIC === 'string' && window.AIVA_CHAT_TOPIC) return window.AIVA_CHAT_TOPIC;
    try {
      const stored = AIVA.Store?.get?.('crew_chat_topic', null);
      if (stored) return stored;
    } catch {}
    return DEFAULT_TOPIC;
  }
  let relayState = 'disconnected';   // 'connected' | 'disconnected' | 'off'
  let relaySource = null;

  /* ============ AES-GCM encryption ============
     Every message is sealed with AES-256-GCM before it leaves the
     browser. The shared key is PBKDF2-derived from a hardcoded
     passphrase + salt. An observer on the public ntfy topic sees
     only ciphertext envelopes; without the passphrase they can't
     read crew chatter or DMs.

     Caveats:
     • The passphrase is in the client bundle. Anyone who reverse-
       engineers AIVA can read messages — but anyone in the closed
       roster already has it baked in, and a fully public host
       can't decrypt. This is "private-from-strangers" not "private-
       from-insiders".
     • Backward compat: receivers fall back to plaintext if a message
       lacks the `enc:1` marker, so a half-deployed crew still talks.
   */
  const CRYPTO_PASSPHRASE = 'aiva-crew-vista-monsoon-77w-2026';
  const CRYPTO_SALT = 'aiva-2026-chakra';
  let _cryptoKey = null;
  async function getKey() {
    if (_cryptoKey) return _cryptoKey;
    if (!window.crypto?.subtle) return null;
    const enc = new TextEncoder();
    try {
      const base = await crypto.subtle.importKey(
        'raw', enc.encode(CRYPTO_PASSPHRASE), 'PBKDF2', false, ['deriveKey']);
      _cryptoKey = await crypto.subtle.deriveKey(
        { name:'PBKDF2', salt: enc.encode(CRYPTO_SALT), iterations: 120_000, hash:'SHA-256' },
        base, { name:'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      return _cryptoKey;
    } catch { return null; }
  }
  const _b64 = {
    enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
    dec: (s)   => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
  };
  async function encryptMessage(msg) {
    const key = await getKey();
    if (!key) return msg;   // fall back to plain if Web Crypto unavailable
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(msg)));
    return { enc: 1, iv: _b64.enc(iv), ct: _b64.enc(ct) };
  }
  async function decryptMessage(env) {
    if (!env || env.enc !== 1) return env;   // already plaintext (backward compat)
    const key = await getKey();
    if (!key) return null;
    try {
      const iv = _b64.dec(env.iv);
      const ct = _b64.dec(env.ct);
      const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
      return JSON.parse(new TextDecoder().decode(pt));
    } catch { return null; }
  }
  const relayStateListeners = [];
  function notifyRelayStateChange() {
    relayStateListeners.forEach(cb => { try { cb(relayState); } catch(_){} });
  }
  const seenIds = new Set();          // dedup buffer (capped)
  function rememberSeen(id) {
    if (!id) return;
    seenIds.add(id);
    if (seenIds.size > 2000) {
      /* drop the oldest half so the set doesn't grow unbounded */
      const arr = Array.from(seenIds);
      seenIds.clear();
      arr.slice(arr.length / 2).forEach(x => seenIds.add(x));
    }
  }

  const channel = (() => {
    try { return new BroadcastChannel(CH_NAME); } catch { return null; }
  })();
  const listeners = [];

  /* ============ storage helpers ============ */
  function purgeOld(arr) {
    const cutoff = Date.now() - RETENTION_MS;
    return arr.filter(m => (m.ts || 0) >= cutoff);
  }
  function readLog() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      const kept = purgeOld(raw);
      if (kept.length !== raw.length) {
        try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch {}
      }
      return kept;
    } catch { return []; }
  }
  function writeLog(arr) {
    /* Cap by retention window AND by MAX_KEEP — whichever is tighter */
    let kept = purgeOld(arr);
    if (kept.length > MAX_KEEP) kept = kept.slice(kept.length - MAX_KEEP);
    try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch {}
  }
  /* Periodic purge tick so messages disappear in real time even if the
     drawer is open and no new messages are arriving. */
  setInterval(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      const kept = purgeOld(raw);
      if (kept.length !== raw.length) {
        localStorage.setItem(KEY, JSON.stringify(kept));
        listeners.forEach(cb => { try { cb(null, kept); } catch(_){} });
      }
    } catch {}
  }, 5 * 60 * 1000);
  function readPresence() {
    try { return JSON.parse(localStorage.getItem(PRESENCE) || '{}'); }
    catch { return {}; }
  }
  function writePresence(p) {
    try { localStorage.setItem(PRESENCE, JSON.stringify(p)); } catch {}
  }
  function pilot() { return (AIVA.Auth?.currentPilot && AIVA.Auth.currentPilot()) || null; }
  /* Look up a pilot's avatar dataURL from the shared crew_avatars map.
     Falls back to null so the renderer can show initials. Stored as a
     plain {pilotId: dataURL} dictionary — see Profile page upload
     handler in portal.js for the write side. */
  function avatarFor(pilotId) {
    try {
      const map = AIVA.Store?.get?.('crew_avatars', {}) || {};
      return map[pilotId] || null;
    } catch { return null; }
  }
  function initialsFor(name) {
    return (name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
  }

  /* ============ presence heartbeat ============ */
  function beat() {
    const p = pilot(); if (!p) return;
    const map = readPresence();
    map[p.id] = Date.now();
    writePresence(map);
  }
  beat();
  setInterval(beat, 60_000);

  /* ============ ntfy relay: publish + subscribe ============ */
  async function relayPublish(msg) {
    if (relayState === 'off') return;
    try {
      const topic = chatTopic();
      const envelope = await encryptMessage(msg);
      await fetch(`${NTFY_BASE}/${encodeURIComponent(topic)}`, {
        method: 'POST',
        headers: { 'Content-Type':'text/plain' },
        body: JSON.stringify(envelope),
      });
      /* Kick a poll immediately after sending — refreshes our own log
         + nudges the ntfy server, which sometimes lazily flushes the
         queue when polled. Helps slow-delivery cases. */
      try { relayPollBackfill(); } catch {}
    } catch {
      /* network glitch — local + BC paths still delivered it for this device */
    }
  }

  /* Polling backfill for messages SSE missed (connection bounced,
     keepalive timed out, network blip). Every 5 s we hit the JSON
     endpoint with `since=<lastTs>` and ingest anything new. Belt-
     and-suspenders next to SSE — covers the "I sent a message but
     it took minutes to arrive" case the Chief Pilot kept hitting.

     Cheap: one HTTP request per 5 s, returns nothing if there are
     no new messages since last poll. */
  let relayPollLastTs = Math.floor(Date.now() / 1000) - 60; // start 60s back so the first poll catches recent messages
  let relayPollTimer = null;
  async function relayPollBackfill() {
    if (relayState === 'off') return;
    try {
      const topic = chatTopic();
      const url = `${NTFY_BASE}/${encodeURIComponent(topic)}/json?poll=1&since=${relayPollLastTs}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return;
      const text = await r.text();
      if (!text.trim()) return;
      /* ntfy returns NDJSON — one envelope per line. */
      const lines = text.split('\n').filter(l => l.trim());
      let maxTs = relayPollLastTs;
      for (const line of lines) {
        let env; try { env = JSON.parse(line); } catch { continue; }
        if (env.time && env.time > maxTs) maxTs = env.time;
        if (env.event && env.event !== 'message') continue;
        if (!env.message) continue;
        await ingestEnvelope(env.message);
      }
      relayPollLastTs = maxTs + 1; // advance to avoid re-ingesting the same batch
    } catch {}
  }
  async function ingestEnvelope(rawMessage) {
    try {
      const wireObj = JSON.parse(rawMessage);
      const msg = (wireObj && wireObj.enc === 1)
        ? await decryptMessage(wireObj)
        : wireObj;
      if (!msg || !msg.id) return;
      if (seenIds.has(msg.id)) return;
      rememberSeen(msg.id);
      if (msg.type === 'reaction') { applyRemoteReaction(msg); if (channel) try { channel.postMessage({ kind:'msg', msg }); } catch {} return; }
      if (msg.type === 'avatar_set') { applyAvatarSet(msg); if (channel) try { channel.postMessage({ kind:'msg', msg }); } catch {} return; }
      const log = readLog();
      if (!log.find(x => x.id === msg.id)) {
        log.push(msg);
        log.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        writeLog(log);
      }
      listeners.forEach(cb => { try { cb(msg, readLog()); } catch(_){} });
      if (channel) { try { channel.postMessage({ kind:'msg', msg }); } catch {} }
    } catch {}
  }
  function relayConnect() {
    if (relayState === 'off') return;
    try {
      if (relaySource) try { relaySource.close(); } catch {}
      const topic = chatTopic();
      /* ntfy returns events as JSON envelopes; event=message means a real
         publish (vs. keepalive). poll=1 replays recent history once on open
         so a pilot who was offline catches up without manual refresh. */
      relaySource = new EventSource(`${NTFY_BASE}/${encodeURIComponent(topic)}/sse?poll=1`);
      /* Start the 5-second polling backfill alongside SSE. SSE delivers
         messages in real time when the connection's healthy; polling
         catches anything SSE missed (bounced connection, queued message
         on the ntfy server). Net effect: latency drops to ≤5 s worst
         case instead of the multi-minute lag pilots were hitting. */
      if (relayPollTimer) clearInterval(relayPollTimer);
      relayPollTimer = setInterval(relayPollBackfill, 5000);
      relayPollBackfill(); // immediate first poll
      relaySource.onopen = () => { relayState = 'connected'; notifyRelayStateChange(); };
      relaySource.onerror = () => {
        relayState = 'disconnected';
        notifyRelayStateChange();
        /* Faster reconnect — 2 s. ntfy.sh bounces connections sometimes
           but they come right back, so we shouldn't sit silent for 8 s. */
        setTimeout(relayConnect, 2000);
      };
      relaySource.onmessage = async (ev) => {
        try {
          const env = JSON.parse(ev.data);
          if (env.event && env.event !== 'message') return;     // skip keepalives
          if (!env.message) return;
          const wireObj = JSON.parse(env.message);
          /* If the wire object carries enc:1, decrypt it before anything
             else. Falls back to treating as plaintext for backward compat. */
          const msg = (wireObj && wireObj.enc === 1)
            ? await decryptMessage(wireObj)
            : wireObj;
          if (!msg || !msg.id) return;
          if (seenIds.has(msg.id)) return;                       // own echo / dedup
          rememberSeen(msg.id);
          /* Reaction events don't add a log entry of their own — they
             mutate an existing message's reactions map. */
          if (msg.type === 'reaction') {
            applyRemoteReaction(msg);
            if (channel) { try { channel.postMessage({ kind: 'msg', msg }); } catch {} }
            return;
          }
          /* Avatar updates: cache the URL globally so chat / crew list
             render the new image immediately. */
          if (msg.type === 'avatar_set') {
            applyAvatarSet(msg);
            if (channel) { try { channel.postMessage({ kind: 'msg', msg }); } catch {} }
            return;
          }
          /* Insert into local log if it's not already there, then notify UI */
          const log = readLog();
          if (!log.find(x => x.id === msg.id)) {
            log.push(msg);
            log.sort((a, b) => (a.ts || 0) - (b.ts || 0));
            writeLog(log);
          }
          listeners.forEach(cb => { try { cb(msg, readLog()); } catch(_){} });
          if (channel) { try { channel.postMessage({ kind: 'msg', msg }); } catch {} }
        } catch {}
      };
    } catch {
      relayState = 'disconnected';
    }
  }
  /* Lazy connect — kick off once on script load */
  relayConnect();

  /* ============ message push ============ */
  function push(msg) {
    msg.id = msg.id || (Date.now().toString(36) + Math.random().toString(36).slice(2,6));
    msg.ts = msg.ts || Date.now();
    rememberSeen(msg.id);                          // suppress our own ntfy echo
    const log = readLog();
    log.push(msg);
    writeLog(log);
    /* Notify same-tab listeners + cross-tab via BroadcastChannel */
    listeners.forEach(cb => { try { cb(msg, log); } catch(_){} });
    if (channel) { try { channel.postMessage({ kind: 'msg', msg }); } catch {} }
    /* Cross-device fan-out via ntfy.sh — fire and forget */
    relayPublish(msg);
    return msg;
  }
  function send(text, opts = {}) {
    const p = pilot();
    if (!p) return null;
    const txt = (text || '').trim();
    if (!txt) return null;
    return push({
      type: 'msg', pilotId: p.id, pilotName: p.name, rank: p.rank, text: txt,
      to:      opts.to      || null,        // null = group, else target pilotId for DM
      replyTo: opts.replyTo || null,        // optional message id this replies to
      reactions: {},
    });
  }

  /* ============ reactions ============
     Each reaction is a separate message of type 'reaction' so it
     syncs over the same ntfy channel as everything else. Receivers
     find the target message in their local log and toggle the
     pilotId in/out of the emoji's reactor list. */
  function react(targetId, emoji) {
    const p = pilot();
    if (!p || !targetId || !emoji) return;
    const log = readLog();
    const target = log.find(m => m.id === targetId);
    if (!target) return;
    target.reactions = target.reactions || {};
    const list = (target.reactions[emoji] || []).filter(Boolean);
    const idx = list.indexOf(p.id);
    let add;
    if (idx >= 0) { list.splice(idx, 1); add = false; }
    else { list.push(p.id); add = true; }
    if (list.length) target.reactions[emoji] = list;
    else delete target.reactions[emoji];
    writeLog(log);
    /* Cross-tab + cross-device fan-out via a reaction event */
    const reactionMsg = {
      id: (Date.now().toString(36) + Math.random().toString(36).slice(2,6)),
      ts: Date.now(),
      type: 'reaction',
      pilotId: p.id,
      targetId, emoji, add,
    };
    rememberSeen(reactionMsg.id);
    if (channel) { try { channel.postMessage({ kind: 'msg', msg: reactionMsg }); } catch {} }
    relayPublish(reactionMsg);
    listeners.forEach(cb => { try { cb(target, log); } catch(_){} });
  }
  /* Apply an incoming reaction event (from another browser/device) to
     the local log. Symmetric with react() above, but driven by
     remote state instead of the local pilot's tap. */
  function applyRemoteReaction(rmsg) {
    const log = readLog();
    const target = log.find(m => m.id === rmsg.targetId);
    if (!target) return;
    target.reactions = target.reactions || {};
    const list = (target.reactions[rmsg.emoji] || []).filter(Boolean);
    const idx = list.indexOf(rmsg.pilotId);
    if (rmsg.add && idx === -1) list.push(rmsg.pilotId);
    if (!rmsg.add && idx >= 0)  list.splice(idx, 1);
    if (list.length) target.reactions[rmsg.emoji] = list;
    else delete target.reactions[rmsg.emoji];
    writeLog(log);
    listeners.forEach(cb => { try { cb(target, log); } catch(_){} });
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
      const m = e.data.msg;
      /* Reaction + avatar events mutate state same as ntfy ones. */
      if (m && m.type === 'reaction' && !seenIds.has(m.id)) {
        rememberSeen(m.id);
        applyRemoteReaction(m);
        return;
      }
      if (m && m.type === 'avatar_set' && !seenIds.has(m.id)) {
        rememberSeen(m.id);
        applyAvatarSet(m);
        return;
      }
      listeners.forEach(cb => { try { cb(m, readLog()); } catch(_){} });
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
  /* Active channel: 'crew' for the group room, else a pilotId for a
     1:1 DM thread. Persisted across drawer toggles so coming back to
     the chat lands on the conversation you were in. */
  let activeChannel = 'crew';
  /* Message ID being replied to, if any — drives the reply preview
     bar above the input and the replyTo field on send. */
  let replyingTo = null;

  /* Visibility filter: which messages belong to the current channel? */
  function isInChannel(m, myId) {
    if (!m) return false;
    if (m.type === 'reaction') return false;       // reactions aren't rendered as separate items
    if (activeChannel === 'crew') return !m.to;    // group room → only un-targeted msgs
    /* DM: show messages where (I sent to them) OR (they sent to me) */
    return (m.pilotId === myId && m.to === activeChannel)
        || (m.pilotId === activeChannel && m.to === myId);
  }

  function renderChannels() {
    const host = root?.querySelector('#ccChannels'); if (!host) return;
    const me = pilot(); if (!me) { host.innerHTML = ''; return; }
    const all = AIVA.Auth?.allPilots?.() || [];
    const log = readLog();
    /* Build the DM list from EVERY pilot we've exchanged a DM with,
       most-recent first. Always show the group "Crew" channel. */
    const dmIds = new Set();
    for (const m of log) {
      if (!m || m.type === 'reaction' || !m.to) continue;
      if (m.pilotId === me.id) dmIds.add(m.to);
      else if (m.to === me.id) dmIds.add(m.pilotId);
    }
    /* If we're currently in a DM that has no messages yet (just clicked
       a pilot in the roster), keep the chip visible. */
    if (activeChannel !== 'crew') dmIds.add(activeChannel);
    const dmList = [...dmIds]
      .map(id => ({ id, p: all.find(x => x.id === id) }))
      .filter(x => x.p)
      .sort((a, b) => a.p.name.localeCompare(b.p.name));

    host.innerHTML = `
      <button class="cc-chan ${activeChannel === 'crew' ? 'on' : ''}" data-cc-dm="crew">CREW</button>
      ${dmList.map(({ id, p }) => {
        const pic = avatarFor(id);
        const avHtml = pic
          ? `<span class="cc-chan-pic"><img src="${pic}" alt=""></span>`
          : `<span class="cc-chan-pic"><span class="cc-chan-init">${initialsFor(p.name)}</span></span>`;
        return `<button class="cc-chan ${activeChannel === id ? 'on' : ''}" data-cc-dm="${id}" title="DM ${p.name}">${avHtml}${p.name.split(' ')[0]}</button>`;
      }).join('')}
    `;
    /* Title reflects the current channel */
    const title = root.querySelector('#ccTitle');
    if (title) title.textContent = activeChannel === 'crew'
      ? 'Crew Chat'
      : `DM · ${(all.find(p => p.id === activeChannel)?.name) || activeChannel}`;
    /* Input placeholder reflects too */
    const inp = root.querySelector('#ccInput');
    if (inp) inp.placeholder = activeChannel === 'crew'
      ? 'Message the crew…'
      : `Message ${(all.find(p => p.id === activeChannel)?.name?.split(' ')[0]) || 'crew'}…`;
  }

  function renderReplyBar() {
    const bar = root?.querySelector('#ccReplyBar');
    if (!bar) return;
    if (!replyingTo) { bar.hidden = true; bar.innerHTML = ''; return; }
    const target = readLog().find(m => m.id === replyingTo);
    if (!target) { replyingTo = null; bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = `
      <div class="cc-reply-strip">
        <div class="cc-reply-meta">↳ Replying to <b>${escapeHTML(target.pilotName || 'crew')}</b></div>
        <div class="cc-reply-text">${escapeHTML((target.text || '').slice(0, 120))}${(target.text || '').length > 120 ? '…' : ''}</div>
      </div>
      <button class="cc-reply-x" id="ccReplyCancel" aria-label="Cancel reply">✕</button>
    `;
    bar.querySelector('#ccReplyCancel').onclick = () => { replyingTo = null; renderReplyBar(); };
  }
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
          <div class="cc-head-title">
            <div class="cc-title" id="ccTitle">Crew Chat</div>
            <div class="cc-sub" id="ccPresence">— online</div>
          </div>
          <div class="cc-actions">
            <button class="cc-icon" id="ccRoster" title="Crew roster">⌘</button>
            <button class="cc-icon" id="ccClose" aria-label="Close">✕</button>
          </div>
        </header>
        <section class="cc-channels" id="ccChannels"></section>
        <section class="cc-roster" id="ccRosterPanel" hidden></section>
        <section class="cc-body" id="ccBody"></section>
        <section class="cc-reply-bar" id="ccReplyBar" hidden></section>
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
      const txt = inp.value.trim();
      if (!txt) return;
      /* If we're in a DM channel, attach the recipient. If there's an
         active replyTo, include it. Both fields are optional in send(). */
      send(txt, {
        to:      activeChannel === 'crew' ? null : activeChannel,
        replyTo: replyingTo || null,
      });
      inp.value = '';
      replyingTo = null;
      renderReplyBar();
    });

    /* Click ANYWHERE inside the chat body to trigger action overlay
       interactions (reaction picker, reply, DM-to-author). We use
       event delegation so message-specific click handlers don't have
       to be re-attached on every renderAll. */
    root.querySelector('#ccBody').addEventListener('click', (e) => {
      const reactBtn = e.target.closest('[data-cc-react]');
      if (reactBtn) {
        const msgEl = reactBtn.closest('[data-cc-id]');
        const id = msgEl?.dataset.ccId;
        const emoji = reactBtn.dataset.ccReact;
        if (id && emoji) react(id, emoji);
        return;
      }
      const replyBtn = e.target.closest('[data-cc-reply]');
      if (replyBtn) {
        replyingTo = replyBtn.dataset.ccReply;
        renderReplyBar();
        root.querySelector('#ccInput')?.focus();
        return;
      }
      const dmBtn = e.target.closest('[data-cc-dm]');
      if (dmBtn) {
        activeChannel = dmBtn.dataset.ccDm;
        renderChannels();
        renderAll();
        scrollBottom();
      }
    });

    /* Initial render + live updates */
    renderChannels();
    renderAll();
    renderReplyBar();
    updatePresence();
    onMessage((msg) => {
      renderChannels();
      renderAll();
      /* Unread badge fires only for messages a) addressed to me or to
         the crew, b) not from me, c) when drawer is closed. */
      const me = pilot()?.id;
      if (drawer.hidden && msg && msg.pilotId !== me) {
        const visible = msg.type === 'reaction'
          ? false                                          // reactions don't badge
          : (!msg.to || msg.to === me);
        if (visible) { lastUnread++; updateBadge(); }
      }
    });
    /* Re-render presence row whenever the ntfy relay state flips so
       pilots see "synced" / "syncing…" in real time. */
    relayStateListeners.push(() => updatePresence());
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
    const relayBadge = relayState === 'connected'
      ? ' · <span style="color:#6EE7B7;">● synced</span>'
      : relayState === 'disconnected'
        ? ' · <span style="color:#FBBF24;">○ syncing…</span>'
        : '';
    const presence = ids.length
      ? `${ids.length} online · ${names.join(', ')}${ids.length > 4 ? ` +${ids.length - 4}` : ''}`
      : '— quiet right now';
    p.innerHTML = presence + relayBadge;
  }
  function renderRoster() {
    const r = root?.querySelector('#ccRosterPanel');
    if (!r) return;
    const all = AIVA.Auth?.allPilots?.() || [];
    const ids = new Set(online());
    const me = pilot()?.id;
    r.innerHTML = `
      <div class="cc-roster-list">
        ${all.map(p => {
          const pic = avatarFor(p.id);
          const avatarHtml = pic
            ? `<span class="cc-roster-avatar"><img src="${pic}" alt=""></span>`
            : `<span class="cc-roster-avatar"><span class="cc-roster-initials">${initialsFor(p.name)}</span></span>`;
          /* Click whole row → open DM with that pilot (skip self). */
          const dmAttr = p.id === me ? '' : `data-cc-dm="${p.id}"`;
          return `
            <div class="cc-roster-row ${ids.has(p.id) ? 'on' : ''}" ${dmAttr} ${dmAttr ? 'style="cursor:pointer;"' : ''}>
              <span class="cc-dot ${ids.has(p.id) ? 'on' : ''}"></span>
              ${avatarHtml}
              <span class="cc-roster-name">${p.name}</span>
              <span class="cc-roster-rank">${p.rank}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    /* Wire the row clicks through to the same delegate that the body
       uses — but the roster lives outside #ccBody so we attach here. */
    r.querySelectorAll('[data-cc-dm]').forEach(row => {
      row.addEventListener('click', () => {
        activeChannel = row.dataset.ccDm;
        replyingTo = null;
        renderChannels();
        renderAll();
        renderReplyBar();
        scrollBottom();
        /* Auto-close the roster panel after picking a DM target */
        r.hidden = true;
      });
    });
  }
  function renderAll() {
    const body = root?.querySelector('#ccBody'); if (!body) return;
    const me  = pilot()?.id;
    const full = readLog();
    const log = full.filter(m => isInChannel(m, me)).slice(-200);
    body.innerHTML = log.length ? log.map(m => msgHTML(m, me, full)).join('') : `
      <div class="cc-empty">
        <div class="cc-empty-icon">⊝</div>
        <div class="cc-empty-text">No chatter yet. Be the first to greet the crew.</div>
      </div>
    `;
    scrollBottom();
  }
  function msgHTML(m, me, fullLog) {
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
    const pic = avatarFor(m.pilotId);
    const avatarHtml = pic
      ? `<span class="cc-msg-avatar" data-cc-dm="${m.pilotId}" title="DM ${escapeHTML(m.pilotName)}"><img src="${pic}" alt=""></span>`
      : `<span class="cc-msg-avatar" data-cc-dm="${m.pilotId}" title="DM ${escapeHTML(m.pilotName)}"><span class="cc-msg-initials">${initialsFor(m.pilotName)}</span></span>`;

    /* Quoted preview when this message is a reply */
    let replyQuote = '';
    if (m.replyTo && fullLog) {
      const t = fullLog.find(x => x.id === m.replyTo);
      if (t) {
        replyQuote = `
          <div class="cc-reply-quote">
            <span class="cc-reply-q-name">${escapeHTML(t.pilotName || 'crew')}</span>
            <span class="cc-reply-q-text">${escapeHTML((t.text || '').slice(0, 120))}${(t.text || '').length > 120 ? '…' : ''}</span>
          </div>`;
      }
    }

    /* Reaction chips (aggregated). Click to toggle your own. */
    const rmap = m.reactions || {};
    const rChips = Object.entries(rmap)
      .filter(([_, ids]) => Array.isArray(ids) && ids.length)
      .map(([emoji, ids]) => {
        const mine = ids.includes(me);
        return `<button class="cc-react-chip ${mine ? 'mine' : ''}" data-cc-react="${emoji}" data-cc-id="${m.id}">
          <span class="cc-react-emo">${emoji}</span><span class="cc-react-n">${ids.length}</span>
        </button>`;
      }).join('');
    const reactionsRow = rChips ? `<div class="cc-reactions">${rChips}</div>` : '';

    /* Action overlay — emoji palette + reply button. Hover/tap reveals. */
    const actions = `
      <div class="cc-actions-overlay">
        ${REACTIONS.map(e => `<button class="cc-act-react" data-cc-react="${e}" title="React ${e}">${e}</button>`).join('')}
        <button class="cc-act-reply" data-cc-reply="${m.id}" title="Reply">↩</button>
      </div>
    `;

    /* DM badge if this message has a `to` field */
    const dmBadge = m.to ? `<span class="cc-dm-badge">DM</span>` : '';

    return `
      <div class="cc-msg ${own ? 'own' : ''}" data-cc-id="${m.id}">
        <div class="cc-msg-row">
          ${!own ? avatarHtml : ''}
          <div class="cc-msg-col">
            ${!own ? `<div class="cc-msg-head"><b data-cc-dm="${m.pilotId}">${escapeHTML(m.pilotName)}</b> <span class="cc-msg-rank">${escapeHTML(m.rank || '')}</span> ${dmBadge} <span class="cc-msg-time">${time}</span></div>` : ''}
            ${replyQuote}
            <div class="cc-msg-bubble">${escapeHTML(m.text)}</div>
            ${own ? `<div class="cc-msg-time own">${dmBadge} ${time}</div>` : ''}
            ${reactionsRow}
            ${actions}
          </div>
        </div>
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
      /* Context-aware positioning:
         • PORTAL (default): bottom-RIGHT of viewport — sidebar lives
           on the LEFT, content fills the rest, no Pax Manifest tile,
           so bottom-right corner is empty.
         • EFB (body.efb-body): also bottom-right, but pulled in by ~90px
           so we sit to the LEFT of the right tile rail (W&B / Perf /
           ACARS / Journey / Pax M) instead of on top of it.
         Maharaja launcher sits to our LEFT (right: 96px on portal /
         right: 186px on EFB) per the spacing in chatbot.js. */
      .cc-root { position: fixed; bottom: 22px; right: 22px; z-index: 92; font-family: var(--font-sans, Inter, system-ui, sans-serif); }
      body.efb-body .cc-root { right: 112px; }   /* clear the tile rail */
      .cc-root.cc-compact { bottom: 14px; right: 22px; }
      .cc-launch {
        /* Size-match Maharaja (64×64) so the two launchers visually
           belong together — same proportions, no asymmetric clustering. */
        width: 64px; height: 64px; border-radius: 50%;
        background: linear-gradient(180deg, #C8102E, #8B1A2B);
        color: #FFFFFF; border: 2px solid rgba(255,225,89,.4);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        box-shadow: 0 14px 36px rgba(168,16,31,.42);
        position: relative;
        transition: transform .2s, box-shadow .2s, background .2s;
      }
      .cc-launch svg { width: 26px; height: 26px; }
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
        position: fixed; bottom: 100px; right: 22px;
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
        display: grid; grid-template-columns: 12px 32px 1fr auto; gap: 10px;
        align-items: center;
        padding: 6px 8px; border-radius: 8px;
        font-size: 12.5px; color: rgba(248,241,228,.55);
      }
      .cc-roster-row.on { color: #F8F1E4; background: rgba(110,231,183,.06); }
      .cc-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.2); }
      .cc-dot.on { background: #6EE7B7; box-shadow: 0 0 8px #6EE7B7; }
      .cc-roster-avatar {
        width: 30px; height: 30px; border-radius: 50%;
        background: linear-gradient(135deg, #DA192F, #4A1B41);
        display: grid; place-items: center;
        overflow: hidden;
        box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 4px 12px rgba(0,0,0,.4);
      }
      .cc-roster-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .cc-roster-initials { color: #FFFFFF; font-family: var(--font-display); font-weight: 700; font-size: 11px; letter-spacing: .04em; }
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
      .cc-msg-row { display: flex; gap: 10px; align-items: flex-start; }
      .cc-msg-col { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
      .cc-msg-avatar {
        flex: 0 0 32px;
        width: 32px; height: 32px; border-radius: 50%;
        background: linear-gradient(135deg, #DA192F, #4A1B41);
        display: grid; place-items: center;
        overflow: hidden; margin-top: 2px;
        box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 4px 12px rgba(0,0,0,.4);
      }
      .cc-msg-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .cc-msg-initials { color: #FFFFFF; font-family: var(--font-display); font-weight: 700; font-size: 12px; letter-spacing: .04em; }
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

      /* ===== Channel switcher (Crew + DMs) ===== */
      .cc-channels {
        display: flex; gap: 6px; padding: 8px 14px;
        overflow-x: auto; flex-wrap: nowrap;
        border-bottom: 1px solid rgba(255,255,255,.05);
        scrollbar-width: thin;
      }
      .cc-chan {
        display: inline-flex; align-items: center; gap: 6px;
        background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.06);
        color: rgba(248,241,228,.7);
        padding: 5px 11px;
        border-radius: 99px;
        font-family: var(--font-display); font-size: 11.5px; font-weight: 600;
        letter-spacing: .04em;
        cursor: pointer;
        white-space: nowrap;
        transition: background .15s ease, color .15s ease, border-color .15s ease;
      }
      .cc-chan.on {
        background: rgba(255,225,89,.12);
        border-color: rgba(255,225,89,.42);
        color: #FFE9A8;
      }
      .cc-chan:hover { background: rgba(255,225,89,.08); color: #F8F1E4; }
      .cc-chan-pic { width: 18px; height: 18px; border-radius: 50%; overflow: hidden; background: linear-gradient(135deg,#DA192F,#4A1B41); display: grid; place-items: center; }
      .cc-chan-pic img { width:100%; height:100%; object-fit:cover; display:block; }
      .cc-chan-init { color:#fff; font-size:8.5px; font-weight:700; }

      /* ===== Reactions ===== */
      .cc-reactions {
        display: flex; gap: 4px; flex-wrap: wrap; margin-top: 5px;
      }
      .cc-react-chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 8px; border-radius: 99px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
        font-size: 11.5px; color: rgba(248,241,228,.8);
        cursor: pointer; transition: all .15s ease;
      }
      .cc-react-chip:hover { background: rgba(255,225,89,.1); }
      .cc-react-chip.mine {
        background: rgba(255,225,89,.18);
        border-color: rgba(255,225,89,.45);
        color: #FFE9A8;
      }
      .cc-react-emo { font-size: 12.5px; line-height: 1; }
      .cc-react-n { font-family: var(--font-mono); font-size: 10.5px; }

      /* ===== Action overlay on hover ===== */
      .cc-actions-overlay {
        position: absolute;
        top: -14px; right: 4px;
        display: flex; gap: 2px;
        background: rgba(20,8,12,.98);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 99px; padding: 2px 4px;
        opacity: 0; pointer-events: none;
        transition: opacity .12s ease;
        box-shadow: 0 6px 18px rgba(0,0,0,.55);
        z-index: 5;
      }
      .cc-msg { position: relative; }
      .cc-msg:hover .cc-actions-overlay { opacity: 1; pointer-events: auto; }
      .cc-act-react, .cc-act-reply {
        background: none; border: 0; cursor: pointer;
        font-size: 13.5px; line-height: 1;
        padding: 4px 6px; border-radius: 50%;
        color: rgba(248,241,228,.85);
      }
      .cc-act-react:hover, .cc-act-reply:hover { background: rgba(255,225,89,.14); }
      .cc-act-reply { font-size: 12px; color: rgba(248,241,228,.6); }
      /* Touch — show on tap (hover doesn't exist on touch) */
      @media (hover: none) {
        .cc-actions-overlay { opacity: 1; pointer-events: auto; }
      }

      /* ===== Reply quote in bubble + reply bar above input ===== */
      .cc-reply-quote {
        border-left: 2px solid rgba(255,225,89,.5);
        padding: 4px 8px; margin-bottom: 6px;
        background: rgba(255,225,89,.05);
        border-radius: 0 8px 8px 0;
        font-size: 11.5px; line-height: 1.4;
        max-width: 80%;
      }
      .cc-reply-q-name { color: var(--ai-gold-bright,#FFE159); font-weight: 600; display: block; }
      .cc-reply-q-text { color: rgba(248,241,228,.7); }

      .cc-reply-bar {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 14px;
        border-top: 1px solid rgba(255,225,89,.22);
        background: rgba(255,225,89,.05);
      }
      .cc-reply-strip { flex: 1; min-width: 0; }
      .cc-reply-meta { font-size: 11px; color: rgba(248,241,228,.65); }
      .cc-reply-meta b { color: var(--ai-gold-bright,#FFE159); }
      .cc-reply-text { font-size: 12px; color: rgba(248,241,228,.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cc-reply-x { background: none; border: 0; color: rgba(248,241,228,.6); font-size: 14px; cursor: pointer; }
      .cc-reply-x:hover { color: #FFE9A8; }

      /* DM badge */
      .cc-dm-badge {
        display: inline-block;
        background: rgba(255,225,89,.18);
        color: #FFE9A8;
        font-family: var(--font-mono); font-size: 8.5px; letter-spacing: .14em;
        padding: 1px 5px; border-radius: 4px;
      }

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

  /* ============ Avatar broadcast =============
     When a pilot uploads a new profile picture, the upload handler in
     portal.js hands us the publicly-hosted URL (from /api/avatar →
     Catbox). We emit an encrypted `avatar_set` event over the same
     ntfy channel; every other browser updates its local crew_avatars
     map and re-renders chat + crew list with the new image. URL is
     ~80 chars so it fits well within ntfy's body limit. */
  function broadcastAvatar(pilotId, url) {
    const p = pilot();
    if (!p || !pilotId) return;
    const msg = {
      id: (Date.now().toString(36) + Math.random().toString(36).slice(2,6)),
      ts: Date.now(),
      type: 'avatar_set',
      pilotId,
      url: url || null,        // null = removal
    };
    rememberSeen(msg.id);
    if (channel) { try { channel.postMessage({ kind: 'msg', msg }); } catch {} }
    relayPublish(msg);
  }
  function applyAvatarSet(msg) {
    if (!msg?.pilotId) return;
    try {
      const avatars = AIVA.Store?.get?.('crew_avatars', {}) || {};
      if (msg.url) avatars[msg.pilotId] = msg.url;
      else delete avatars[msg.pilotId];
      AIVA.Store?.set?.('crew_avatars', avatars);
    } catch {}
    /* Re-fire listeners with a synthetic event so UIs re-render. */
    listeners.forEach(cb => { try { cb({ type:'avatar_set', pilotId: msg.pilotId }, readLog()); } catch(_){} });
  }

  return {
    mount, send, event, online, onMessage, clear, react,
    broadcastAvatar,
    relayState: () => relayState,
    setTopic: (t) => {
      try { AIVA.Store.set('crew_chat_topic', t); } catch {}
      relayConnect();
    },
  };
})();
