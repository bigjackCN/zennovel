import { FORMAT_VERSION, type Locale, type Project, type Theme } from './types';

/** Short random id with a readable prefix, e.g. "scene_k3f9a2". */
export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export const defaultTheme: Theme = {
  fontFamily: 'system-ui, "Segoe UI", Roboto, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
  textSpeed: 40,
  dialogue: {
    background: 'rgba(20, 22, 35, 0.82)',
    textColor: '#f4f1ea',
    fontSize: 26,
    borderRadius: 14,
    padding: 28,
    height: 0.28,
    margin: 24,
  },
  nameplate: {
    background: '#c8553d',
    textColor: '#ffffff',
    fontSize: 22,
  },
  choice: {
    background: 'rgba(20, 22, 35, 0.85)',
    hoverBackground: 'rgba(200, 85, 61, 0.95)',
    textColor: '#f4f1ea',
    borderRadius: 10,
  },
};

export interface EmptyProjectOptions {
  locale?: Locale;
  /** Name of the first scene, e.g. "Start". */
  firstSceneName?: string;
  /** Placeholder first line. */
  firstLine?: string;
}

export function createEmptyProject(name: string, options: EmptyProjectOptions = {}): Project {
  const now = new Date().toISOString();
  const startId = createId('scene');
  return {
    formatVersion: FORMAT_VERSION,
    meta: {
      id: createId('proj'),
      name,
      locale: options.locale ?? 'en',
      resolution: { width: 1280, height: 720 },
      createdAt: now,
      updatedAt: now,
    },
    assets: [],
    characters: [],
    variables: [],
    theme: structuredClone(defaultTheme),
    scenes: [
      {
        id: startId,
        name: options.firstSceneName ?? 'Start',
        position: { x: 0, y: 0 },
        commands: [
          { id: createId('cmd'), type: 'bg', background: { kind: 'color', value: '#2b2d42' } },
          { id: createId('cmd'), type: 'say', text: options.firstLine ?? 'The story begins here…' },
        ],
      },
    ],
    startSceneId: startId,
  };
}
