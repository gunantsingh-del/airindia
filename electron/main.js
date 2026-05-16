/* =====================================================================
   AIVA — Electron desktop wrapper

   Beyond just-loading-the-website, the desktop build delivers:
     • System tray icon (chakra) — single-click to focus the app,
       right-click for quick actions + a "Quit" that actually quits
       (closing the window minimises to tray instead).
     • Native OS notifications — chat messages, FSUIPC connect /
       disconnect, descent through 10k, sim crash. Replaces the
       in-page toasts when the window isn't focused.
     • Always-on-top toggle — pin AIVA as a HUD over MSFS while you
       fly. Toggleable from the tray menu + via Profile in the app.
     • Auto-start with Windows — launch AIVA on boot.
     • Custom window-open routing: Navigraph stays in-app
       (auth flow needs same session), everything else bounces to
       the user's real browser.

   Build:
       npm install
       npm run dist:win        → AIVA-Setup.exe + AIVA-Portable.exe
       (output lands in ./dist-electron/)
   ===================================================================== */

const { app, BrowserWindow, Menu, Tray, shell, ipcMain, Notification, nativeImage } = require('electron');
const path = require('path');
const SimBridge = require('./simconnect-bridge');

const APP_URL = process.env.AIVA_URL || 'https://airindiavirtual.online/';

/* Force WebGL on for the MapLibre globe + EFB live map. Some pilots'
   GPUs are on Chromium's software-rasterizer blocklist (older Intel
   integrated chips, AMD switchable graphics, certain laptop docks) —
   without these switches MapLibre throws "Failed to initialize WebGL"
   and the Network Globe + Book Roster maps render blank. */
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-webgl');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

/* ----- Single-instance lock so launching twice just focuses the window ----- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let mainWin   = null;
let tray      = null;
let quitting  = false;     // distinguish "X close" (minimise) from real quit
let simBridge = null;      // SimConnect bridge — direct talk to MSFS

const ICON_PATH = path.join(__dirname, '..', 'assets', 'img',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png');

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#0A0709',
    title: 'AIVA',
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      /* HTTPS-loaded airindiavirtual.online needs to open ws://localhost
         for the FSUIPC bridge — Chrome's Mixed-Content rule blocks this
         by default, but this flag scoped to AIVA only lifts the gate. */
      allowRunningInsecureContent: true,
      webSecurity: true,
    },
  });

  mainWin.once('ready-to-show', () => mainWin.show());

  /* Chromium disk-cache nuker. Without this the .exe holds onto stale
     HTML/JS for days even when Vercel returns Cache-Control: no-cache
     — Chromium just doesn't bother revalidating disk-cached responses.
     Pilots install a fresh .exe and still see old UI because the
     per-user cache dir survived the reinstall. Clearing on every boot
     is overkill but the right tradeoff: a one-time ~500ms extra fetch
     vs. days of "I reinstalled but nothing changed". */
  mainWin.webContents.session.clearCache().catch(() => {});
  mainWin.webContents.session.clearStorageData({ storages: ['shadercache', 'cachestorage'] }).catch(() => {});

  mainWin.loadURL(APP_URL);

  /* Closing the window minimises to tray on Windows/Linux. On macOS the
     standard pattern is to keep the dock icon alive instead. Quitting
     for real has to go through the tray menu or Cmd+Q / File→Exit. */
  mainWin.on('close', (e) => {
    if (!quitting && process.platform !== 'darwin') {
      e.preventDefault();
      mainWin.hide();
      if (tray && !tray.balloonShown) {
        try { tray.displayBalloon({ title: 'AIVA still running', content: 'Minimised to the system tray. Click the chakra to bring it back.', iconType: 'info' }); } catch {}
        tray.balloonShown = true;
      }
      return;
    }
  });

  /* Window-open routing: Navigraph stays in-app (OAuth needs same
     session), everything else bounces to the user's real browser. */
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/navigraph\.com/i.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280, height: 860,
          title: 'AIVA · Navigraph',
          autoHideMenuBar: true,
          backgroundColor: '#0A0709',
          icon: ICON_PATH,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWin.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url);
      const ownHost = new URL(APP_URL).host;
      if (u.host === ownHost) return;
      if (/(^|\.)navigraph\.com$/i.test(u.host)) return;
      e.preventDefault();
      shell.openExternal(url);
    } catch {}
  });

  mainWin.on('closed', () => { mainWin = null; });
}

/* ============ System tray ============ */
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'AIVA · Air India Virtual', enabled: false },
    { type: 'separator' },
    { label: 'Open AIVA', click: () => { mainWin?.show(); mainWin?.focus(); } },
    { label: 'Open EFB',       click: () => mainWin?.webContents?.executeJavaScript("location.href='efb.html'") },
    { label: 'Open My Roster', click: () => mainWin?.webContents?.executeJavaScript("location.href='portal.html#roster'") },
    { label: 'Open Crew Chat', click: () => mainWin?.webContents?.executeJavaScript("location.href='portal.html#dashboard'") },
    { type: 'separator' },
    {
      label: 'Always on top', type: 'checkbox',
      checked: mainWin?.isAlwaysOnTop() || false,
      click: (item) => { mainWin?.setAlwaysOnTop(item.checked, 'normal'); tray.setContextMenu(buildTrayMenu()); },
    },
    {
      label: 'Launch at startup', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--from-tray-autostart'] });
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { type: 'separator' },
    { label: 'Quit AIVA', click: () => { quitting = true; app.quit(); } },
  ]);
}
function createTray() {
  try {
    const img = nativeImage.createFromPath(ICON_PATH);
    /* Resize for tray — Windows wants 16/32, macOS wants 22px templates */
    const resized = process.platform === 'darwin' ? img.resize({ width: 18, height: 18 }) : img.resize({ width: 16, height: 16 });
    tray = new Tray(resized);
    tray.setToolTip('AIVA · Air India Virtual');
    tray.on('click', () => {
      if (!mainWin) return;
      if (mainWin.isVisible() && mainWin.isFocused()) mainWin.hide();
      else { mainWin.show(); mainWin.focus(); }
    });
    tray.setContextMenu(buildTrayMenu());
  } catch (e) {
    console.warn('[AIVA] tray init failed:', e?.message);
  }
}

/* ============ SimConnect bridge ============
   Starts after the main window is created. The bridge owns the
   SimConnect named-pipe connection in the main process and forwards
   telemetry + state to the renderer over IPC. No second app, no
   FSUIPC bridge, no port-2048 dance — MSFS exposes SimConnect itself. */
function startSimBridge() {
  if (simBridge) return;
  try {
    simBridge = new SimBridge();
    simBridge.on('state', (state) => {
      mainWin?.webContents?.send('aiva:sim-state', state);
      if (tray) {
        const labels = { connected: 'MSFS connected', searching: 'Looking for MSFS…', unavailable: 'SimConnect unavailable' };
        tray.setToolTip(`AIVA · ${labels[state] || state}`);
      }
      if (state === 'connected') {
        notifySafe('AIVA · Connected to MSFS', 'Telemetry streaming. Start Flight when ready.');
      }
    });
    simBridge.on('telemetry', (t) => {
      mainWin?.webContents?.send('aiva:sim-telemetry', t);
    });
    simBridge.start();
  } catch (err) {
    console.warn('[AIVA] SimBridge init failed:', err?.message);
    simBridge = null;
  }
}
function notifySafe(title, body) {
  try {
    if (!Notification.isSupported()) return;
    /* Only fire when window isn't focused to avoid double-notifying. */
    if (mainWin?.isFocused()) return;
    const n = new Notification({ title, body, icon: ICON_PATH });
    n.on('click', () => { mainWin?.show(); mainWin?.focus(); });
    n.show();
  } catch {}
}

/* ============ IPC handlers used by the renderer ============ */
ipcMain.handle('aiva:sim-state', () => simBridge?.getState() || 'unavailable');
ipcMain.handle('aiva:sim-last',  () => simBridge?.getLast()  || null);

ipcMain.handle('aiva:notify', (_e, payload) => {
  try {
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: payload?.title || 'AIVA',
      body:  payload?.body  || '',
      silent: !!payload?.silent,
      icon:  ICON_PATH,
    });
    n.on('click', () => { mainWin?.show(); mainWin?.focus(); });
    n.show();
    return true;
  } catch { return false; }
});
ipcMain.handle('aiva:setAlwaysOnTop', (_e, on) => {
  mainWin?.setAlwaysOnTop(!!on, 'normal');
  tray?.setContextMenu(buildTrayMenu());
  return !!on;
});
ipcMain.handle('aiva:setAutoStart', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on, args: ['--from-tray-autostart'] });
  tray?.setContextMenu(buildTrayMenu());
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('aiva:getDesktopState', () => ({
  alwaysOnTop: !!mainWin?.isAlwaysOnTop(),
  autoStart:   !!app.getLoginItemSettings().openAtLogin,
}));

/* ============ Second-instance focus ============ */
app.on('second-instance', () => {
  if (mainWin) {
    if (!mainWin.isVisible()) mainWin.show();
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  }
});

app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force reload' },
        { type: 'separator' },
        { label: 'Hide to tray', accelerator: 'CmdOrCtrl+W', click: () => mainWin?.hide() },
        { label: 'Exit AIVA',    accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools', label: 'Developer tools' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Always on top', type: 'checkbox',
          click: (item) => mainWin?.setAlwaysOnTop(item.checked, 'normal') },
        { type: 'separator' },
        { label: 'Launch at startup', type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--from-tray-autostart'] }) },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Open airindiavirtual.online in browser', click: () => shell.openExternal('https://airindiavirtual.online/') },
        { label: 'FSUIPC bridge setup',                    click: () => shell.openExternal('https://www.fsuipc.com/') },
        { type: 'separator' },
        { label: 'About AIVA', click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWin, {
              type: 'info',
              title: 'About AIVA',
              message: `Air India Virtual — Desktop`,
              detail: `Version ${app.getVersion()}\nChief Pilot · Gunant Singh Pahwa\n\nNative wrapper with system tray, OS notifications, always-on-top, FSUIPC bridge access, and in-app Navigraph charts.`,
            });
        } },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  createWindow();
  createTray();
  startSimBridge();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else { mainWin?.show(); mainWin?.focus(); }
  });
});

/* Hold app alive even when all windows are closed (we live in the tray). */
app.on('window-all-closed', (e) => {
  if (!quitting && process.platform !== 'darwin') {
    /* swallow — tray keeps us running */
    e?.preventDefault?.();
  } else {
    app.quit();
  }
});
app.on('before-quit', () => { quitting = true; });
