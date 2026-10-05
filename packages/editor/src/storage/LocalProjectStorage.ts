import type { Project } from '@zennovel/core';
import type { ProjectStorage, ProjectSummary } from './ProjectStorage';

const INDEX_KEY = 'zennovel:index';
const projectKey = (id: string) => `zennovel:project:${id}`;

function summarize(p: Project): ProjectSummary {
  return {
    id: p.meta.id,
    name: p.meta.name,
    description: p.meta.description,
    updatedAt: p.meta.updatedAt,
    sceneCount: p.scenes.length,
  };
}

/**
 * Browser storage via localStorage. Fine for text-only projects; once users
 * import their own images this should move to IndexedDB (localStorage caps
 * out around 5 MB).
 */
export class LocalProjectStorage implements ProjectStorage {
  private readIndex(): ProjectSummary[] {
    try {
      return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as ProjectSummary[];
    } catch {
      return [];
    }
  }

  private writeIndex(index: ProjectSummary[]) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadProject(id: string): Promise<Project | null> {
    const raw = localStorage.getItem(projectKey(id));
    return raw ? (JSON.parse(raw) as Project) : null;
  }

  async saveProject(project: Project): Promise<void> {
    localStorage.setItem(projectKey(project.meta.id), JSON.stringify(project));
    const index = this.readIndex().filter((p) => p.id !== project.meta.id);
    index.push(summarize(project));
    this.writeIndex(index);
  }

  async deleteProject(id: string): Promise<void> {
    localStorage.removeItem(projectKey(id));
    this.writeIndex(this.readIndex().filter((p) => p.id !== id));
  }
}

export const storage: ProjectStorage = new LocalProjectStorage();
