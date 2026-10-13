import type { Project } from '@zennovel/core';

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  sceneCount: number;
  /** The project's folder (desktop app only). */
  dir?: string;
}

/**
 * Everything the editor needs from "disk". The web build uses browser
 * storage; a desktop shell (Tauri / Electron) can provide its own
 * implementation backed by real folders without touching the UI.
 */
export interface ProjectStorage {
  listProjects(): Promise<ProjectSummary[]>;
  loadProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
}
