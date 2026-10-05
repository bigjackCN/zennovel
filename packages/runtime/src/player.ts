import type { Background, Project, Theme } from '@zennovel/core';
import { Engine, type EngineState } from './engine';
import { PLAYER_CSS } from './styles';

export interface PlayerOptions {
  /** Base URL for relative asset paths. Defaults to document.baseURI. */
  assetBase?: string;
  /** Scene to start from (editor preview). Defaults to the project's start scene. */
  startSceneId?: string;
  /** Called whenever engine state changes. */
  onStateChange?: (state: Readonly<EngineState>) => void;
}

const STYLE_ID = 'zennovel-player-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PLAYER_CSS;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement) {
  const node = document.createElement(tag);
  node.className = className;
  parent?.appendChild(node);
  return node;
}

/**
 * Renders an Engine into a DOM container. Used both by the editor's live
 * preview and by exported games, so what writers see is what players get.
 */
export class Player {
  readonly engine: Engine;
  private project: Project;
  private options: PlayerOptions;
  private root: HTMLElement;
  private stage: HTMLElement;
  private bgLayer: HTMLElement;
  private spriteLayer: HTMLElement;
  private dialogueBox: HTMLElement;
  private nameplate: HTMLElement;
  private textEl: HTMLElement;
  private choiceLayer: HTMLElement;
  private overlay: HTMLElement;
  private resizeObserver: ResizeObserver;
  private unsubscribe: () => void;
  private typing: { timer: number; full: string } | null = null;
  private lastDialogue: EngineState['dialogue'] = null;
  private lastBgKey = '';

  constructor(container: HTMLElement, project: Project, options: PlayerOptions = {}) {
    ensureStyles();
    this.project = project;
    this.options = options;
    this.engine = new Engine(project);

    this.root = el('div', 'zn-root', container);
    this.root.tabIndex = 0;
    this.stage = el('div', 'zn-stage', this.root);
    this.bgLayer = el('div', 'zn-bg', this.stage);
    this.spriteLayer = el('div', 'zn-sprites', this.stage);
    this.dialogueBox = el('div', 'zn-dialogue', this.stage);
    this.nameplate = el('div', 'zn-nameplate', this.dialogueBox);
    this.textEl = el('div', 'zn-text', this.dialogueBox);
    this.choiceLayer = el('div', 'zn-choices', this.stage);
    this.overlay = el('div', 'zn-overlay', this.stage);

    this.applyTheme(project.theme);
    this.stage.addEventListener('click', this.onClick);
    this.root.addEventListener('keydown', this.onKey);
    this.root.addEventListener('wheel', this.onWheel, { passive: true });

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.root);

    this.unsubscribe = this.engine.subscribe((s) => {
      this.render(s);
      this.options.onStateChange?.(s);
    });
    this.engine.start(options.startSceneId);
    this.fit();
  }

  /** Replace the project (e.g. after an edit) and restart. */
  setProject(project: Project, startSceneId?: string): void {
    this.project = project;
    this.engine.setProject(project);
    this.applyTheme(project.theme);
    this.restart(startSceneId ?? this.options.startSceneId);
  }

  restart(sceneId?: string): void {
    this.lastBgKey = '';
    this.lastDialogue = null;
    this.engine.start(sceneId);
  }

  focus(): void {
    this.root.focus();
  }

  destroy(): void {
    this.stopTyping();
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.root.remove();
  }

  // -------------------------------------------------------------------------
  // Input

  private onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.zn-choice, .zn-overlay button')) return;
    this.next();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.next();
    } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
      this.engine.rollback();
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (e.deltaY < 0) this.engine.rollback();
  };

  private next() {
    if (this.typing) {
      this.finishTyping();
      return;
    }
    this.engine.advance();
  }

  // -------------------------------------------------------------------------
  // Rendering

  private fit() {
    const { width, height } = this.project.meta.resolution;
    const box = this.root.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const scale = Math.min(box.width / width, box.height / height);
    this.stage.style.width = `${width}px`;
    this.stage.style.height = `${height}px`;
    this.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  private applyTheme(theme: Theme) {
    const v = (name: string, value: string | number) => this.stage.style.setProperty(name, String(value));
    const d = theme.dialogue;
    v('--zn-font', theme.fontFamily);
    v('--zn-dlg-bg', d.background);
    v('--zn-dlg-color', d.textColor);
    v('--zn-dlg-size', `${d.fontSize}px`);
    v('--zn-dlg-radius', `${d.borderRadius}px`);
    v('--zn-dlg-padding', `${d.padding}px`);
    v('--zn-dlg-height', `${d.height * 100}%`);
    v('--zn-dlg-margin', `${d.margin}px`);
    v('--zn-name-bg', theme.nameplate.background);
    v('--zn-name-color', theme.nameplate.textColor);
    v('--zn-name-size', `${theme.nameplate.fontSize}px`);
    v('--zn-choice-bg', theme.choice.background);
    v('--zn-choice-hover', theme.choice.hoverBackground);
    v('--zn-choice-color', theme.choice.textColor);
    v('--zn-choice-radius', `${theme.choice.borderRadius}px`);

    if (d.frame) {
      const src = this.assetUrl(d.frame.assetId);
      this.dialogueBox.style.borderImage = src ? `url("${src}") ${d.frame.slice} fill / ${d.frame.slice}px stretch` : '';
      this.dialogueBox.style.borderStyle = src ? 'solid' : '';
    } else {
      this.dialogueBox.style.borderImage = '';
      this.dialogueBox.style.borderStyle = '';
    }
  }

  private assetUrl(assetId: string): string | null {
    const asset = this.project.assets.find((a) => a.id === assetId);
    if (!asset) return null;
    try {
      return new URL(asset.src, this.options.assetBase ?? document.baseURI).href;
    } catch {
      return asset.src;
    }
  }

  private backgroundCss(bg: Background | null): string {
    if (!bg) return '#000';
    if (bg.kind === 'color') return bg.value;
    const url = this.assetUrl(bg.assetId);
    return url ? `center / cover no-repeat url("${url}")` : '#000';
  }

  private render(s: Readonly<EngineState>) {
    // Background (cross-fade by stacking a new layer on top).
    const bgKey = JSON.stringify(s.background);
    if (bgKey !== this.lastBgKey) {
      this.lastBgKey = bgKey;
      const layer = el('div', 'zn-bg-layer', this.bgLayer);
      layer.style.background = this.backgroundCss(s.background);
      if (s.backgroundTransition === 'fade') layer.classList.add('zn-fade-in');
      const old = Array.from(this.bgLayer.children).slice(0, -1);
      window.setTimeout(() => old.forEach((n) => n.remove()), s.backgroundTransition === 'fade' ? 600 : 0);
    }

    // Sprites
    this.spriteLayer.replaceChildren();
    for (const sprite of s.sprites) {
      const character = this.project.characters.find((c) => c.id === sprite.characterId);
      const wrap = el('div', `zn-sprite zn-pos-${sprite.position}`, this.spriteLayer);
      const assetId = character?.sprites[sprite.expression];
      const url = assetId ? this.assetUrl(assetId) : null;
      if (url) {
        const img = el('img', '', wrap);
        img.src = url;
        img.alt = character?.name ?? '';
        img.draggable = false;
      } else {
        const ph = el('div', 'zn-sprite-placeholder', wrap);
        ph.textContent = character?.name ?? '?';
        if (character) ph.style.borderColor = character.color;
      }
    }

    // Dialogue
    if (s.dialogue !== this.lastDialogue) {
      this.lastDialogue = s.dialogue;
      if (s.dialogue) {
        const character = s.dialogue.characterId
          ? this.project.characters.find((c) => c.id === s.dialogue!.characterId)
          : undefined;
        this.nameplate.textContent = character?.name ?? '';
        this.nameplate.style.display = character ? '' : 'none';
        if (character) this.nameplate.style.background = character.color || '';
        this.dialogueBox.style.display = '';
        this.typeText(s.dialogue.text);
      } else {
        this.stopTyping();
        this.dialogueBox.style.display = 'none';
      }
    }

    // Choices
    this.choiceLayer.replaceChildren();
    for (const choice of s.choices ?? []) {
      const btn = el('button', 'zn-choice', this.choiceLayer);
      btn.type = 'button';
      btn.textContent = choice.text;
      btn.addEventListener('click', () => this.engine.choose(choice.id));
    }

    // End / error overlay
    this.overlay.replaceChildren();
    this.overlay.style.display = s.ended || s.error ? '' : 'none';
    if (s.ended || s.error) {
      const msg = el('div', s.error ? 'zn-overlay-error' : 'zn-overlay-title', this.overlay);
      msg.textContent = s.error ?? '— The End —';
      const again = el('button', '', this.overlay);
      again.type = 'button';
      again.textContent = 'Play again';
      again.addEventListener('click', () => this.restart());
    }
  }

  private typeText(full: string) {
    this.stopTyping();
    const speed = this.project.theme.textSpeed;
    if (!speed || speed <= 0) {
      this.textEl.textContent = full;
      return;
    }
    const chars = Array.from(full);
    let shown = 0;
    this.textEl.textContent = '';
    const timer = window.setInterval(() => {
      shown++;
      this.textEl.textContent = chars.slice(0, shown).join('');
      if (shown >= chars.length) this.stopTyping();
    }, 1000 / speed);
    this.typing = { timer, full };
  }

  private finishTyping() {
    if (!this.typing) return;
    this.textEl.textContent = this.typing.full;
    this.stopTyping();
  }

  private stopTyping() {
    if (this.typing) window.clearInterval(this.typing.timer);
    this.typing = null;
  }
}

export function mountPlayer(container: HTMLElement, project: Project, options?: PlayerOptions): Player {
  return new Player(container, project, options);
}
