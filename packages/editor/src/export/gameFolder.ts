import type { Asset, Project } from '@zennovel/core';
import { buildGameHtml, safeFileName } from './gameHtml';
import type { GameFile } from '../desktop';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/webm': 'weba',
};

/** "assets/x.webp" for zn-project://p/<id>/assets/x.webp, or null for any other URL. */
function projectRelative(src: string): string | null {
  const m = /^zn-project:\/\/p\/[^/]+\/(.+)$/.exec(src);
  return m ? m[1]!.split('/').map(decodeURIComponent).join('/') : null;
}

/**
 * A game as a folder: index.html (player + story) with every image and
 * sound as a file in assets/. This is what goes on a website or itch.io,
 * and inside every desktop build. Files come from the project folder
 * (desktop app) or from data: URLs (browser).
 */
export function gameFolder(project: Project, playerScript: string): { html: string; files: GameFile[] } {
  const taken = new Set<string>();
  const unique = (path: string) => {
    const dot = path.lastIndexOf('.');
    const [stem, ext] = dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
    let candidate = path;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  };
  const files: GameFile[] = [];
  const assets: Asset[] = project.assets.map((a) => {
    const rel = projectRelative(a.src);
    if (rel) {
      const path = unique(rel.startsWith('assets/') ? rel : `assets/${rel.split('/').pop()}`);
      files.push({ path, from: { projectRel: rel } });
      return { ...a, src: path };
    }
    const mime = /^data:([^;,]+)/.exec(a.src)?.[1]?.toLowerCase();
    if (mime) {
      const path = unique(`assets/${safeFileName(a.name, a.id)}.${EXT[mime] ?? 'bin'}`);
      files.push({ path, from: { dataUrl: a.src } });
      return { ...a, src: path };
    }
    return a; // a web address: the game loads it from there
  });
  return { html: buildGameHtml({ ...project, assets }, playerScript), files };
}

/** Bytes of a data: URL. */
export function dataUrlBytes(url: string): Uint8Array {
  const comma = url.indexOf(',');
  const body = url.slice(comma + 1);
  if (url.slice(0, comma).endsWith(';base64')) {
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(body));
}
