import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Project } from '@zennovel/core';
import { autoLayout, COLUMN, layoutScenes, mapEdges, ROW } from './mapLayout';
import demoJson from '../../public/templates/demo/project.en.json';

const demo = () => structuredClone(demoJson) as Project;

describe('story map', () => {
  it('finds jumps and labelled choice options, skipping missing targets', () => {
    const p = demo();
    p.scenes[0]!.commands.push({ id: 'j', type: 'jump', targetSceneId: 'nowhere' });
    expect(mapEdges(p).map((e) => `${e.from}>${e.to}:${e.kind}:${e.label ?? ''}`)).toEqual([
      'scene_start>scene_library:choice:Return books at the library',
      'scene_start>scene_rooftop:choice:Watch the sunset from the rooftop',
      'scene_library>scene_ending:jump:',
      'scene_rooftop>scene_ending:jump:',
    ]);
  });

  it('auto layout puts scenes in columns by distance from the start', () => {
    const pos = autoLayout(demo());
    expect(pos.scene_start).toEqual({ x: 0, y: 0 });
    expect(pos.scene_library).toEqual({ x: COLUMN, y: 0 });
    expect(pos.scene_rooftop).toEqual({ x: COLUMN, y: ROW });
    expect(pos.scene_ending).toEqual({ x: 2 * COLUMN, y: 0 });
  });

  it('keeps saved positions and places new scenes to the right', () => {
    const p = demo();
    p.scenes.push({ id: 'new', name: 'New', commands: [] });
    const pos = layoutScenes(p);
    expect(pos.scene_library).toEqual({ x: 320, y: 0 });
    expect(pos.new).toEqual({ x: 640 + COLUMN, y: 0 });
  });

  it('lays out a never-arranged project automatically, without overlaps', () => {
    const p = createEmptyProject('x');
    p.scenes.push({ id: 'a', name: 'A', commands: [] }, { id: 'b', name: 'B', commands: [] });
    const spots = Object.values(layoutScenes(p)).map((q) => `${q.x},${q.y}`);
    expect(new Set(spots).size).toBe(3);
  });
});
