import { describe, expect, it } from 'vitest';
import type { Project } from '@zennovel/core';
import { Engine } from './engine';
import { AUTO_SLOT, SaveStore, makeSave, type SaveBackend } from './saves';
import demo from '../../editor/public/templates/demo/project.en.json';

const project = demo as Project;

function memory(): SaveBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('saves', () => {
  it('round-trips a game through a slot and resumes at the same line', () => {
    const engine = new Engine(project);
    engine.start();
    engine.advance();
    const store = new SaveStore(project.meta.id, memory());
    expect(store.write('1', makeSave(project, engine.save()))).toBe(true);

    const record = store.read('1')!;
    expect(record.sceneName).toBe('The hill after school');
    expect(record.text).toBe('Walking home alone again today?');
    const other = new Engine(project);
    other.load(record.state);
    expect(other.getState().dialogue?.text).toBe('Walking home alone again today?');
  });

  it('labels a save made at a choice with the options', () => {
    const engine = new Engine(project);
    engine.start();
    for (let i = 0; i < 5 && !engine.getState().choices; i++) engine.advance();
    expect(makeSave(project, engine.save()).text).toBe('Where should we go?');
  });

  it('keeps games apart by project id', () => {
    const backend = memory();
    new SaveStore('a', backend).write(AUTO_SLOT, makeSave(project, new Engine(project).save()));
    expect(new SaveStore('b', backend).read(AUTO_SLOT)).toBeNull();
    expect([...backend.data.keys()]).toEqual(['zennovel:a:save:auto']);
  });

  it('survives broken data and missing or failing storage', () => {
    const backend = memory();
    backend.data.set('zennovel:p:save:1', '{not json');
    const store = new SaveStore('p', backend);
    expect(store.read('1')).toBeNull();
    expect(store.hasManualSaves()).toBe(false);

    const none = new SaveStore('p', null);
    expect(none.available).toBe(false);
    expect(none.write('1', makeSave(project, new Engine(project).save()))).toBe(false);

    const full: SaveBackend = {
      ...memory(),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(new SaveStore('p', full).write('1', makeSave(project, new Engine(project).save()))).toBe(false);
  });
});
