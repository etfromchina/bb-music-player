const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT) || 30030;
const HOST = '127.0.0.1';
const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 490;

let mainWindow = null;
let stopServerFn = null;

async function bootLocalServer() {
  const serverEntry = path.join(__dirname, '..', 'server.js');
  const serverModule = await import(pathToFileURL(serverEntry).href);
  const started = await serverModule.startServer({ port: PORT, host: HOST, silent: true });
  stopServerFn = serverModule.stopServer;
  return started;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: 360,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const appUrl = `http://${HOST}:${PORT}/?desktop=1`;
  mainWindow.loadURL(appUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('closed', () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle('desktop:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('desktop:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
}

async function shutdownServer() {
  if (typeof stopServerFn === 'function') {
    await stopServerFn();
    stopServerFn = null;
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerIpc();

  try {
    await bootLocalServer();
    createMainWindow();
  } catch (error) {
    console.error('[desktop startup error]', error?.message || error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', async (event) => {
  event.preventDefault();
  try {
    await shutdownServer();
  } finally {
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
