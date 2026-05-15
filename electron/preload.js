/* =====================================================================
   AIVA preload — runs in an isolated world before the renderer JS.
   Exposes a tiny namespaced API on window.AIVA_DESKTOP so the in-page
   code can detect the wrapper AND drive Electron-only features:

     window.AIVA_DESKTOP.isDesktop                 // true inside the .exe
     window.AIVA_DESKTOP.platform                  // 'win32' | 'darwin' | ...
     window.AIVA_DESKTOP.notify({ title, body })   // OS notification
     window.AIVA_DESKTOP.setAlwaysOnTop(true)      // pin as HUD over MSFS
     window.AIVA_DESKTOP.setAutoStart(true)        // launch on boot
     window.AIVA_DESKTOP.getState()                // { alwaysOnTop, autoStart }

   All calls round-trip through ipcMain handlers in main.js. No node
   APIs leak to the renderer.
   ===================================================================== */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('AIVA_DESKTOP', {
  isDesktop: true,
  version:   process.versions.electron || 'unknown',
  platform:  process.platform,
  notify:           (payload) => ipcRenderer.invoke('aiva:notify', payload),
  setAlwaysOnTop:   (on)      => ipcRenderer.invoke('aiva:setAlwaysOnTop', !!on),
  setAutoStart:     (on)      => ipcRenderer.invoke('aiva:setAutoStart', !!on),
  getState:         ()        => ipcRenderer.invoke('aiva:getDesktopState'),
});
