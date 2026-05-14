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
     party calls. */
  function proxy(url) {
    const custom = (AIVA.Store?.get?.('hoppie_proxy', '') || '').trim();
    const base = custom || 'https://corsproxy.io/?';
    return base + encodeURIComponent(url);
  }

  /* ============================================================
     SimBrief — pull the latest OFP for a configured username.
     Endpoint returns XML; we extract just what we need.
     ============================================================ */
  async function fetchSimbriefOFP(username) {
    if (!username) throw new Error('No SimBrief username set in Profile');
    const url = `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}`;
    const r = await fetch(proxy(url));
    if (!r.ok) throw new Error('SimBrief fetch HTTP ' + r.status);
    const xml = await r.text();
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
    proxy,
    fetchSimbriefOFP, parseSimbriefXML,
    fetchMETAR, scoreSeverity,
    preflightPack, arrivalGate, goodbye, weatherWarning,
  };
})();
