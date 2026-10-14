import { describe, expect, it } from 'vitest';
import { checkProject, normalizeProject, type Project } from '@zennovel/core';
import { Engine } from './engine';
import nightZh from '../../editor/public/templates/night/project.zh.json';
import nightEn from '../../editor/public/templates/night/project.en.json';

const zh = nightZh as Project;
const en = nightEn as Project;

/**
 * Plays the night the way the player would, minus the screen: pauses and time
 * limits run their course, `tool` is the torch picked in the day, and `good`
 * says whether the player does the right thing in time (finds, follows,
 * fixes, lights). Returns when each event started, in seconds of night.
 */
function play(project: Project, tool: number, good: boolean) {
  const engine = new Engine(project);
  engine.start();
  const lines: string[] = [];
  const prompts: [string, number][] = [];
  let elapsed = 0;
  const pass = (seconds: number) => {
    elapsed += seconds;
    engine.tick(seconds);
  };
  for (let i = 0; i < 10000; i++) {
    const s = engine.getState();
    if (s.ended || s.error) break;
    if (s.waiting) {
      pass(s.waiting.seconds);
      engine.resume(s.waiting.id);
    } else if (s.choices && s.choiceTimer) {
      prompts.push([s.dialogue?.text ?? '', Math.round(elapsed)]);
      const pick = s.choices[0]!;
      if (good) {
        pass(pick.hold ?? 0.5);
        engine.choose(pick.id);
      } else {
        pass(s.choiceTimer.seconds);
        engine.timeUp(s.choiceTimer.id);
      }
    } else if (s.choices) {
      engine.choose(s.choices[tool - 1]!.id);
    } else {
      if (s.dialogue) lines.push(s.dialogue.text);
      engine.advance();
    }
  }
  return { engine, lines, prompts, elapsed, vars: engine.getState().variables };
}

describe('“Night Shift” sample', () => {
  it('loads cleanly in both languages and the story checker finds nothing', () => {
    for (const raw of [nightZh, nightEn]) {
      expect(normalizeProject(raw).ok).toBe(true);
      expect(checkProject(raw as Project)).toEqual([]);
    }
  });

  it('is dark at night, with the torch sized by the tool you took', () => {
    for (const [tool, radius] of [
      [1, 0.3],
      [2, 0.19],
    ] as const) {
      const engine = new Engine(zh);
      engine.start();
      for (let i = 0; i < 40 && !engine.getState().waiting; i++) {
        const s = engine.getState();
        if (s.choices) engine.choose(s.choices[tool - 1]!.id);
        else engine.advance();
      }
      const s = engine.getState();
      expect(s.darkness?.radius).toBe(radius);
      expect(s.variables.clock).toBe(60);
      // Each torch has its own battery; only the one you carry is charged (and shown).
      expect([s.variables.battery1, s.variables.battery2]).toEqual(tool === 1 ? [100, 0] : [0, 100]);
      expect(s.sprites.filter((sp) => sp.glow).map((sp) => sp.characterId)).toEqual(['windows', 'lamps']);
    }
  });

  it('a good night with either torch keeps all five things safe, and lasts one minute', () => {
    for (const tool of [1, 2]) {
      const { engine, lines, prompts, elapsed, vars } = play(zh, tool, true);
      expect(engine.getState().ended).toBe(true);
      expect([vars.safe, vars.hit, vars.bikeGone, vars.boySafe, vars.girlSafe]).toEqual([5, false, false, true, true]);
      expect(lines).toContain('一件事都没出。行，这条街的夜里，以后归你了。');
      expect(elapsed >= 60 && elapsed < 62).toBe(true);
      // The four kinds of trouble come in order: search, follow, react, choose.
      expect(prompts.map(([p]) => p.slice(0, 4))).toEqual([
        '对面店门',
        '路灯坏了',
        '有车来了',
        tool === 1 ? '手电没电' : '手电接触',
        '两个人同',
        '快！',
      ]);
    }
  });

  it('the big torch runs flat by itself; the old one acts up on schedule', () => {
    const big = play(zh, 1, true).prompts.find(([p]) => p.startsWith('手电'))![1];
    const old = play(zh, 2, true).prompts.find(([p]) => p.startsWith('手电'))![1];
    expect(big >= 31 && big <= 33).toBe(true);
    expect(old >= 30 && old <= 31).toBe(true);
  });

  it('a bad night: the bike is stolen, the old lady is hit, the torch stays broken', () => {
    const { lines, vars, engine } = play(zh, 2, false);
    expect([vars.safe, vars.hit, vars.bikeGone, vars.dim]).toEqual([0, true, true, true]);
    expect(lines).toContain('修车铺老李的车让人偷了，在门口骂了一早上。');
    expect(lines).toContain('【这一夜，5 件事一件也没守住。光要跟着人走——再守一夜？】');
    expect(engine.getState().ended).toBe(true);
  });

  it('the English version is the same night, command for command', () => {
    const shape = (p: Project) =>
      JSON.stringify(
        p.scenes.map((s) => s.commands),
        (k, v: unknown) => (k === 'text' || k === 'prompt' || k === 'expression' ? undefined : v),
      );
    expect(shape(en)).toEqual(shape(zh));
    const run = play(en, 1, true);
    expect(run.vars.safe).toBe(5);
    expect(run.lines).toContain('[Tonight you kept all 5 things safe. Take the other torch and guard another night?]');
  });
});
