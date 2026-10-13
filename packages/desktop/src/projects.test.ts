import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetUrl, parseAssetUrl, ProjectLibrary, safeName } from './projects.js';

const PNG = 'data:image/png;base64,' + Buffer.from('fake png bytes').toString('base64');

function project(id: string, name: string, assets: { id: string; kind: string; name: string; src: string }[] = []) {
  return {
    formatVersion: 1,
    meta: { id, name, updatedAt: '2026-10-13T10:00:00.000Z' },
    assets,
    scenes: [{ id: 's1', name: 'Start', commands: [] }],
  };
}

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'zn-lib-'));
  const lib = new ProjectLibrary({ settingsFile: join(dir, 'settings.json'), defaultRoot: join(dir, 'Projects') });
  return { dir, lib };
}

describe('project folders', () => {
  it('makes names safe for every file system', () => {
    expect(safeName('大裂: 第一章 / 草稿?', 'x')).toBe('大裂 第一章 草稿');
    expect(safeName('  ...  ', 'fallback')).toBe('fallback');
    expect(safeName('CON', 'fallback')).toBe('fallback');
  });

  it('round-trips asset URLs, even with an upper-case id and spaces in names', () => {
    const url = assetUrl('Proj_X', 'assets/my bg.webp');
    expect(url).toBe('zn-project://p/Proj_X/assets/my%20bg.webp');
    expect(parseAssetUrl(url)).toEqual({ projectId: 'Proj_X', rel: 'assets/my bg.webp' });
  });

  it('writes a new project as a folder and uploads as files', async () => {
    const { dir, lib } = await setup();
    await lib.write(project('proj_a', '我的故事', [{ id: 'img_1', kind: 'image', name: '森林', src: PNG }]));
    const folder = join(dir, 'Projects', '我的故事');
    const saved = JSON.parse(await readFile(join(folder, 'project.json'), 'utf8'));
    expect(saved.assets[0].src).toBe('assets/森林.png');
    expect(await readFile(join(folder, 'assets', '森林.png'), 'utf8')).toBe('fake png bytes');

    // Read back: paths become URLs the window can load.
    const loaded = await lib.read('proj_a');
    expect(loaded?.assets?.[0]?.src).toBe(assetUrl('proj_a', 'assets/森林.png'));

    // Saving what was loaded writes the same relative path, no copy.
    await lib.write(loaded!);
    const again = JSON.parse(await readFile(join(folder, 'project.json'), 'utf8'));
    expect(again.assets[0].src).toBe('assets/森林.png');
    expect(await readdir(join(folder, 'assets'))).toEqual(['森林.png']);

    // Autosaves with the same upload don't write it twice.
    await lib.write(project('proj_a', '我的故事', [{ id: 'img_1', kind: 'image', name: '森林', src: PNG }]));
    expect(await readdir(join(folder, 'assets'))).toEqual(['森林.png']);
  });

  it('lists projects, finds folders copied in by hand and forgets deleted ones', async () => {
    const { dir, lib } = await setup();
    await lib.write(project('proj_a', 'A'));
    await lib.write(project('proj_b', 'A'));
    expect(existsSync(join(dir, 'Projects', 'A 2'))).toBe(true);

    const copied = join(dir, 'Projects', 'From USB');
    await mkdir(copied);
    await writeFile(join(copied, 'project.json'), JSON.stringify(project('proj_c', 'From USB')));
    const list = await lib.list();
    expect(list.map((p) => p.id).sort()).toEqual(['proj_a', 'proj_b', 'proj_c']);
    expect(list.find((p) => p.id === 'proj_c')?.sceneCount).toBe(1);

    await lib.remove('proj_b');
    expect(existsSync(join(dir, 'Projects', 'A 2'))).toBe(false);
    expect((await lib.list()).map((p) => p.id).sort()).toEqual(['proj_a', 'proj_c']);
  });

  it('opens a project folder from anywhere, but not a second copy of an open one', async () => {
    const { dir, lib } = await setup();
    const elsewhere = join(dir, 'Elsewhere');
    await mkdir(elsewhere);
    await writeFile(join(elsewhere, 'project.json'), JSON.stringify(project('proj_x', 'X')));
    expect(await lib.register(elsewhere)).toEqual({ id: 'proj_x' });
    expect(await lib.register(dir)).toEqual({ error: 'notAProject' });

    const copy = join(dir, 'Copy');
    await mkdir(copy);
    await writeFile(join(copy, 'project.json'), JSON.stringify(project('proj_x', 'X')));
    expect(await lib.register(copy)).toEqual({ error: 'alreadyOpen', id: 'proj_x' });
  });
});
