/* =====================================================================
   AIVA — Brand SVG assets
   • Canonical Maharaja (red/yellow striped turban, namaste bow)
   • Air India "Vista" wordmark (red text + gold arch)
   ===================================================================== */

window.AIVA = window.AIVA || {};

/* The canonical Air India Maharaja — bow with hand on chest, red sherwani
   with yellow trim, red/yellow striped turban with feather plume.
   Modeled to match the iconic Bobby Kooka (1946) figure. */
AIVA.MaharajaSVG = (size = 220) => `
<svg viewBox="0 0 240 320" width="${size}" height="${size * 1.33}" xmlns="http://www.w3.org/2000/svg" class="maharaja-silhouette" aria-label="Air India Maharaja">
  <defs>
    <linearGradient id="mhRed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#E61926"/>
      <stop offset="100%" stop-color="#A8101F"/>
    </linearGradient>
    <linearGradient id="mhYel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#FFE159"/>
      <stop offset="100%" stop-color="#E0A926"/>
    </linearGradient>
    <linearGradient id="mhFace" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#F0C09A"/>
      <stop offset="100%" stop-color="#C7905D"/>
    </linearGradient>
  </defs>

  <!-- ground shadow -->
  <ellipse cx="120" cy="312" rx="55" ry="5" fill="#000" opacity=".3"/>

  <!-- Striped trousers (vertical red/yellow stripes) — bottom of figure -->
  <path d="M95 290 L100 312 L120 312 L118 290 Z" fill="url(#mhRed)"/>
  <path d="M122 290 L120 312 L140 312 L145 290 Z" fill="url(#mhRed)"/>
  <line x1="103" y1="293" x2="105" y2="310" stroke="#FFE159" stroke-width="1.5"/>
  <line x1="111" y1="293" x2="113" y2="310" stroke="#FFE159" stroke-width="1.5"/>
  <line x1="128" y1="293" x2="126" y2="310" stroke="#FFE159" stroke-width="1.5"/>
  <line x1="138" y1="293" x2="135" y2="310" stroke="#FFE159" stroke-width="1.5"/>

  <!-- Pointy slipper toes -->
  <path d="M95 312 Q88 314 84 308 Q88 310 95 312" fill="#A8101F"/>
  <path d="M145 312 Q152 314 156 308 Q152 310 145 312" fill="#A8101F"/>

  <!-- Sherwani / red coat — bowing forward, longer at back -->
  <path d="M 70 300 Q 65 240 80 195 Q 90 175 110 175 L 138 175 Q 158 175 170 198 Q 184 245 178 295 L 160 290 L 140 295 L 118 295 L 95 295 L 80 298 Z"
        fill="url(#mhRed)" stroke="#5A0815" stroke-width=".8"/>

  <!-- Yellow scalloped trim along coat bottom -->
  <path d="M 70 295 Q 78 300 85 297 Q 92 302 100 297 Q 108 302 115 297 Q 122 302 130 297 Q 138 302 145 297 Q 153 302 160 297 Q 168 302 178 295 L 178 305 Q 168 310 160 308 Q 153 312 145 308 Q 138 312 130 308 Q 122 312 115 308 Q 108 312 100 308 Q 92 312 85 308 Q 78 312 70 305 Z"
        fill="url(#mhYel)" stroke="#876C28" stroke-width=".4"/>

  <!-- Yellow scalloped collar trim -->
  <path d="M 95 178 Q 105 184 120 184 Q 135 184 145 178 L 144 188 Q 130 192 120 192 Q 110 192 96 188 Z" fill="url(#mhYel)"/>

  <!-- Decorative yellow buttons down the front -->
  <circle cx="120" cy="200" r="2.5" fill="url(#mhYel)"/>
  <circle cx="120" cy="220" r="2.5" fill="url(#mhYel)"/>
  <circle cx="120" cy="240" r="2.5" fill="url(#mhYel)"/>

  <!-- Right arm tucked at chest with hand on heart (the bow gesture) -->
  <ellipse cx="135" cy="220" rx="18" ry="22" fill="url(#mhRed)" stroke="#5A0815" stroke-width=".7" transform="rotate(15 135 220)"/>
  <!-- Yellow cuff -->
  <ellipse cx="148" cy="240" rx="10" ry="6" fill="url(#mhYel)" transform="rotate(15 148 240)"/>
  <!-- Hand on chest -->
  <ellipse cx="148" cy="248" rx="11" ry="13" fill="url(#mhFace)" stroke="#8A5630" stroke-width=".5"/>
  <!-- Finger lines -->
  <path d="M152 240 Q150 248 148 256" stroke="#8A5630" stroke-width=".5" fill="none"/>
  <path d="M156 242 Q154 250 152 258" stroke="#8A5630" stroke-width=".5" fill="none"/>

  <!-- Left arm hanging down beside body -->
  <ellipse cx="78" cy="232" rx="13" ry="24" fill="url(#mhRed)" stroke="#5A0815" stroke-width=".7" transform="rotate(-12 78 232)"/>
  <ellipse cx="68" cy="252" rx="9" ry="6" fill="url(#mhYel)" transform="rotate(-12 68 252)"/>
  <!-- Hand -->
  <ellipse cx="65" cy="262" rx="8" ry="10" fill="url(#mhFace)" stroke="#8A5630" stroke-width=".5"/>

  <!-- Neck -->
  <rect x="113" y="160" width="14" height="20" fill="url(#mhFace)" stroke="#8A5630" stroke-width=".4"/>

  <!-- Head, side-profile, bowing forward and slightly down -->
  <g transform="rotate(-8 120 120)">
    <!-- left ear (visible side) -->
    <ellipse cx="86" cy="125" rx="6" ry="9" fill="url(#mhFace)" stroke="#8A5630" stroke-width=".5"/>
    <!-- face — slight 3/4 view -->
    <ellipse cx="118" cy="122" rx="40" ry="42" fill="url(#mhFace)" stroke="#8A5630" stroke-width=".7"/>

    <!-- Closed bowing eye (just one visible since side profile) — small slit + lash -->
    <path d="M 100 116 Q 110 122 122 116" stroke="#1A1414" stroke-width="2" fill="none" stroke-linecap="round"/>

    <!-- Eyebrow above eye -->
    <path d="M 96 108 Q 110 102 122 106" stroke="#3B1F12" stroke-width="2.4" fill="none" stroke-linecap="round"/>

    <!-- Nose (side profile bump) -->
    <path d="M 138 124 Q 148 130 142 142 Q 138 144 134 142 Q 134 130 138 124" fill="#C49063" opacity=".7"/>

    <!-- Big handlebar mustache curling at tips -->
    <path d="M 92 154 Q 110 148 128 154 Q 144 148 162 152
             Q 156 162 144 161 Q 130 158 124 158 Q 116 158 108 161 Q 96 162 92 154 Z"
          fill="#1A1414" stroke="#000" stroke-width=".5"/>
    <!-- Curl tips -->
    <path d="M 92 154 Q 78 148 80 138 Q 86 144 92 152" fill="#1A1414"/>
    <path d="M 162 152 Q 176 146 174 136 Q 170 142 164 150" fill="#1A1414"/>

    <!-- Soft chin / smile under mustache (subtle) -->
    <path d="M 116 168 Q 130 172 144 168" stroke="#3B1F12" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".5"/>

    <!-- ===== TURBAN ===== red base with horizontal yellow stripes and orange highlights -->
    <path d="M 76 100 Q 78 64 120 56 Q 162 64 164 100 Q 168 110 158 116 Q 138 84 120 82 Q 102 84 82 116 Q 72 110 76 100 Z"
          fill="url(#mhRed)" stroke="#5A0815" stroke-width=".9"/>
    <!-- Horizontal yellow stripes (the canonical Maharaja look) -->
    <path d="M 78 96 Q 120 78 162 96 L 158 102 Q 120 84 82 102 Z" fill="url(#mhYel)"/>
    <path d="M 80 88 Q 120 70 160 88 L 156 92 Q 120 74 84 92 Z" fill="url(#mhRed)"/>
    <path d="M 82 80 Q 120 64 158 80 L 154 84 Q 120 68 86 84 Z" fill="url(#mhYel)"/>

    <!-- Turban top wrap / crown -->
    <path d="M 100 64 Q 120 50 140 64 Q 132 68 120 66 Q 108 68 100 64 Z" fill="url(#mhRed)" stroke="#5A0815" stroke-width=".5"/>

    <!-- Yellow tassel/feather streaming up from turban top -->
    <g transform="translate(120 56)">
      <path d="M 0 0 L -2 -28" stroke="url(#mhYel)" stroke-width="2" stroke-linecap="round"/>
      <path d="M 0 0 L 2 -32" stroke="url(#mhYel)" stroke-width="2" stroke-linecap="round"/>
      <path d="M 0 0 L 0 -34" stroke="url(#mhYel)" stroke-width="2" stroke-linecap="round"/>
      <path d="M 0 0 L -4 -25" stroke="url(#mhYel)" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M 0 0 L 4 -28" stroke="url(#mhYel)" stroke-width="1.5" stroke-linecap="round"/>
      <!-- jewel/binding at base of feather -->
      <circle cx="0" cy="-2" r="3" fill="#E61926" stroke="#876C28" stroke-width=".6"/>
    </g>
  </g>
</svg>
`;

/* Mini Maharaja icon for favicon and small badges */
AIVA.MaharajaIcon = (size = 28) => `
<svg viewBox="0 0 60 60" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-label="AIVA">
  <defs>
    <linearGradient id="miR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E61926"/><stop offset="1" stop-color="#A8101F"/></linearGradient>
    <linearGradient id="miY" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE159"/><stop offset="1" stop-color="#E0A926"/></linearGradient>
  </defs>
  <!-- turban striped -->
  <path d="M14 26 Q16 12 30 10 Q44 12 46 26 Q48 30 44 32 Q36 20 30 19 Q24 20 16 32 Q12 30 14 26 Z" fill="url(#miR)"/>
  <path d="M16 24 Q30 14 44 24 L43 26 Q30 18 17 26 Z" fill="url(#miY)"/>
  <path d="M17 19 Q30 11 43 19 L42 21 Q30 13 18 21 Z" fill="url(#miR)"/>
  <!-- feather plume -->
  <path d="M30 12 L29 4" stroke="url(#miY)" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M30 12 L31 3" stroke="url(#miY)" stroke-width="1.2" stroke-linecap="round"/>
  <!-- face -->
  <ellipse cx="30" cy="38" rx="11" ry="11" fill="#F0C09A"/>
  <!-- mustache -->
  <path d="M19 41 Q24 39 30 41 Q36 39 41 41 Q37 45 33 43 Q30 42 27 43 Q23 45 19 41 Z" fill="#1A1414"/>
  <!-- closed eye -->
  <path d="M27 36 Q30 39 33 36" stroke="#1A1414" stroke-width="1" fill="none"/>
</svg>
`;

/* Air India official wordmark — bold red "AIR INDIA" with the gold "Vista"
   arch curving up and around the right side (matches official 2023 brand). */
AIVA.Wordmark = (color = '#E61926', goldArch = true) => `
<svg viewBox="0 0 380 90" height="58" xmlns="http://www.w3.org/2000/svg" aria-label="Air India">
  <defs>
    <linearGradient id="wmGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFE159"/>
      <stop offset="60%" stop-color="#E0A926"/>
      <stop offset="100%" stop-color="#876C28"/>
    </linearGradient>
  </defs>
  ${goldArch ? `
    <!-- Gold "Vista" arch sweeping up and around the right of the wordmark -->
    <path d="M 270 22 Q 320 -8 360 28 L 354 36 L 348 30 Q 332 14 312 22 Q 290 30 270 38 Z" fill="url(#wmGold)"/>
    <!-- Arrow tip at end of arch -->
    <path d="M 354 36 L 360 28 L 368 32 L 360 40 Z" fill="#876C28"/>
  ` : ''}
  <!-- AIR INDIA wordmark, custom-flat-top sans -->
  <text x="0" y="62" font-family="Outfit, 'DM Sans', sans-serif" font-size="50" font-weight="900" fill="${color}" letter-spacing=".005em" style="font-stretch:condensed;">AIR INDIA</text>
</svg>
`;

/* Vista window arch (Jharokha) — used as background ornament in hero areas */
AIVA.VistaArch = (w = 240, h = 280) => `
<svg viewBox="0 0 240 280" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="vag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFE159"/>
      <stop offset="55%" stop-color="#E0A926"/>
      <stop offset="100%" stop-color="#876C28"/>
    </linearGradient>
    <pattern id="vap" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
      <path d="M 7 0 L 7 14 M 0 7 L 14 7 M 0 0 L 14 14 M 14 0 L 0 14" stroke="#E0A926" stroke-width=".3" opacity=".5"/>
    </pattern>
  </defs>
  <path d="M 24 274 L 24 80 Q 24 14 120 14 Q 216 14 216 80 L 216 274 Z"
        fill="none" stroke="url(#vag)" stroke-width="2" stroke-linecap="round"/>
  <path d="M 40 274 L 40 90 Q 40 30 120 30 Q 200 30 200 90 L 200 274 Z"
        fill="none" stroke="url(#vag)" stroke-width="1" opacity=".6"/>
  <path d="M 56 100 L 56 100 Q 56 46 120 46 Q 184 46 184 100 L 184 100 Z" fill="url(#vap)" opacity=".4"/>
  <g transform="translate(120 100)" opacity=".55">
    ${Array.from({length: 16}).map((_, i) => `<line x1="0" y1="0" x2="${Math.cos(i * Math.PI / 8) * 36}" y2="${Math.sin(i * Math.PI / 8) * 36}" stroke="#E0A926" stroke-width=".7"/>`).join('')}
  </g>
  <circle cx="120" cy="100" r="6" fill="#E0A926"/>
  <circle cx="120" cy="100" r="14" fill="none" stroke="#E0A926" stroke-width=".5" opacity=".5"/>
</svg>
`;

/* Chakra wheel for badges and loaders */
AIVA.ChakraWheel = (size = 36) => `
<svg viewBox="0 0 40 40" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g transform="translate(20 20)">
    ${Array.from({length: 16}).map((_, i) => `<rect x="-.6" y="-18" width="1.2" height="6" fill="#E0A926" transform="rotate(${i * 22.5})"/>`).join('')}
    <circle r="3.5" fill="#E0A926"/>
    <circle r="11" fill="none" stroke="#E0A926" stroke-width=".5" opacity=".5"/>
  </g>
</svg>
`;
