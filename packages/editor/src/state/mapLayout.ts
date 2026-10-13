import { walkCommands, type Project } from '@zennovel/core';

/** Size of a scene box on the story map, and the auto-layout grid. */
export const NODE_W = 200;
export const NODE_H = 64;
export const COLUMN = 300;
export const ROW = 110;

export interface Point {
  x: number;
  y: number;
}

export interface MapEdge {
  from: string;
  to: string;
  /** A jump, or a choice option (labelled with the option text). */
  kind: 'jump' | 'choice';
  label?: string;
}

/** Every way one scene leads to another. Edges to missing scenes are left out (the story check reports them). */
export function mapEdges(project: Project): MapEdge[] {
  const ids = new Set(project.scenes.map((s) => s.id));
  const edges: MapEdge[] = [];
  const seen = new Set<string>();
  const add = (edge: MapEdge) => {
    const key = `${edge.from}>${edge.to}>${edge.kind}>${edge.label ?? ''}`;
    if (!ids.has(edge.to) || seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };
  for (const scene of project.scenes) {
    walkCommands(scene.commands, (cmd) => {
      if (cmd.type === 'jump') add({ from: scene.id, to: cmd.targetSceneId, kind: 'jump' });
      if (cmd.type === 'choice') {
        for (const o of cmd.options) {
          if (o.targetSceneId) add({ from: scene.id, to: o.targetSceneId, kind: 'choice', label: o.text });
        }
      }
    });
  }
  return edges;
}

/**
 * Lay scenes out left to right by distance from the start scene (a column
 * per step), stacking scenes of the same step. Scenes nothing leads to go
 * in a final column.
 */
export function autoLayout(project: Project): Record<string, Point> {
  const next = new Map<string, string[]>();
  for (const e of mapEdges(project)) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);

  const depth = new Map<string, number>();
  const queue: string[] = [];
  if (project.scenes.some((s) => s.id === project.startSceneId)) {
    depth.set(project.startSceneId, 0);
    queue.push(project.startSceneId);
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const to of next.get(id) ?? []) {
      if (!depth.has(to)) {
        depth.set(to, depth.get(id)! + 1);
        queue.push(to);
      }
    }
  }
  const lastColumn = Math.max(-1, ...depth.values()) + 1;
  const rows = new Map<number, number>();
  const out: Record<string, Point> = {};
  for (const scene of project.scenes) {
    const column = depth.get(scene.id) ?? lastColumn;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    out[scene.id] = { x: column * COLUMN, y: row * ROW };
  }
  return out;
}

/**
 * Where each scene is drawn: its saved position when it has a usable one,
 * otherwise a fresh spot. A project that has (almost) never been arranged
 * gets a full auto layout.
 */
export function layoutScenes(project: Project): Record<string, Point> {
  const taken = new Set<string>();
  const placed: Record<string, Point> = {};
  for (const s of project.scenes) {
    const p = s.position;
    if (!p) continue;
    const key = `${p.x},${p.y}`;
    if (taken.has(key)) continue; // two scenes on one spot: re-place the second
    taken.add(key);
    placed[s.id] = { x: p.x, y: p.y };
  }
  const placedCount = Object.keys(placed).length;
  if (project.scenes.length > 1 && placedCount <= 1) return autoLayout(project);

  // New scenes go in a column to the right of everything else.
  const values = Object.values(placed);
  const x = values.length ? Math.max(...values.map((p) => p.x)) + COLUMN : 0;
  let y = values.length ? Math.min(...values.map((p) => p.y)) : 0;
  const out = { ...placed };
  for (const s of project.scenes) {
    if (out[s.id]) continue;
    out[s.id] = { x, y };
    y += ROW;
  }
  return out;
}
