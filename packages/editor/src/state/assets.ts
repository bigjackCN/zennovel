import { createId, type Asset, type Project } from '@zennovel/core';

/** Larger images are refused: they bloat the project file and slow the editor down. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export type ImageReadError = { code: 'notImage' } | { code: 'tooLarge'; megabytes: number };

/**
 * Read a user-picked file into an image asset. The image is stored inside
 * the project as a data: URL, so the project (and its export) is
 * self-contained.
 */
export async function readImageFile(file: File): Promise<Asset | ImageReadError> {
  if (!file.type.startsWith('image/')) return { code: 'notImage' };
  if (file.size > MAX_IMAGE_BYTES) return { code: 'tooLarge', megabytes: Math.round(file.size / 1024 / 1024) };
  return {
    id: createId('img'),
    kind: 'image',
    name: file.name.replace(/\.[^.]+$/, ''),
    src: await blobToDataUrl(file),
  };
}

export const isImageReadError = (v: Asset | ImageReadError): v is ImageReadError => 'code' in v;

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
