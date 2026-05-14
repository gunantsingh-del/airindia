/* =====================================================================
   AIVA — AI.g (Air India customer-care assistant)
   Modelled on airindia.com's chat agent. Sits separately from the
   Maharaja flight-ops chat — AI.g handles passenger-side topics like
   bookings, baggage, check-in, status, Maharaja Club.
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.AIG = (() => {

  const AIG_AVATAR = 'assets/img/aig-avatar.png?v=20260513n';

  /* Topic taxonomy mirrors airindia.com chatbot's quick actions */
  const QUICK_ACTIONS = [
    { id:'booking',  label:'New Booking',     icon:'plus' },
    { id:'modify',   label:'Modify Booking',  icon:'edit',     chip:'NEW' },
    { id:'checkin',  label:'Check In',        icon:'check' },
    { id:'baggage',  label:'Baggage Allowance',icon:'briefcase' },
    { id:'status',   label:'Flight Status',   icon:'plane' },
  ];

  const SKILLS = [
    'Assist with any special needs while travelling',
    'Raise a request to add your Maharaja Club number to your booking',
    'Help with web check-in and seat selection',
    'Explain fare rules and ticket changes',
    'Track baggage in case of mishandling',
    'Provide visa & document guidance for the destination',
  ];

  /* Topic → multi-step canned reply (since this is a demo) */
  const REPLIES = {
    booking:  'Sure — to book a new flight: tap **Book Roster** in the portal, then **Search & Book**. Use the airport search or click any pin on the globe. Need real customer service? Reach Air India at **+91 2462 17777** or visit **airindia.com/booking**.',
    modify:   'Modify Booking is available on the **airindia.com** booking management page or via the **myAirIndia** app. You\'ll need your PNR + last name. For complex changes (cabin upgrade, date change penalties), I recommend the call centre at +91 2462 17777.',
    checkin:  'Web check-in opens **48 hours** before departure on airindia.com and the myAirIndia app. International flights: complete advance passenger info first. Need to add SSR (wheelchair, special meal, infant)? — Use **Modify Booking** before check-in.',
    baggage:  'Baggage allowance depends on your fare class and route. As a rough guide:\n• **Domestic India** — Economy 15 kg, Premium Economy 25 kg, Business 35 kg (checked) + 8 kg cabin\n• **International (most)** — Economy 23 kg × 2 pcs, Premium 32 kg × 2, Business 32 kg × 2 + 10 kg cabin\nUSA/Canada routes use piece-concept. Confirm exact allowance on your PNR.',
    status:   'You can check live flight status on **airindia.com/flight-status** with the flight number + date. The Maharaja crew assistant inside this portal also tracks every flight you\'re rostered on under **My Roster**.',
    fares:    'Air India\'s fare families: **Light** (cheapest, no checked bag, non-refundable), **Comfort** (1 bag, low change fee), **Flexible** (refundable, free changes). Premium cabins always include full baggage + lounge.',
    visa:     'Visa requirements depend on passport + destination. I recommend **iVisa** or the destination country\'s embassy site. India\'s Bureau of Immigration also publishes the latest entry rules at **boi.gov.in**.',
    maharaja: 'The **Maharaja Club** is Air India\'s loyalty programme — earn points on flights and 100+ partner brands. Tiers: Silver → Gold → Platinum. Add your number to a booking via Modify Booking, or call +91 2462 17777.',
    contact:  'You can reach Air India\'s customer care:\n• **Call centre**: +91 2462 17777 (24×7)\n• **WhatsApp**: +91 99300 22222\n• **Email**: contactus@airindia.com\n• **In person**: any AI airport counter',
    default:  'I can help with **bookings**, **check-in**, **baggage**, **flight status**, **Maharaja Club**, **visa info**, and contacting Air India. Try one of the quick actions or ask me a question in the box below.',
  };

  function topicFor(text) {
    const q = (text || '').toLowerCase();
    if (/\b(book|fly to|ticket|reserve)\b/.test(q))                  return 'booking';
    if (/\b(modif|change|cancel|reschedule|date change)\b/.test(q))  return 'modify';
    if (/\b(check[ -]?in|seat|boarding pass)\b/.test(q))             return 'checkin';
    if (/\b(bag|baggage|luggage|allowance|carry[ -]?on|cabin bag)\b/.test(q)) return 'baggage';
    if (/\b(status|delay|on time|arrived|departure time)\b/.test(q)) return 'status';
    if (/\b(fare|class|economy|business|premium|refund)\b/.test(q))  return 'fares';
    if (/\b(visa|passport|document|entry|immigration)\b/.test(q))    return 'visa';
    if (/\b(maharaja|loyalty|miles|points|tier)\b/.test(q))          return 'maharaja';
    if (/\b(contact|call|phone|email|whatsapp|support|help)\b/.test(q)) return 'contact';
    return 'default';
  }

  function reply(text) {
    return REPLIES[topicFor(text)] || REPLIES.default;
  }

  let host, openBtn, body;

  function mount() {
    if (document.getElementById('aig-launcher')) return;

    /* Floating launcher — sits to the LEFT of the Maharaja launcher */
    openBtn = document.createElement('button');
    openBtn.id = 'aig-launcher';
    openBtn.className = 'aig-launcher';
    openBtn.innerHTML = `<img src="${AIG_AVATAR}" alt="AI.g"/>`;
    openBtn.setAttribute('aria-label','Open AI.g customer-care chat');
    document.body.appendChild(openBtn);

    host = document.createElement('aside');
    host.className = 'aig-panel';
    host.innerHTML = `
      <header class="aig-head">
        <div class="aig-avatar"><img src="${AIG_AVATAR}" alt="AI.g"/></div>
        <div class="aig-greeting">
          <div class="aig-hello">Hello I'm AI.g</div>
          <div class="aig-sub">How may I help you today?</div>
        </div>
        <a class="aig-whatsapp" href="https://wa.me/919930022222" target="_blank" rel="noopener" aria-label="Connect on WhatsApp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16 8.5a8 8 0 11-8-8 8 8 0 018 8z" stroke="#25D366" stroke-width="2"/><path d="M16 14l-2.5-1.2a1.5 1.5 0 00-1.5.2l-.6.5a4 4 0 01-2.4-2.4l.5-.6a1.5 1.5 0 00.2-1.5L8.5 6.5" stroke="#25D366" stroke-width="2" stroke-linecap="round"/></svg>
          <span>Connect on WhatsApp</span>
        </a>
        <button class="aig-min" aria-label="Minimize">–</button>
        <button class="aig-close" aria-label="Close">✕</button>
      </header>

      <div class="aig-body" id="aigBody">
        <div class="aig-intro">Choose one of the quick options below or type your question.</div>

        <div class="aig-quick" id="aigQuick">
          ${QUICK_ACTIONS.map(a => `
            <button class="aig-quick-row" data-action="${a.id}">
              <span class="aig-quick-ico">${AIVA.Icon ? AIVA.Icon(a.icon, 18) : ''}</span>
              <span class="aig-quick-lbl">${a.label}${a.chip ? `<span class="aig-chip">${a.chip}</span>` : ''}</span>
              <span class="aig-quick-arrow">›</span>
            </button>
          `).join('')}
        </div>

        <div class="aig-skill">
          <div class="aig-skill-head">
            <span class="aig-skill-ico">⚙</span>
            <span class="aig-skill-title">Skill Spotlight</span>
          </div>
          <div class="aig-skill-sub">Do you know I can help you to..</div>
          ${SKILLS.map(s => `
            <button class="aig-skill-row" data-skill>${s} <span class="aig-quick-arrow">›</span></button>
          `).join('')}
        </div>
      </div>

      <form class="aig-form" id="aigForm">
        <button type="button" class="aig-menu" aria-label="More">≡</button>
        <input id="aigInput" class="aig-input" placeholder="Type your question here..." autocomplete="off">
        <button class="aig-send" type="submit" aria-label="Send">➤</button>
      </form>

      <footer class="aig-foot">
        <a>MY SKILLS</a><a>T&C</a><a>FEEDBACK</a>
      </footer>
    `;
    document.body.appendChild(host);

    body = host.querySelector('#aigBody');
    const input = host.querySelector('#aigInput');

    /* Open / close */
    const open  = () => { host.classList.add('open');  openBtn.classList.add('hidden'); };
    const close = () => { host.classList.remove('open'); openBtn.classList.remove('hidden'); };
    openBtn.onclick = open;
    host.querySelector('.aig-close').onclick = close;
    host.querySelector('.aig-min').onclick = close;

    /* Quick action rows → swap to chat thread */
    host.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.action;
        const lbl = QUICK_ACTIONS.find(a => a.id === id)?.label;
        switchToChat();
        addMsg('user', lbl);
        setTimeout(() => addMsg('bot', REPLIES[id] || REPLIES.default), 250);
      };
    });
    host.querySelectorAll('[data-skill]').forEach(btn => {
      btn.onclick = () => {
        const txt = btn.textContent.replace('›', '').trim();
        switchToChat();
        addMsg('user', txt);
        setTimeout(() => addMsg('bot', reply(txt)), 250);
      };
    });

    /* Free-form input */
    host.querySelector('#aigForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      switchToChat();
      addMsg('user', q);
      input.value = '';
      setTimeout(() => addMsg('bot', reply(q)), 280);
    });
  }

  /* Convert the quick-action homescreen into a scrolling chat thread */
  let inChatMode = false;
  function switchToChat() {
    if (inChatMode) return;
    inChatMode = true;
    body.innerHTML = `<div class="aig-thread" id="aigThread"></div>`;
  }
  function addMsg(role, text) {
    if (!inChatMode) switchToChat();
    const thread = body.querySelector('#aigThread');
    const b = document.createElement('div');
    b.className = `aig-bubble aig-${role}`;
    b.innerHTML = text.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
    thread.appendChild(b);
    thread.scrollTop = thread.scrollHeight;
  }

  return { mount, open: () => host?.classList.add('open') };
})();

/* Inject AI.g styles */
(function injectAigCSS() {
  if (document.getElementById('aig-style')) return;
  const css = `
    .aig-launcher {
      position: fixed; right: 100px; bottom: 22px;
      width: 56px; height: 56px;
      border-radius: 50%;
      background: #FFFFFF;
      border: 2px solid #DA192F;
      box-shadow: 0 10px 30px rgba(218,25,47,.3);
      cursor: pointer;
      z-index: 9000;
      padding: 2px;
      overflow: hidden;
      transition: transform .15s ease;
    }
    .aig-launcher:hover { transform: scale(1.05); }
    .aig-launcher.hidden { display: none; }
    .aig-launcher img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }

    .aig-panel {
      position: fixed; right: 22px; bottom: 22px;
      width: 380px; max-width: 92vw;
      height: 620px; max-height: 84vh;
      background: #FFFFFF;
      border-radius: 22px;
      box-shadow: 0 28px 80px rgba(0,0,0,.45);
      z-index: 9100;
      display: flex; flex-direction: column;
      overflow: hidden;
      transform: translateY(20px) scale(.97); opacity: 0;
      pointer-events: none;
      transition: all .25s cubic-bezier(.2,.7,.2,1);
      color: #1A0F12;
    }
    .aig-panel.open { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }

    .aig-head {
      background: linear-gradient(180deg, #DA192F 0%, #B30E22 100%);
      color: #FFFFFF;
      padding: 22px 18px 16px;
      display: grid;
      grid-template-columns: 70px 1fr auto auto;
      gap: 10px;
      align-items: center;
      position: relative;
    }
    .aig-avatar {
      width: 64px; height: 64px;
      border-radius: 50%;
      overflow: hidden;
      background: #FFFFFF;
      border: 3px solid #FFFFFF;
      grid-row: span 2;
    }
    .aig-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .aig-greeting { grid-column: 2 / 3; grid-row: 1 / 3; }
    .aig-hello { font-family: var(--font-display); font-size: 22px; font-weight: 700; line-height: 1.1; }
    .aig-sub   { font-size: 12.5px; opacity: .92; margin-top: 4px; }
    .aig-min, .aig-close {
      width: 28px; height: 28px;
      background: rgba(255,255,255,.18);
      border: 0; border-radius: 6px;
      color: #FFFFFF; font-size: 14px;
      cursor: pointer;
      display: grid; place-items: center;
    }
    .aig-min:hover, .aig-close:hover { background: rgba(255,255,255,.32); }

    .aig-whatsapp {
      grid-column: 1 / -1;
      display: inline-flex; align-items: center; gap: 8px;
      justify-self: center;
      margin-top: 12px;
      padding: 8px 16px;
      background: #FFFFFF;
      color: #1A0F12;
      border-radius: 99px;
      font-size: 13px; font-weight: 600;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(0,0,0,.18);
    }
    .aig-whatsapp:hover { background: #F8F1E4; }

    .aig-body {
      flex: 1; overflow-y: auto;
      background: #F8F4ED;
      padding: 14px;
    }
    .aig-intro {
      padding: 12px 14px;
      background: #FFFFFF;
      border-radius: 12px;
      font-size: 13px;
      color: #1A0F12;
      margin-bottom: 12px;
    }
    .aig-quick {
      background: #FFFFFF;
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 14px;
    }
    .aig-quick-row {
      display: flex; align-items: center; gap: 14px;
      width: 100%;
      padding: 14px 16px;
      background: transparent;
      border: 0; border-bottom: 1px solid rgba(20,16,18,.06);
      text-align: left; cursor: pointer;
      color: #1A0F12; font-size: 14px;
    }
    .aig-quick-row:last-child { border-bottom: 0; }
    .aig-quick-row:hover { background: #FBF5EC; }
    .aig-quick-ico {
      width: 28px; height: 28px;
      color: #DA192F;
      display: grid; place-items: center;
    }
    .aig-quick-lbl { flex: 1; font-weight: 600; }
    .aig-chip {
      display: inline-block;
      margin-left: 8px;
      padding: 2px 8px;
      background: #DA192F;
      color: #FFFFFF;
      border-radius: 6px;
      font-size: 10px; letter-spacing: .08em;
      font-weight: 700;
    }
    .aig-quick-arrow { color: rgba(26,15,18,.4); font-size: 16px; }

    .aig-skill {
      background: #FFFFFF;
      border-radius: 14px;
      padding: 14px 16px 10px;
    }
    .aig-skill-head {
      display: flex; align-items: center; gap: 8px;
      color: #DA192F; font-weight: 700; font-size: 14px;
    }
    .aig-skill-ico {
      display: grid; place-items: center;
      width: 22px; height: 22px;
      background: rgba(218,25,47,.08);
      border-radius: 50%; font-size: 12px;
    }
    .aig-skill-sub {
      font-size: 12px; color: rgba(26,15,18,.6);
      margin: 6px 0 10px;
    }
    .aig-skill-row {
      display: flex; align-items: center;
      width: 100%;
      padding: 11px 0;
      background: transparent;
      border: 0; border-top: 1px solid rgba(20,16,18,.06);
      text-align: left; cursor: pointer;
      color: #1A0F12; font-size: 13px;
      gap: 10px;
    }
    .aig-skill-row .aig-quick-arrow { margin-left: auto; }
    .aig-skill-row:hover { color: #DA192F; }

    .aig-thread {
      display: flex; flex-direction: column;
      gap: 10px;
      padding: 0;
    }
    .aig-bubble {
      max-width: 86%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 13.5px; line-height: 1.5;
    }
    .aig-bubble b { color: #DA192F; }
    .aig-bot {
      align-self: flex-start;
      background: #FFFFFF;
      color: #1A0F12;
      border-top-left-radius: 4px;
      box-shadow: 0 1px 2px rgba(0,0,0,.04);
    }
    .aig-user {
      align-self: flex-end;
      background: #DA192F;
      color: #FFFFFF;
      border-top-right-radius: 4px;
    }

    .aig-form {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 12px;
      background: #FFFFFF;
      border-top: 1px solid rgba(20,16,18,.08);
    }
    .aig-menu, .aig-send {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: transparent;
      border: 0; cursor: pointer;
      display: grid; place-items: center;
      color: #DA192F; font-size: 16px;
    }
    .aig-send { background: #F8E0E2; }
    .aig-send:hover { background: #DA192F; color: #FFFFFF; }
    .aig-input {
      flex: 1; padding: 10px 14px;
      background: #F8F4ED;
      border: 0; border-radius: 99px;
      font-size: 13.5px;
      color: #1A0F12;
      outline: none;
    }
    .aig-input::placeholder { color: rgba(26,15,18,.4); }

    .aig-foot {
      display: flex; justify-content: center; gap: 24px;
      padding: 10px;
      background: #FFFFFF;
      border-top: 1px solid rgba(20,16,18,.06);
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: .14em;
      color: #DA192F;
    }
    .aig-foot a { cursor: pointer; }
    .aig-foot a:hover { text-decoration: underline; }

    @media (max-width: 480px) {
      .aig-launcher { right: 88px; bottom: 18px; width: 50px; height: 50px; }
      .aig-panel { right: 12px; left: 12px; width: auto; height: 80vh; bottom: 14px; }
    }
  `;
  const s = document.createElement('style'); s.id = 'aig-style'; s.textContent = css;
  document.head.appendChild(s);
})();
