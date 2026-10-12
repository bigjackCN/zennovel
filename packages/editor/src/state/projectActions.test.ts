import { describe, expect, it } from 'vitest';
import type { IfCommand, Project, SetVarCommand, ShowCommand } from '@zennovel/core';
import { actions } from './projectActions';
import demoJson from '../../public/templates/demo/project.en.json';

const demo = () => structuredClone(demoJson) as Project;
const scene = (p: Project, id: string) => p.scenes.find((s) => s.id === id)!;
const ifCmd = (p: Project) => scene(p, 'scene_ending').commands.find((c) => c.id === 'cmd_026') as IfCommand;

describe('projectActions', () => {
  it('never mutates the project it is given', () => {
    const p = demo();
    const before = JSON.stringify(p);
    actions.removeCommand(p, 'scene_start', 'cmd_002');
    actions.renameExpression(p, 'chr_mei', 'normal', 'smile');
    actions.changeVariableType(p, 'var_courage', 'boolean');
    expect(JSON.stringify(p)).toBe(before);
  });

  it('inserts, moves and removes commands inside if branches', () => {
    let p = demo();
    const firstThen = ifCmd(p).then[0]!.id;
    p = actions.insertCommand(p, 'scene_ending', { id: 'new', type: 'say', text: 'x' }, { afterId: firstThen });
    expect(
      ifCmd(p)
        .then.map((c) => c.id)
        .slice(0, 2),
    ).toEqual([firstThen, 'new']);
    p = actions.moveCommand(p, 'scene_ending', 'new', -1);
    expect(ifCmd(p).then[0]!.id).toBe('new');
    p = actions.insertCommand(
      p,
      'scene_ending',
      { id: 'nested', type: 'end' },
      { parentIfId: 'cmd_026', branch: 'else' },
    );
    expect(ifCmd(p).else.at(-1)!.id).toBe('nested');
    p = actions.removeCommand(p, 'scene_ending', 'new');
    expect(ifCmd(p).then.some((c) => c.id === 'new')).toBe(false);
  });

  it('renames an expression and the commands that use it', () => {
    const p = actions.renameExpression(demo(), 'chr_mei', 'normal', 'smile');
    expect(Object.keys(p.characters.find((c) => c.id === 'chr_mei')!.sprites)).toEqual(['smile']);
    const shows = p.scenes.flatMap((s) => s.commands).filter((c): c is ShowCommand => c.type === 'show');
    expect(shows.filter((c) => c.characterId === 'chr_mei').every((c) => c.expression === 'smile')).toBe(true);
    expect(shows.filter((c) => c.characterId === 'chr_theo').every((c) => c.expression === 'normal')).toBe(true);
  });

  it('refuses to rename an expression to an empty or existing name', () => {
    let p = demo();
    p = actions.updateCharacter(p, { ...p.characters[0]!, sprites: { normal: 'img_mei', sad: 'img_mei' } });
    expect(actions.renameExpression(p, p.characters[0]!.id, 'normal', 'sad')).toBe(p);
    expect(actions.renameExpression(p, p.characters[0]!.id, 'normal', '  ')).toBe(p);
  });

  it('changing a variable to yes/no rewrites the places that use it', () => {
    const p = actions.changeVariableType(demo(), 'var_courage', 'boolean');
    expect(p.variables[0]!.initial).toBe(false);
    const opt = (
      scene(p, 'scene_start').commands.find((c) => c.type === 'choice') as { options: { effects?: unknown[] }[] }
    ).options[0]!;
    expect(opt.effects).toEqual([{ variableId: 'var_courage', op: 'toggle' }]);
    expect(ifCmd(p).condition).toEqual({ kind: 'compare', variableId: 'var_courage', op: '==', value: true });
  });

  it('changing a variable to text keeps "set" and converts values', () => {
    let p = demo();
    p = actions.insertCommand(
      p,
      'scene_start',
      { id: 'sv', type: 'setVar', effect: { variableId: 'var_courage', op: 'set', value: 3 } },
      { afterId: 'cmd_002' },
    );
    p = actions.changeVariableType(p, 'var_courage', 'string');
    const sv = scene(p, 'scene_start').commands.find((c) => c.id === 'sv') as SetVarCommand;
    expect(sv.effect).toEqual({ variableId: 'var_courage', op: 'set', value: '3' });
  });

  it('deleting the start scene moves the start to another scene', () => {
    const p = actions.deleteScene(demo(), 'scene_start');
    expect(p.scenes.some((s) => s.id === 'scene_start')).toBe(false);
    expect(p.startSceneId).toBe(p.scenes[0]!.id);
  });

  it('keeps at least one scene', () => {
    let p = demo();
    for (const s of [...p.scenes]) p = actions.deleteScene(p, s.id);
    expect(p.scenes).toHaveLength(1);
  });
});
