/**
 * The program inside an exported desktop game (Electron build). It is copied
 * into resources/app/ next to the game folder (game/index.html + assets/),
 * so it must not import anything but Electron and Node.
 *
 * - Serves game/ over game://, so the page, its images and its music load
 *   like a website.
 * - Keeps saves as files in the user's app-data folder (one file per slot),
 *   which Steam Cloud can sync.
 * - F11 / Alt+Enter toggle fullscreen.
 * - With resources/app/steam.json and steamworks.js, talks to Steam
 *   (achievements and the overlay).
 */
import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from 'electron';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameDir = resolve(here, 'game');

// Containers such as the Steam Linux Runtime don't allow Chromium's sandbox.
// The game only shows its own files, so it runs without it on Linux.
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');

protocol.registerSchemesAsPrivileged([
  { scheme: 'game', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

interface SteamClient {
  achievement: { activate(name: string): boolean };
}
let steam: SteamClient | null = null;
try {
  const config = JSON.parse(readFileSync(join(here, 'steam.json'), 'utf8')) as { appId: number };
  const steamworks = createRequire(import.meta.url)('steamworks.js') as {
    init(appId: number): SteamClient;
    electronEnableSteamOverlay(): void;
  };
  steam = steamworks.init(config.appId);
  steamworks.electronEnableSteamOverlay();
} catch {
  // Not a Steam build, or Steam isn't running.
}

// Saves live in <app data>/<game name>/saves. Set explicitly: with a non-ASCII
// game name (e.g. 大裂) Electron can fall back to the app data folder itself.
app.setPath('userData', join(app.getPath('appData'), app.getName()));

if (!app.requestSingleInstanceLock()) app.quit();

const savesDir = () => join(app.getPath('userData'), 'saves');
const saveFile = (key: string) => join(savesDir(), `${String(key).replace(/[^\w.-]+/g, '_')}.json`);

ipcMain.on('save:get', (e, key: string) => {
  try {
    e.returnValue = readFileSync(saveFile(key), 'utf8');
  } catch {
    e.returnValue = null;
  }
});
ipcMain.on('save:set', (e, key: string, value: string) => {
  try {
    mkdirSync(savesDir(), { recursive: true });
    const file = saveFile(key);
    writeFileSync(`${file}.tmp`, String(value));
    renameSync(`${file}.tmp`, file);
    e.returnValue = true;
  } catch {
    e.returnValue = false;
  }
});
ipcMain.on('save:remove', (e, key: string) => {
  rmSync(saveFile(key), { force: true });
  e.returnValue = true;
});
ipcMain.on('game:isFullscreen', (e) => {
  e.returnValue = BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false;
});
ipcMain.handle('game:fullscreen', (e, on?: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return false;
  win.setFullScreen(on ?? !win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('game:quit', () => app.quit());
ipcMain.handle('game:achievement', (_e, name: string) => {
  try {
    return steam ? steam.achievement.activate(String(name)) : false;
  } catch {
    return false;
  }
});

function toggleFullscreen() {
  const win = BrowserWindow.getFocusedWindow();
  win?.setFullScreen(!win.isFullScreen());
}

void app.whenReady().then(async () => {
  protocol.handle('game', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = resolve(gameDir, rel);
    if (!file.startsWith(gameDir + sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });

  // No visible menu; the shortcuts still work.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.getName(),
        submenu: [
          { label: 'Fullscreen', accelerator: 'F11', click: toggleFullscreen },
          { label: 'Fullscreen', accelerator: 'Alt+Enter', click: toggleFullscreen },
          { role: 'quit' },
        ],
      },
    ]),
  );

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#000000',
    title: app.getName(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      // Music should start without waiting for a click.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('game://')) e.preventDefault();
  });
  await win.loadURL('game://local/index.html');
});

app.on('window-all-closed', () => app.quit());
