import { describe, expect, it } from 'vitest';
import { COALESCE_MS, MAX_UNDO, canRedo, canUndo, createHistory, record, redo, undo } from './history';

describe('history', () => {
  it('undoes and redoes', () => {
    let h = createHistory('a');
    h = record(h, 'b', { now: 0 });
    h = record(h, 'c', { now: 10_000 });
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe('b');
    expect(canRedo(h)).toBe(true);
  });

  it('groups typing in one field into one step', () => {
    let h = createHistory('');
    h = record(h, 'H', { key: 'line1', now: 0 });
    h = record(h, 'Hi', { key: 'line1', now: 200 });
    h = record(h, 'Hi!', { key: 'line1', now: 400 });
    expect(undo(h).present).toBe('');
  });

  it('starts a new step after a pause, a different field, or an unkeyed edit', () => {
    let h = createHistory('');
    h = record(h, 'a', { key: 'x', now: 0 });
    h = record(h, 'ab', { key: 'x', now: COALESCE_MS + 1 });
    expect(undo(h).present).toBe('a');
    h = record(h, 'abc', { key: 'y', now: COALESCE_MS + 2 });
    expect(undo(h).present).toBe('ab');
    h = record(h, 'abcd', { now: COALESCE_MS + 3 });
    h = record(h, 'abcde', { now: COALESCE_MS + 4 });
    expect(undo(h).present).toBe('abcd');
  });

  it('a new edit clears redo; recording the same value is a no-op', () => {
    let h = record(createHistory(1), 2, { now: 0 });
    h = undo(h);
    h = record(h, 3, { now: 5000 });
    expect(canRedo(h)).toBe(false);
    expect(record(h, 3, { now: 6000 })).toBe(h);
  });

  it('keeps at most MAX_UNDO steps', () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_UNDO + 50; i++) h = record(h, i, { now: i * 10_000 });
    expect(h.past).toHaveLength(MAX_UNDO);
  });
});
