import { createId, type Asset, type Project } from '@zennovel/core';

/** Larger files are refused: they bloat the project (and every export) and slow the editor down. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Which kinds of file an upload accepts. */
export type MediaKind = 'image' | 'audio';

export type MediaReadError =
  { code: 'unsupported'; accepted: MediaKind[] } | { code: 'tooLarge'; megabytes: number; limit: number };

/**
 * Read a user-picked file into an image or audio asset. The file is stored
 * inside the project as a data: URL, so the project (and its export) is
 * self-contained.
 */
export async function readMediaFile(file: File, accepted: MediaKind[]): Promise<Asset | MediaReadError> {
  const kind = accepted.find((k) => file.type.startsWith(`${k}/`));
  if (!kind) return { code: 'unsupported', accepted };
  const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (file.size > limit) {
    return { code: 'tooLarge', megabytes: Math.round(file.size / 1024 / 1024), limit: limit / 1024 / 1024 };
  }
  return {
    id: createId(kind === 'image' ? 'img' : 'snd'),
    kind,
    name: file.name.replace(/\.[^.]+$/, ''),
    src: await blobToDataUrl(file),
  };
}

export const isMediaReadError = (v: Asset | MediaReadError): v is MediaReadError => 'code' in v;

/** Fetch an asset URL and turn it into a data: URL; returns null if it can't be fetched. */
async function inline(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

/** Embed every asset that isn't already a data: URL. Assets that can't be fetched keep their URL. */
export async function inlineAssets(assets: Asset[], base: string | URL): Promise<Asset[]> {
  return Promise.all(
    assets.map(async (a) => {
      if (a.src.startsWith('data:')) return a;
      const src = await inline(new URL(a.src, base).href);
      return src ? { ...a, src } : a;
    }),
  );
}

/** e.g. "http://localhost:5173/templates/demo/assets/mei.svg" */
const TEMPLATE_ASSET = /^https?:\/\/[^/]+\/(?:.*\/)?templates\/([\w-]+)\/assets\/([^?#]+)$/;

/**
 * ZenNovel 0.1 stored template images as absolute URLs of whichever site
 * created the project (often http://localhost:5173 during development), so
 * they broke when the port or host changed. Point those at this site's copy
 * of the template and embed them. Returns the same object when nothing
 * needed repairing.
 */
export async function repairTemplateAssets(project: Project): Promise<Project> {
  const stale = project.assets.filter((a) => TEMPLATE_ASSET.test(a.src));
  if (stale.length === 0) return project;
  const assets = await Promise.all(
    project.assets.map(async (a) => {
      const m = TEMPLATE_ASSET.exec(a.src);
      if (!m) return a;
      const here = new URL(`${import.meta.env.BASE_URL}templates/${m[1]}/assets/${m[2]}`, window.location.href).href;
      return { ...a, src: (await inline(here)) ?? here };
    }),
  );
  return { ...project, assets };
}
