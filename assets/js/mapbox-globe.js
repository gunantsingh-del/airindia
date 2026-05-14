/* =====================================================================
   AIR INDIA VIRTUAL — Globe + route layer
   Uses MapLibre GL JS (free, open-source fork of Mapbox GL JS).
   Supports the same API including globe projection — no token required.
   Tiles: Carto dark basemap (free for personal/non-commercial).
   Optionally upgrades to Mapbox if user provides their own token.
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.MapboxGlobe = (() => {

  function ensureLib() {
    return new Promise((res) => {
      if (window.maplibregl) return res();
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      s.onload = () => res();
      document.head.appendChild(s);
    });
  }

  /* Free dark-style spec using Carto raster tiles */
  const STYLE = {
    version: 8,
    sources: {
      'carto-dark': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap · © CARTO',
      },
    },
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0a0709' } },
      { id: 'carto', type: 'raster', source: 'carto-dark', paint: { 'raster-opacity': 0.92, 'raster-saturation': -0.2 } },
    ],
  };

  function arcLine(from, to, op) {
    const a = AIVA.airport(from), b = AIVA.airport(to);
    if (!a || !b) return null;
    const pts = AIVA.U.greatCircle(a.lat, a.lon, b.lat, b.lon, 96).map(([la, lo]) => [lo, la]);
    return { type:'Feature', geometry:{ type:'LineString', coordinates: pts }, properties:{ from, to, op } };
  }
  function airportPoints(routes) {
    const codes = new Set();
    routes.forEach(r => { codes.add(r.from); codes.add(r.to); });
    return {
      type:'FeatureCollection',
      features:[...codes].map(c => {
        const a = AIVA.airport(c); if (!a) return null;
        return {
          type:'Feature',
          geometry:{ type:'Point', coordinates:[a.lon, a.lat] },
          properties:{ code:c, iata:a.iata, name:a.name, city:a.city, hub:!!a.hub },
        };
      }).filter(Boolean),
    };
  }

  async function render(elId, opts = {}) {
    await ensureLib();
    const host = document.getElementById(elId);
    if (!host) return;
    host.innerHTML = '';

    const map = new maplibregl.Map({
      container: elId,
      style: STYLE,
      center: opts.center || [78, 22],
      zoom: opts.zoom ?? 1.5,
      attributionControl: false,
      minZoom: 0.8,
      maxZoom: 9,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    /* Switch to globe projection once loaded (MapLibre 4.0+) */
    map.on('load', () => {
      try { map.setProjection({ type:'globe' }); } catch {}
      addLayers();
    });

    function addLayers() {
      const routes = filtered(opts);
      const flownPairs = new Set((opts.flown || []).map(f => `${f.from}-${f.to}`));

      const arcsAll = { type:'FeatureCollection', features: routes.map(r => arcLine(r.from, r.to, r.op)).filter(Boolean) };
      const arcsFlown = { type:'FeatureCollection', features: routes
        .filter(r => flownPairs.has(`${r.from}-${r.to}`))
        .map(r => arcLine(r.from, r.to, r.op)).filter(Boolean) };

      if (!map.getSource('airports')) map.addSource('airports', { type:'geojson', data: airportPoints(routes) });
      if (!map.getSource('routes'))   map.addSource('routes',   { type:'geojson', data: arcsAll });
      if (!map.getSource('flown'))    map.addSource('flown',    { type:'geojson', data: arcsFlown });

      map.addLayer({
        id:'rt-line', type:'line', source:'routes',
        layout:{ 'line-cap':'round', 'line-join':'round' },
        paint:{
          'line-color': ['match', ['get','op'], 'AI', '#DA192F', 'IX', '#6B2A60', '#888'],
          'line-width': 1.2,
          'line-opacity': 0.6,
        },
      });
      map.addLayer({
        id:'rt-flown', type:'line', source:'flown',
        paint:{ 'line-color':'#E4C988', 'line-width':2, 'line-opacity':0.95, 'line-blur':0.4 },
      });
      map.addLayer({
        id:'ap-halo', type:'circle', source:'airports',
        paint:{
          'circle-color':'#C7A56C',
          'circle-radius': ['case', ['get','hub'], 9, 6],
          'circle-opacity': 0.22,
        },
      });
      map.addLayer({
        id:'ap-dot', type:'circle', source:'airports',
        paint:{
          'circle-color':'#E4C988',
          'circle-radius': ['case', ['get','hub'], 4.5, 3],
          'circle-stroke-color':'#876C3B',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id:'ap-label', type:'symbol', source:'airports',
        layout:{
          'text-field': ['get','iata'],
          'text-size': ['case', ['get','hub'], 12, 10],
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-font': ['Open Sans Regular'],
        },
        paint:{
          'text-color':'#F8F1E4',
          'text-halo-color':'rgba(0,0,0,.8)',
          'text-halo-width': 1.3,
        },
      });

      const tip = new maplibregl.Popup({ closeButton:false, closeOnClick:false, className:'aiva-mb-tip' });
      ['ap-dot','ap-halo'].forEach(id => {
        map.on('mouseenter', id, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features[0];
          tip.setLngLat(f.geometry.coordinates).setHTML(`
            <div style="font-family:Outfit,sans-serif;color:#F8F1E4;padding:6px 10px;">
              <div style="font-size:11px;color:#C7A56C;letter-spacing:.18em;text-transform:uppercase;">${f.properties.code}</div>
              <div style="font-size:13px;font-weight:600;">${f.properties.city}</div>
              <div style="font-size:11px;color:rgba(248,241,228,.6);">${f.properties.name}</div>
            </div>
          `).addTo(map);
        });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; tip.remove(); });
      });

      if (opts.onAirportClick) {
        ['ap-dot','ap-halo'].forEach(id => {
          map.on('click', id, (e) => {
            const f = e.features[0];
            opts.onAirportClick(f.properties.code, f.properties);
          });
        });
      }

      let rot;
      if (opts.autoSpin !== false) {
        rot = setInterval(() => {
          if (!map.isMoving()) {
            const c = map.getCenter();
            map.easeTo({ center: [c.lng + 0.15, c.lat], duration: 70, easing: t => t });
          }
        }, 60);
      }
      const stop = () => { clearInterval(rot); rot = null; };
      ['mousedown','wheel','touchstart'].forEach(ev => map.on(ev, stop));
    }

    return {
      map,
      setMode(mode, ac) {
        const routes = filtered({ mode, ac, flown: opts.flown });
        if (map.getSource('routes')) {
          map.getSource('routes').setData({ type:'FeatureCollection', features: routes.map(r => arcLine(r.from, r.to, r.op)).filter(Boolean) });
          map.getSource('airports').setData(airportPoints(routes));
        }
      },
      destroy() { map.remove(); },
    };
  }

  function filtered(opts) {
    let r = AIVA.FLIGHTS;
    if (opts.mode === 'ai')    r = r.filter(f => f.op === 'AI');
    if (opts.mode === 'ix')    r = r.filter(f => f.op === 'IX');
    if (opts.mode === 'flown' && opts.flown?.length) {
      const set = new Set(opts.flown.map(f => `${f.from}-${f.to}`));
      r = r.filter(f => set.has(`${f.from}-${f.to}`));
    }
    if (opts.ac && opts.ac.length) r = r.filter(f => opts.ac.includes(f.ac));
    if (opts.from) r = r.filter(f => f.from === opts.from);
    return r;
  }

  return { render };
})();

/* Mapbox/MapLibre tooltip & control styling */
(function () {
  const s = document.createElement('style');
  s.textContent = `
    .aiva-mb-tip .maplibregl-popup-content,
    .aiva-mb-tip .mapboxgl-popup-content {
      background: rgba(20,16,18,.92) !important;
      border:1px solid rgba(199,165,108,.4) !important;
      border-radius: 10px !important;
      box-shadow: 0 12px 36px rgba(0,0,0,.5) !important;
      padding: 0 !important;
    }
    .aiva-mb-tip .maplibregl-popup-tip,
    .aiva-mb-tip .mapboxgl-popup-tip { display:none !important; }
    .maplibregl-ctrl button, .mapboxgl-ctrl button {
      background: rgba(28,23,25,.85) !important;
      border: 1px solid rgba(199,165,108,.3) !important;
    }
    .maplibregl-ctrl-group, .mapboxgl-ctrl-group {
      box-shadow: 0 8px 24px rgba(0,0,0,.4) !important;
      border-radius: 10px !important;
      overflow: hidden;
    }
    .maplibregl-ctrl-attrib, .mapboxgl-ctrl-attrib {
      background: rgba(20,16,18,.7) !important;
      color: rgba(248,241,228,.5) !important;
      font-family: var(--font-mono); font-size: 9px !important;
    }
    .maplibregl-ctrl-attrib a { color: var(--ai-gold) !important; }
  `;
  document.head.appendChild(s);
})();
