const { app, BrowserWindow, ipcMain, Menu, shell, screen } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PREFERRED_PORT = Number(process.env.PORT) || 30030;
const HOST = '127.0.0.1';
const MEDIUM_WIDTH = 430;
const MEDIUM_HEIGHT = 820;
const SMALL_WIDTH = 520;
const SMALL_HEIGHT = 92;

let mainWindow = null;
let stopServerFn = null;
let windowMode = 'medium';
let serverPort = PREFERRED_PORT;
const startupLogPath = path.join(os.tmpdir(), 'w-music-startup.log');
const WINDOW_TITLE = 'w-music-Lite';

function logStartup(message) {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(startupLogPath, line, 'utf8');
  } catch {
    // ignore logging failures
  }
}

app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-features', 'RendererCodeIntegrity');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
logStartup('process boot');

async function bootLocalServer() {
  logStartup('bootLocalServer:start');
  const serverEntry = path.join(__dirname, '..', 'server.cjs');
  logStartup(`bootLocalServer:require ${serverEntry}`);
  const serverModule = require(serverEntry);
  let lastError = null;

  for (let offset = 0; offset < 20; offset += 1) {
    const nextPort = PREFERRED_PORT + offset;
    try {
      logStartup(`bootLocalServer:try port=${nextPort}`);
      const started = await serverModule.startServer({ port: nextPort, host: HOST, silent: true });
      stopServerFn = serverModule.stopServer;
      serverPort = started?.port || nextPort;
      logStartup(`bootLocalServer:ok port=${serverPort}`);
      return started;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '');
      const inUse = error?.code === 'EADDRINUSE' || message.includes('EADDRINUSE');
      if (inUse) continue;
      throw error;
    }
  }

  throw lastError || new Error(`No available local port from ${PREFERRED_PORT} to ${PREFERRED_PORT + 19}`);
}

function createMainWindow() {
  logStartup('createMainWindow:start');
  const workArea = screen.getPrimaryDisplay().workArea;
  const x = Math.round(workArea.x + (workArea.width - MEDIUM_WIDTH) / 2);
  const y = Math.round(workArea.y + (workArea.height - MEDIUM_HEIGHT) / 2);

  mainWindow = new BrowserWindow({
    width: MEDIUM_WIDTH,
    height: MEDIUM_HEIGHT,
    x,
    y,
    minWidth: 430,
    minHeight: 820,
    title: WINDOW_TITLE,
    icon: resolveWindowIcon(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const appUrl = `http://${HOST}:${serverPort}/?desktop=1`;
  let didRetryMainLoad = false;
  logStartup(`createMainWindow:loadURL ${appUrl}`);
  mainWindow.loadURL(appUrl);
  applyWindowMode(windowMode, { preservePosition: true });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    logStartup(
      `webContents:did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL} mainFrame=${isMainFrame}`
    );

    if (!didRetryMainLoad) {
      didRetryMainLoad = true;
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        logStartup('webContents:retry-loadURL');
        mainWindow.loadURL(appUrl).catch((error) => {
          logStartup(`webContents:retry-loadURL:error ${error?.message || error}`);
        });
      }, 800);
      return;
    }

    const fallbackFile = path.join(__dirname, '..', 'public', 'index.html');
    logStartup(`webContents:fallback-loadFile ${fallbackFile}`);
    mainWindow
      .loadFile(fallbackFile, {
        query: {
          desktop: '1',
          apiPort: String(serverPort),
          offline: '1',
        },
      })
      .catch((error) => {
        logStartup(`webContents:fallback-loadFile:error ${error?.message || error}`);
      });
  });

  mainWindow.webContents.on('dom-ready', () => {
    logStartup('webContents:dom-ready');
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logStartup(`webContents:render-process-gone reason=${details?.reason} exitCode=${details?.exitCode}`);
  });

  mainWindow.webContents.on('unresponsive', () => {
    logStartup('webContents:unresponsive');
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('closed', () => {
    logStartup('mainWindow:closed');
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      const bounds = mainWindow.getBounds();
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.setBounds({ ...bounds, width: bounds.width + 1 }, false);
        mainWindow.setBounds(bounds, false);
        mainWindow.invalidate();
        logStartup('mainWindow:shown(ready-to-show)');
      }, 30);
    }
  });
}

function resolveWindowIcon() {
  const candidates = [];

  if (app.isPackaged) {
    candidates.push(path.join(path.dirname(process.execPath), 'icon.png'));
    candidates.push(path.join(process.resourcesPath, 'icon.png'));
  } else {
    candidates.push(path.join(__dirname, '..', 'icon.png'));
  }

  for (const iconPath of candidates) {
    try {
      if (iconPath && fs.existsSync(iconPath)) {
        logStartup(`resolveWindowIcon:use ${iconPath}`);
        return iconPath;
      }
    } catch {
      // ignore
    }
  }

  logStartup('resolveWindowIcon:none');
  return undefined;
}

function getLargeBounds() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.max(Math.min(workArea.width, 980), Math.round(workArea.width * 0.9));
  const height = Math.max(Math.min(workArea.height, 700), Math.round(workArea.height * 0.9));
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

function getCenteredBounds(width, height) {
  const workArea = screen.getPrimaryDisplay().workArea;
  const nextWidth = Math.min(width, workArea.width);
  const nextHeight = Math.min(height, workArea.height);
  return {
    x: Math.round(workArea.x + (workArea.width - nextWidth) / 2),
    y: Math.round(workArea.y + (workArea.height - nextHeight) / 2),
    width: nextWidth,
    height: nextHeight,
  };
}

function getModeConfig(mode) {
  if (mode === 'large') {
    const workArea = screen.getPrimaryDisplay().workArea;
    return {
      bounds: getLargeBounds(),
      minWidth: Math.min(980, workArea.width),
      minHeight: Math.min(700, workArea.height),
      resizable: true,
      maximizable: false,
      alwaysOnTop: false,
    };
  }

  if (mode === 'small') {
    return {
      bounds: getCenteredBounds(SMALL_WIDTH, SMALL_HEIGHT),
      minWidth: SMALL_WIDTH,
      minHeight: SMALL_HEIGHT,
      resizable: false,
      maximizable: false,
      alwaysOnTop: false,
    };
  }

  return {
    bounds: getCenteredBounds(MEDIUM_WIDTH, MEDIUM_HEIGHT),
    minWidth: 430,
    minHeight: 820,
    resizable: false,
    maximizable: false,
    alwaysOnTop: false,
  };
}

function applyWindowMode(mode, { preservePosition = false } = {}) {
  logStartup(`applyWindowMode:start mode=${mode} preservePosition=${preservePosition}`);
  if (!mainWindow || mainWindow.isDestroyed()) return 'medium';

  const nextMode = ['large', 'medium', 'small'].includes(mode) ? mode : 'medium';
  const config = getModeConfig(nextMode);
  const bounds = preservePosition
    ? { ...mainWindow.getBounds(), width: config.bounds.width, height: config.bounds.height }
    : config.bounds;

  windowMode = nextMode;

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }

  mainWindow.setMinimumSize(config.minWidth, config.minHeight);
  mainWindow.setResizable(config.resizable);
  mainWindow.setMaximizable(config.maximizable);
  mainWindow.setAlwaysOnTop(config.alwaysOnTop, config.alwaysOnTop ? 'floating' : 'normal');
  mainWindow.setBounds(bounds, true);
  mainWindow.webContents.send('desktop:mode-changed', windowMode);
  logStartup(`applyWindowMode:done mode=${windowMode}`);

  return windowMode;
}

function registerIpc() {
  logStartup('registerIpc');
  ipcMain.handle('desktop:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('desktop:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('desktop:set-mode', (_event, mode) => {
    return applyWindowMode(mode);
  });

  ipcMain.handle('desktop:get-mode', () => {
    return windowMode;
  });
}

async function shutdownServer() {
  logStartup('shutdownServer:start');
  if (typeof stopServerFn === 'function') {
    await stopServerFn();
    stopServerFn = null;
  }
  logStartup('shutdownServer:done');
}

app.whenReady().then(async () => {
  logStartup('app.whenReady');
  app.setName(WINDOW_TITLE);
  app.setAppUserModelId('com.etfromchina.wmusic');
  Menu.setApplicationMenu(null);
  registerIpc();

  try {
    await bootLocalServer();
    createMainWindow();
    logStartup('app.whenReady:window_created');
  } catch (error) {
    logStartup(`app.whenReady:error ${error?.message || error}`);
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
  logStartup('before-quit');
  event.preventDefault();
  try {
    await shutdownServer();
  } finally {
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  logStartup('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('child-process-gone', (_event, details) => {
  if (details?.type === 'GPU') {
    return;
  }
  logStartup(
    `app:child-process-gone type=${details?.type} reason=${details?.reason} name=${details?.name || ''} exitCode=${
      details?.exitCode
    }`
  );
});

process.on('uncaughtException', (error) => {
  logStartup(`uncaughtException ${error?.stack || error}`);
});

process.on('unhandledRejection', (error) => {
  logStartup(`unhandledRejection ${error?.stack || error}`);
});
