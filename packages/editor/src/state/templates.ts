import { createEmptyProject, createId, type Locale, type Project } from '@zennovel/core';
import type { Messages } from '../i18n';

/** Template ids; display names come from the i18n messages (t.templates[id]). */
export const templateIds = ['demo', 'blank'] as const;
export type TemplateId = (typeof templateIds)[number];

function freshMeta(project: Project, name: string): Project {
  const now = new Date().toISOString();
  return { ...project, meta: { ...project.meta, id: createId('proj'), name, createdAt: now, updatedAt: now } };
}

/**
 * Sample templates ship one project file per language (project.en.json,
 * project.zh.json) and share one assets folder.
 */
export async function createFromTemplate(templateId: TemplateId, name: string, locale: Locale, t: Messages): Promise<Project> {
  if (templateId === 'blank') {
    return createEmptyProject(name, {
      locale,
      firstSceneName: t.newProject.firstSceneName,
      firstLine: t.newProject.firstLine,
    });
  }

  const url = new URL(`${import.meta.env.BASE_URL}templates/${templateId}/project.${locale}.json`, window.location.href);
  const res = await fetch(url);
  if (!res.ok) throw new Error(t.templates.loadFailed(res.status));
  const project = (await res.json()) as Project;
  // Template assets use paths relative to the template folder; pin them to absolute URLs.
  project.assets = project.assets.map((a) => ({ ...a, src: new URL(a.src, url).href }));
  return freshMeta(project, name);
}

export function downloadProject(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${project.meta.name || 'zennovel-project'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readProjectFile(file: File, t: Messages): Promise<Project> {
  let project: Project;
  try {
    project = JSON.parse(await file.text()) as Project;
  } catch {
    throw new Error(t.templates.notAProject);
  }
  if (!project?.meta || !Array.isArray(project.scenes)) throw new Error(t.templates.notAProject);
  return freshMeta(project, project.meta.name);
}
