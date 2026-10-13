/**
 * ZenNovel desktop: the same editor as the website, in its own window, with
 * projects as folders on disk and exports to Windows / Linux games.
 *
 * The editor (packages/editor, built into ../editor) is served over
 * zn-app://, project files over zn-project://. Everything that touches the
 * disk happens here and is offered to the page through preload.cts.
 */
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, type OpenDialogOptions } from 'electron';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ExportError, GameExporter, type ExportRequest } from './export.js';
import { extensionsFor, importMedia, type MediaKind } from './media.js';
import { ASSET_SCHEME, assetUrl, insideProject, parseAssetUrl, PROJECT_FILE, ProjectLibrary } from './projects.js';

const here = dirname(fileURLToPath(import.meta.url));
/** The built editor (vite build --base ./). */
const editorDir = resolve(here, '..', 'editor');
/** Set by `pnpm desktop:dev` to load the Vite dev server instead. */
const devUrl = process.env.ZN_DEV_URL;

protocol.registerSchemesAsPrivileged([
  { scheme: 'zn-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

if (!app.requestSingleInstanceLock()) app.quit();
app.setName('ZenNovel');

const library = new ProjectLibrary({
  settingsFile: join(app.getPath('userData'), 'projects.json'),
  defaultRoot: join(app.getPath('documents'), 'ZenNovel'),
});

/** A packaged app keeps these outside app.asar (see electron-builder config), so they can be copied. */
const unpacked = (p: string) => p.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`);

function steamworksDir(): string | null {
  try {
    return unpacked(dirname(createRequire(import.meta.url).resolve('steamworks.js/package.json')));
  } catch {
    return null;
  }
}

const exporter = new GameExporter({
  cacheDir: join(app.getPath('userData'), 'cache'),
  shellDir: unpacked(join(here, 'shell')),
  electronVersion: process.versions.electron,
  steamworksDir: steamworksDir(),
  // Electron's fetch uses the system proxy settings.
  fetch: net.fetch as typeof fetch,
});

const MEDIA_FILTER_NAMES: Record<MediaKind, string> = { image: 'Images', audio: 'Audio' };

async function fileResponse(file: string, cors = false) {
  const res = await net.fetch(pathToFileURL(file).href);
  if (!cors) return res;
  // The editor reads project files with fetch() when it exports a portable project file.
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(res.body, { status: res.status, headers });
}

function registerProtocols() {
  protocol.handle('zn-app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = insideProject(editorDir, rel.endsWith('/') ? `${rel}index.html` : rel);
    if (!file || !existsSync(file)) return new Response('Not found', { status: 404 });
    return fileResponse(file);
  });
  protocol.handle(ASSET_SCHEME, async (req) => {
    const parsed = parseAssetUrl(req.url);
    const dir = parsed && (await library.dirOf(parsed.projectId));
    const file = dir && insideProject(dir, parsed.rel);
    if (!file || !existsSync(file)) return new Response('Not found', { status: 404 });
    return fileResponse(file, true);
  });
}

function withAssetUrls<T extends { src: string }>(projectId: string, assets: T[]): T[] {
  return assets.map((a) => ({ ...a, src: assetUrl(projectId, a.src) }));
}

async function projectDir(id: string): Promise<string> {
  const dir = await library.dirOf(id);
  if (!dir) throw new Error('This project has not been saved yet');
  return dir;
}

function registerIpc() {
  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    steamworks: steamworksDir() !== null,
    projectsRoot: await library.root(),
  }));

  ipcMain.handle('projects:list', () => library.list());
  ipcMain.handle('projects:read', (_e, id: string) => library.read(id));
  ipcMain.handle('projects:write', (_e, project) => library.write(project));
  ipcMain.handle('projects:remove', (_e, id: string) => library.remove(id, (dir) => shell.trashItem(dir)));
  ipcMain.handle('projects:reveal', async (_e, id: string) => {
    shell.showItemInFolder(join(await projectDir(id), PROJECT_FILE));
  });
  ipcMain.handle('projects:openFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    return library.register(res.filePaths[0]);
  });
  ipcMain.handle('projects:chooseRoot', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const res = await dialog.showOpenDialog(win, {
      defaultPath: await library.root(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    await library.setRoot(res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle('media:pick', async (e, projectId: string, kinds: MediaKind[], multiple: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const options: OpenDialogOptions = {
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [
        ...kinds.map((k) => ({ name: MEDIA_FILTER_NAMES[k], extensions: extensionsFor([k]) })),
        ...(kinds.length > 1 ? [{ name: 'Images & audio', extensions: extensionsFor(kinds) }] : []),
      ],
    };
    const res = await dialog.showOpenDialog(win, options);
    if (res.canceled) return { assets: [], rejected: [] };
    const result = await importMedia(await projectDir(projectId), res.filePaths, kinds);
    return { ...result, assets: withAssetUrls(projectId, result.assets) };
  });
  ipcMain.handle('media:import', async (_e, projectId: string, paths: string[], kinds: MediaKind[]) => {
    const result = await importMedia(await projectDir(projectId), paths, kinds);
    return { ...result, assets: withAssetUrls(projectId, result.assets) };
  });

  ipcMain.handle('export:run', async (e, projectId: string, req: ExportRequest) => {
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const res = await dialog.showOpenDialog(win, {
      title: req.gameName,
      defaultPath: app.getPath('desktop'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    try {
      return await exporter.export(await projectDir(projectId), req, res.filePaths[0], (p) => {
        if (!e.sender.isDestroyed()) e.sender.send('export:progress', p);
      });
    } catch (err) {
      // Errors lose their fields on the way through IPC: send the code along.
      return {
        error: {
          code: err instanceof ExportError ? err.code : 'other',
          message: String((err as Error)?.message ?? err),
        },
      };
    }
  });
  ipcMain.handle('shell:reveal', (_e, path: string) => shell.openPath(path));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'ZenNovel',
    backgroundColor: '#f5f1ea',
    show: false,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    // The editor's "▶ Play" and the sample play page open in a window of their own.
    if (
      url === 'about:blank' ||
      url.startsWith('zn-app:') ||
      url.startsWith('blob:') ||
      (devUrl && url.startsWith(devUrl))
    ) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 1280, height: 760, autoHideMenuBar: true, backgroundColor: '#000000' },
      };
    }
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  void win.loadURL(devUrl ?? 'zn-app://editor/index.html');
  return win;
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

void app.whenReady().then(() => {
  registerProtocols();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
