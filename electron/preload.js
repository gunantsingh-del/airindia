/* =====================================================================
   AIVA preload — runs in an isolated world before the renderer JS.
   We expose a tiny "AIVA_DESKTOP" flag so the in-page JS can detect
   it's running inside the Electron wrapper and adjust UX accordingly
   (e.g. hide the "Install AIVA" PWA button — already installed).
   ===================================================================== */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('AIVA_DESKTOP', {
  isDesktop: true,
  version: process.versions.electron || 'unknown',
  platform: process.platform,
});
