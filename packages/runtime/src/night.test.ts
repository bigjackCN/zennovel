import { describe, expect, it } from 'vitest';
import { checkProject, normalizeProject, type Project } from '@zennovel/core';
import { Engine } from './engine';
import nightZh from '../../editor/public/templates/night/project.zh.json';
import nightEn from '../../editor/public/templates/night/project.en.json';

const zh = nightZh as Project;
const en = nightEn as Project;

/**
 * Plays the night the way the player would, minus the screen: pauses and time
 * limits run their course, `tool` is the button picked in the day, and
 * `keepLight` says whether the player keeps the torch on whoever needs it.
 */
function play(project: Project, tool: number, keepLight: boolean) {
  const engine = new Engine(project);
  engine.start();
  const lines: string[] = [];
  let elapsed = 0;
  const pass = (seconds: number) => {
    elapsed += seconds;
    engine.tick(seconds);
  };
  for (let i = 0; i < 5000; i++) {
    const s = engine.getState();
    if (s.ended || s.error) break;
    if (s.waiting) {
      pass(s.waiting.seconds);
      engine.resume(s.waiting.id);
    } else if (s.choices && s.choiceTimer) {
      const held = s.choices.find((c) => c.hold);
      if (keepLight && held) {
        pass(held.hold!);
        engine.choose(held.id);
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
  return { engine, lines, elapsed };
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
      expect(s.variables.clock).toBe(22);
      // Each torch has its own battery; only the one you carry is charged (and shown).
      expect([s.variables.battery1, s.variables.battery2]).toEqual(tool === 1 ? [100, 0] : [0, 100]);
      expect(s.sprites.filter((sp) => sp.glow).map((sp) => sp.characterId)).toEqual(['windows', 'lamps']);
    }
  });

  it('keeping the light on her gets her across; the night lasts until the clock runs out', () => {
    const { engine, lines, elapsed } = play(zh, 2, true);
    const s = engine.getState();
    expect([s.ended, s.variables.saved, s.variables.hit]).toEqual([true, true, false]);
    expect(lines).toContain('刚出笼的包子，趁热吃。');
    expect(s.variables.clock).toBe(0);
    expect(elapsed >= 22 && elapsed < 24).toBe(true);
  });

  it('losing her in the dark ends the night early, and the morning is different', () => {
    const { engine, lines } = play(zh, 1, false);
    const s = engine.getState();
    expect([s.ended, s.variables.saved, s.variables.hit]).toEqual([true, false, true]);
    expect(lines).toContain('司机说，他根本没看见路上有人。');
  });

  it('the English version is the same night, command for command', () => {
    const shape = (p: Project) =>
      JSON.stringify(
        p.scenes.map((s) => s.commands),
        (k, v: unknown) => (k === 'text' || k === 'prompt' || k === 'expression' ? undefined : v),
      );
    expect(shape(en)).toEqual(shape(zh));
    const run = play(en, 2, true);
    expect(run.engine.getState().variables.saved).toBe(true);
    expect(run.lines).toContain("Steamed buns, fresh out of the basket. Eat them while they're hot.");
  });
});
