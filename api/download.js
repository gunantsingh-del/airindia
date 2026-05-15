/* =====================================================================
   AIVA · /api/download — Vercel serverless function
   ---------------------------------------------------------------------
   Resolves the latest GitHub Release asset and 302-redirects to it.
   If the release isn't ready yet (first build in progress, or build
   failed), we serve a branded "Building, try again in a couple minutes"
   page instead of GitHub's bare 404.

   Two query knobs:
     ?file=AIVA-Setup.exe         (default)
     ?file=AIVA-Portable.exe      portable build
     ?refresh=1                   forces a fresh GitHub API call (we
                                  cache for 60s otherwise)
   ===================================================================== */

const OWNER = 'gunantsingh-del';
const REPO  = 'airindia';

let cache = { ts: 0, json: null };
const CACHE_MS = 60 * 1000;   // 60s — GitHub Releases don't change minute-by-minute

async function fetchLatestRelease() {
  if (cache.json && (Date.now() - cache.ts) < CACHE_MS) return cache.json;
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
    headers: {
      'Accept':     'application/vnd.github+json',
      'User-Agent': 'aiva-download-router',
    },
  });
  if (!r.ok) {
    cache = { ts: Date.now(), json: null };
    return null;
  }
  const j = await r.json();
  cache = { ts: Date.now(), json: j };
  return j;
}

function buildingPage(assetName) {
  /* Bust the unique-each-request URL the auto-poller hits — guarantees no
     CDN/browser cache hits the same path twice. */
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="cache-control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="pragma" content="no-cache">
<meta http-equiv="expires" content="0">
<title>Building AIVA Desktop · please wait</title>
<link rel="icon" type="image/png" href="/assets/img/vaic-mini-colour.png">
<link href="https://fonts.googleapis.com/css2?family=Mukta:wght@500;600;700&family=Inter+Tight:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; height: 100%; background: #0A0709; color: #F8F1E4; font-family: 'Mukta','Inter Tight',sans-serif; }
  body {
    background:
      radial-gradient(ellipse at top, rgba(168,16,31,.28) 0%, transparent 55%),
      #0A0709;
    display: grid; place-items: center; padding: 24px;
  }
  .wrap { max-width: 540px; text-align: center; }
  .logo { width: 72px; height: 72px; border-radius: 50%; margin: 0 auto 22px; display: block; }
  h1 {
    font-family: 'Inter Tight',sans-serif;
    font-size: 32px; margin: 0 0 12px;
    background: linear-gradient(180deg, #F8F1E4 0%, #C9A86A 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  p { font-size: 14px; line-height: 1.6; color: rgba(248,241,228,.74); margin: 0 0 14px; }
  .eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: #FFE9A8; margin-bottom: 22px; }
  .status { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: rgba(248,241,228,.55); margin-top: 10px; }
  .spinner {
    width: 28px; height: 28px;
    border: 2px solid rgba(255,225,89,.25);
    border-top-color: #FFE9A8;
    border-radius: 50%;
    margin: 22px auto 6px;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .actions { margin-top: 28px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 11px 22px; border-radius: 99px;
    font-family: 'Inter Tight', sans-serif;
    font-size: 12.5px; letter-spacing: .12em; text-transform: uppercase; font-weight: 600;
    text-decoration: none;
    transition: all .2s ease;
    cursor: pointer;
  }
  .btn-primary { background: linear-gradient(180deg,#C8102E,#8B1A2B); color: #FFFFFF; border: 1px solid rgba(255,225,89,.45); }
  .btn-primary:hover { transform: translateY(-1px); }
  .btn-ghost { color: #FFE9A8; border: 1px solid rgba(255,225,89,.3); background: transparent; }
  .btn-ghost:hover { background: rgba(255,225,89,.06); }
  .det { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: rgba(248,241,228,.45); margin-top: 26px; }
</style>
</head>
<body>
<div class="wrap">
  <img src="/assets/img/vaic-mini-colour.png" alt="AIVA" class="logo">
  <div class="eyebrow">Air India Virtual</div>
  <h1>Build in progress</h1>
  <p>
    The desktop installer is being compiled on a fresh runner. This
    typically takes about three minutes. We'll redirect you the second
    the .exe is ready.
  </p>
  <div class="spinner" aria-hidden="true"></div>
  <div class="status" id="pollStatus">Checking release status…</div>
  <div class="actions">
    <button class="btn btn-primary" id="forceBtn">Check now</button>
    <a class="btn btn-ghost" href="/portal.html">Open portal in browser</a>
  </div>
  <div class="det">
    Asset: <code style="color:#FFE9A8;">${assetName}</code><br>
    Build status: <a href="https://github.com/${OWNER}/${REPO}/actions" target="_blank" style="color:rgba(248,241,228,.7);">GitHub Actions</a>
  </div>
</div>

<script>
/* Aggressive polling: every 4 seconds we ask the GitHub Releases API directly
   from the browser. The moment AIVA-Setup.exe appears in the latest release,
   we redirect straight to the asset URL — no waiting for a page refresh,
   no CDN/serverless caching between us and the release. */
(function () {
  const ASSET = ${JSON.stringify(assetName)};
  const API   = 'https://api.github.com/repos/${OWNER}/${REPO}/releases/latest';
  const status = document.getElementById('pollStatus');
  let tries = 0;
  let stopped = false;

  async function checkOnce() {
    tries++;
    try {
      const r = await fetch(API + '?_=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        const asset = (j.assets || []).find(a => a.name === ASSET);
        if (asset && asset.browser_download_url) {
          status.innerHTML = 'Build complete — starting download.';
          stopped = true;
          window.location.href = asset.browser_download_url;
          return;
        }
        status.textContent = 'Release exists but ' + ASSET + ' not uploaded yet. (poll ' + tries + ')';
      } else if (r.status === 404) {
        status.textContent = 'No release yet — first build still running. (poll ' + tries + ')';
      } else {
        status.textContent = 'GitHub API returned ' + r.status + '. Retrying.';
      }
    } catch (e) {
      status.textContent = 'Network hiccup, retrying. (' + (e.message || 'unknown') + ')';
    }
  }

  function tick() { if (!stopped) checkOnce().finally(() => setTimeout(tick, 4000)); }
  checkOnce().finally(() => setTimeout(tick, 4000));

  document.getElementById('forceBtn').addEventListener('click', (e) => {
    e.preventDefault();
    status.textContent = 'Forcing a re-check…';
    checkOnce();
  });
})();
</script>
</body>
</html>`;
}

export default async function handler(req, res) {
  const file = (req.query?.file || 'AIVA-Setup.exe').toString();
  /* Force refresh skips the 60s cache; useful from the "Check now" button. */
  if (req.query?.refresh === '1') cache = { ts: 0, json: null };

  const release = await fetchLatestRelease();
  if (release && Array.isArray(release.assets)) {
    const a = release.assets.find(x => x.name === file);
    if (a && a.browser_download_url) {
      /* Short-cache 302 so a refresh storm doesn't pin a stale URL but
         we still serve the redirect fast on hot cache. */
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.setHeader('Location', a.browser_download_url);
      res.status(302).end();
      return;
    }
  }

  /* Fallback: branded "build in progress" page with auto-refresh. */
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).send(buildingPage(file));
}
