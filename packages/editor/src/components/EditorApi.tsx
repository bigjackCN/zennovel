import { createContext, useContext } from 'react';
import type { Project } from '@zennovel/core';

/** Apply a pure edit. Pass `key` for continuous edits (typing) so they undo as one step. */
export type EditFn = (fn: (p: Project) => Project, key?: string) => void;

/** Editor-wide helpers that deep components (cards, selects) need without prop drilling. */
export interface EditorApi {
  /** The open project (the desktop app copies uploads into its folder). */
  projectId: string;
  /** Ask for a name, create a variable, and resolve to its id (null if cancelled). */
  createVariable(): Promise<string | null>;
  /** Ask for a name, create a character, and resolve to its id (null if cancelled). */
  createCharacter(): Promise<string | null>;
  /** Show the "Deleted · Undo" notice after something was removed. */
  notifyDeleted(): void;
}

export const EditorApiContext = createContext<EditorApi | null>(null);

export function useEditorApi(): EditorApi {
  const api = useContext(EditorApiContext);
  if (!api) throw new Error('useEditorApi must be used inside <Editor>');
  return api;
}

/** Name-label colours handed out to new characters in turn. */
export const CHARACTER_COLORS = [
  '#c8553d',
  '#3f6e8c',
  '#5b8c3f',
  '#8c3f7b',
  '#c98a12',
  '#3f8c87',
  '#6b4fb3',
  '#b23a48',
];
