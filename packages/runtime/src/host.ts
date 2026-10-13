import type { GameHost } from './game';

interface TauriWindow {
  close(): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
}
interface TauriGlobal {
  window?: { getCurrentWindow(): TauriWindow };
}

/** Desktop builds made with the Tauri player (withGlobalTauri). Saves stay in the web view's storage. */
function tauriHost(tauri: Required<TauriGlobal>): GameHost {
  const win = tauri.window.getCurrentWindow();
  let fullscreen = false;
  void win.isFullscreen().then((v) => (fullscreen = v));
  return {
    kind: 'tauri',
    quit: () => win.close(),
    isFullscreen: () => fullscreen,
    setFullscreen: async (on) => {
      fullscreen = on ?? !(await win.isFullscreen());
      await win.setFullscreen(fullscreen);
      return fullscreen;
    },
  };
}

/** A web page: only fullscreen (itch.io and most sites allow it). */
function webHost(): GameHost {
  return {
    kind: 'web',
    isFullscreen: () => document.fullscreenElement !== null,
    setFullscreen: async (on) => {
      const want = on ?? document.fullscreenElement === null;
      try {
        if (want && !document.fullscreenElement) await document.documentElement.requestFullscreen();
        if (!want && document.fullscreenElement) await document.exitFullscreen();
      } catch {
        // Refused (e.g. inside an iframe without permission).
      }
      return document.fullscreenElement !== null;
    },
  };
}

/**
 * What the page is running in: an Electron build exposes `zennovelHost`
 * (see packages/desktop/src/shell), a Tauri build `__TAURI__`.
 */
export function detectHost(): GameHost | null {
  const w = window as unknown as { zennovelHost?: GameHost; __TAURI__?: TauriGlobal };
  if (w.zennovelHost) return w.zennovelHost;
  if (w.__TAURI__?.window) return tauriHost(w.__TAURI__ as Required<TauriGlobal>);
  if (document.fullscreenEnabled) return webHost();
  return null;
}
