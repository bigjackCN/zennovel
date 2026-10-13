import { describe, expect, it } from 'vitest';
import { checkProject, normalizeProject, type Project } from '@zennovel/core';
import { Engine } from './engine';
import dalieJson from '../../editor/public/templates/dalie/project.zh.json';

const project = dalieJson as Project;

/**
 * Plays until the end, picking each choice by the start of its text.
 * Returns every line shown, so tests can look for an ending.
 */
function play(picks: string[]): { lines: string[]; engine: Engine } {
  const engine = new Engine(project);
  engine.start();
  const lines: string[] = [];
  const queue = [...picks];
  for (let i = 0; i < 5000; i++) {
    const s = engine.getState();
    if (s.ended || s.error) break;
    if (s.choices) {
      const want = queue.shift();
      if (want === undefined) throw new Error(`no pick left for: ${s.choices.map((c) => c.text).join(' / ')}`);
      const option = s.choices.find((c) => c.text.startsWith(want));
      if (!option) throw new Error(`"${want}" is not one of: ${s.choices.map((c) => c.text).join(' / ')}`);
      engine.choose(option.id);
      continue;
    }
    if (s.dialogue) lines.push(s.dialogue.text);
    engine.advance();
  }
  expect(queue).toEqual([]);
  return { lines, engine };
}

describe('大裂 sample', () => {
  it('loads cleanly and the story checker finds nothing', () => {
    const result = normalizeProject(dalieJson);
    expect(result.ok).toBe(true);
    expect(checkProject(project)).toEqual([]);
  });

  it('points every audio asset at a file shipped in assets/', () => {
    const shipped = ['cave', 'glass', 'leaving', 'night', 'riot', 'wasteland'].map((n) => `assets/${n}.mp3`);
    expect(project.assets.map((a) => a.kind)).toEqual(project.assets.map(() => 'audio'));
    expect(project.assets.map((a) => a.src).sort()).toEqual(shipped);
  });

  it('opens on a silent title card, then the night theme', () => {
    const engine = new Engine(project);
    engine.start();
    expect(engine.getState().dialogue?.text).toBe('— 一 · 第七夜 —');
    expect(engine.getState().music).toBeNull();
    engine.advance();
    expect(engine.getState().music?.assetId).toBe('bgm_night');
  });

  it('leaving the stone unturned ends early', () => {
    const { lines, engine } = play(['搬椅子', '冲上去', '接过来', '照实说', '认真读完', '拉着大家走', '算了']);
    expect(lines.at(-1)).toBe('【结局：最后的百分之五】');
    expect(engine.getState().ended).toBe(true);
  });

  it('the route closest to the novel reaches “我偷了你的洋镐”, with its callbacks', () => {
    const { lines, engine } = play([
      '搬椅子',
      '别过脸去',
      '接过来',
      '不说话',
      '跟大家一样',
      '拉着大家走',
      '跟赵乃夫一起把它掀开',
      '告诉宿舍里的人',
      '“不是。”',
      '“去了也没用。”',
      '“……不知道。”',
      '“我留下来挖。”',
      '什么也不说，继续挖',
      '吸一口',
      '默默帮他拎包',
      '“你要不要来挖黄金？”',
      '等着找钥匙',
      '拉住郭仲翰',
      '追上去',
      '去北边的村子',
    ]);
    expect(lines.at(-1)).toBe('【结局：我偷了你的洋镐】');
    // Lying about the cart is remembered in town; turning away on the first night, in the riot.
    expect(lines).toContain('那辆手推车，是那家的吧。……我早就知道。你连这个都要骗我。');
    expect(lines).toContain('那眼神和第七夜一模一样。那天晚上，我也只是站在门口看着。');
    expect(engine.getState().music?.assetId).toBe('bgm_leaving');
  });
});
