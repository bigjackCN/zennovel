/**
 * What the editor page may ask of the desktop app. Mirrored by the
 * DesktopBridge type in packages/editor/src/desktop.ts.
 */
import electron = require('electron');

const { contextBridge, ipcRenderer, webUtils } = electron;

type Kinds = ('image' | 'audio')[];

contextBridge.exposeInMainWorld('zennovelDesktop', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('app:info'),

  listProjects: () => ipcRenderer.invoke('projects:list'),
  readProject: (id: string) => ipcRenderer.invoke('projects:read', id),
  writeProject: (project: unknown) => ipcRenderer.invoke('projects:write', project),
  removeProject: (id: string) => ipcRenderer.invoke('projects:remove', id),
  revealProject: (id: string) => ipcRenderer.invoke('projects:reveal', id),
  openProjectFolder: () => ipcRenderer.invoke('projects:openFolder'),
  chooseProjectsRoot: () => ipcRenderer.invoke('projects:chooseRoot'),

  pickMedia: (projectId: string, kinds: Kinds, multiple: boolean) =>
    ipcRenderer.invoke('media:pick', projectId, kinds, multiple),
  /** Files dropped on the window: copied into the project by path, whatever their size. */
  importFiles: (projectId: string, files: File[], kinds: Kinds) =>
    ipcRenderer.invoke('media:import', projectId, files.map((f) => webUtils.getPathForFile(f)).filter(Boolean), kinds),

  exportGame: (projectId: string, request: unknown) => ipcRenderer.invoke('export:run', projectId, request),
  onExportProgress: (callback: (progress: unknown) => void) => {
    const listener = (_e: unknown, progress: unknown) => callback(progress);
    ipcRenderer.on('export:progress', listener);
    return () => {
      ipcRenderer.removeListener('export:progress', listener);
    };
  },
  revealPath: (path: string) => ipcRenderer.invoke('shell:reveal', path),
});
