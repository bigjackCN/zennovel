/**
 * Gives an exported desktop game what a browser can't: save files on disk,
 * fullscreen, quitting, and Steam achievements. The player looks for
 * `window.zennovelHost` (see runtime/src/standalone.ts).
 */
import electron = require('electron');

const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld('zennovelHost', {
  kind: 'electron',
  saveBackend: {
    getItem: (key: string): string | null => ipcRenderer.sendSync('save:get', String(key)),
    setItem: (key: string, value: string): void => {
      if (!ipcRenderer.sendSync('save:set', String(key), String(value)))
        throw new Error('Could not write the save file');
    },
    removeItem: (key: string): void => {
      ipcRenderer.sendSync('save:remove', String(key));
    },
  },
  quit: (): Promise<void> => ipcRenderer.invoke('game:quit'),
  setFullscreen: (on?: boolean): Promise<boolean> => ipcRenderer.invoke('game:fullscreen', on),
  isFullscreen: (): boolean => ipcRenderer.sendSync('game:isFullscreen'),
  unlockAchievement: (name: string): Promise<boolean> => ipcRenderer.invoke('game:achievement', String(name)),
});
