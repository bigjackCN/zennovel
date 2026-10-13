import type { Project } from '@zennovel/core';
import { buildGameHtml, safeFileName } from './gameHtml';
import { createZip, type ZipEntry } from './zip';
import { dataUrlBytes, gameFolder } from './gameFolder';
import { markBackedUp } from '../storage/backups';

/** The game player script, built on first use (see vite.config.ts). */
export async function playerScript(): Promise<string> {
  return (await import('virtual:zennovel-player')).default;
}

function download(data: BlobPart, fileName: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = fileName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Download `<name>.zip` containing index.html: ready for itch.io ("HTML" project, upload the zip). */
export async function exportGameZip(project: Project): Promise<void> {
  const html = buildGameHtml(project, await playerScript());
  const zip = createZip([{ name: 'index.html', data: new TextEncoder().encode(html) }]);
  download(zip, `${safeFileName(project.meta.name)}.zip`, 'application/zip');
  // The game's index.html can be imported back into ZenNovel, so it is a backup too.
  markBackedUp(project.meta.id);
}

/**
 * Download `<name>-web.zip`: index.html plus an assets folder. For websites
 * and itch.io ("HTML" project); loads faster than one big file for larger games.
 */
export async function exportWebFolderZip(project: Project): Promise<void> {
  const { html, files } = gameFolder(project, await playerScript());
  const entries: ZipEntry[] = [{ name: 'index.html', data: new TextEncoder().encode(html) }];
  for (const f of files) {
    if ('dataUrl' in f.from) entries.push({ name: f.path, data: dataUrlBytes(f.from.dataUrl) });
  }
  download(createZip(entries), `${safeFileName(project.meta.name)}-web.zip`, 'application/zip');
  markBackedUp(project.meta.id);
}

/** Open the exported game in a new tab, exactly as players will see it. */
export async function playGameInNewTab(project: Project): Promise<void> {
  // Open the tab first: browsers block popups opened after an await.
  const tab = window.open('', '_blank');
  const html = buildGameHtml(project, await playerScript());
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  if (tab) tab.location.href = url;
  else window.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
