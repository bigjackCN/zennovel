import { describe, expect, it } from 'vitest';
import { defaultTheme, FORMAT_VERSION, normalizeProject, type Project } from './index';
import demo from '../../editor/public/templates/demo/project.en.json';

const ok = (raw: unknown): Project => {
  const r = normalizeProject(raw);
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.project;
};

describe('normalizeProject', () => {
  it('passes a valid project through unchanged', () => {
    expect(ok(demo)).toEqual(demo);
  });

  it('rejects things that are not projects', () => {
    for (const raw of [null, 42, 'hi', [], {}, { scenes: 'nope' }, { scenes: [] }]) {
      expect(normalizeProject(raw).ok).toBe(false);
    }
  });

  it('refuses files from a newer version of ZenNovel', () => {
    const r = normalizeProject({ ...demo, formatVersion: FORMAT_VERSION + 1 });
    expect(r.ok ? null : r.error).toEqual({ code: 'newerFormat', version: FORMAT_VERSION + 1 });
  });

  it('fills in everything that is missing', () => {
    const p = ok({ scenes: [{ id: 's1', commands: [{ type: 'say', text: 'Hi' }] }] });
    expect(p.formatVersion).toBe(FORMAT_VERSION);
    expect(p.theme).toEqual(defaultTheme);
    expect(p.characters).toEqual([]);
    expect(p.variables).toEqual([]);
    expect(p.assets).toEqual([]);
    expect(p.startSceneId).toBe('s1');
    expect(p.meta.resolution).toEqual({ width: 1280, height: 720 });
    expect(p.scenes[0]!.commands[0]!.id).toMatch(/^cmd_/);
  });

  it('completes a partial theme from the defaults', () => {
    const p = ok({ scenes: [{ id: 's', commands: [] }], theme: { textSpeed: 10, dialogue: { fontSize: 30 } } });
    expect(p.theme.textSpeed).toBe(10);
    expect(p.theme.dialogue.fontSize).toBe(30);
    expect(p.theme.dialogue.textColor).toBe(defaultTheme.dialogue.textColor);
    expect(p.theme.choice).toEqual(defaultTheme.choice);
  });

  it('drops malformed commands and renames duplicate ids', () => {
    const p = ok({
      startSceneId: 'gone',
      scenes: [
        {
          id: 's',
          commands: [
            { id: 'a', type: 'say', text: 'one' },
            { id: 'a', type: 'say', text: 'two' },
            { id: 'b', type: 'teleport' },
            'junk',
            { id: 'c', type: 'if', condition: { kind: 'all', conditions: [{ kind: 'compare', variableId: 'v', op: '>=', value: 1 }, 5] }, then: [{ id: 'a', type: 'end' }] },
          ],
        },
      ],
    });
    const cmds = p.scenes[0]!.commands;
    expect(cmds.map((c) => c.type)).toEqual(['say', 'say', 'if']);
    const ids = [cmds[0]!.id, cmds[1]!.id, cmds[2]!.id, (cmds[2] as { then: { id: string }[] }).then[0]!.id];
    expect(new Set(ids).size).toBe(4);
    expect(cmds[0]!.id).toBe('a');
    expect(p.startSceneId).toBe('s');
    const cond = (cmds[2] as { condition: { conditions: unknown[] } }).condition;
    expect(cond.conditions).toHaveLength(1);
  });

  it('keeps ids in separate namespaces (a scene and an asset may share one)', () => {
    const p = ok({ scenes: [{ id: 'park', commands: [] }], assets: [{ id: 'park', kind: 'image', name: 'Park', src: 'a.png' }] });
    expect(p.scenes[0]!.id).toBe('park');
    expect(p.assets[0]!.id).toBe('park');
  });
});
