import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { binaryName, GameExporter, listFiles, type ExportRequest } from './export.js';
import { listZip, zipFolder } from './zip.js';

/** A stand-in for an Electron release zip: same layout, tiny files. */
async function fakeElectronZip(dir: string, platform: 'win32' | 'linux') {
  const src = join(dir, `fake-${platform}`);
  await mkdir(join(src, 'resources'), { recursive: true });
  await writeFile(join(src, platform === 'win32' ? 'electron.exe' : 'electron'), 'binary');
  await writeFile(join(src, 'resources', 'default_app.asar'), 'default app');
  await writeFile(join(src, 'LICENSE'), 'MIT');
  const zip = join(dir, 'cache', 'electron', `electron-v44.7.1-${platform}-x64.zip`);
  await zipFolder(src, zip);
}

async function setup(fetchImpl?: typeof fetch) {
  const dir = await mkdtemp(join(tmpdir(), 'zn-export-'));
  const project = join(dir, 'project');
  await mkdir(join(project, 'assets'), { recursive: true });
  await writeFile(join(project, 'assets', 'bg.webp'), 'webp bytes');
  const shell = join(dir, 'shell');
  await mkdir(shell);
  await writeFile(join(shell, 'main.js'), '// shell');
  await writeFile(join(shell, 'preload.cjs'), '// preload');
  const steamworks = join(dir, 'steamworks.js');
  await mkdir(steamworks);
  await writeFile(join(steamworks, 'package.json'), '{}');
  await fakeElectronZip(dir, 'win32');
  await fakeElectronZip(dir, 'linux');
  const exporter = new GameExporter({
    cacheDir: join(dir, 'cache'),
    shellDir: shell,
    electronVersion: '44.7.1',
    steamworksDir: steamworks,
    tauriRelease: 'https://example.test/release/',
    fetch:
      fetchImpl ??
      (async () => {
        throw new Error('offline');
      }),
  });
  return { dir, project, exporter };
}

const request = (over: Partial<ExportRequest> = {}): ExportRequest => ({
  gameName: '大裂',
  targets: ['web'],
  zip: false,
  html: '<!doctype html><title>大裂</title>',
  files: [
    { path: 'assets/bg.webp', from: { projectRel: 'assets/bg.webp' } },
    { path: 'assets/theme.mp3', from: { dataUrl: 'data:audio/mpeg;base64,' + Buffer.from('mp3').toString('base64') } },
  ],
  ...over,
});

describe('game export', () => {
  it('names binaries per system', () => {
    expect(binaryName('大裂: 第二版', 'windows-electron')).toBe('大裂 第二版.exe');
    expect(binaryName('大裂', 'linux-tauri')).toBe('大裂');
  });

  it('writes the game folder for websites and itch.io, zipped with index.html on top', async () => {
    const { dir, project, exporter } = await setup();
    const { folder, outputs } = await exporter.export(project, request({ zip: true }), dir);
    expect(folder).toBe(join(dir, '大裂 export'));
    expect(await listFiles(join(folder, 'web'))).toEqual(['assets/bg.webp', 'assets/theme.mp3', 'index.html']);
    expect(await readFile(join(folder, 'web', 'assets', 'theme.mp3'), 'utf8')).toBe('mp3');
    expect(outputs[0]!.zip).toBe(join(folder, '大裂-web.zip'));
    expect((await listZip(outputs[0]!.zip!)).map((e) => e.name)).toContain('index.html');
  });

  it('refuses asset paths that leave the game folder or the project', async () => {
    const { dir, project, exporter } = await setup();
    await expect(
      exporter.export(project, request({ files: [{ path: '../x', from: { projectRel: 'assets/bg.webp' } }] }), dir),
    ).rejects.toThrow();
    await expect(
      exporter.export(
        project,
        request({ files: [{ path: 'assets/x', from: { projectRel: '../../etc/passwd' } }] }),
        dir,
      ),
    ).rejects.toThrow();
  });

  it('builds Windows and Linux games around Electron, with Steam support when asked', async () => {
    const { dir, project, exporter } = await setup();
    const steps: string[] = [];
    const { folder } = await exporter.export(
      project,
      request({ targets: ['windows-electron', 'linux-electron'], steamAppId: '480', zip: true }),
      dir,
      (p) => steps.push(p.step),
    );
    const win = await listFiles(join(folder, 'windows-x64'));
    expect(win).toEqual([
      'LICENSE',
      'resources/app/game/assets/bg.webp',
      'resources/app/game/assets/theme.mp3',
      'resources/app/game/index.html',
      'resources/app/main.js',
      'resources/app/node_modules/steamworks.js/package.json',
      'resources/app/package.json',
      'resources/app/preload.cjs',
      'resources/app/steam.json',
      'steam_appid.txt',
      '大裂.exe',
    ]);
    const pkg = JSON.parse(await readFile(join(folder, 'windows-x64', 'resources', 'app', 'package.json'), 'utf8'));
    expect(pkg).toMatchObject({ productName: '大裂', main: 'main.js', type: 'module' });
    expect(pkg.name).toBe('zennovel-game');
    if (process.platform !== 'win32') expect((await stat(join(folder, 'linux-x64', '大裂'))).mode & 0o111).toBeTruthy();
    expect(existsSync(join(folder, '大裂-windows.zip'))).toBe(true);
    // The Linux program is executable in the zip, wherever the export ran.
    const linuxZip = await listZip(join(folder, '大裂-linux.zip'));
    expect(linuxZip.find((e) => e.name === '大裂/大裂')?.mode).toBe(0o755);
    expect(steps).toContain('package');
  });

  it('downloads the small Tauri player once, checking its checksum', async () => {
    const binary = Buffer.from('tauri player');
    const sha = createHash('sha256').update(binary).digest('hex');
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.endsWith('SHA256SUMS.txt')) return new Response(`${sha}  zennovel-player-windows-x64.exe\n`);
      if (url.endsWith('zennovel-player-windows-x64.exe')) return new Response(binary);
      return new Response('missing', { status: 404 });
    }) as typeof fetch;
    const { dir, project, exporter } = await setup(fake);
    const { folder } = await exporter.export(project, request({ targets: ['windows-tauri'] }), dir);
    expect(await listFiles(join(folder, 'windows-x64-small'))).toEqual([
      'game/assets/bg.webp',
      'game/assets/theme.mp3',
      'game/index.html',
      '大裂.exe',
    ]);
    await exporter.export(project, request({ targets: ['windows-tauri'] }), dir);
    expect(calls.filter((u) => u.endsWith('.exe'))).toHaveLength(1);

    // No Linux player published: a clear error, not a broken build.
    await expect(exporter.export(project, request({ targets: ['linux-tauri'] }), dir)).rejects.toMatchObject({
      code: 'tauriMissing',
    });
  });
});
