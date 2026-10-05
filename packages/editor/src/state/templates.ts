import { createEmptyProject, createId, type Project } from '@zennovel/core';

export interface Template {
  id: string;
  name: string;
  description: string;
}

export const templates: Template[] = [
  { id: 'demo', name: 'Cherry Blossom Hill (sample)', description: 'A short story with backgrounds, characters, choices and two endings' },
  { id: 'blank', name: 'Blank project', description: 'Start from a blank page' },
];

function freshMeta(project: Project, name: string): Project {
  const now = new Date().toISOString();
  return { ...project, meta: { ...project.meta, id: createId('proj'), name, createdAt: now, updatedAt: now } };
}

export async function createFromTemplate(templateId: string, name: string): Promise<Project> {
  if (templateId === 'blank') return createEmptyProject(name);

  const url = new URL(`${import.meta.env.BASE_URL}templates/${templateId}/project.json`, window.location.href);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load template (HTTP ${res.status})`);
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

export async function readProjectFile(file: File): Promise<Project> {
  const project = JSON.parse(await file.text()) as Project;
  if (!project?.meta || !Array.isArray(project.scenes)) throw new Error("This isn't a ZenNovel project file");
  return freshMeta(project, project.meta.name);
}
