/**
 * Undo / redo over immutable snapshots. Edits already produce a new project
 * object each time (see projectActions), so a snapshot is just a reference
 * and unchanged parts are shared between snapshots.
 */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Coalescing key and time of the last recorded edit. */
  lastKey: string | null;
  lastAt: number;
}

export const MAX_UNDO = 200;

/** Edits with the same key closer together than this become one undo step (e.g. typing a sentence). */
export const COALESCE_MS = 1000;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/**
 * Record a new present. Pass a `key` for continuous edits (typing into one
 * field) so they undo together; edits without a key are always separate steps.
 */
export function record<T>(h: History<T>, next: T, opts: { key?: string; now: number }): History<T> {
  if (next === h.present) return h;
  const { key, now } = opts;
  if (key && key === h.lastKey && now - h.lastAt < COALESCE_MS) {
    return { ...h, present: next, future: [], lastAt: now };
  }
  const past = [...h.past, h.present];
  if (past.length > MAX_UNDO) past.shift();
  return { past, present: next, future: [], lastKey: key ?? null, lastAt: now };
}

/** Replace the present without creating an undo step (e.g. reloading from storage). */
export function reset<T>(present: T): History<T> {
  return createHistory(present);
}

export function undo<T>(h: History<T>): History<T> {
  const previous = h.past[h.past.length - 1];
  if (previous === undefined) return h;
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1), lastKey: null, lastAt: 0 };
}

export const canUndo = (h: History<unknown>) => h.past.length > 0;
export const canRedo = (h: History<unknown>) => h.future.length > 0;
