const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  onCloseTab: (callback) => ipcRenderer.on("close-tab", callback),
});
