import type { Project } from '@zennovel/core';
import type { EngineState } from './engine';

/** One saved game, as stored in the player's browser. */
export interface SaveRecord {
  version: 1;
  savedAt: string;
  /** Shown in the save/load list. */
  sceneName: string;
  text: string;
  state: EngineState;
}

/** The parts of `localStorage` saves need (so tests can pass a fake). */
export type SaveBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const AUTO_SLOT = 'auto';
export const MANUAL_SLOTS = ['1', '2', '3', '4', '5', '6'] as const;

/** localStorage, or null where it's unavailable (private mode, sandboxed iframes). */
export function browserSaveBackend(): SaveBackend | null {
  try {
    const probe = '__zennovel_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/** Build a save from the engine state, with a readable label for the slot list. */
export function makeSave(project: Project, state: EngineState, now = new Date()): SaveRecord {
  const sceneId = state.stack[0]?.sceneId;
  const sceneName = project.scenes.find((s) => s.id === sceneId)?.name ?? '';
  const text = state.dialogue?.text ?? state.choices?.map((c) => c.text).join(' / ') ?? '';
  return { version: 1, savedAt: now.toISOString(), sceneName, text, state: structuredClone(state) };
}

/**
 * Save slots for one game. Keys include the project id because exported
 * games on the same site (e.g. itch.io's shared player domain) share one
 * localStorage.
 */
export class SaveStore {
  private projectId: string;
  private backend: SaveBackend | null;

  constructor(projectId: string, backend: SaveBackend | null) {
    this.projectId = projectId;
    this.backend = backend;
  }

  get available(): boolean {
    return this.backend !== null;
  }

  private key(slot: string) {
    return `zennovel:${this.projectId}:save:${slot}`;
  }

  read(slot: string): SaveRecord | null {
    try {
      const raw = this.backend?.getItem(this.key(slot));
      if (!raw) return null;
      const record = JSON.parse(raw) as SaveRecord;
      return record?.version === 1 && record.state ? record : null;
    } catch {
      return null;
    }
  }

  /** Returns false if the browser refused (storage full or disabled). */
  write(slot: string, record: SaveRecord): boolean {
    try {
      this.backend?.setItem(this.key(slot), JSON.stringify(record));
      return this.backend !== null;
    } catch {
      return false;
    }
  }

  remove(slot: string): void {
    try {
      this.backend?.removeItem(this.key(slot));
    } catch {
      // ignore
    }
  }

  /** Whether any manual slot holds a save. */
  hasManualSaves(): boolean {
    return MANUAL_SLOTS.some((s) => this.read(s) !== null);
  }
}
