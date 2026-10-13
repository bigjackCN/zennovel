import type { Project } from '@zennovel/core';
import type { DesktopBridge } from '../desktop';
import type { ProjectStorage, ProjectSummary } from './ProjectStorage';

/**
 * Projects as folders on disk, through the desktop app. Images and music
 * are files in the project's assets/ folder; the editor sees them as
 * zn-project:// URLs.
 */
export class DesktopProjectStorage implements ProjectStorage {
  private bridge: DesktopBridge;

  constructor(bridge: DesktopBridge) {
    this.bridge = bridge;
  }

  listProjects(): Promise<ProjectSummary[]> {
    return this.bridge.listProjects();
  }

  async loadProject(id: string): Promise<Project | null> {
    return ((await this.bridge.readProject(id)) as Project | null) ?? null;
  }

  saveProject(project: Project): Promise<void> {
    return this.bridge.writeProject(project);
  }

  deleteProject(id: string): Promise<void> {
    return this.bridge.removeProject(id);
  }
}
