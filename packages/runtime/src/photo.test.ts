import { describe, expect, it } from 'vitest';
import { checkProject, normalizeProject, type Project } from '@zennovel/core';
import { Engine } from './engine';
import photoZh from '../../editor/public/templates/photo/project.zh.json';
import photoEn from '../../editor/public/templates/photo/project.en.json';

const zh = photoZh as Project;
const en = photoEn as Project;

/**
 * Plays the story: `people` is the order to click people in the photograph,
 * `answers` the option to take (by index) at each button choice.
 */
function play(project: Project, people: string[], answers: number[]) {
  const engine = new Engine(project);
  engine.start();
  const lines: string[] = [];
  const queue = [...people];
  const picks = [...answers];
  for (let i = 0; i < 2000; i++) {
    const s = engine.getState();
    if (s.ended || s.error) break;
    if (s.choices) {
      if (s.choices.every((c) => c.area)) {
        const who = queue.shift();
        const option = project.scenes
          .flatMap((sc) => sc.commands)
          .flatMap((c) => (c.type === 'choice' ? c.options : []))
          .find((o) => o.targetSceneId === who);
        if (!option) throw new Error(`no hotspot for ${who}`);
        engine.choose(option.id);
      } else {
        engine.choose(s.choices[Math.min(picks.shift() ?? 0, s.choices.length - 1)]!.id);
      }
      continue;
    }
    if (s.dialogue) lines.push(s.dialogue.text);
    engine.advance();
  }
  return { lines, engine };
}

/** Which picture each person in the photograph shows at the end. */
const photo = (engine: Engine) =>
  Object.fromEntries(engine.getState().sprites.map((sp) => [sp.characterId, sp.expression]));

describe('“One photograph” sample', () => {
  it('loads cleanly in both languages and the story checker finds nothing', () => {
    for (const raw of [photoZh, photoEn]) {
      expect(normalizeProject(raw).ok).toBe(true);
      expect(checkProject(raw as Project)).toEqual([]);
    }
  });

  it('the photograph is chosen by clicking people in it, and they are full-stage layers', () => {
    const engine = new Engine(zh);
    engine.start();
    for (let i = 0; i < 20 && !engine.getState().choices; i++) engine.advance();
    const s = engine.getState();
    expect(s.choices?.map((c) => !!c.area)).toEqual([true, true, true]);
    expect(s.sprites.map((sp) => sp.characterId)).toEqual(['boy', 'post', 'girl', 'film']);
    expect(s.sprites.every((sp) => JSON.stringify(sp.place) === JSON.stringify({ x: 0.5, y: 1, height: 1 }))).toBe(
      true,
    );
  });

  it('choices change the developed photograph, and the order you visit people in matters', () => {
    // The boy stays, the letter is delivered, the girl waits.
    let run = play(zh, ['boy1', 'post1', 'girl1'], [0, 0, 0]);
    expect(run.engine.getState().ended).toBe(true);
    expect(photo(run.engine)).toEqual({ boy: '在', post: '停下', girl: '等着', film: '颗粒' });
    expect(run.lines).toContain('那封信是我写的。我托邮局把它送到钟下面，因为我没有勇气自己走过去。');

    // The girl leaves first: when the postman gets there, nobody is under the clock.
    run = play(zh, ['girl1', 'post1', 'boy1'], [1, 0, 1]);
    expect(photo(run.engine)).toEqual({ boy: '走了', post: '骑车经过', girl: '走了', film: '颗粒' });
    expect(run.lines).toContain('可等他骑到街口，钟底下已经没有人了。');
  });

  it('the English version is the same story, line for line', () => {
    expect(en.scenes.map((s) => s.id)).toEqual(zh.scenes.map((s) => s.id));
    const shape = (p: Project) =>
      JSON.stringify(
        p.scenes.map((s) => s.commands),
        (k, v: unknown) => (k === 'text' || k === 'prompt' || k === 'expression' ? undefined : v),
      );
    expect(shape(en)).toEqual(shape(zh));
    const run = play(en, ['post1', 'girl1', 'boy1'], [0, 1, 0]);
    expect(photo(run.engine)).toEqual({ boy: 'there', post: 'stopped', girl: 'leaving', film: 'grain' });
  });
});
