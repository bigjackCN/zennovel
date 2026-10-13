import { describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, extractZip, listZip, zipFolder } from './zip.js';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('packs a folder and unpacks it again, keeping the executable bit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zn-zip-'));
    const src = join(dir, 'src');
    await mkdir(join(src, 'assets', '音乐'), { recursive: true });
    await writeFile(join(src, 'index.html'), '<p>'.repeat(5000));
    await writeFile(join(src, 'assets', '音乐', 'theme.mp3'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
    await writeFile(join(src, 'game'), '#!/bin/sh\n');
    await chmod(join(src, 'game'), 0o755);

    const zip = join(dir, 'out.zip');
    // 'game' is named as a program too, so it is executable even when packed on Windows.
    await zipFolder(src, zip, 'Game/', undefined, (path) => path === 'game');
    const entries = await listZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['Game/assets/音乐/theme.mp3', 'Game/game', 'Game/index.html']);
    expect(entries.find((e) => e.name === 'Game/game')?.mode).toBe(0o755);
    expect(entries.find((e) => e.name === 'Game/index.html')?.mode).toBe(0o644);
    // Text is deflated; the mp3 is stored as is.
    expect((await stat(zip)).size).toBeLessThan(15000);

    const out = join(dir, 'out');
    await extractZip(zip, out);
    expect(await readFile(join(out, 'Game', 'index.html'), 'utf8')).toBe('<p>'.repeat(5000));
    expect([...(await readFile(join(out, 'Game', 'assets', '音乐', 'theme.mp3')))]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    if (process.platform !== 'win32') expect((await stat(join(out, 'Game', 'game'))).mode & 0o777).toBe(0o755);
  });
});
