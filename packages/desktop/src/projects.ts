/**
 * Projects on disk. Each project is a folder:
 *
 *   My Story/
 *     project.json      the story, with asset paths relative to the folder
 *     assets/           images, music, … as ordinary files
 *
 * The editor works with the same Project objects as in the browser. On the
 * way in, relative asset paths become zn-project://<id>/<path> URLs the
 * window can load; on the way out they become relative again, and any
 * data: URL (an upload, a template) is written out as a file.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';

export const PROJECT_FILE = 'project.json';
export const ASSET_SCHEME = 'zn-project';

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  sceneCount: number;
  /** Folder on disk (desktop only). */
  dir?: string;
}

/** The parts of a project this module reads; the rest passes through untouched. */
interface ProjectLike {
  meta: { id: string; name: string; description?: string; updatedAt?: string };
  assets?: { id: string; kind?: string; name?: string; src: string }[];
  scenes?: unknown[];
  [key: string]: unknown;
}

interface Settings {
  root?: string;
  /** project id -> folder */
  projects: Record<string, string>;
}

export const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/webm': 'weba',
  'audio/opus': 'opus',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
};

/** A name that is safe as a file or folder name on Windows, macOS and Linux. */
export function safeName(name: string, fallback: string): string {
  const cleaned = Array.from(name, (c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
  const out = cleaned.slice(0, 60);
  return out && !reserved.test(out) ? out : fallback;
}

export function randomId(prefix: string): string {
  return `${prefix}_${Array.from(randomBytes(8), (b) => (b % 36).toString(36)).join('')}`;
}

/** `wanted`, or `wanted 2`, `wanted 3`… whichever doesn't exist yet in `dir`. */
export function uniquePath(dir: string, wanted: string, ext = ''): string {
  for (let n = 1; ; n++) {
    const p = join(dir, (n === 1 ? wanted : `${wanted} ${n}`) + ext);
    if (!existsSync(p)) return p;
  }
}

/**
 * `zn-project://p/<id>/<path>` for an asset path relative to the project folder.
 * (The id goes in the path: URL hosts are lowercased.)
 */
export function assetUrl(projectId: string, rel: string): string {
  return `${ASSET_SCHEME}://p/${encodeURIComponent(projectId)}/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

/** Project id and relative path of a zn-project:// URL. */
export function parseAssetUrl(url: string): { projectId: string; rel: string } | null {
  const m = new RegExp(`^${ASSET_SCHEME}://p/([^/]+)/(.+)$`).exec(url.split(/[?#]/)[0]!);
  return m ? { projectId: decodeURIComponent(m[1]!), rel: m[2]!.split('/').map(decodeURIComponent).join('/') } : null;
}

/** The project-relative path in a zn-project:// URL of this project, or null. */
export function relFromAssetUrl(projectId: string, src: string): string | null {
  const prefix = `${ASSET_SCHEME}://p/${encodeURIComponent(projectId)}/`;
  if (!src.startsWith(prefix)) return null;
  return src.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
}

const isRelative = (src: string) => !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('/');

/** Resolve a project-relative path, refusing anything that escapes the folder. */
export function insideProject(dir: string, rel: string): string | null {
  const root = resolve(dir);
  const full = resolve(root, rel);
  return full.startsWith(root + sep) ? full : null;
}

async function writeAtomic(file: string, data: string | Uint8Array) {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

export class ProjectLibrary {
  private settingsFile: string;
  private defaultRoot: string;
  private settings: Settings | null = null;
  /** asset id + data URL fingerprint -> file already written, so autosaves don't rewrite big files. */
  private written = new Map<string, string>();

  constructor(options: { settingsFile: string; defaultRoot: string }) {
    this.settingsFile = options.settingsFile;
    this.defaultRoot = options.defaultRoot;
  }

  private async load(): Promise<Settings> {
    if (this.settings) return this.settings;
    try {
      const raw = JSON.parse(await readFile(this.settingsFile, 'utf8')) as Partial<Settings>;
      this.settings = { root: raw.root, projects: { ...raw.projects } };
    } catch {
      this.settings = { projects: {} };
    }
    return this.settings;
  }

  private async persist() {
    await mkdir(dirname(this.settingsFile), { recursive: true });
    await writeAtomic(this.settingsFile, JSON.stringify(this.settings, null, 2));
  }

  /** Where new projects are created (Documents/ZenNovel by default). */
  async root(): Promise<string> {
    return (await this.load()).root ?? this.defaultRoot;
  }

  async setRoot(dir: string): Promise<void> {
    (await this.load()).root = dir;
    await this.persist();
  }

  async dirOf(id: string): Promise<string | null> {
    return (await this.load()).projects[id] ?? null;
  }

  private async readMeta(dir: string): Promise<ProjectLike | null> {
    try {
      const p = JSON.parse(await readFile(join(dir, PROJECT_FILE), 'utf8')) as ProjectLike;
      return p && typeof p === 'object' && p.meta && typeof p.meta.id === 'string' ? p : null;
    } catch {
      return null;
    }
  }

  /**
   * Every known project, newest first. Folders added to the projects folder
   * by hand are picked up; folders that were deleted or moved are dropped.
   */
  async list(): Promise<ProjectSummary[]> {
    const settings = await this.load();
    let changed = false;
    const root = await this.root();
    try {
      for (const d of await readdir(root, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const dir = join(root, d.name);
        if (Object.values(settings.projects).includes(dir)) continue;
        const p = await this.readMeta(dir);
        if (p && !settings.projects[p.meta.id]) {
          settings.projects[p.meta.id] = dir;
          changed = true;
        }
      }
    } catch {
      // No projects folder yet.
    }
    const out: ProjectSummary[] = [];
    for (const [id, dir] of Object.entries(settings.projects)) {
      const p = await this.readMeta(dir);
      if (!p || p.meta.id !== id) {
        delete settings.projects[id];
        changed = true;
        continue;
      }
      out.push({
        id,
        name: p.meta.name,
        ...(p.meta.description && { description: p.meta.description }),
        updatedAt: p.meta.updatedAt ?? '',
        sceneCount: Array.isArray(p.scenes) ? p.scenes.length : 0,
        dir,
      });
    }
    if (changed) await this.persist();
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** The project with its asset paths turned into zn-project:// URLs, or null. */
  async read(id: string): Promise<ProjectLike | null> {
    const dir = await this.dirOf(id);
    if (!dir) return null;
    const p = await this.readMeta(dir);
    if (!p || p.meta.id !== id) return null;
    for (const a of p.assets ?? []) {
      if (typeof a.src === 'string' && isRelative(a.src)) a.src = assetUrl(id, a.src);
    }
    return p;
  }

  /**
   * Write a project. A new project gets a folder in the projects folder,
   * named after it. data: URLs are written out to assets/.
   */
  async write(project: ProjectLike): Promise<void> {
    const settings = await this.load();
    const id = project.meta.id;
    let dir = settings.projects[id];
    if (!dir || !existsSync(dir)) {
      const root = await this.root();
      await mkdir(root, { recursive: true });
      dir = uniquePath(root, safeName(project.meta.name, 'ZenNovel Project'));
      await mkdir(dir, { recursive: true });
      settings.projects[id] = dir;
      await this.persist();
    }
    const out: ProjectLike = { ...project, assets: [] };
    for (const asset of project.assets ?? []) {
      out.assets!.push({ ...asset, src: await this.storeAsset(id, dir, asset) });
    }
    await writeAtomic(join(dir, PROJECT_FILE), JSON.stringify(out, null, 2) + '\n');
  }

  private async storeAsset(id: string, dir: string, asset: { id: string; name?: string; src: string }) {
    const own = relFromAssetUrl(id, asset.src);
    if (own !== null) return own;
    const m = /^data:([^;,]+)(;base64)?,/.exec(asset.src);
    if (!m) return asset.src; // relative already, or a web URL
    const key = `${asset.id}:${asset.src.length}:${asset.src.slice(-48)}`;
    const known = this.written.get(key);
    if (known && existsSync(join(dir, known))) return known;
    const body = asset.src.slice(m[0].length);
    const data = m[2] ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf8');
    const ext = MIME_EXT[m[1]!.toLowerCase()] ?? 'bin';
    const assets = join(dir, 'assets');
    await mkdir(assets, { recursive: true });
    const file = uniquePath(assets, safeName(asset.name ?? '', asset.id), `.${ext}`);
    await writeFile(file, data);
    const rel = `assets/${basename(file)}`;
    this.written.set(key, rel);
    return rel;
  }

  /** Add an existing project folder (e.g. from a USB stick or a git clone). Returns its id. */
  async register(dir: string): Promise<{ id: string } | { error: 'notAProject' | 'alreadyOpen'; id?: string }> {
    const p = await this.readMeta(dir);
    if (!p) return { error: 'notAProject' };
    const settings = await this.load();
    const known = settings.projects[p.meta.id];
    if (known && resolve(known) !== resolve(dir) && existsSync(join(known, PROJECT_FILE))) {
      return { error: 'alreadyOpen', id: p.meta.id };
    }
    settings.projects[p.meta.id] = dir;
    await this.persist();
    return { id: p.meta.id };
  }

  /** Forget a project and hand its folder to `discard` (the system trash). */
  async remove(id: string, discard: (dir: string) => Promise<void> = (d) => rm(d, { recursive: true })) {
    const settings = await this.load();
    const dir = settings.projects[id];
    delete settings.projects[id];
    await this.persist();
    if (dir && existsSync(dir)) await discard(dir);
  }
}

/** File extension (lowercase, no dot). */
export const extOf = (p: string) => extname(p).slice(1).toLowerCase();
