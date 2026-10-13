import type { Locale } from '@zennovel/core';
import type { Messages } from '../i18n';
import { storage } from '../storage';
import { markBackedUp } from '../storage/backups';
import { createFromTemplate } from './templates';
import type { SampleId } from './samples';

/** Samples every new visitor finds already in "My stories", ready to open and play. */
const preloaded: SampleId[] = ['dalie'];
const flag = (id: SampleId) => `zennovel:preloaded:${id}`;

let running: Promise<boolean> | null = null;

/**
 * Put the preloaded samples into this browser's stories, once. A flag is set
 * first, so a writer who deletes one never gets it back, and two open tabs
 * don't both add it. Resolves to whether anything was added.
 */
export function preloadSamples(locale: Locale, t: Messages): Promise<boolean> {
  running ??= (async () => {
    let added = false;
    for (const id of preloaded) {
      try {
        if (localStorage.getItem(flag(id))) continue;
        localStorage.setItem(flag(id), new Date().toISOString());
      } catch {
        continue; // no storage to remember the flag in: don't add it on every visit
      }
      try {
        const project = await createFromTemplate(id, t.templates[id].name, locale, t);
        await storage.saveProject(project);
        // An untouched sample needs no backup reminder.
        markBackedUp(project.meta.id);
        added = true;
      } catch (e) {
        console.warn(`Could not preload the "${id}" sample`, e);
        try {
          localStorage.removeItem(flag(id)); // try again next visit
        } catch {
          // ignore
        }
      }
    }
    return added;
  })();
  return running;
}
