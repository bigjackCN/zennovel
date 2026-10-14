import type { Locale } from '@zennovel/core';
import type { EngineError } from './engine';

/** Text the player itself shows (not story text). */
export interface PlayerStrings {
  theEnd: string;
  playAgain: string;
  error: (e: EngineError) => string;

  // Title screen and in-game menu (exported games).
  start: string;
  continue: string;
  load: string;
  save: string;
  history: string;
  backToTitle: string;
  resume: string;
  close: string;
  menu: string;
  by: (author: string) => string;
  slot: (n: string) => string;
  autosave: string;
  emptySlot: string;
  noHistory: string;
  narrator: string;
  saved: string;
  saveFailed: string;
  noStorage: string;
  confirmTitle: string;
  settings: string;
  musicVolume: string;
  soundVolume: string;
  fullscreen: string;
  quit: string;
  achievement: (name: string) => string;
  savePicture: string;
  pictureSaved: string;
  pictureFailed: string;
}

export const playerStrings: Record<Locale, PlayerStrings> = {
  en: {
    theEnd: '— The End —',
    playAgain: 'Play again',
    error: (e) =>
      e.code === 'sceneNotFound'
        ? `Scene not found: ${e.sceneId}`
        : 'The story seems stuck in a loop (jumps with no lines in between)',

    start: 'Start',
    continue: 'Continue',
    load: 'Load',
    save: 'Save',
    history: 'History',
    backToTitle: 'Title screen',
    resume: 'Back to the story',
    close: 'Close',
    menu: 'Menu',
    by: (author) => `by ${author}`,
    slot: (n) => `Slot ${n}`,
    autosave: 'Autosave',
    emptySlot: 'Empty',
    noHistory: 'Nothing has been said yet.',
    narrator: 'Narrator',
    saved: 'Saved.',
    saveFailed: 'Could not save: this browser is not allowing storage.',
    noStorage: 'Saving is not available in this browser (private mode?).',
    confirmTitle: 'Return to the title screen? Progress since your last save will be lost.',
    settings: 'Settings',
    musicVolume: 'Music',
    soundVolume: 'Sound effects',
    fullscreen: 'Fullscreen',
    quit: 'Quit',
    achievement: (name) => `🏆 Achievement unlocked: ${name}`,
    savePicture: 'Save picture',
    pictureSaved: 'Picture saved.',
    pictureFailed: 'Could not save the picture.',
  },
  zh: {
    theEnd: '— 完 —',
    playAgain: '重新开始',
    error: (e) =>
      e.code === 'sceneNotFound' ? `找不到场景：${e.sceneId}` : '故事好像陷入了死循环（跳转之间没有任何台词）',

    start: '开始游戏',
    continue: '继续游戏',
    load: '读取存档',
    save: '保存',
    history: '对话记录',
    backToTitle: '回到标题',
    resume: '返回故事',
    close: '关闭',
    menu: '菜单',
    by: (author) => `作者：${author}`,
    slot: (n) => `存档 ${n}`,
    autosave: '自动存档',
    emptySlot: '空',
    noHistory: '还没有任何对话。',
    narrator: '旁白',
    saved: '已保存。',
    saveFailed: '保存失败：浏览器不允许写入存储。',
    noStorage: '这个浏览器无法存档（可能是无痕模式）。',
    confirmTitle: '回到标题画面？上次存档之后的进度会丢失。',
    settings: '设置',
    musicVolume: '音乐音量',
    soundVolume: '音效音量',
    fullscreen: '全屏',
    quit: '退出游戏',
    achievement: (name) => `🏆 解锁成就：${name}`,
    savePicture: '保存画面',
    pictureSaved: '画面已保存。',
    pictureFailed: '无法保存画面。',
  },
};
