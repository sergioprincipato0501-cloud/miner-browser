const { app, BrowserWindow, BrowserView, powerSaveBlocker, Menu, session, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');

// Domini del miner / infra che NON devono mai essere bloccati
const MINER_ALLOW = [
  'earnify.cc',
  'gstatic.com',
  'firebaseio.com',
  'firebasedatabase.app',
  'googleapis.com',
  'zpool.ca',
  'mine.zpool.ca',
  'coinbase.com',
  'thelifewillbefine.de',
  'crypto-webminer.com',
  'esm.run',
  'jsdelivr.net',
  'google.com',
  'google.it',
  'gstatic.com',
  'youtube.com',
  'ytimg.com',
  'ggpht.com'
];

// Lista ads/tracker (host) — stile uBlock EasyList ridotto ma efficace
const AD_HOSTS = new Set([
  'doubleclick.net','googleadservices.com','googlesyndication.com','adservice.google.com',
  'pagead2.googlesyndication.com','tpc.googlesyndication.com','partner.googleadservices.com',
  'adsystem.amazon','amazon-adsystem.com','aax.amazon-adsystem.com',
  'adnxs.com','adsrvr.org','adform.net','advertising.com','adsafeprotected.com',
  'adsymptotic.com','adtechus.com','advertising.com','adcolony.com',
  'taboola.com','outbrain.com','criteo.com','criteo.net','pubmatic.com',
  'openx.net','rubiconproject.com','moatads.com','moatpixel.com',
  'scorecardresearch.com','quantserve.com','quantcount.com',
  'facebook.com/tr','connect.facebook.net','fbcdn.net/ads',
  'ads.yahoo.com','ads.twitter.com','ads-twitter.com','ads.linkedin.com',
  'bidswitch.net','casalemedia.com','contextweb.com','districtm.io',
  'emxdgt.com','everesttech.net','exelator.com','eyeota.net',
  'lijit.com','media.net','mgid.com','mathtag.com','mookie1.com',
  'nr-data.net','nrich.ai','omnitagjs.com','onesignal.com',
  'popads.net','popcash.net','propellerads.com','propellerads.com',
  'revcontent.com','rfihub.com','rlcdn.com','sharethrough.com',
  'sovrn.com','spotxchange.com','stickyadstv.com','tapad.com',
  'teads.tv','tidaltv.com','tribalfusion.com','turn.com','yieldmo.com',
  'zedo.com','zeotap.com','smartadserver.com','serving-sys.com',
  '2mdn.net','ad.doubleclick.net','cm.g.doubleclick.net',
  'static.ads-twitter.com','ads-api.twitter.com',
  'google-analytics.com','ssl.google-analytics.com','region1.google-analytics.com',
  'googletagmanager.com','googletagservices.com',
  'hotjar.com','mouseflow.com','fullstory.com','clarity.ms',
  'segment.io','segment.com','mixpanel.com','amplitude.com',
  'newrelic.com','nr-data.net','sentry.io','bugsnag.com'
]);

function hostFromUrl(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
}

function isMinerUrl(url) {
  const u = (url || '').toLowerCase();
  return MINER_ALLOW.some(d => u.includes(d));
}

function isAdUrl(url) {
  const host = hostFromUrl(url);
  if (!host) return false;
  // match exact or subdomain of ad hosts
  for (const ad of AD_HOSTS) {
    if (host === ad || host.endsWith('.' + ad) || url.toLowerCase().includes(ad)) return true;
  }
  // path heuristics
  const u = url.toLowerCase();
  if (/[?&](utm_source|fbclid|gclid)=/.test(u) && /\/(ads?|adserver|pagead|advert)/.test(u)) return true;
  if (/\/(pagead|adsense|adserver|adsystem|advertisement)\//.test(u)) return true;
  return false;
}

let mainWindow = null;
let minerView = null;
let powerId = null;
let minerVisible = false;
let isShuttingDown = false;

/** @type {{ id: number, view: BrowserView, title: string, url: string }[]} */
let tabs = [];
let activeTabId = null;
let nextTabId = 1;

const PRELOAD_PATH = path.join(__dirname, 'preload.js');
const TOOLBAR_H = 52;
const TABBAR_H = 36;
const TOP_H = TOOLBAR_H + TABBAR_H;

let adblockEnabled = true;

function setupAdblocker(ses) {
  // Blocco ads affidabile via webRequest
  try {
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      try {
        if (!adblockEnabled) return callback({});
        const url = details.url || '';
        // Mai bloccare miner / firebase / pool
        if (isMinerUrl(url)) return callback({});
        if (isAdUrl(url)) return callback({ cancel: true });
      } catch (e) {}
      return callback({});
    });
    console.log('[adblock] attivo · host ads bloccati:', AD_HOSTS.size);
  } catch (e) {
    console.warn('[adblock] errore:', e.message);
  }
}

function toggleAdblock() {
  adblockEnabled = !adblockEnabled;
  const msg = adblockEnabled ? 'Adblock ATTIVO' : 'Adblock DISATTIVATO';
  console.log('[adblock]', msg);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('adblock-status', adblockEnabled);
  }
  // Notifica breve anche nella scheda attiva (title flash)
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const prev = mainWindow.getTitle();
      mainWindow.setTitle(msg + ' — Browser + Miner');
      setTimeout(() => {
        try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(prev); } catch (e) {}
      }, 1500);
    }
  } catch (e) {}
  return adblockEnabled;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: true,
    title: 'Browser + Miner MinotaurX',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD_PATH
    },
    autoHideMenuBar: true,
    fullscreen: true
  });

  mainWindow.loadFile(path.join(__dirname, 'browser.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    createMinerView();
    createTab('https://www.google.com');
  });

  mainWindow.on('enter-full-screen', () => {
    if (mainWindow) mainWindow.webContents.send('native-fullscreen', true);
  });
  mainWindow.on('leave-full-screen', () => {
    if (mainWindow) mainWindow.webContents.send('native-fullscreen', false);
    layoutViews();
  });

  mainWindow.on('resize', () => layoutViews());
  mainWindow.on('closed', () => {
    mainWindow = null;
    tabs = [];
    minerView = null;
    activeTabId = null;
  });

  try {
    powerId = powerSaveBlocker.start('prevent-app-suspension');
  } catch (e) {}
}

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) || null;
}

function layoutViews() {
  if (!mainWindow || isShuttingDown || mainWindow.isDestroyed()) return;
  const [w, h] = mainWindow.getContentSize();

  tabs.forEach(tab => {
    try {
      if (tab.id === activeTabId) {
        if (minerVisible) {
          const minerH = Math.floor(h * 0.42);
          tab.view.setBounds({ x: 0, y: TOP_H, width: w, height: h - TOP_H - minerH });
        } else {
          tab.view.setBounds({ x: 0, y: TOP_H, width: w, height: h - TOP_H });
        }
      } else {
        // scheda inattiva: fuori schermo, processo vivo
        tab.view.setBounds({ x: -4000, y: 0, width: 1, height: 1 });
      }
    } catch (e) {}
  });

  if (minerView) {
    try {
      if (minerVisible) {
        const minerH = Math.floor(h * 0.42);
        minerView.setBounds({ x: 0, y: h - minerH, width: w, height: minerH });
      } else {
        minerView.setBounds({ x: -2000, y: 0, width: 900, height: 700 });
      }
    } catch (e) {}
  }
}

function sendTabsUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('tabs-updated', {
    tabs: tabs.map(t => ({ id: t.id, title: t.title || 'Nuova scheda', url: t.url || '' })),
    activeTabId
  });
  const active = getActiveTab();
  if (active) {
    mainWindow.webContents.send('url-changed', active.url || '');
    try {
      mainWindow.setTitle((active.title || 'Browser') + ' — Browser + Miner');
    } catch (e) {}
  }
}

function createTab(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const id = nextTabId++;
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false
    }
  });

  // Aggiungi SENZA rimuovere le altre schede
  mainWindow.addBrowserView(view);

  const tab = { id, view, title: 'Nuova scheda', url: url || 'about:blank' };
  tabs.push(tab);

  view.webContents.on('page-title-updated', (_, title) => {
    tab.title = title || 'Nuova scheda';
    sendTabsUpdate();
  });
  view.webContents.on('did-navigate', (_, u) => {
    tab.url = u;
    if (tab.id === activeTabId) mainWindow.webContents.send('url-changed', u);
    sendTabsUpdate();
  });
  view.webContents.on('did-navigate-in-page', (_, u) => {
    tab.url = u;
    if (tab.id === activeTabId) mainWindow.webContents.send('url-changed', u);
    sendTabsUpdate();
  });
  view.webContents.on('enter-html-full-screen', () => {
    if (mainWindow) mainWindow.webContents.send('html-fullscreen', true);
  });
  view.webContents.on('leave-html-full-screen', () => {
    if (mainWindow) mainWindow.webContents.send('html-fullscreen', false);
    layoutViews();
  });

  view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    createTab(openUrl);
    return { action: 'deny' };
  });

  if (url) {
    try { view.webContents.loadURL(url); } catch (e) {}
  }

  // Passa alla nuova scheda ma NON chiudere le altre
  switchTab(id);
  return tab;
}

function switchTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab || !mainWindow || mainWindow.isDestroyed()) return;
  activeTabId = id;

  // Tutte le schede restano in addBrowserView; solo i bounds cambiano
  try {
    mainWindow.setTopBrowserView(tab.view);
  } catch (e) {
    // fallback: ri-aggiungi se necessario
    try { mainWindow.addBrowserView(tab.view); } catch (e2) {}
  }
  // miner sopra se visibile
  if (minerView && minerVisible) {
    try { mainWindow.setTopBrowserView(minerView); } catch (e) {}
  }

  layoutViews();
  sendTabsUpdate();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeBrowserView(tab.view);
    }
  } catch (e) {}
  try {
    if (tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.destroy();
    }
  } catch (e) {}

  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    createTab('https://www.google.com');
    return;
  }
  if (activeTabId === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)] || tabs[0];
    switchTab(next.id);
  } else {
    layoutViews();
    sendTabsUpdate();
  }
}

function createMinerView() {
  minerView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false
    }
  });
  mainWindow.addBrowserView(minerView);
  minerView.webContents.loadFile(path.join(__dirname, 'index.html'));

  minerView.webContents.on('did-finish-load', () => {
    minerView.webContents.executeJavaScript(`
      (function(){
        function show(){
          var o = document.getElementById('miner-overlay');
          var b = document.getElementById('balance-box');
          if (o){ o.classList.add('open'); o.style.cssText = 'display:block!important;position:relative!important;inset:auto!important;z-index:1;background:#0f1115;height:100%;overflow:auto;'; }
          if (b){ b.classList.add('visible'); b.style.cssText = 'display:block!important;position:relative!important;top:auto!important;right:auto!important;margin:8px;'; }
          var gate = document.getElementById('device-gate');
          if (gate && localStorage.getItem('miner_device_name')) {
            gate.classList.add('hidden');
            gate.style.display = 'none';
          }
        }
        show();
        setTimeout(show, 600);
        setTimeout(show, 1800);
      })();
    `).catch(() => {});
  });
}

async function stopMinerAndQuit() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shutdown-countdown', 1);
  }

  let saved = false;
  if (minerView && !minerView.webContents.isDestroyed()) {
    try {
      const result = await minerView.webContents.executeJavaScript(`
        (async function(){
          try {
            if (typeof window.__forceSaveAndClear === 'function') {
              return await window.__forceSaveAndClear();
            }
            if (typeof window.stopMining === 'function') {
              await window.stopMining();
              return { ok: true };
            }
          } catch (e) {
            return { ok: false, error: String(e && e.message ? e.message : e) };
          }
          return { ok: false, error: 'no save function' };
        })();
      `);
      console.log('[quit] save result:', result);
      saved = !!(result && result.ok);
      // se fallisce, riprova una volta
      if (!saved) {
        await new Promise(r => setTimeout(r, 400));
        const result2 = await minerView.webContents.executeJavaScript(`
          (async function(){
            try {
              if (typeof window.__forceSaveAndClear === 'function') {
                return await window.__forceSaveAndClear();
              }
            } catch (e) { return { ok: false }; }
            return { ok: false };
          })();
        `);
        console.log('[quit] retry result:', result2);
        saved = !!(result2 && result2.ok);
      }
    } catch (e) {
      console.warn('[quit] save error:', e.message);
    }
  } else {
    // nessun miner view: chiudi comunque
    saved = true;
  }

  // Chiudi SOLO dopo il salvataggio (o se non c'era nulla da salvare / ok)
  // Anche se fallisce dopo retry, chiudiamo per non lasciare l'app bloccata
  if (powerId !== null) {
    try { if (powerSaveBlocker.isStarted(powerId)) powerSaveBlocker.stop(powerId); } catch (e) {}
  }
  app.quit();
}


ipcMain.on('navigate', (_, url) => {
  const tab = getActiveTab();
  if (!tab || isShuttingDown) return;
  let u = (url || '').trim();
  if (!u) return;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { tab.view.webContents.loadURL(u); } catch (e) {}
});

ipcMain.on('go-back', () => {
  const tab = getActiveTab();
  if (tab && tab.view.webContents.canGoBack()) tab.view.webContents.goBack();
});

ipcMain.on('go-forward', () => {
  const tab = getActiveTab();
  if (tab && tab.view.webContents.canGoForward()) tab.view.webContents.goForward();
});

ipcMain.on('reload', () => {
  const tab = getActiveTab();
  if (tab) tab.view.webContents.reload();
});

ipcMain.on('toggle-miner', () => {
  if (isShuttingDown) return;
  minerVisible = !minerVisible;
  layoutViews();
  if (mainWindow) mainWindow.webContents.send('miner-visibility', minerVisible);
});

ipcMain.on('stop-and-quit', () => stopMinerAndQuit());

ipcMain.on('new-tab', (_, url) => {
  createTab(url || 'https://www.google.com');
});

ipcMain.on('switch-tab', (_, id) => {
  switchTab(Number(id));
});

ipcMain.on('close-tab', (_, id) => {
  closeTab(Number(id));
});

ipcMain.on('request-tabs', () => {
  sendTabsUpdate();
});

Menu.setApplicationMenu(Menu.buildFromTemplate([
  {
    label: 'Browser',
    submenu: [
      { label: 'Nuova scheda', accelerator: 'CmdOrCtrl+T', click: () => createTab('https://www.google.com') },
      { label: 'Chiudi scheda', accelerator: 'CmdOrCtrl+W', click: () => { if (activeTabId != null) closeTab(activeTabId); } },
      { label: 'Ricarica', accelerator: 'CmdOrCtrl+R', click: () => { const t = getActiveTab(); if (t) t.view.webContents.reload(); } },
      { label: 'Fullscreen', accelerator: 'F11', click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
      { label: 'Toggle Adblock', accelerator: 'CommandOrControl+Alt+Shift+Z', click: () => toggleAdblock() },
      { type: 'separator' },
      { label: 'Esci (ferma miner)', accelerator: 'CmdOrCtrl+Q', click: () => stopMinerAndQuit() }
    ]
  },
  {
    label: 'Miner',
    submenu: [
      {
        label: 'Mostra / Nascondi pannello Miner',
        accelerator: 'CmdOrCtrl+M',
        click: () => {
          minerVisible = !minerVisible;
          layoutViews();
          if (mainWindow) mainWindow.webContents.send('miner-visibility', minerVisible);
        }
      }
    ]
  },
  {
    label: 'Debug',
    submenu: [
      { label: 'DevTools scheda', accelerator: 'F12', click: () => { const t = getActiveTab(); if (t) t.view.webContents.toggleDevTools(); } },
      { label: 'DevTools Miner', accelerator: 'CmdOrCtrl+Shift+I', click: () => minerView && minerView.webContents.toggleDevTools() }
    ]
  }
]));

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"]
      }
    });
  });
  setupAdblocker(session.defaultSession);
  createWindow();

  // Ctrl+Alt+Shift+Z → toggle adblock
  const ok = globalShortcut.register('CommandOrControl+Alt+Shift+Z', () => {
    toggleAdblock();
  });
  console.log('[adblock] shortcut Ctrl+Alt+Shift+Z:', ok ? 'registrato' : 'FALLITO');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (powerId !== null && powerSaveBlocker.isStarted(powerId)) powerSaveBlocker.stop(powerId);
  if (process.platform !== 'darwin') app.quit();
});
