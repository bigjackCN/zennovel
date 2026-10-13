import {
  createEmptyProject,
  createId,
  normalizeProject,
  type Locale,
  type Project,
  type ProjectLoadError,
} from '@zennovel/core';
import type { Messages } from '../i18n';
import { inlineAssets } from './assets';
import { markBackedUp } from '../storage/backups';
import { projectJsonFromGameHtml, safeFileName } from '../export/gameHtml';

/** Template ids; display names come from the i18n messages (t.templates[id]). */
export const templateIds = ['demo', 'blank'] as const;
export type TemplateId = (typeof templateIds)[number];

function freshMeta(project: Project, name: string): Project {
  const now = new Date().toISOString();
  return { ...project, meta: { ...project.meta, id: createId('proj'), name, createdAt: now, updatedAt: now } };
}

/** The writer-facing explanation of why a file couldn't be opened. */
export function loadErrorMessage(error: ProjectLoadError, t: Messages): string {
  return error.code === 'newerFormat' ? t.templates.newerFormat(error.version) : t.templates.notAProject;
}

/**
 * Sample templates ship one project file per language (project.en.json,
 * project.zh.json) and share one assets folder. Their images are embedded
 * into the new project, so it keeps working wherever it is opened or exported.
 */
export async function createFromTemplate(
  templateId: TemplateId,
  name: string,
  locale: Locale,
  t: Messages,
): Promise<Project> {
  if (templateId === 'blank') {
    return createEmptyProject(name, {
      locale,
      firstSceneName: t.newProject.firstSceneName,
      firstLine: t.newProject.firstLine,
    });
  }

  const url = new URL(
    `${import.meta.env.BASE_URL}templates/${templateId}/project.${locale}.json`,
    window.location.href,
  );
  const res = await fetch(url);
  if (!res.ok) throw new Error(t.templates.loadFailed(res.status));
  const result = normalizeProject(await res.json());
  if (!result.ok) throw new Error(loadErrorMessage(result.error, t));
  const project = result.project;
  project.assets = await inlineAssets(project.assets, url);
  return freshMeta(project, name);
}

export function downloadProject(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileName(project.meta.name, 'zennovel-project')}.json`;
  a.click();
  markBackedUp(project.meta.id);
  // Revoking right away can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function readProjectFile(file: File, t: Messages): Promise<Project> {
  let raw: unknown;
  try {
    const text = await file.text();
    // An exported game (index.html) carries its project, so it can be opened again.
    const json = text.trimStart().startsWith('<') ? projectJsonFromGameHtml(text) : text;
    raw = JSON.parse(json ?? '');
  } catch {
    throw new Error(t.templates.notAProject);
  }
  const result = normalizeProject(raw);
  if (!result.ok) throw new Error(loadErrorMessage(result.error, t));
  return freshMeta(result.project, result.project.meta.name || file.name.replace(/\.(json|html?)$/i, ''));
}
