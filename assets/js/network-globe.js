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
      /* Unsplash source delivers a featured photo for a query — free, no key.
         Cache-busted per airport so each card gets its own background. */
      const cityQuery = encodeURIComponent(`${a.city} skyline city`);
      const photoURL = `https://source.unsplash.com/640x360/?${cityQuery}`;

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
        <div class="ng-side-photo" style="background-image:url('${photoURL}');"></div>
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
              <span class="ng-basket-count">${basket.length} flight${basket.length===1?'':'s'} in basket</span>
              <a href="portal.html#book" class="ng-basket-btn">Open Search &amp; Book →</a>
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
