const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  closeWindow: () => ipcRenderer.invoke('desktop:close'),
  minimizeWindow: () => ipcRenderer.invoke('desktop:minimize'),
  setWindowMode: (mode) => ipcRenderer.invoke('desktop:set-mode', mode),
  getWindowMode: () => ipcRenderer.invoke('desktop:get-mode'),
  onModeChanged: (handler) => {
    const listener = (_event, mode) => {
      if (typeof handler === 'function') handler(mode);
    };
    ipcRenderer.on('desktop:mode-changed', listener);
    return () => ipcRenderer.removeListener('desktop:mode-changed', listener);
  },
});
