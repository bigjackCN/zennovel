import { describe, expect, it } from 'vitest';
import { checkProject, createEmptyProject, type Command, type Project } from '@zennovel/core';
import { Engine } from './engine';

/** Two scenes: music starts in the first and keeps going into the second, a sound plays between lines. */
function project(): Project {
  const p = createEmptyProject('audio');
  p.assets.push(
    { id: 'theme', kind: 'audio', name: 'Theme', src: 'data:audio/wav;base64,' },
    { id: 'ding', kind: 'audio', name: 'Ding', src: 'data:audio/wav;base64,' },
  );
  const first: Command[] = [
    { id: 'm1', type: 'music', action: 'play', assetId: 'theme', volume: 0.5 },
    { id: 'l1', type: 'say', text: 'one' },
    { id: 's1', type: 'sound', assetId: 'ding' },
    { id: 'l2', type: 'say', text: 'two' },
    { id: 'j', type: 'jump', targetSceneId: 'second' },
  ];
  p.scenes[0]!.commands = first;
  p.scenes.push({
    id: 'second',
    name: 'Second',
    commands: [
      { id: 'l3', type: 'say', text: 'three' },
      { id: 'm2', type: 'music', action: 'stop' },
      { id: 'l4', type: 'say', text: 'four' },
      { id: 'e', type: 'end' },
    ],
  });
  return p;
}

describe('music and sound', () => {
  it('music keeps playing across scenes until stopped', () => {
    const engine = new Engine(project());
    engine.start();
    expect(engine.getState().music).toEqual({ assetId: 'theme', volume: 0.5, loop: true });
    engine.advance(); // two
    engine.advance(); // three (second scene)
    expect(engine.getState().dialogue?.text).toBe('three');
    expect(engine.getState().music?.assetId).toBe('theme');
    engine.advance(); // four
    expect(engine.getState().music).toBeNull();
  });

  it('each sound gets a new id, also when replayed after a rollback', () => {
    const engine = new Engine(project());
    engine.start();
    expect(engine.getState().sfx).toBeNull();
    engine.advance();
    const first = engine.getState().sfx!;
    expect(first.assetId).toBe('ding');
    engine.rollback();
    expect(engine.getState().sfx).toBeNull();
    engine.advance();
    expect(engine.getState().sfx!.id > first.id).toBe(true);
  });

  it('starting from a line sets up the music but does not replay sounds above it', () => {
    const p = project();
    const engine = new Engine(p);
    engine.start(p.startSceneId, 'l2');
    expect(engine.getState().dialogue?.text).toBe('two');
    expect(engine.getState().music?.assetId).toBe('theme');
    expect(engine.getState().sfx).toBeNull();
  });

  it('music is part of a save', () => {
    const p = project();
    const engine = new Engine(p);
    engine.start();
    engine.advance();
    const saved = JSON.parse(JSON.stringify(engine.save()));
    const other = new Engine(p);
    other.load(saved);
    expect(other.getState().music?.assetId).toBe('theme');
    other.advance();
    expect(other.getState().dialogue?.text).toBe('three');
  });

  it('loads saves made before music existed', () => {
    const p = project();
    const engine = new Engine(p);
    engine.start();
    const old = JSON.parse(JSON.stringify(engine.save()));
    delete old.music;
    delete old.sfx;
    const other = new Engine(p);
    other.load(old);
    expect(other.getState().music).toBeNull();
  });

  it('the story check reports missing audio, but not for "stop"', () => {
    const p = project();
    p.assets = p.assets.filter((a) => a.id !== 'ding');
    p.assets.push({ id: 'pic', kind: 'image', name: 'Pic', src: 'x.png' });
    (p.scenes[0]!.commands[0] as { assetId: string }).assetId = 'pic'; // an image is not music
    const flagged = checkProject(p)
      .filter((i) => i.code === 'missingAudio')
      .map((i) => i.commandId);
    expect(flagged).toEqual(['m1', 's1']);
  });
});
