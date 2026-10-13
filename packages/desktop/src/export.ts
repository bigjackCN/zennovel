/**
 * Turning a project into games people can download.
 *
 * Every export starts from one "game folder" (index.html with the player
 * and the story, plus assets/), the same thing that is uploaded to a website
 * or to itch.io as an HTML5 game. Desktop builds wrap that folder:
 *
 * - Electron: an official Electron release for the target system, renamed,
 *   with a small app (shell/) in resources/app that opens the game folder.
 *   The same build works for Steam (achievements, cloud-friendly save files).
 * - Tauri: a prebuilt ZenNovel player (packages/shell-tauri, published as a
 *   GitHub release) next to the game folder. Much smaller; uses the
 *   system's web view.
 *
 * Downloads are cached, so only the first export for a system needs the
 * network.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { chmod, copyFile, cp, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { insideProject, safeName } from './projects.js';
import { extractZip, zipFolder } from './zip.js';

export type ExportTarget = 'web' | 'windows-electron' | 'linux-electron' | 'windows-tauri' | 'linux-tauri';

export interface GameFile {
  /** Path in the game folder, e.g. "assets/forest.webp". */
  path: string;
  /** A file in the project folder (relative path), or file contents as a data: URL. */
  from: { projectRel: string } | { dataUrl: string };
}

export interface ExportRequest {
  gameName: string;
  /** "1.0.0"-style version for the desktop builds. */
  version?: string;
  targets: ExportTarget[];
  /** Also pack each build as a .zip (what itch.io and most websites want). */
  zip: boolean;
  /** Steam App ID: adds Steam support (achievements, overlay) to the Electron builds. */
  steamAppId?: string | null;
  /** The game page: player script + story, with assets at assets/… */
  html: string;
  files: GameFile[];
}

export interface ExportProgress {
  /** Machine-readable step, worded by the editor. */
  step: 'game' | 'download' | 'unpack' | 'package' | 'zip' | 'done';
  target?: ExportTarget;
  /** 0–1 within the step, when known. */
  fraction?: number;
}

export interface ExportOutput {
  target: ExportTarget;
  /** Folder that holds the build. */
  folder: string;
  /** The .zip of it, when asked for. */
  zip?: string;
}

export interface ExporterOptions {
  /** Where downloads are kept between exports. */
  cacheDir: string;
  /** Compiled Electron game shell (main.js, preload.cjs). */
  shellDir: string;
  /** Electron version to package games with: the editor's own. */
  electronVersion: string;
  /** Base URLs that host electron-v<version>-<platform>-x64.zip and SHASUMS256.txt, tried in order. */
  electronMirrors?: string[];
  /** Base URL of the release that holds the prebuilt Tauri players. */
  tauriRelease?: string;
  /** Folder of the steamworks.js package, if installed. */
  steamworksDir?: string | null;
  /** fetch to use for downloads (Electron's net.fetch follows the system proxy). */
  fetch?: typeof fetch;
}

export const DEFAULT_ELECTRON_MIRRORS = [
  'https://github.com/electron/electron/releases/download/v{version}/',
  // Mirror for players and writers in mainland China.
  'https://npmmirror.com/mirrors/electron/{version}/',
];
export const DEFAULT_TAURI_RELEASE = 'https://github.com/bigjackCN/zennovel/releases/download/shell-tauri-v1/';

export class ExportError extends Error {
  code: 'download' | 'checksum' | 'steamworks' | 'tauriMissing' | 'tooLarge';
  constructor(code: ExportError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

const platformOf = (t: ExportTarget) => (t.startsWith('windows') ? 'windows' : 'linux');

/** The game's binary name: readable, but safe on every file system. */
export function binaryName(gameName: string, target: ExportTarget): string {
  const base = safeName(gameName, 'Game');
  return platformOf(target) === 'windows' ? `${base}.exe` : base;
}

export class GameExporter {
  private o: Required<Omit<ExporterOptions, 'steamworksDir'>> & { steamworksDir: string | null };

  constructor(options: ExporterOptions) {
    this.o = {
      electronMirrors: DEFAULT_ELECTRON_MIRRORS,
      tauriRelease: DEFAULT_TAURI_RELEASE,
      steamworksDir: null,
      fetch: globalThis.fetch,
      ...options,
    };
  }

  /**
   * Build everything asked for into `<outDir>/<game name> export/`.
   * Earlier builds there with the same names are replaced.
   */
  async export(
    projectDir: string,
    req: ExportRequest,
    outDir: string,
    progress: (p: ExportProgress) => void = () => {},
  ): Promise<{ folder: string; outputs: ExportOutput[] }> {
    if (req.steamAppId && !/^\d+$/.test(req.steamAppId)) throw new Error('Steam App ID must be a number');
    if (req.steamAppId && !this.o.steamworksDir && req.targets.some((t) => t.endsWith('electron'))) {
      throw new ExportError('steamworks', 'steamworks.js is not installed');
    }
    const name = safeName(req.gameName, 'Game');
    const folder = join(outDir, `${name} export`);
    await mkdir(folder, { recursive: true });

    // 1. The game folder: what every build contains.
    progress({ step: 'game' });
    const web = join(folder, 'web');
    await rm(web, { recursive: true, force: true });
    await this.writeGameFolder(projectDir, req, web);

    const outputs: ExportOutput[] = [];
    for (const target of req.targets) {
      let out: string;
      if (target === 'web') out = web;
      else if (target.endsWith('electron')) out = await this.electronBuild(target, req, web, folder, progress);
      else out = await this.tauriBuild(target, req, web, folder, progress);
      const output: ExportOutput = { target, folder: out };
      if (req.zip) {
        progress({ step: 'zip', target, fraction: 0 });
        const zip = join(folder, `${name}-${target === 'web' ? 'web' : target.replace('-electron', '')}.zip`);
        // itch.io wants index.html at the top of an HTML5 zip; desktop zips keep a folder.
        // Programs a Linux player must be able to run, even when the zip is made on Windows.
        const programs =
          platformOf(target) === 'linux'
            ? [binaryName(req.gameName, target), 'chrome_crashpad_handler', 'chrome-sandbox']
            : [];
        await zipFolder(
          out,
          zip,
          target === 'web' ? '' : `${name}/`,
          (d, n) => progress({ step: 'zip', target, fraction: d / n }),
          (path) => programs.includes(path),
        );
        output.zip = zip;
      }
      outputs.push(output);
    }
    progress({ step: 'done' });
    return { folder, outputs };
  }

  async writeGameFolder(projectDir: string, req: ExportRequest, dest: string): Promise<void> {
    await mkdir(join(dest, 'assets'), { recursive: true });
    await writeFile(join(dest, 'index.html'), req.html);
    for (const f of req.files) {
      const target = insideProject(dest, f.path);
      if (!target) throw new Error(`Bad asset path: ${f.path}`);
      await mkdir(dirname(target), { recursive: true });
      if ('projectRel' in f.from) {
        const src = insideProject(projectDir, f.from.projectRel);
        if (!src || !existsSync(src)) throw new Error(`Missing file: ${f.from.projectRel}`);
        await copyFile(src, target);
      } else {
        const m = /^data:[^;,]*(;base64)?,/.exec(f.from.dataUrl);
        if (!m) throw new Error(`Bad data for ${f.path}`);
        const body = f.from.dataUrl.slice(m[0].length);
        await writeFile(target, m[1] ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body)));
      }
    }
  }

  // ------------------------------------------------------------ Electron

  /** Path of the cached Electron release zip for a platform, downloading it if needed. */
  async electronZip(platform: 'win32' | 'linux', progress: (p: ExportProgress) => void, target: ExportTarget) {
    const v = this.o.electronVersion;
    const file = `electron-v${v}-${platform}-x64.zip`;
    const cached = join(this.o.cacheDir, 'electron', file);
    if (existsSync(cached)) return cached;
    let lastError: unknown = null;
    for (const mirror of this.o.electronMirrors) {
      const base = mirror.replace('{version}', v);
      try {
        const sums = await (await this.get(base + 'SHASUMS256.txt')).text();
        const expected = new RegExp(`^([0-9a-f]{64}) \\*?${file.replace(/\./g, '\\.')}$`, 'm').exec(sums)?.[1];
        if (!expected) throw new ExportError('checksum', `No checksum for ${file}`);
        await this.download(base + file, cached, expected, (f) => progress({ step: 'download', target, fraction: f }));
        return cached;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError instanceof ExportError
      ? lastError
      : new ExportError('download', `Could not download Electron ${v}: ${String(lastError)}`);
  }

  private async electronBuild(
    target: ExportTarget,
    req: ExportRequest,
    web: string,
    folder: string,
    progress: (p: ExportProgress) => void,
  ): Promise<string> {
    const windows = platformOf(target) === 'windows';
    const zip = await this.electronZip(windows ? 'win32' : 'linux', progress, target);
    const out = join(folder, windows ? 'windows-x64' : 'linux-x64');
    await rm(out, { recursive: true, force: true });
    progress({ step: 'unpack', target });
    // Electron's demo app is not needed. (Inside Electron, fs treats *.asar files as
    // folders, so it is never written in the first place rather than deleted.)
    await extractZip(zip, out, (name) => !name.endsWith('default_app.asar'));

    progress({ step: 'package', target });
    const exe = binaryName(req.gameName, target);
    await rename(join(out, windows ? 'electron.exe' : 'electron'), join(out, exe));
    if (!windows) await chmod(join(out, exe), 0o755);

    const app = join(out, 'resources', 'app');
    await mkdir(app, { recursive: true });
    for (const f of ['main.js', 'preload.cjs']) await copyFile(join(this.o.shellDir, f), join(app, f));
    await writeFile(
      join(app, 'package.json'),
      JSON.stringify(
        {
          name:
            safeName(req.gameName, 'game')
              .toLowerCase()
              .replace(/[^a-z0-9-]+/g, '-')
              .replace(/^-+|-+$/g, '') || 'zennovel-game',
          productName: req.gameName,
          version: req.version ?? '1.0.0',
          main: 'main.js',
          type: 'module',
        },
        null,
        2,
      ),
    );
    await cp(web, join(app, 'game'), { recursive: true });
    if (req.steamAppId) {
      await writeFile(join(app, 'steam.json'), JSON.stringify({ appId: Number(req.steamAppId) }));
      await cp(this.o.steamworksDir!, join(app, 'node_modules', 'steamworks.js'), { recursive: true });
      // Lets the game find Steam when started outside the Steam client (testing).
      await writeFile(join(out, 'steam_appid.txt'), req.steamAppId);
    }
    return out;
  }

  // ------------------------------------------------------------ Tauri

  private async tauriBuild(
    target: ExportTarget,
    req: ExportRequest,
    web: string,
    folder: string,
    progress: (p: ExportProgress) => void,
  ): Promise<string> {
    const windows = platformOf(target) === 'windows';
    const asset = windows ? 'zennovel-player-windows-x64.exe' : 'zennovel-player-linux-x64';
    const cached = join(this.o.cacheDir, 'tauri', asset);
    if (!existsSync(cached)) {
      let sums: string;
      try {
        sums = await (await this.get(this.o.tauriRelease + 'SHA256SUMS.txt')).text();
      } catch (e) {
        throw new ExportError('tauriMissing', `The Tauri player is not available yet (${String(e)})`);
      }
      const expected = new RegExp(`^([0-9a-f]{64})\\s+\\*?${asset.replace(/\./g, '\\.')}$`, 'm').exec(sums)?.[1];
      if (!expected) throw new ExportError('tauriMissing', `No Tauri player for ${target}`);
      await this.download(this.o.tauriRelease + asset, cached, expected, (f) =>
        progress({ step: 'download', target, fraction: f }),
      );
    }
    progress({ step: 'package', target });
    const out = join(folder, windows ? 'windows-x64-small' : 'linux-x64-small');
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    const exe = join(out, binaryName(req.gameName, target));
    await copyFile(cached, exe);
    if (!windows) await chmod(exe, 0o755);
    await cp(web, join(out, 'game'), { recursive: true });
    return out;
  }

  // ------------------------------------------------------------ network

  private async get(url: string): Promise<Response> {
    const res = await this.o.fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new ExportError('download', `HTTP ${res.status} for ${url}`);
    return res;
  }

  /** Download to `dest`, checking the SHA-256. Written to a temp file first, so a broken download never sticks. */
  private async download(url: string, dest: string, sha256: string, onFraction: (f: number) => void) {
    await mkdir(dirname(dest), { recursive: true });
    const res = await this.get(url);
    const total = Number(res.headers.get('content-length')) || 0;
    const hash = createHash('sha256');
    let got = 0;
    const tmp = `${dest}.part`;
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      got += chunk.length;
      if (total) onFraction(got / total);
    });
    await pipeline(body, createWriteStream(tmp));
    if (hash.digest('hex') !== sha256) {
      await rm(tmp, { force: true });
      throw new ExportError('checksum', `Checksum mismatch for ${url}`);
    }
    await rename(tmp, dest);
  }
}

/** Names of the files in a folder, recursively (for tests and the result screen). */
export async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (d.isDirectory()) out.push(...(await listFiles(join(dir, d.name), `${prefix}${d.name}/`)));
    else out.push(prefix + d.name);
  }
  return out.sort();
}
