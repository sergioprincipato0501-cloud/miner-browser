const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  navigate: (url) => ipcRenderer.send('navigate', url),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  reload: () => ipcRenderer.send('reload'),
  toggleMiner: () => ipcRenderer.send('toggle-miner'),
  stopAndQuit: () => ipcRenderer.send('stop-and-quit'),
  newTab: (url) => ipcRenderer.send('new-tab', url),
  switchTab: (id) => ipcRenderer.send('switch-tab', id),
  closeTab: (id) => ipcRenderer.send('close-tab', id),
  requestTabs: () => ipcRenderer.send('request-tabs'),
  onUrlChanged: (cb) => ipcRenderer.on('url-changed', (_, url) => cb(url)),
  onMinerVisibility: (cb) => ipcRenderer.on('miner-visibility', (_, vis) => cb(vis)),
  onShutdownCountdown: (cb) => ipcRenderer.on('shutdown-countdown', (_, sec) => cb(sec)),
  onHtmlFullscreen: (cb) => ipcRenderer.on('html-fullscreen', (_, on) => cb(on)),
  onNativeFullscreen: (cb) => ipcRenderer.on('native-fullscreen', (_, on) => cb(on)),
  onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_, data) => cb(data)),
  onAdblockStatus: (cb) => ipcRenderer.on('adblock-status', (_, on) => cb(on))
});
