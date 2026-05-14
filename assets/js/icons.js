/* =====================================================================
   Inline SVG icon set — feather/lucide-flavored 1.5px stroke icons.
   Hand-curated to avoid an external icon dependency.
   ===================================================================== */

window.AIVA = window.AIVA || {};

AIVA.Icon = (name, size = 18) => {
  const I = AIVA._ICONS[name] || AIVA._ICONS.dot;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${I}</svg>`;
};

AIVA._ICONS = {
  dot:      `<circle cx="12" cy="12" r="3"/>`,
  home:     `<path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>`,
  dashboard:`<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>`,
  plane:    `<path d="M21 15l-9-3.5L3 14V8l10-2 8 4z"/><path d="M9 22l2-7M15 22l-2-7"/>`,
  plane2:   `<path d="M3 12l4 1.5 5-9 1.5 4 5 1.5-2 6-4-3-5 9z"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>`,
  clipboard:`<rect x="6" y="4" width="12" height="18" rx="2"/><path d="M9 4V2h6v2"/>`,
  cloud:    `<path d="M6 18a4 4 0 0 1 0-8 5 5 0 0 1 9.4-1.5A4 4 0 1 1 17 18z"/>`,
  alert:    `<path d="M10.3 3.7L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3l-8.5-14.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>`,
  gauge:    `<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/>`,
  arrow_down:`<path d="M12 4v16M6 14l6 6 6-6"/>`,
  scale:    `<path d="M12 3v18"/><path d="M5 7h14"/><path d="M3 12l2-5 2 5"/><path d="M17 12l2-5 2 5"/><path d="M5 16h14"/>`,
  map:      `<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>`,
  target:   `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>`,
  route:    `<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 17V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v0"/>`,
  doc:      `<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>`,
  book:     `<path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1 0-4h13"/>`,
  clock:    `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  satellite:`<path d="M5 12l7 7M9 8l7 7"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M2 18a4 4 0 0 1 4-4M22 6a4 4 0 0 1-4 4"/>`,
  wifi:     `<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>`,
  upload:   `<path d="M12 4v12"/><path d="M6 10l6-6 6 6"/><path d="M4 18v2h16v-2"/>`,
  download: `<path d="M12 4v12"/><path d="M18 10l-6 6-6-6"/><path d="M4 20h16"/>`,
  globe:    `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>`,
  graduation:`<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5a6 6 0 0 0 12 0v-5"/>`,
  shield:   `<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>`,
  search:   `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>`,
  bell:     `<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9z"/><path d="M10 21a2 2 0 0 0 4 0"/>`,
  cog:      `<circle cx="12" cy="12" r="3"/><path d="M19 12c0-.7-.1-1.3-.2-2l2-1.5-2-3.5-2.4 1c-1-1-2-1.5-3.2-1.8L13 2h-2l-.2 2.2c-1.1.3-2.2.9-3.1 1.8L5.3 5l-2 3.5 2 1.5c-.1.7-.2 1.3-.2 2s.1 1.3.2 2l-2 1.5 2 3.5 2.4-1c1 .9 2 1.5 3.2 1.8L11 22h2l.2-2.2c1.2-.3 2.2-.9 3.2-1.8l2.4 1 2-3.5-2-1.5c.1-.7.2-1.3.2-2z"/>`,
  logout:   `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>`,
  menu:     `<path d="M3 6h18M3 12h18M3 18h18"/>`,
  close:    `<path d="M6 6l12 12M18 6L6 18"/>`,
  chevron_right:`<path d="M9 6l6 6-6 6"/>`,
  chevron_down:`<path d="M6 9l6 6 6-6"/>`,
  external: `<path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>`,
  plus:     `<path d="M12 5v14M5 12h14"/>`,
  file_csv: `<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><text x="8" y="17" font-family="JetBrains Mono" font-size="6" fill="currentColor" stroke="none">CSV</text>`,
  star:     `<path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>`,
  flame:    `<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 1.5-4 2-6 1.5 2 3 2 3-5z"/>`,
  airport:  `<path d="M3 12h18M3 6h18M3 18h18"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="6" cy="18" r="1" fill="currentColor"/>`,
  layers:   `<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>`,
  table:    `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>`,
  send:     `<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>`,
  wind:     `<path d="M9 4a2 2 0 1 1 2 4H2"/><path d="M14 18a2 2 0 1 0 2-4H2"/><path d="M17 2a3 3 0 1 1 3 6h-1"/>`,
  fuel:     `<rect x="3" y="5" width="11" height="16" rx="1"/><path d="M14 11h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2"/><path d="M17 4l3 4"/>`,
  briefcase:`<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`,
  user:     `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
  users:    `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1A4 4 0 0 1 16 11"/>`,
  newspaper:`<rect x="3" y="4" width="14" height="16" rx="1"/><path d="M17 8h3v10a2 2 0 0 1-2 2H6"/><path d="M7 8h6M7 12h6M7 16h4"/>`,
  cup:      `<path d="M17 8H3v9a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-2"/><path d="M17 8h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3"/>`,
  radar:    `<circle cx="12" cy="12" r="9"/><path d="M12 12L21 6"/><circle cx="12" cy="12" r="3"/>`,
  building: `<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>`,
  /* Hangar — fleet register */
  hangar:   `<path d="M3 21V11l9-6 9 6v10"/><path d="M3 21h18"/><path d="M9 21v-6h6v6"/><path d="M9 11h6"/>`,
  /* Palette — liveries (paint dabs on a palette) */
  palette:  `<path d="M12 22a10 10 0 1 1 10-10c0 2-1.5 3-3 3h-2a2 2 0 0 0-1 3.7 2 2 0 0 1-1 3.3z"/><circle cx="13.5" cy="6.5" r="1" fill="currentColor"/><circle cx="17" cy="10" r="1" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1" fill="currentColor"/>`,
  /* Sun — for light theme */
  sun:      `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`,
  /* Moon — for dark theme */
  moon:     `<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>`,
  /* Megaphone — for announcements */
  megaphone:`<path d="M3 11v2a3 3 0 0 0 3 3h2l10 4V4L8 8H6a3 3 0 0 0-3 3z"/><path d="M16 8a4 4 0 0 1 0 8"/>`,
  /* Activity — for situations / PSR */
  activity: `<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>`,
};
