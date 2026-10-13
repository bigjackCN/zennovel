import { describe, expect, it } from 'vitest';
import { checkProject, createEmptyProject, normalizeProject, type Project } from '@zennovel/core';
import { Engine } from './engine';

function project(): Project {
  const p = createEmptyProject('achievements');
  p.scenes[0]!.commands = [
    { id: 'l1', type: 'say', text: 'one' },
    { id: 'a1', type: 'achievement', achievementId: 'ENDING_TRUE', name: '真结局' },
    { id: 'l2', type: 'say', text: 'two' },
    { id: 'e', type: 'end' },
  ];
  return p;
}

describe('achievements', () => {
  it('survive loading a project file, and the checker wants a Steam-style API name', () => {
    const result = normalizeProject(JSON.parse(JSON.stringify(project())));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.scenes[0]!.commands[1]).toEqual({
      id: 'a1',
      type: 'achievement',
      achievementId: 'ENDING_TRUE',
      name: '真结局',
    });
    expect(checkProject(result.project)).toEqual([]);
    const bad = project();
    bad.scenes[0]!.commands[1] = { id: 'a1', type: 'achievement', achievementId: '真结局' };
    expect(checkProject(bad).map((i) => i.code)).toEqual(['badAchievementId']);
  });

  it('are reported once each, with a new id after a rollback', () => {
    const engine = new Engine(project());
    engine.start();
    expect(engine.getState().achievement).toBeNull();
    engine.advance();
    const first = engine.getState().achievement!;
    expect([first.achievementId, first.name]).toEqual(['ENDING_TRUE', '真结局']);
    engine.rollback();
    engine.advance();
    expect(engine.getState().achievement!.id > first.id).toBe(true);
  });

  it('are not unlocked by starting the preview from a later line', () => {
    const engine = new Engine(project());
    engine.start(undefined, 'l2');
    expect(engine.getState().dialogue?.text).toBe('two');
    expect(engine.getState().achievement).toBeNull();
  });
});
