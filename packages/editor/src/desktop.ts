import type { Asset, Project } from '@zennovel/core';
import type { ProjectSummary } from './storage/ProjectStorage';

/** Where an exported game can go. "web" is the HTML5 build for websites and itch.io. */
export type ExportTarget = 'web' | 'windows-electron' | 'linux-electron' | 'windows-tauri' | 'linux-tauri';

export interface GameFile {
  path: string;
  from: { projectRel: string } | { dataUrl: string };
}

export interface ExportRequest {
  gameName: string;
  version?: string;
  targets: ExportTarget[];
  zip: boolean;
  steamAppId?: string | null;
  html: string;
  files: GameFile[];
}

export interface ExportProgress {
  step: 'game' | 'download' | 'unpack' | 'package' | 'zip' | 'done';
  target?: ExportTarget;
  fraction?: number;
}

export interface ExportResult {
  folder: string;
  outputs: { target: ExportTarget; folder: string; zip?: string }[];
}

export interface MediaImport {
  assets: Asset[];
  rejected: string[];
}

/**
 * What the desktop app (packages/desktop, preload.cts) offers the editor.
 * In a browser `desktop` is null and the editor uses browser storage.
 */
export interface DesktopBridge {
  platform: string;
  info(): Promise<{ version: string; electron: string; platform: string; steamworks: boolean; projectsRoot: string }>;

  listProjects(): Promise<ProjectSummary[]>;
  readProject(id: string): Promise<unknown>;
  writeProject(project: Project): Promise<void>;
  removeProject(id: string): Promise<void>;
  revealProject(id: string): Promise<void>;
  openProjectFolder(): Promise<{ id: string } | { error: 'notAProject' | 'alreadyOpen'; id?: string } | null>;
  chooseProjectsRoot(): Promise<string | null>;

  pickMedia(projectId: string, kinds: ('image' | 'audio')[], multiple: boolean): Promise<MediaImport>;
  importFiles(projectId: string, files: File[], kinds: ('image' | 'audio')[]): Promise<MediaImport>;

  /** null when the writer cancelled the folder dialog. */
  exportGame(
    projectId: string,
    request: ExportRequest,
  ): Promise<ExportResult | { error: { code: string; message: string } } | null>;
  onExportProgress(callback: (progress: ExportProgress) => void): () => void;
  revealPath(path: string): Promise<void>;
}

export const desktop: DesktopBridge | null =
  (globalThis as { zennovelDesktop?: DesktopBridge }).zennovelDesktop ?? null;

/** Asset URLs of projects on disk (served by the desktop app). */
export const PROJECT_ASSET_PREFIX = 'zn-project://';
