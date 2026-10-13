/**
 * Adding images and audio to a project on disk: the files are copied into
 * the project's assets/ folder as they are. No size limit and no data: URLs.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { extOf, randomId, safeName, uniquePath } from './projects.js';

export type MediaKind = 'image' | 'audio';

const KIND_BY_EXT: Record<string, MediaKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  svg: 'image',
  avif: 'image',
  apng: 'image',
  mp3: 'audio',
  ogg: 'audio',
  oga: 'audio',
  opus: 'audio',
  wav: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
  weba: 'audio',
};

export const extensionsFor = (kinds: MediaKind[]) =>
  Object.entries(KIND_BY_EXT)
    .filter(([, k]) => kinds.includes(k))
    .map(([e]) => e);

export interface ImportedAsset {
  id: string;
  kind: MediaKind;
  name: string;
  /** Relative to the project folder. */
  src: string;
}

export interface ImportResult {
  assets: ImportedAsset[];
  /** Files that were skipped because they aren't one of the accepted kinds. */
  rejected: string[];
}

/** Copy files into `<projectDir>/assets/`. Each gets a unique name next to the others. */
export async function importMedia(projectDir: string, paths: string[], kinds: MediaKind[]): Promise<ImportResult> {
  const assetsDir = join(projectDir, 'assets');
  await mkdir(assetsDir, { recursive: true });
  const result: ImportResult = { assets: [], rejected: [] };
  for (const p of paths) {
    const kind = KIND_BY_EXT[extOf(p)];
    if (!kind || !kinds.includes(kind) || !(await stat(p)).isFile()) {
      result.rejected.push(basename(p));
      continue;
    }
    const name = basename(p, extname(p));
    const target = uniquePath(assetsDir, safeName(name, kind), `.${extOf(p)}`);
    await copyFile(p, target);
    result.assets.push({
      id: randomId(kind === 'image' ? 'img' : 'snd'),
      kind,
      name,
      src: `assets/${basename(target)}`,
    });
  }
  return result;
}
