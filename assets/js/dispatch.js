/* =====================================================================
   AIVA — Dispatch services
   • SimBrief OFP XML fetcher (via CORS proxy)
   • aviationweather.gov METAR/TAF fetcher
   • Weather-severity classifier
   • Templated message builders for Hoppie auto-send
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.Dispatch = (() => {

  /* CORS proxy used for everything that doesn't allow cross-origin reads.
     Reads `hoppie_proxy` from store so the user's choice covers all third-
     party calls. Returns a SINGLE proxy URL — use proxyList() when you
     want to try multiple. */
  function proxy(url) {
    const custom = (AIVA.Store?.get?.('hoppie_proxy', '') || '').trim();
    const base = custom || 'https://corsproxy.io/?';
    return base + encodeURIComponent(url);
  }

  /* Ordered list of public CORS proxies. corsproxy.io intermittently
     returns 403 (rate-limit / abuse blocklist), so we fall through to
     alternates. The pilot's custom `hoppie_proxy` (if any) is tried
     FIRST so they can override entirely. */
  function proxyList(url) {
    const enc = encodeURIComponent(url);
    const custom = (AIVA.Store?.get?.('hoppie_proxy', '') || '').trim();
    const list = [];
    if (custom) list.push(custom + enc);
    /* ALL proxies must receive the target URL ENCODED — otherwise the
       `&` between Hoppie query params (from=, to=, type=, packet=) gets
       interpreted by the proxy as its OWN param separator, stripping
       everything after `logon`. Hoppie then responds
       `error {no from address}` which is exactly the bug pilots hit
       when corsproxy.io rate-limited and the chain fell through to
       codetabs/thingproxy with the raw URL. */
    list.push(
      'https://corsproxy.io/?' + enc,
      'https://api.allorigins.win/raw?url=' + enc,
      'https://api.codetabs.com/v1/proxy?quest=' + enc,
      'https://thingproxy.freeboard.io/fetch/' + enc,
    );
    return list;
  }

  /* Try a fetch through each proxy in order. Returns the first response
     with HTTP 2xx; throws with the last status if all fail. Useful for
     SimBrief / weather endpoints that block direct CORS. */
  async function fetchViaProxies(url, opts = {}) {
    const proxies = proxyList(url);
    let lastErr = null;
    for (const p of proxies) {
      try {
        const r = await fetch(p, opts);
        if (r.ok) return r;
        lastErr = new Error('HTTP ' + r.status);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('all proxies failed');
  }

  /* ============================================================
     SimBrief — pull the latest OFP for a configured username.
     Fetch order:
       1. AIVA's own /api/simbrief (server-side fetch on Vercel —
          fastest, no proxy, no CORS, ~300-800 ms typical).
       2. Public CORS proxy chain as fallback if our function is
          unreachable (Vercel cold start, deploy in progress, etc).
     Endpoint returns XML; we extract just what we need.
     ============================================================ */
  async function fetchSimbriefOFP(username) {
    if (!username) throw new Error('No SimBrief username set in Profile');

    /* === Fast path: AIVA's Vercel function === */
    try {
      const aiva = await fetch(`/api/simbrief?username=${encodeURIComponent(username)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (aiva.ok) {
        const xml = await aiva.text();
        if (xml && xml.length > 200 && !/<error>/i.test(xml)) {
          return parseSimbriefXML(xml);
        }
      }
      /* 404 from our function = user has no OFP — surface that
         directly without falling through to public proxies (would
         just return the same empty response). */
      if (aiva.status === 404) {
        throw new Error('SimBrief has no OFP for "' + username + '" — dispatch a flight plan at simbrief.com first');
      }
      /* Otherwise fall through to public-proxy chain below. */
    } catch (e) {
      /* If the error came from our own 404 handler, re-throw it now —
         don't waste time hitting public proxies for the same result. */
      if (/no OFP/i.test(e.message || '')) throw e;
      /* Network-level failure (Vercel cold-start, function down) — try
         the public-proxy chain as backup. */
    }

    /* === Backup path: public CORS proxies === */
    const url = `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}`;
    let r;
    try {
      r = await fetchViaProxies(url);
    } catch (e) {
      throw new Error('SimBrief fetch ' + (e.message || 'failed') + ' — check username + try again, or set a custom proxy in Profile');
    }
    const xml = await r.text();
    if (!xml || xml.length < 200 || /<error>/i.test(xml)) {
      throw new Error('SimBrief returned no OFP for "' + username + '" — dispatch a flight plan at simbrief.com first');
    }
    return parseSimbriefXML(xml);
  }

  function parseSimbriefXML(xml) {
    const get = (tag) => {
      const m = xml.match(new RegExp('<' + tag + '>([^<]+)</' + tag + '>', 'i'));
      return m ? m[1].trim() : null;
    };
    /* SimBrief XML schema: top-level <general>, <origin>, <destination>,
       <weights>, <fuel>, <times>, <atc> etc. */
    const out = {
      callsign:   get('atc_callsign')   || get('callsign'),
      icaoAirl:   get('icao_airline'),
      flightNo:   get('flight_number'),
      origin:     get('icao_code'),            // first match within <origin>
      destination:null,                         // populated below
      altDest:    null,
      acType:     get('icao'),
      acReg:      get('reg'),
      paxCount:   get('pax_count'),
      paxCountActual: get('pax_count_actual'),
      cargo:      get('cargo'),
      zfw:        get('est_zfw'),
      tow:        get('est_tow'),
      ldw:        get('est_ldw'),
      blockFuel:  get('plan_ramp'),
      tripFuel:   get('enroute_burn'),
      reserveFuel:get('reserve'),
      taxiFuel:   get('taxi'),
      etd:        get('sched_out'),
      eta:        get('sched_in'),
      route:      get('route'),
      cruiseFL:   get('initial_altitude'),
      mach:       get('cruise_mach'),
      time:       get('est_time_enroute'),
      raw:        xml,
    };
    /* Find the destination ICAO (second occurrence of icao_code, inside <destination>) */
    const destBlock = xml.match(/<destination>[\s\S]*?<\/destination>/i);
    if (destBlock) {
      const m = destBlock[0].match(/<icao_code>([^<]+)<\/icao_code>/i);
      if (m) out.destination = m[1].trim();
    }
    const altBlock = xml.match(/<alternate>[\s\S]*?<\/alternate>/i);
    if (altBlock) {
      const m = altBlock[0].match(/<icao_code>([^<]+)<\/icao_code>/i);
      if (m) out.altDest = m[1].trim();
    }
    return out;
  }

  /* ============================================================
     METAR / TAF — aviationweather.gov public JSON endpoint.
     Returns the raw METAR string plus a severity classifier.
     ============================================================ */
  async function fetchMETAR(icao) {
    if (!icao) throw new Error('Need ICAO');
    const url = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json&taf=false`;
    const r = await fetch(proxy(url));
    if (!r.ok) throw new Error('METAR fetch HTTP ' + r.status);
    const arr = await r.json();
    if (!arr.length) return null;
    const m = arr[0];
    return {
      icao,
      raw: m.rawOb || m.raw_text || '',
      temp: m.temp, dewp: m.dewp,
      wind: { dir: m.wdir, speed: m.wspd, gust: m.wgst },
      visibility: m.visib,
      altim: m.altim,
      ceiling: extractCeiling(m.rawOb || ''),
      severity: scoreSeverity(m),
      report: m,
    };
  }

  /* Parse "BKN012" / "OVC008" lowest broken/overcast layer from raw METAR */
  function extractCeiling(raw) {
    const m = raw.match(/\b(BKN|OVC)(\d{3})\b/);
    return m ? parseInt(m[2], 10) * 100 : null;
  }

  /* Quick severity classifier:
       OK            wind <25 kt, vis >5 SM, ceiling >2500'
       CAUTION       wind 25-34 kt OR vis 3-5 SM OR ceiling 1500-2500
       WARNING       wind 35-50 kt OR vis 1-3 SM OR ceiling 500-1500 OR TS OR FZ
       SEVERE        wind >50 kt OR vis <1 SM OR ceiling <500 OR GR/+TS/+SN     */
  function scoreSeverity(m) {
    const raw = (m.rawOb || '').toUpperCase();
    const wind  = +m.wspd || 0, gust = +m.wgst || 0, vis = +m.visib || 99;
    const ceil  = extractCeiling(raw);
    let level = 'OK', reasons = [];

    if (gust >= 35 || wind >= 35) { level = 'WARNING'; reasons.push(`wind ${wind}G${gust}`); }
    if (vis < 3)                  { level = 'WARNING'; reasons.push(`vis ${vis} SM`); }
    if (ceil != null && ceil < 1500) { level = 'WARNING'; reasons.push(`ceiling ${ceil}'`); }
    if (/\bTS\b/.test(raw))       { level = 'WARNING'; reasons.push('thunderstorm'); }
    if (/\bFZ/.test(raw))         { level = 'WARNING'; reasons.push('freezing precip'); }

    if (gust >= 50 || wind >= 50) { level = 'SEVERE'; }
    if (vis < 1)                  { level = 'SEVERE'; }
    if (ceil != null && ceil < 500) { level = 'SEVERE'; }
    if (/\+TS|\bGR\b/.test(raw))  { level = 'SEVERE'; }

    if (level === 'OK' && (wind >= 25 || vis < 5 || (ceil != null && ceil < 2500))) {
      level = 'CAUTION';
      if (wind >= 25) reasons.push(`wind ${wind}G${gust}`);
      if (vis < 5)    reasons.push(`vis ${vis} SM`);
      if (ceil != null && ceil < 2500) reasons.push(`ceiling ${ceil}'`);
    }
    return { level, reasons: reasons.length ? reasons : ['nominal'] };
  }

  /* ============================================================
     Templated Hoppie messages.
     These return the BODY string. Caller sends via the Hoppie module.
     ============================================================ */
  function preflightPack(ofp) {
    if (!ofp) return null;
    return [
      `PREFLIGHT PACK · ${ofp.callsign || ofp.flightNo || 'flight'}`,
      `RTE  ${ofp.origin}-${ofp.destination}  ${ofp.acType}/${ofp.acReg || '—'}`,
      `PAX  ${ofp.paxCount || '?'}  CARGO ${ofp.cargo || 0} KG`,
      `ZFW  ${ofp.zfw || '?'}  TOW ${ofp.tow || '?'}  LDW ${ofp.ldw || '?'}`,
      `FUEL  BLK ${ofp.blockFuel || '?'}  TRIP ${ofp.tripFuel || '?'}  RES ${ofp.reserveFuel || '?'}  TAXI ${ofp.taxiFuel || '?'}`,
      `CRZ  FL${ofp.cruiseFL?.replace(/^FL?/i,'') || '?'}  M${ofp.mach || '?'}  ${ofp.time || '?'}`,
      `ROUTE ${(ofp.route || '').slice(0, 240)}`,
    ].join('\n');
  }

  function arrivalGate(airportCode, aircraftType, pilotFirstName) {
    const gate = AIVA.pickGate(airportCode, aircraftType);
    if (!gate) return null;
    const ap = AIVA.airport(airportCode);
    return [
      `ARR INFO · ${airportCode} (${ap?.icao || ''})`,
      `GATE  ${gate}`,
      `ACTYPE ${aircraftType} · ${AIVA.acSize(aircraftType).toUpperCase()} STAND`,
      pilotFirstName ? `Welcome to ${ap?.city || airportCode}, Capt ${pilotFirstName}.` : `Welcome to ${ap?.city || airportCode}.`,
    ].join('\n');
  }

  function goodbye(pilotFirstName, airportCode) {
    const ap = AIVA.airport(airportCode);
    return [
      `OPS · ON-BLOCKS`,
      `Goodbye Capt ${pilotFirstName || ''}.`,
      `Sector closed at ${ap?.city || airportCode}. Safe rest.`,
    ].join('\n');
  }

  function weatherWarning(icao, wx) {
    return [
      `MET ALERT · ${icao} · ${wx.severity.level}`,
      `Issues: ${wx.severity.reasons.join(' · ')}`,
      `Raw: ${wx.raw}`,
    ].join('\n');
  }

  return {
    proxy, proxyList, fetchViaProxies,
    fetchSimbriefOFP, parseSimbriefXML,
    fetchMETAR, scoreSeverity,
    preflightPack, arrivalGate, goodbye, weatherWarning,
  };
})();
