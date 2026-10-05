import type { Locale } from '@zennovel/core';
import type { EngineError } from './engine';

/** Text the player itself shows (not story text). */
export interface PlayerStrings {
  theEnd: string;
  playAgain: string;
  error: (e: EngineError) => string;
}

export const playerStrings: Record<Locale, PlayerStrings> = {
  en: {
    theEnd: '— The End —',
    playAgain: 'Play again',
    error: (e) =>
      e.code === 'sceneNotFound'
        ? `Scene not found: ${e.sceneId}`
        : 'The story seems stuck in a loop (jumps with no lines in between)',
  },
  zh: {
    theEnd: '— 完 —',
    playAgain: '重新开始',
    error: (e) =>
      e.code === 'sceneNotFound' ? `找不到场景：${e.sceneId}` : '故事好像陷入了死循环（跳转之间没有任何台词）',
  },
};
