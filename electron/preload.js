/* =====================================================================
   AIVA preload — runs in an isolated world before the renderer JS.
   Exposes a namespaced API on window.AIVA_DESKTOP so the in-page
   code can detect the wrapper AND drive Electron-only features:

     window.AIVA_DESKTOP.isDesktop
     window.AIVA_DESKTOP.platform
     window.AIVA_DESKTOP.notify({ title, body })
     window.AIVA_DESKTOP.setAlwaysOnTop(on)
     window.AIVA_DESKTOP.setAutoStart(on)
     window.AIVA_DESKTOP.getState()

   SimConnect — direct MSFS telemetry (Windows-only, via the native
   SimConnect SDK; eliminates the FSUIPC WebSockets Server step):

     window.AIVA_DESKTOP.simConnect.getState()      // 'connected'|'searching'|'unavailable'
     window.AIVA_DESKTOP.simConnect.getLast()       // last telemetry frame
     window.AIVA_DESKTOP.simConnect.onState(cb)     // subscribe → returns unsubscribe()
     window.AIVA_DESKTOP.simConnect.onTelemetry(cb) // subscribe → returns unsubscribe()

   All calls round-trip through ipcMain handlers in main.js. No node
   APIs leak to the renderer.
   ===================================================================== */

const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('AIVA_DESKTOP', {
  isDesktop: true,
  version:   process.versions.electron || 'unknown',
  platform:  process.platform,
  notify:           (payload) => ipcRenderer.invoke('aiva:notify', payload),
  setAlwaysOnTop:   (on)      => ipcRenderer.invoke('aiva:setAlwaysOnTop', !!on),
  setAutoStart:     (on)      => ipcRenderer.invoke('aiva:setAutoStart', !!on),
  getState:         ()        => ipcRenderer.invoke('aiva:getDesktopState'),

  simConnect: {
    getState:       ()  => ipcRenderer.invoke('aiva:sim-state'),
    getLast:        ()  => ipcRenderer.invoke('aiva:sim-last'),
    onState:        subscribe('aiva:sim-state'),
    onTelemetry:    subscribe('aiva:sim-telemetry'),
  },
});
