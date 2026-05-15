/* =====================================================================
   AIVA — Network Globe (Mapbox/MapLibre style, Canada VA inspired)
   • Black space background, dark land, faint country outlines + names
   • Red airport pins with hover/click
   • Click an airport → side panel with all flights from there
   • White great-circle arcs between every served city-pair
   • Used ONLY on the Network page (not in Book Roster)
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.NetworkGlobe = (() => {

  /* Load MapLibre GL on demand from CDN. */
  let mlLoaded = null;
  function loadMapLibre() {
    if (mlLoaded) return mlLoaded;
    mlLoaded = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
      document.head.appendChild(css);

      const s = document.createElement('script');
      s.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
      s.onload = () => resolve(window.maplibregl);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return mlLoaded;
  }

  /* Great-circle line geometry between two lat/lons (in [lon,lat] GeoJSON order) */
  function arcLine(la1, lo1, la2, lo2, n = 64) {
    const r = Math.PI / 180;
    const φ1 = la1 * r, λ1 = lo1 * r, φ2 = la2 * r, λ2 = lo2 * r;
    const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2-φ1)/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin((λ2-λ1)/2)**2));
    if (d === 0) return [[lo1, la1]];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const A = Math.sin((1-f)*d) / Math.sin(d);
      const B = Math.sin(f*d)     / Math.sin(d);
      const x = A*Math.cos(φ1)*Math.cos(λ1) + B*Math.cos(φ2)*Math.cos(λ2);
      const y = A*Math.cos(φ1)*Math.sin(λ1) + B*Math.cos(φ2)*Math.sin(λ2);
      const z = A*Math.sin(φ1)               + B*Math.sin(φ2);
      pts.push([Math.atan2(y, x) / r, Math.atan2(z, Math.sqrt(x*x+y*y)) / r]);
    }
    return pts;
  }

  async function render(hostId, opts = {}) {
    const ml = await loadMapLibre();
    const host = document.getElementById(hostId);
    if (!host) return null;
    host.innerHTML = '';

    /* Dark style: vector tiles from Carto (no key needed). Has labels for countries. */
    const styleUrl = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

    /* Find the pilot's base for default center */
    const me = AIVA.Auth?.currentPilot?.();
    const baseAp = me?.base ? AIVA.airport(me.base) : null;

    const map = new ml.Map({
      container: host,
      style: styleUrl,
      center: baseAp ? [baseAp.lon, baseAp.lat] : [77, 22],
      zoom: 2.4,
      minZoom: 1.4,
      maxZoom: 8,
      projection: 'globe',
      antialias: true,
      attributionControl: false,
    });
    map.addControl(new ml.NavigationControl({ visualizePitch: false }), 'top-right');

    /* Build dataset */
    const pairs = AIVA.uniqueRoutePairs();
    /* Dedupe undirected pairs (BOM-DEL same as DEL-BOM for the arc layer) */
    const undirSeen = new Set();
    const arcs = [];
    pairs.forEach(p => {
      const k = [p.from, p.to].sort().join('-');
      if (undirSeen.has(k)) return;
      undirSeen.add(k);
      arcs.push(p);
    });

    const arcGeo = {
      type: 'FeatureCollection',
      features: arcs.map(p => ({
        type: 'Feature',
        properties: { from: p.from, to: p.to, count: p.count },
        geometry: { type: 'LineString', coordinates: arcLine(p.fromAirport.lat, p.fromAirport.lon, p.toAirport.lat, p.toAirport.lon, 80) },
      })),
    };

    /* Airport points */
    const ports = new Map();
    AIVA.FLIGHTS.forEach(f => {
      [f.from, f.to].forEach(c => {
        if (ports.has(c)) return;
        const a = AIVA.airport(c);
        if (!a) return;
        const out = AIVA.routesFromBase(c).length;
        const inb = AIVA.routesToBase(c).length;
        ports.set(c, { ...a, out, inb, total: out + inb });
      });
    });
    const portsGeo = {
      type: 'FeatureCollection',
      features: [...ports.values()].map(p => ({
        type: 'Feature',
        properties: { code: p.iata, city: p.city, country: p.country, hub: !!p.hub, total: p.total, icao: p.icao, name: p.name },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    };

    function setupLayers() {
      if (map.getSource('arcs')) return;   // already set up
      /* setFog is a Mapbox-only API; MapLibre globe handles its own atmosphere. */

      map.addSource('arcs',  { type: 'geojson', data: arcGeo  });
      map.addSource('ports', { type: 'geojson', data: portsGeo });

      /* Arc lines — bright white, slightly transparent so the cluster doesn't blow out */
      map.addLayer({
        id: 'arcs-line',
        type: 'line',
        source: 'arcs',
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.35, 3, 0.65, 6, 1.4],
          'line-opacity': 0.55,
          'line-blur': 0.4,
        },
      });

      /* Outer red halo on every airport */
      map.addLayer({
        id: 'ports-halo',
        type: 'circle',
        source: 'ports',
        paint: {
          'circle-radius':       ['case', ['get','hub'], 10, 5],
          'circle-color':        '#DA192F',
          'circle-opacity':      0.18,
          'circle-stroke-color': '#DA192F',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.55,
        },
      });
      /* Inner red dot */
      map.addLayer({
        id: 'ports-dot',
        type: 'circle',
        source: 'ports',
        paint: {
          'circle-radius':       ['case', ['get','hub'], 6, 3.5],
          'circle-color':        '#FFFFFF',
          'circle-stroke-color': '#DA192F',
          'circle-stroke-width': 2,
        },
      });
      /* Labels for hubs only at lower zooms; all airports at high zoom */
      map.addLayer({
        id: 'ports-label',
        type: 'symbol',
        source: 'ports',
        layout: {
          'text-field': ['get', 'code'],
          'text-font': ['Open Sans Semibold','Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 9, 4, 11, 6, 13],
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'visibility': 'visible',
        },
        paint: {
          'text-color': '#F8F1E4',
          'text-halo-color': 'rgba(8,5,7,.9)',
          'text-halo-width': 1.5,
        },
        filter: ['any',
          ['==', ['get','hub'], true],
          ['>', ['zoom'], 3.5],
        ],
      });

      /* Cursor + popup on hover */
      map.on('mouseenter', 'ports-dot',  () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'ports-dot',  () => map.getCanvas().style.cursor = '');
      let hoverPopup = null;
      map.on('mousemove', 'ports-dot', (e) => {
        if (hoverPopup) hoverPopup.remove();
        const p = e.features[0].properties;
        hoverPopup = new ml.Popup({ closeButton: false, className: 'aiva-popup', offset: 14 })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<b>${p.code}</b> · ${p.city}<br><span class="aiva-popup-sub">${p.total} flights · ${p.icao}</span>`)
          .addTo(map);
      });
      map.on('mouseleave', 'ports-dot', () => { hoverPopup?.remove(); hoverPopup = null; });

      /* Click → side panel (or onPickOverride if set, used by Book Roster) */
      map.on('click', 'ports-dot', (e) => {
        const p = e.features[0].properties;
        if (typeof AIVA.NetworkGlobe._onPickOverride === 'function') {
          AIVA.NetworkGlobe._onPickOverride(p.code);
        } else {
          showSidePanel(p.code);
        }
        focusAirport(p.code);
      });

      /* Empty-map click anywhere else → reset filter */
      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['ports-dot'] });
        if (!features.length) resetFocus();
      });
    }

    /* Show only arcs that touch the focused airport. Other arcs go very faint
       (kept rendered so the user has spatial context but visually de-emphasised). */
    function focusAirport(code) {
      if (!map.getLayer('arcs-line')) return;
      map.setFilter('arcs-line', ['any', ['==', ['get','from'], code], ['==', ['get','to'], code]]);
      /* Also dim non-related ports */
      if (map.getLayer('ports-dot')) {
        map.setPaintProperty('ports-dot', 'circle-opacity',
          ['case',
            ['==', ['get','code'], code], 1.0,
            ['any',
              ['in', ['get','code'], ['literal', neighborsOf(code)]],
              false
            ], 0.85,
            0.18
          ]);
      }
      AIVA.NetworkGlobe._focused = code;
    }
    function resetFocus() {
      if (!map.getLayer('arcs-line')) return;
      map.setFilter('arcs-line', null);
      if (map.getLayer('ports-dot')) {
        map.setPaintProperty('ports-dot', 'circle-opacity', 1.0);
      }
      AIVA.NetworkGlobe._focused = null;
    }
    function neighborsOf(code) {
      return [...new Set([
        ...AIVA.FLIGHTS.filter(f => f.from === code).map(f => f.to),
        ...AIVA.FLIGHTS.filter(f => f.to   === code).map(f => f.from),
      ])];
    }

    /* Robust setup: try multiple events + a timer fallback. */
    function tryRunSetup(reason) {
      try {
        if (!map.getSource || typeof map.getStyle !== 'function') return;
        if (!map.getStyle()) return;
        setupLayers();
      } catch (err) {
        console.warn('[NetworkGlobe] setupLayers via ' + reason + ' failed:', err);
      }
    }
    map.on('load',       () => tryRunSetup('load'));
    map.on('style.load', () => tryRunSetup('style.load'));
    map.on('idle',       () => tryRunSetup('idle'));
    /* Belt: poll for up to 8 s in case events misfire */
    const poll = setInterval(() => {
      if (map.getSource && map.getSource('arcs')) { clearInterval(poll); return; }
      if (map.isStyleLoaded?.()) { tryRunSetup('poll'); }
    }, 400);
    setTimeout(() => clearInterval(poll), 8000);

    /* === Side panel === */
    let sideEl = null;
    function showSidePanel(code) {
      const a = AIVA.airport(code);
      const out = AIVA.FLIGHTS.filter(f => f.from === code).sort((x,y) => x.dep.localeCompare(y.dep));
      const inb = AIVA.FLIGHTS.filter(f => f.to   === code).sort((x,y) => x.dep.localeCompare(y.dep));

      if (!sideEl) {
        sideEl = document.createElement('aside');
        sideEl.className = 'ng-side';
        host.appendChild(sideEl);
      }
      /* Curated city skyline / landmark photos per IATA (direct Unsplash CDN
         URLs — the old source.unsplash.com/?query endpoint was deprecated by
         Unsplash in 2024 and now silently fails). Missing keys fall back to
         a clean red-gradient header. */
      const _I = (id) => `https://images.unsplash.com/photo-${id}?w=720&h=320&fit=crop&q=80`;
      const CITY_PHOTOS = {
        /* India hubs */
        DEL:_I('1587474260584-136574528ed5'), BOM:_I('1570168007204-dfb528c6958f'),
        BLR:_I('1582719508461-905c673771fd'), CCU:_I('1558431382-27e303142255'),
        HYD:_I('1568733873715-f0e3b9b07e8c'), MAA:_I('1602216056096-3b40cc0c9944'),
        AMD:_I('1567502141261-21c1f7891b9b'), COK:_I('1583996228542-aa0f6d8b2d33'),
        CCJ:_I('1604061986761-d9d0cc41b0d1'), IXE:_I('1612296227013-ec9b1f5ce6f3'),
        TRV:_I('1593693411515-c20261bcad6e'), CNN:_I('1605369572399-05d8d64a0f30'),
        TRZ:_I('1568839755881-9e0bf3f04b1f'), TIR:_I('1605640840605-14ac1855827b'),
        ATQ:_I('1587135304313-6e3acdba6f72'), JAI:_I('1599661046827-dacde6f1c0d3'),
        IXC:_I('1610715717267-9180322ab14e'), IXR:_I('1583994067700-1eb96b9c0c3a'),
        IXB:_I('1592378479466-15c4d7ffa42b'), IXL:_I('1591025207163-942350e47db2'),
        SXR:_I('1614588928773-5e2b29bbc9c3'), IXJ:_I('1574611361840-90f12faa17d3'),
        IDR:_I('1605649461784-8a8d4a4d8888'), LKO:_I('1608445459517-4af3cc56a23a'),
        VNS:_I('1561361398-d59d4e30dcf6'),   GAU:_I('1610715717267-9180322ab14e'),
        BBI:_I('1620207419681-0c0a8be0c1f0'),
        /* UK / Europe */
        LHR:_I('1513635269975-59663e0ac1ad'), LGW:_I('1533929736458-ca588d08c8be'),
        BHX:_I('1556195994-99f3eb1f3e51'),
        CDG:_I('1502602898657-3e91760cbb34'), FRA:_I('1547548912-be0a32ef9ad2'),
        AMS:_I('1534351590666-13e3e96c5017'), VIE:_I('1516550893923-42d28e5677af'),
        MXP:_I('1520175480921-4edfa2983e0f'), FCO:_I('1531572753322-ad063cecc140'),
        /* North America */
        JFK:_I('1496442226666-8d4d0e62e6e9'), EWR:_I('1485871981521-5b1fd3805eee'),
        SFO:_I('1521747116042-5a810fda9664'), ORD:_I('1494522358652-f30e61a60313'),
        YYZ:_I('1517090504586-fde19ea6066f'), YVR:_I('1559511260-66a654ae982a'),
        /* East / SE Asia + Australia */
        NRT:_I('1542051841857-5f90071e7989'), HND:_I('1503899036084-c55cdd92da26'),
        SIN:_I('1525625293386-3f8f99389edd'), HKG:_I('1506146332389-18140dc7b2fb'),
        BKK:_I('1563492065-1a3ffe5e8da4'),    ICN:_I('1538485399081-7c8978d05fe2'),
        PVG:_I('1474181487882-5abf3f0ba6c2'),
        SYD:_I('1506973035872-a4ec16b8e8d9'), MEL:_I('1514395462725-fb4566210144'),
        /* Middle East */
        DXB:_I('1512453979798-5ea266f8880c'), DOH:_I('1539020140153-e479b8c2dc5b'),
        AUH:_I('1572252009-fe78fdf345b7'),    SHJ:_I('1567517908-c6e1c7d44dac'),
        MCT:_I('1568294159-bdf24ed29ca0'),    BAH:_I('1582719371728-5fefcef8e2bb'),
        KWI:_I('1572252009-fe78fdf345b7'),    JED:_I('1538902035000-9efb46aacd35'),
        RUH:_I('1581014149244-3edda52b88f0'), DMM:_I('1538902035000-9efb46aacd35'),
        AAN:_I('1572252009-fe78fdf345b7'),
        /* Africa / IO */
        NBO:_I('1607604276583-eef5d076aa5f'), MRU:_I('1505881502353-a1986add3762'),
        MLE:_I('1573843981267-be1999ff37cd'),
      };
      const photoURL = CITY_PHOTOS[a.iata];

      const rowHTML = (f, kind) => `
        <button class="ng-side-row" data-fno="${f.fno}" data-kind="${kind}">
          <span class="ng-arrow ${kind === 'out' ? 'ng-out' : 'ng-in'}">${kind === 'out' ? '↗' : '↙'}</span>
          <span class="mono ng-row-fno"><b>${f.fno}</b></span>
          <span class="ng-rt">${kind === 'out' ? f.to : f.from}</span>
          <span class="ng-time mono">${f.dep}</span>
          <span class="pill pill-gold" style="font-size:9.5px;">${f.ac}</span>
          <span class="ng-add" aria-label="Add to roster basket">+</span>
        </button>
      `;

      sideEl.innerHTML = `
        <div class="ng-side-photo${photoURL ? '' : ' ng-side-photo-fallback'}"${photoURL ? ` style="background-image:url('${photoURL}');"` : ''}></div>
        <header class="ng-side-head">
          <div>
            <div class="ng-side-code">${a.iata}</div>
            <div class="ng-side-name">${a.name}</div>
            <div class="ng-side-city">${a.city}${a.country !== 'India' ? ' · ' + a.country : ''}</div>
          </div>
          <button class="ng-side-close" aria-label="Close">✕</button>
        </header>
        <div class="ng-side-stats">
          <div><div class="lbl">Outbound</div><div class="val">${out.length}</div></div>
          <div><div class="lbl">Inbound</div><div class="val">${inb.length}</div></div>
          <div><div class="lbl">Routes</div><div class="val">${new Set([...out.map(f=>f.to), ...inb.map(f=>f.from)]).size}</div></div>
        </div>
        <div class="ng-side-tabs">
          <button class="ng-side-tab on" data-t="out">Departures · ${out.length}</button>
          <button class="ng-side-tab" data-t="in">Arrivals · ${inb.length}</button>
        </div>
        <div class="ng-side-list" id="ngSideList">${
          out.map(f => rowHTML(f, 'out')).join('')
        }</div>
        <div class="ng-basket-cta" id="ngBasketCta" hidden></div>
      `;
      sideEl.classList.add('open');
      sideEl.querySelector('.ng-side-close').onclick = () => sideEl.classList.remove('open');

      /* Persistent basket — lives in AIVA.Store per pilot.
         Each click on a row pushes the flight to the basket and lights up
         the "Open Search & Book" CTA at the bottom of the card. */
      const refreshBasketCTA = () => {
        const basket = AIVA.Store.get('book_basket', []);
        const cta = sideEl.querySelector('#ngBasketCta');
        if (basket.length) {
          cta.hidden = false;
          cta.innerHTML = `
            <div class="ng-basket-row">
              <span class="ng-basket-count">${basket.length} in basket</span>
              <a href="portal.html#book" class="ng-basket-btn">Open Book Roster →</a>
            </div>
          `;
        } else {
          cta.hidden = true;
        }
      };

      const wireRows = () => {
        sideEl.querySelectorAll('.ng-side-row[data-fno]').forEach(row => {
          row.onclick = () => {
            const fno = row.dataset.fno;
            const basket = AIVA.Store.get('book_basket', []);
            const exists = basket.some(b => b.fno === fno);
            if (exists) {
              AIVA.Store.set('book_basket', basket.filter(b => b.fno !== fno));
              row.classList.remove('on');
            } else {
              const f = AIVA.findFlight(fno); if (!f) return;
              basket.push({ fno: f.fno, ac: f.ac, from: f.from, to: f.to, op: f.op, ts: Date.now() });
              AIVA.Store.set('book_basket', basket);
              row.classList.add('on');
            }
            refreshBasketCTA();
            try { AIVA.U?.toast?.(exists ? `${fno} removed from basket` : `${fno} added — open Book Roster to confirm`, 'ok'); } catch {}
          };
          /* Mark rows already in the basket */
          const basket = AIVA.Store.get('book_basket', []);
          if (basket.some(b => b.fno === row.dataset.fno)) row.classList.add('on');
        });
      };
      wireRows();
      refreshBasketCTA();

      const tabs = sideEl.querySelectorAll('[data-t]');
      tabs.forEach(t => t.onclick = () => {
        tabs.forEach(x => x.classList.remove('on'));
        t.classList.add('on');
        const which = t.dataset.t;
        const list = which === 'out' ? out : inb;
        sideEl.querySelector('#ngSideList').innerHTML = list.map(f => rowHTML(f, which)).join('');
        wireRows();
      });

      /* Fly to the airport */
      map.flyTo({ center: [a.lon, a.lat], zoom: 4.2, speed: 0.7 });
    }

    const handle = {
      map,
      destroy: () => map.remove(),
      focusAirport: (code) => showSidePanel(code),
    };
    AIVA.NetworkGlobe._last = handle;   // debug accessor
    return handle;
  }

  return { render };
})();
