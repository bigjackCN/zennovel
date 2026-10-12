import type { Project } from '@zennovel/core';
import type { ProjectStorage, ProjectSummary } from './ProjectStorage';
import { IndexedDbProjectStorage } from './IndexedDbProjectStorage';
import { LocalProjectStorage } from './LocalProjectStorage';
import { announceSaved } from './sync';

export type { ProjectStorage, ProjectSummary };

/**
 * The browser build's storage: IndexedDB when available, localStorage
 * otherwise. Every successful save is announced to other open tabs.
 */
class BrowserProjectStorage implements ProjectStorage {
  private backend: Promise<ProjectStorage> = IndexedDbProjectStorage.open().catch((e: unknown) => {
    console.warn('IndexedDB unavailable, falling back to localStorage', e);
    return new LocalProjectStorage();
  });

  async listProjects(): Promise<ProjectSummary[]> {
    return (await this.backend).listProjects();
  }

  async loadProject(id: string): Promise<Project | null> {
    return (await this.backend).loadProject(id);
  }

  async saveProject(project: Project): Promise<void> {
    await (await this.backend).saveProject(project);
    announceSaved(project.meta.id, project.meta.updatedAt);
  }

  async deleteProject(id: string): Promise<void> {
    await (await this.backend).deleteProject(id);
    announceSaved(id, null);
  }
}

export const storage: ProjectStorage = new BrowserProjectStorage();
