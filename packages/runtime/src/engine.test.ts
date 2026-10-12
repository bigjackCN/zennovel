import { describe, expect, it } from 'vitest';
import { checkProject, createEmptyProject, type Project } from '@zennovel/core';
import { Engine } from './engine';
import demoEn from '../../editor/public/templates/demo/project.en.json';
import demoZh from '../../editor/public/templates/demo/project.zh.json';

const project = demoEn as Project;
const projectZh = demoZh as Project;

function lines(engine: Engine, max = 50): string[] {
  const seen: string[] = [];
  for (let i = 0; i < max; i++) {
    const s = engine.getState();
    if (s.ended || s.choices) break;
    if (s.dialogue) seen.push(s.dialogue.text);
    engine.advance();
  }
  return seen;
}

describe('Engine', () => {
  it('plays the demo up to the first choice', () => {
    const engine = new Engine(project);
    engine.start();
    expect(engine.getState().background).toEqual({ kind: 'image', assetId: 'img_park' });
    expect(lines(engine)).toHaveLength(3);
    const s = engine.getState();
    expect(s.choices?.map((c) => c.id)).toEqual(['opt_library', 'opt_rooftop']);
    expect(s.dialogue?.text).toBe('Where should we go?');
  });

  it('library route applies the effect and reaches the good ending', () => {
    const engine = new Engine(project);
    engine.start();
    lines(engine);
    engine.choose('opt_library');
    expect(engine.getState().variables.var_courage).toBe(1);
    const rest = lines(engine);
    expect(rest).toContain('[Good Ending] The cherry blossoms will bloom many more times.');
    expect(engine.getState().ended).toBe(true);
  });

  it('staying quiet on the rooftop leads to the normal ending', () => {
    const engine = new Engine(project);
    engine.start();
    lines(engine);
    engine.choose('opt_rooftop');
    lines(engine);
    engine.choose('opt_quiet');
    const rest = lines(engine);
    expect(rest).toContain('[Normal Ending] Only the wind is left on the hill.');
    expect(engine.getState().sprites.map((s) => s.characterId)).toEqual(['chr_mei']);
  });

  it('rolls back to the previous line, undoing variable changes', () => {
    const engine = new Engine(project);
    engine.start();
    lines(engine);
    engine.choose('opt_library');
    expect(engine.getState().variables.var_courage).toBe(1);
    engine.rollback();
    expect(engine.getState().variables.var_courage).toBe(0);
    expect(engine.getState().choices).not.toBeNull();
  });

  it('save and load round-trip through JSON', () => {
    const engine = new Engine(project);
    engine.start();
    engine.advance();
    const saved = JSON.parse(JSON.stringify(engine.save()));
    const other = new Engine(project);
    other.load(saved);
    expect(other.getState().dialogue).toEqual(engine.getState().dialogue);
  });

  it('loads a save made before the writer inserted a line above it', () => {
    const engine = new Engine(project);
    engine.start();
    engine.advance(); // -> "Walking home alone again today?"
    expect(engine.getState().dialogue?.text).toBe('Walking home alone again today?');
    const saved = JSON.parse(JSON.stringify(engine.save()));

    const edited = structuredClone(project);
    const start = edited.scenes.find((s) => s.id === 'scene_start')!;
    start.commands.splice(0, 0, { id: 'new_line', type: 'say', text: 'A new opening line.' });
    edited.variables.push({ id: 'var_new', name: 'New', initial: 5 });

    const other = new Engine(edited);
    other.load(saved);
    other.advance();
    expect(other.getState().dialogue?.text).toBe('Do you… want to go somewhere together?');
    expect(other.getState().variables.var_new).toBe(5);
  });

  it('starts from a line in the middle of a scene with the stage already set up', () => {
    const engine = new Engine(project);
    engine.start('scene_rooftop', 'cmd_015');
    const s = engine.getState();
    expect(s.background).toEqual({ kind: 'image', assetId: 'img_rooftop' });
    expect(s.sprites.map((sp) => `${sp.characterId}@${sp.position}`)).toEqual(['chr_mei@left', 'chr_theo@right']);
    expect(s.dialogue?.text).toBe('Oh, you came to watch the sunset too?');
  });

  it('starts from a line inside an if branch', () => {
    const engine = new Engine(project);
    engine.start('scene_ending', 'cmd_022');
    expect(engine.getState().dialogue?.text).toMatch(/^Tomorrow/);
    expect(engine.getState().sprites.map((sp) => sp.characterId)).toEqual(['chr_mei']);
  });

  it('reports an infinite jump loop instead of hanging', () => {
    const p = createEmptyProject('loop');
    const id = p.startSceneId;
    p.scenes[0]!.commands = [{ id: 'j', type: 'jump', targetSceneId: id }];
    const engine = new Engine(p);
    engine.start();
    expect(engine.getState().error).toEqual({ code: 'infiniteLoop' });
  });
});

describe('sample template translations', () => {
  /** Everything except display text, so en/zh must have identical structure. */
  const skeleton = (p: Project) =>
    JSON.stringify(p, (key, value) =>
      ['name', 'text', 'prompt', 'description', 'locale', 'fontFamily'].includes(key) ? undefined : value,
    );

  it('zh sample has the same structure as en', () => {
    expect(skeleton(projectZh)).toBe(skeleton(project));
  });

  it('zh sample plays through to an ending with no errors', () => {
    expect(checkProject(projectZh).filter((i) => i.level === 'error')).toEqual([]);
    const engine = new Engine(projectZh);
    engine.start();
    lines(engine);
    engine.choose('opt_library');
    expect(lines(engine)).toContain('【好结局】樱花还会再开很多次。');
    expect(engine.getState().ended).toBe(true);
  });
});

describe('checkProject', () => {
  it('finds no errors in the demo', () => {
    expect(checkProject(project).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('flags broken jumps and unreachable scenes', () => {
    const p = createEmptyProject('broken');
    p.scenes[0]!.commands.push({ id: 'j', type: 'jump', targetSceneId: 'nowhere' });
    p.scenes.push({ id: 'island', name: 'Island', commands: [{ id: 'e', type: 'end' }] });
    const codes = checkProject(p).map((i) => i.code);
    expect(codes).toContain('missingJumpTarget');
    expect(codes).toContain('unreachable');
  });

  it('warns when a variable is used in a way that does not fit its kind', () => {
    const p = createEmptyProject('types');
    p.variables.push({ id: 'flag', name: 'Flag', initial: false }, { id: 'n', name: 'N', initial: 0 });
    const cmds = p.scenes[0]!.commands;
    cmds.push({ id: 'ok1', type: 'setVar', effect: { variableId: 'flag', op: 'toggle' } });
    cmds.push({ id: 'ok2', type: 'setVar', effect: { variableId: 'n', op: 'add', value: 2 } });
    cmds.push({
      id: 'ok3',
      type: 'if',
      condition: { kind: 'compare', variableId: 'flag', op: '==', value: true },
      then: [],
      else: [],
    });
    cmds.push({ id: 'bad1', type: 'setVar', effect: { variableId: 'flag', op: 'add', value: 1 } });
    cmds.push({
      id: 'bad2',
      type: 'if',
      condition: { kind: 'compare', variableId: 'flag', op: '>=', value: 1 },
      then: [],
      else: [],
    });
    cmds.push({ id: 'end', type: 'end' });
    const flagged = checkProject(p)
      .filter((i) => i.code === 'variableTypeMismatch')
      .map((i) => i.commandId);
    expect(flagged).toEqual(['bad1', 'bad2']);
  });

  it('warns when a final choice can be skipped because every option is conditional', () => {
    const p = createEmptyProject('conditional');
    p.variables.push({ id: 'v', name: 'V', initial: 0 });
    const target = p.startSceneId;
    const option = (id: string) => ({
      id,
      text: id,
      targetSceneId: target,
      condition: { kind: 'compare' as const, variableId: 'v', op: '>=' as const, value: 1 },
    });
    p.scenes[0]!.commands = [{ id: 'c', type: 'choice', options: [option('a'), option('b')] }];
    expect(checkProject(p).map((i) => i.code)).toContain('noEnding');

    // One unconditional option means the choice always shows, so the scene does end.
    p.scenes[0]!.commands = [
      { id: 'c', type: 'choice', options: [option('a'), { id: 'b', text: 'b', targetSceneId: target }] },
    ];
    expect(checkProject(p).map((i) => i.code)).not.toContain('noEnding');
  });
});
