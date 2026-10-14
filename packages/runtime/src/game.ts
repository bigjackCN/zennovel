import type { Background, Locale, Project } from '@zennovel/core';
import type { EngineState } from './engine';
import { Player } from './player';
import {
  AUTO_SLOT,
  MANUAL_SLOTS,
  SaveStore,
  browserSaveBackend,
  makeSave,
  type SaveBackend,
  type SaveRecord,
} from './saves';
import { playerStrings, type PlayerStrings } from './strings';

/**
 * What the program around the game offers beyond a web page: the desktop
 * builds (Electron, Tauri) provide one as `window.zennovelHost`; on the web
 * standalone.ts builds one from the Fullscreen API.
 */
export interface GameHost {
  /** "electron", "tauri" or "web". */
  kind?: string;
  /** Saves as files instead of localStorage. */
  saveBackend?: SaveBackend;
  /** Shown as "Quit" on the title screen when present. */
  quit?(): unknown;
  /** What the quit button says instead of "Quit" (a web page might go back to its site). */
  quitLabel?: string;
  /** Toggle (no argument) or set fullscreen; resolves to the new state. */
  setFullscreen?(on?: boolean): Promise<boolean> | boolean;
  isFullscreen?(): boolean;
  /** Unlock a platform achievement (Steam). Resolves to false when it couldn't. */
  unlockAchievement?(achievementId: string): Promise<boolean> | boolean;
}

export interface GameOptions {
  /** Base URL for relative asset paths. Defaults to document.baseURI. */
  assetBase?: string;
  /** UI language. Defaults to the project's meta.locale, then English. */
  locale?: Locale;
  /** Where saves go. Defaults to the host's, then localStorage; null disables saving. */
  saveBackend?: SaveBackend | null;
  host?: GameHost | null;
}

type Screen = 'title' | 'playing' | 'menu' | 'save' | 'load' | 'history' | 'settings' | 'confirm';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function button(parent: HTMLElement, label: string, onClick: () => void, className = 'zn-btn') {
  const b = el('button', className, parent, label);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** First background the story shows: used behind the title screen. */
function openingBackground(project: Project): Background | null {
  const start = project.scenes.find((s) => s.id === project.startSceneId);
  const bg = start?.commands.find((c) => c.type === 'bg');
  return bg?.type === 'bg' ? bg.background : null;
}

/**
 * A complete game around the Player: title screen, in-game menu (Esc,
 * right-click or ☰), save / load slots, autosave and a history of past
 * lines. This is what exported games run; the editor preview uses the bare
 * Player.
 */
export class Game {
  readonly player: Player;
  private project: Project;
  private strings: PlayerStrings;
  private saves: SaveStore;
  private locale: Locale;
  private screen: Screen = 'title';
  /** Where "Close" on the load screen goes back to. */
  private loadReturn: 'title' | 'menu' = 'title';
  /** Where "Close" on the settings screen goes back to. */
  private settingsReturn: 'title' | 'menu' = 'title';
  private ui: HTMLElement;
  private hud: HTMLElement;
  private toastTimer = 0;
  private host: GameHost | null;
  /** Id of the last achievement reported (see EngineState.achievement). */
  private lastAchievementId = 0;

  constructor(container: HTMLElement, project: Project, options: GameOptions = {}) {
    this.project = project;
    this.host = options.host ?? null;
    this.locale = options.locale ?? project.meta.locale ?? 'en';
    this.strings = playerStrings[this.locale] ?? playerStrings.en;
    this.saves = new SaveStore(
      project.meta.id,
      options.saveBackend !== undefined ? options.saveBackend : (this.host?.saveBackend ?? browserSaveBackend()),
    );
    this.player = new Player(container, project, {
      assetBase: options.assetBase,
      locale: this.locale,
      endActions: [
        { label: this.strings.backToTitle, onClick: () => this.showTitle() },
        { label: this.strings.playAgain, onClick: () => this.startNew() },
      ],
      onStateChange: (state) => {
        this.reportAchievement(state);
        this.autosave(state);
      },
      // The story (and its music) starts from the title screen.
      autoStart: false,
    });
    const volumes = this.saves.readVolumes();
    if (volumes) this.player.setVolumes(volumes);

    this.hud = this.player.addLayer('zn-hud');
    button(this.hud, '☰', () => this.openMenu(), 'zn-menu-button').setAttribute('aria-label', this.strings.menu);
    this.ui = this.player.addLayer('zn-ui');

    this.player.element.addEventListener('keydown', this.onKey);
    // When a panel closes, its focused button disappears and focus falls back
    // to <body> for a moment: keys pressed then should still reach the game.
    document.addEventListener('keydown', (e) => {
      if (e.target === document.body) this.onKey(e);
    });
    this.player.element.addEventListener('contextmenu', (e) => {
      if (this.screen !== 'playing') return;
      e.preventDefault();
      this.openMenu();
    });
    this.showTitle();
  }

  /** The screen currently shown (for tests and embedding pages). */
  get currentScreen(): Screen {
    return this.screen;
  }

  // ---------------------------------------------------------------- flow

  showTitle(): void {
    this.setScreen('title');
    const title = el('div', 'zn-title', this.ui);
    title.style.background = this.player.backgroundCss(openingBackground(this.project));
    const inner = el('div', 'zn-title-inner', title);
    el('h1', 'zn-title-name', inner, this.project.meta.name);
    if (this.project.meta.author) el('p', 'zn-title-author', inner, this.strings.by(this.project.meta.author));
    const buttons = el('div', 'zn-title-buttons', inner);
    if (this.saves.read(AUTO_SLOT)) button(buttons, this.strings.continue, () => this.load(AUTO_SLOT));
    button(buttons, this.strings.start, () => this.startNew());
    if (this.saves.hasManualSaves()) button(buttons, this.strings.load, () => this.showSlots('load', 'title'));
    button(buttons, this.strings.settings, () => this.showSettings('title'));
    const host = this.host;
    if (host?.quit) button(buttons, host.quitLabel ?? this.strings.quit, () => void host.quit!());
    this.focusFirst();
  }

  startNew(): void {
    this.setScreen('playing');
    this.player.restart(this.project.startSceneId);
  }

  openMenu(): void {
    this.setScreen('menu');
    const panel = this.panel(this.strings.menu);
    const list = el('div', 'zn-menu-list', panel);
    button(list, this.strings.resume, () => this.resume());
    button(list, this.strings.save, () => this.showSlots('save'));
    button(list, this.strings.load, () => this.showSlots('load', 'menu'));
    button(list, this.strings.history, () => this.showHistory());
    button(list, this.strings.savePicture, () => void this.savePicture());
    button(list, this.strings.settings, () => this.showSettings('menu'));
    button(list, this.strings.backToTitle, () => this.confirmTitle());
    this.focusFirst();
  }

  resume(): void {
    this.setScreen('playing');
  }

  /** Download the picture on stage (without the text box) as a PNG. */
  async savePicture(): Promise<void> {
    const blob = await this.player.capturePicture();
    if (!blob) {
      this.toast(this.strings.pictureFailed);
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.project.meta.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'picture'}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    this.toast(this.strings.pictureSaved);
  }

  // ---------------------------------------------------------------- saves

  private reportAchievement(state: Readonly<EngineState>) {
    const cue = state.achievement;
    if (!cue || cue.id <= this.lastAchievementId) return;
    this.lastAchievementId = cue.id;
    // Steam shows its own notice; elsewhere (or when Steam isn't there) the game does.
    void Promise.resolve(this.host?.unlockAchievement?.(cue.achievementId) ?? false)
      .catch(() => false)
      .then((shownByPlatform) => {
        if (!shownByPlatform) this.toast(this.strings.achievement(cue.name), 3500, 'zn-toast-top');
      });
  }

  private autosave(state: Readonly<EngineState>) {
    if (this.screen !== 'playing' || state.error) return;
    if (state.ended) {
      // A finished story has nothing to continue.
      this.saves.remove(AUTO_SLOT);
      return;
    }
    this.saves.write(AUTO_SLOT, makeSave(this.project, state as EngineState));
  }

  private load(slot: string) {
    const record = this.saves.read(slot);
    if (!record) return;
    // Achievements already reported when the game was saved aren't announced again.
    this.lastAchievementId = Math.max(this.lastAchievementId, record.state.achievement?.id ?? 0);
    this.setScreen('playing');
    this.player.loadState(record.state);
  }

  private showSlots(mode: 'save' | 'load', returnTo: 'title' | 'menu' = 'menu') {
    if (mode === 'load') this.loadReturn = returnTo;
    this.setScreen(mode);
    const panel = this.panel(mode === 'save' ? this.strings.save : this.strings.load);
    if (!this.saves.available) el('p', 'zn-note', panel, this.strings.noStorage);
    const grid = el('div', 'zn-slots', panel);
    const slots = mode === 'load' ? [AUTO_SLOT, ...MANUAL_SLOTS] : [...MANUAL_SLOTS];
    for (const slot of slots) this.slotButton(grid, slot, mode);
    button(panel, this.strings.close, () => this.back(), 'zn-btn zn-close');
    this.focusFirst();
  }

  private slotButton(grid: HTMLElement, slot: string, mode: 'save' | 'load') {
    const record = this.saves.read(slot);
    const b = button(
      grid,
      '',
      () => {
        if (mode === 'load') return this.load(slot);
        const ok = this.saves.write(slot, makeSave(this.project, this.player.engine.save()));
        this.showSlots('save');
        this.toast(ok ? this.strings.saved : this.strings.saveFailed);
      },
      'zn-slot',
    );
    b.disabled = mode === 'load' && !record;
    el('span', 'zn-slot-name', b, slot === AUTO_SLOT ? this.strings.autosave : this.strings.slot(slot));
    if (!record) {
      el('span', 'zn-slot-empty', b, this.strings.emptySlot);
      return;
    }
    el('span', 'zn-slot-date', b, this.formatDate(record));
    el('span', 'zn-slot-text', b, [record.sceneName, record.text].filter(Boolean).join(' · '));
  }

  private formatDate(record: SaveRecord) {
    try {
      return new Date(record.savedAt).toLocaleString(this.locale === 'zh' ? 'zh-CN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return record.savedAt;
    }
  }

  // ---------------------------------------------------------------- history

  private showHistory() {
    this.setScreen('history');
    const panel = this.panel(this.strings.history);
    const list = el('div', 'zn-history', panel);
    const backlog = this.player.engine.getState().backlog;
    if (backlog.length === 0) el('p', 'zn-note', list, this.strings.noHistory);
    for (const line of backlog) {
      const row = el('div', 'zn-history-line', list);
      const character = this.project.characters.find((c) => c.id === line.characterId);
      const who = el('span', 'zn-history-who', row, character?.name ?? '');
      if (character) who.style.color = character.color;
      el('span', 'zn-history-text', row, line.text);
    }
    button(panel, this.strings.close, () => this.back(), 'zn-btn zn-close');
    requestAnimationFrame(() => (list.scrollTop = list.scrollHeight));
    this.focusFirst('.zn-close');
  }

  private confirmTitle() {
    this.setScreen('confirm');
    const panel = this.panel(this.strings.backToTitle);
    el('p', 'zn-note', panel, this.strings.confirmTitle);
    const row = el('div', 'zn-row', panel);
    button(row, this.strings.backToTitle, () => this.showTitle());
    button(row, this.strings.resume, () => this.resume());
    this.focusFirst();
  }

  // ---------------------------------------------------------------- plumbing

  private showSettings(returnTo: 'title' | 'menu') {
    this.settingsReturn = returnTo;
    this.setScreen('settings');
    const panel = this.panel(this.strings.settings);
    const list = el('div', 'zn-settings', panel);
    const volumes = this.player.audio.getVolumes();
    const slider = (label: string, key: keyof typeof volumes) => {
      const row = el('label', 'zn-setting', list);
      el('span', 'zn-setting-label', row, label);
      const input = el('input', 'zn-range', row);
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '5';
      input.value = String(Math.round(volumes[key] * 100));
      const value = el('span', 'zn-setting-value', row, `${input.value}%`);
      input.addEventListener('input', () => {
        volumes[key] = Number(input.value) / 100;
        value.textContent = `${input.value}%`;
        this.player.setVolumes(volumes);
        this.saves.writeVolumes(volumes);
      });
    };
    slider(this.strings.musicVolume, 'music');
    slider(this.strings.soundVolume, 'sfx');
    const host = this.host;
    if (host?.setFullscreen) {
      const row = el('label', 'zn-setting zn-setting-check', list);
      el('span', 'zn-setting-label', row, this.strings.fullscreen);
      const box = el('input', 'zn-check', row);
      box.type = 'checkbox';
      box.checked = host.isFullscreen?.() ?? false;
      box.addEventListener('change', async () => {
        box.checked = await host.setFullscreen!(box.checked);
      });
    }
    button(panel, this.strings.close, () => this.back(), 'zn-btn zn-close');
    this.focusFirst('input');
  }

  private back() {
    if (this.screen === 'load' && this.loadReturn === 'title') this.showTitle();
    else if (this.screen === 'settings' && this.settingsReturn === 'title') this.showTitle();
    else this.openMenu();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.screen === 'playing') this.openMenu();
      else if (this.screen === 'menu' || this.screen === 'confirm') this.resume();
      else if (this.screen !== 'title') this.back();
      return;
    }
    if (this.screen !== 'playing' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const buttons = Array.from(this.ui.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  };

  /** Clear the UI layer and pause or resume the story to match `screen`. */
  private setScreen(screen: Screen) {
    this.screen = screen;
    this.ui.replaceChildren();
    const playing = screen === 'playing';
    this.ui.style.display = playing ? 'none' : '';
    this.hud.style.display = playing ? '' : 'none';
    this.player.setPaused(!playing);
    // The title screen is silent; menus keep the story's music going.
    this.player.setAudioSuspended(screen === 'title');
    if (playing) this.player.focus();
  }

  private panel(heading: string): HTMLElement {
    const backdrop = el('div', 'zn-backdrop', this.ui);
    const panel = el('div', 'zn-panel', backdrop);
    el('h2', 'zn-panel-title', panel, heading);
    return panel;
  }

  private focusFirst(selector = 'button:not(:disabled)') {
    requestAnimationFrame(() => this.ui.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }));
  }

  private toast(message: string, ms = 1800, className = '') {
    const t = el('div', `zn-toast ${className}`.trim(), this.ui, message);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.remove(), ms);
  }
}

export function mountGame(container: HTMLElement, project: Project, options?: GameOptions): Game {
  return new Game(container, project, options);
}
