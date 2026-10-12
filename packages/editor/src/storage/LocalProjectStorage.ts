import type { Project } from '@zennovel/core';
import type { ProjectStorage, ProjectSummary } from './ProjectStorage';

/** Keys used by ZenNovel 0.1, which kept projects in localStorage. */
export const LEGACY_INDEX_KEY = 'zennovel:index';
export const legacyProjectKey = (id: string) => `zennovel:project:${id}`;

export function summarize(p: Project): ProjectSummary {
  return {
    id: p.meta.id,
    name: p.meta.name,
    description: p.meta.description,
    updatedAt: p.meta.updatedAt,
    sceneCount: p.scenes.length,
  };
}

/**
 * localStorage fallback for browsers where IndexedDB is unavailable.
 * Limited to roughly 5 MB in total, so large images won't fit.
 */
export class LocalProjectStorage implements ProjectStorage {
  private readIndex(): ProjectSummary[] {
    try {
      return JSON.parse(localStorage.getItem(LEGACY_INDEX_KEY) ?? '[]') as ProjectSummary[];
    } catch {
      return [];
    }
  }

  private writeIndex(index: ProjectSummary[]) {
    localStorage.setItem(LEGACY_INDEX_KEY, JSON.stringify(index));
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadProject(id: string): Promise<Project | null> {
    const raw = localStorage.getItem(legacyProjectKey(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Project;
    } catch {
      return null;
    }
  }

  async saveProject(project: Project): Promise<void> {
    localStorage.setItem(legacyProjectKey(project.meta.id), JSON.stringify(project));
    const index = this.readIndex().filter((p) => p.id !== project.meta.id);
    index.push(summarize(project));
    this.writeIndex(index);
  }

  async deleteProject(id: string): Promise<void> {
    localStorage.removeItem(legacyProjectKey(id));
    this.writeIndex(this.readIndex().filter((p) => p.id !== id));
  }
}
