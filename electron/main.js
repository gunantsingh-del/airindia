/* =====================================================================
   AIVA — Electron desktop wrapper

   Why this exists:
     • In a normal browser at airindiavirtual.online (HTTPS), Chrome
       blocks plain ws://localhost:2048 as Mixed Content. The FSUIPC
       bridge silently fails.
     • Wrapping the same site in Electron lets us either:
         (a) Disable web security for localhost ws:// connections, OR
         (b) Load a bundled copy from file:// (skipping the rule).
       We go with (a) so the app always shows the latest live site
       without rebuilding the .exe for every update.
     • Branded with the AIVA chakra icon, installs to Start Menu +
       Desktop, opens chromeless in its own window.

   Build:
       npm install
       npm run dist:win        → AIVA-Setup-<version>.exe + AIVA-Portable-<version>.exe
       (output lands in ./dist-electron/)

   Or push a tag → GitHub Actions workflow auto-builds + uploads to
   the release page.
   ===================================================================== */

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

/* The page we wrap. Override at runtime with AIVA_URL=... electron . for
   local development against a Python dev server etc. */
const APP_URL = process.env.AIVA_URL || 'https://airindiavirtual.online/';

/* ----- Single-instance lock so launching twice just focuses the window ----- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let mainWin = null;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#0A0709',
    title: 'AIVA',
    icon: path.join(__dirname, '..', 'assets', 'img', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      /* Crucial: this allows the HTTPS-loaded airindiavirtual.online page
         to make plain ws://localhost:2048 connections without Chrome's
         Mixed Content blocker tripping. Same trade-off as Chrome's
         --allow-running-insecure-content flag, scoped to this app. */
      allowRunningInsecureContent: true,
      webSecurity: true,
    },
  });

  /* Splash-style fade in: only show once the page is painted */
  mainWin.once('ready-to-show', () => mainWin.show());

  mainWin.loadURL(APP_URL);

  /* Window-open routing for the desktop app:
       • Navigraph: opens in a NEW IN-APP BrowserWindow so the OAuth
         flow + charts stay inside AIVA (cookies persist across the
         shared session).
       • Other http(s) links: bounced to the user's real browser via
         shell.openExternal so unrelated sites don't pollute the app.
   */
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/navigraph\.com/i.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 860,
          title: 'AIVA · Navigraph',
          autoHideMenuBar: true,
          backgroundColor: '#0A0709',
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

  /* In-place navigation: keep our own host + Navigraph subdomains
     (charts.navigraph.com redirects to login.navigraph.com during OAuth);
     everything else bounces to the user's browser. */
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

/* Re-focus the existing window if user launches AIVA a second time */
app.on('second-instance', () => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  }
});

app.whenReady().then(() => {
  /* Slim menu — File / View / Help. No "Edit > Cut" muscle-memory traps. */
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force reload' },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools', label: 'Developer tools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Open airindiavirtual.online in browser', click: () => shell.openExternal('https://airindiavirtual.online/') },
        { label: 'FSUIPC bridge setup', click: () => shell.openExternal('https://www.fsuipc.com/') },
        { type: 'separator' },
        { label: 'About AIVA', click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWin, {
              type: 'info',
              title: 'About AIVA',
              message: `Air India Virtual — Desktop`,
              detail: `Version ${app.getVersion()}\nChief Pilot · Gunant Singh Pahwa\n\nWraps airindiavirtual.online so the FSUIPC bridge can talk to localhost without browser Mixed-Content blocking.`,
            });
        } },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
