const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  closeWindow: () => ipcRenderer.invoke('desktop:close'),
  minimizeWindow: () => ipcRenderer.invoke('desktop:minimize'),
});
