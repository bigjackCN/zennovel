import { describe, expect, it } from 'vitest';
import { checkProject, normalizeProject, type Project } from '@zennovel/core';
import { Engine } from './engine';
import dalieJson from '../../editor/public/templates/dalie/project.zh.json';

const project = dalieJson as Project;

/**
 * Plays until the end, picking each choice by the start of its text.
 * Returns every line shown, so tests can look for an ending.
 */
interface Seen {
  text: string;
  background: string | null;
  sprites: string[];
}

function play(picks: string[]): { lines: string[]; seen: Seen[]; engine: Engine } {
  const engine = new Engine(project);
  engine.start();
  const lines: string[] = [];
  const seen: Seen[] = [];
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
    if (s.dialogue) {
      lines.push(s.dialogue.text);
      seen.push({
        text: s.dialogue.text,
        background: s.background?.kind === 'image' ? s.background.assetId : null,
        sprites: s.sprites.map((sp) => `${sp.characterId}:${sp.expression}@${sp.position}`),
      });
      // Never two people in the same spot.
      const spots = s.sprites.map((sp) => sp.position);
      if (new Set(spots).size !== spots.length) throw new Error(`two sprites share a spot at "${s.dialogue.text}"`);
    }
    engine.advance();
  }
  expect(queue).toEqual([]);
  return { lines, seen, engine };
}

describe('大裂 sample', () => {
  it('loads cleanly and the story checker finds nothing', () => {
    const result = normalizeProject(dalieJson);
    expect(result.ok).toBe(true);
    expect(checkProject(project)).toEqual([]);
  });

  it('ships its pictures and music as files next to the story', () => {
    for (const asset of project.assets) {
      const ext = /^assets\/[\w-]+\.(webp|svg|mp3)$/.exec(asset.src)?.[1] ?? asset.src;
      expect(['webp', 'svg', 'mp3']).toContain(ext);
      expect(asset.kind).toBe(ext === 'mp3' ? 'audio' : 'image');
    }
    expect(project.assets.filter((a) => a.kind === 'audio')).toHaveLength(6);
  });

  it('gives everyone who appears on stage a sprite', () => {
    const withSprites = project.characters.filter((c) => Object.keys(c.sprites).length > 0).map((c) => c.id);
    expect(withSprites).toHaveLength(14);
    for (const c of project.characters) {
      for (const assetId of Object.values(c.sprites)) {
        expect(project.assets.find((a) => a.id === assetId)?.kind).toBe('image');
      }
    }
  });

  it('opens on a silent title card, then the night theme', () => {
    const engine = new Engine(project);
    engine.start();
    expect(engine.getState().dialogue?.text).toBe('— 一 · 第七夜 —');
    expect(engine.getState().music).toBeNull();
    engine.advance();
    expect(engine.getState().music?.assetId).toBe('bgm_night');
    expect(engine.getState().background).toEqual({ kind: 'image', assetId: 'bg_dorm_night' });
  });

  it('leaving the stone unturned ends early', () => {
    const { lines, engine } = play(['搬椅子', '冲上去', '接过来', '照实说', '认真读完', '拉着大家走', '算了']);
    expect(lines.at(-1)).toBe('【结局：最后的百分之五】');
    expect(engine.getState().ended).toBe(true);
  });

  it('the route closest to the novel reaches “我偷了你的洋镐”, with its callbacks', () => {
    const { lines, seen, engine } = play([
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
    // Ding Weiyang walks out of the cave in the armour; nobody from the dorm is left standing in the yard.
    const armour = seen.find((s) => s.text.startsWith('根本没有黄金'));
    expect(armour?.background).toBe('bg_riot');
    expect(armour?.sprites).toEqual(['ding:盔甲@center']);
    const yard = seen.find((s) => s.text === '我偷了你的洋镐。');
    expect(yard?.background).toBe('bg_yard');
    expect(yard?.sprites).toEqual(['pick:平常@center']);
  });
});
