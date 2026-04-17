const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPanel", {
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  openUrl: (url) => ipcRenderer.invoke("url:open", url),
  setSnapEnabled: (enabled) => ipcRenderer.invoke("app:setSnapEnabled", enabled),
  setWindowSize: (width, height) => ipcRenderer.invoke("window:setSize", width, height),
  setDropAccepting: (accepting) => ipcRenderer.invoke("drop:setAccepting", accepting),
  resolveLnkFiles: (filePaths) => ipcRenderer.invoke("shortcuts:resolveLnkFiles", filePaths),
  searchIconSuggestions: (query) => ipcRenderer.invoke("icons:searchSuggestions", query),
  searchOfficialUrl: (query) => ipcRenderer.invoke("links:searchOfficialUrl", query),
  snapAfterDrag: () => ipcRenderer.invoke("window:snapAfterDrag"),
  getLaunchAtLogin: () => ipcRenderer.invoke("app:getLaunchAtLogin"),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke("app:setLaunchAtLogin", enabled)
});
