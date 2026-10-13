import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importMedia } from './media.js';

describe('adding media to a project folder', () => {
  it('copies files into assets/ under unique names and refuses other kinds', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zn-media-'));
    const src = join(dir, 'from');
    await mkdir(src);
    for (const f of ['森林.webp', 'theme.MP3', 'notes.txt']) await writeFile(join(src, f), f);
    const project = join(dir, 'project');

    const first = await importMedia(
      project,
      ['森林.webp', 'theme.MP3', 'notes.txt'].map((f) => join(src, f)),
      ['image', 'audio'],
    );
    expect(first.assets.map((a) => [a.kind, a.name, a.src])).toEqual([
      ['image', '森林', 'assets/森林.webp'],
      ['audio', 'theme', 'assets/theme.mp3'],
    ]);
    expect(first.rejected).toEqual(['notes.txt']);

    // The same picture again gets a name of its own; audio isn't accepted where only images are.
    const second = await importMedia(project, [join(src, '森林.webp'), join(src, 'theme.MP3')], ['image']);
    expect(second.assets.map((a) => a.src)).toEqual(['assets/森林 2.webp']);
    expect(second.rejected).toEqual(['theme.MP3']);
    expect((await readdir(join(project, 'assets'))).sort()).toEqual(['theme.mp3', '森林 2.webp', '森林.webp']);
  });
});
