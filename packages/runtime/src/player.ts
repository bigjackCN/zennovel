import type { Background, Locale, Project, Theme } from '@zennovel/core';
import { Engine, type EngineState, type SpriteState } from './engine';
import { AudioController, type AudioVolumes } from './audio';
import { PLAYER_CSS } from './styles';
import { playerStrings } from './strings';

export interface PlayerOptions {
  /** Base URL for relative asset paths. Defaults to document.baseURI. */
  assetBase?: string;
  /** Scene to start from (editor preview). Defaults to the project's start scene. */
  startSceneId?: string;
  /** Command inside startSceneId to start from (editor "play from this line"). */
  startCommandId?: string;
  /** UI language of the player. Defaults to the project's meta.locale, then English. */
  locale?: Locale;
  /** Called whenever engine state changes. */
  onStateChange?: (state: Readonly<EngineState>) => void;
  /**
   * Scrolling up rolls back one line. 'whenFocused' only does so after the
   * player has been clicked or tabbed into, so scrolling a page that merely
   * contains the player (e.g. the editor's side panel) doesn't rewind it.
   * Defaults to 'always'.
   */
  wheelRollback?: 'always' | 'whenFocused' | 'never';
  /** Buttons on the end screen. Defaults to a single "Play again". */
  endActions?: EndAction[];
  /** Start without sound (the editor preview, until the writer turns it on). */
  muted?: boolean;
  /** Start the story right away (default). The game shell starts it from its title screen instead. */
  autoStart?: boolean;
}

export interface EndAction {
  label: string;
  onClick: () => void;
}

/** Horizontal centre of the preset stage positions (matches the CSS). */
const POSITION_X = { left: 0.22, center: 0.5, right: 0.78 } as const;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Wheel events closer together than this belong to one scroll gesture. */
const WHEEL_GESTURE_GAP_MS = 150;

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
  /** Choices picked by clicking part of the picture. */
  private hotspotLayer: HTMLElement;
  /** The question above a picture choice (the dialogue box would cover the picture). */
  private caption: HTMLElement;
  private overlay: HTMLElement;
  /** Sprites on stage by character, kept between renders so they only fade when they change. */
  private spriteEls = new Map<string, { wrap: HTMLElement; url: string | null | undefined }>();
  private resizeObserver: ResizeObserver;
  private unsubscribe: () => void;
  private typing: { timer: number; full: string } | null = null;
  private lastDialogue: EngineState['dialogue'] = null;
  private lastBgKey = '';
  /** Where "Play again" returns to. */
  private startSceneId: string | undefined;
  private startCommandId: string | undefined;
  private lastWheelAt = 0;
  private wheelGestureUsed = false;
  /** While a menu is open on top of the story, the story ignores input. */
  private paused = false;
  /** Background music and sound effects. */
  readonly audio: AudioController;
  /** Id of the last sound effect played (see EngineState.sfx). */
  private lastSfxId = 0;

  constructor(container: HTMLElement, project: Project, options: PlayerOptions = {}) {
    ensureStyles();
    this.project = project;
    this.options = options;
    this.startSceneId = options.startSceneId;
    this.startCommandId = options.startCommandId;
    this.engine = new Engine(project);

    this.root = el('div', 'zn-root', container);
    this.root.tabIndex = 0;
    this.stage = el('div', 'zn-stage', this.root);
    this.bgLayer = el('div', 'zn-bg', this.stage);
    this.spriteLayer = el('div', 'zn-sprites', this.stage);
    this.dialogueBox = el('div', 'zn-dialogue', this.stage);
    this.nameplate = el('div', 'zn-nameplate', this.dialogueBox);
    this.textEl = el('div', 'zn-text', this.dialogueBox);
    this.hotspotLayer = el('div', 'zn-hotspots', this.stage);
    this.caption = el('div', 'zn-caption', this.stage);
    this.choiceLayer = el('div', 'zn-choices', this.stage);
    this.overlay = el('div', 'zn-overlay', this.stage);

    this.applyTheme(project.theme);
    this.stage.addEventListener('click', this.onClick);
    this.root.addEventListener('keydown', this.onKey);
    this.root.addEventListener('wheel', this.onWheel, { passive: true });

    this.audio = new AudioController(this.root);
    this.audio.setMuted(options.muted ?? false);
    // Browsers only allow sound after the user has interacted with the page.
    const unlock = () => this.audio.unlock();
    this.root.addEventListener('pointerdown', unlock, true);
    this.root.addEventListener('keydown', unlock, true);

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.root);

    this.unsubscribe = this.engine.subscribe((s) => {
      this.render(s);
      this.options.onStateChange?.(s);
    });
    if (options.autoStart !== false) this.engine.start(this.startSceneId, this.startCommandId);
    this.fit();
  }

  /** Replace the project (e.g. after an edit) and restart. */
  setProject(project: Project, startSceneId?: string, startCommandId?: string): void {
    this.project = project;
    this.engine.setProject(project);
    this.applyTheme(project.theme);
    this.fit();
    this.restart(startSceneId, startCommandId);
  }

  /**
   * Restart from `sceneId` (optionally from `commandId` inside it). With no
   * arguments, restart from wherever the last (re)start began.
   */
  restart(sceneId?: string, commandId?: string): void {
    if (sceneId) {
      this.startSceneId = sceneId;
      this.startCommandId = commandId;
    }
    this.lastBgKey = '';
    this.lastDialogue = null;
    this.clearSprites();
    this.engine.start(this.startSceneId, this.startCommandId);
  }

  /** Continue from a save made with `engine.save()`. */
  loadState(state: EngineState): void {
    this.lastBgKey = '';
    this.lastDialogue = null;
    // Don't replay the sound effect that was playing when the game was saved.
    this.lastSfxId = Math.max(this.lastSfxId, state.sfx?.id ?? 0);
    this.clearSprites();
    this.engine.load(state);
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  /** Hold the music back (e.g. on the title screen) without forgetting what should play. */
  setAudioSuspended(suspended: boolean): void {
    this.audio.setSuspended(suspended);
  }

  setVolumes(volumes: AudioVolumes): void {
    this.audio.setVolumes(volumes);
  }

  /** Ignore clicks, keys and scrolling (e.g. while a menu is open). */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** The focusable outer element, for adding key handlers (game menus). */
  get element(): HTMLElement {
    return this.root;
  }

  /** Add a full-stage layer above the story (title screen, menus). It scales with the stage. */
  addLayer(className: string): HTMLElement {
    return el('div', className, this.stage);
  }

  /** Resolve an asset id to a URL the browser can load. */
  assetUrl(assetId: string): string | null {
    const asset = this.project.assets.find((a) => a.id === assetId);
    if (!asset) return null;
    try {
      return new URL(asset.src, this.options.assetBase ?? document.baseURI).href;
    } catch {
      return asset.src;
    }
  }

  /** CSS `background` value for a background command. */
  backgroundCss(bg: Background | null): string {
    if (!bg) return '#000';
    if (bg.kind === 'color') return bg.value;
    const url = this.assetUrl(bg.assetId);
    return url ? `center / cover no-repeat url("${url}")` : '#000';
  }

  focus(): void {
    this.root.focus();
  }

  /**
   * The picture on stage — background and characters, without the text box
   * or buttons — as a PNG at the story's resolution. Null when the browser
   * refuses (pictures from another site taint the canvas).
   */
  async capturePicture(): Promise<Blob | null> {
    const { width: W, height: H } = this.project.meta.resolution;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const s = this.engine.getState();
    try {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      if (s.background?.kind === 'color') {
        ctx.fillStyle = s.background.value;
        ctx.fillRect(0, 0, W, H);
      } else if (s.background?.kind === 'image') {
        const url = this.assetUrl(s.background.assetId);
        const img = url ? await loadImage(url) : null;
        if (img) {
          // Same as CSS `cover`, centred.
          const iw = img.naturalWidth || W;
          const ih = img.naturalHeight || H;
          const scale = Math.max(W / iw, H / ih);
          ctx.drawImage(img, (W - iw * scale) / 2, (H - ih * scale) / 2, iw * scale, ih * scale);
        }
      }
      for (const sprite of s.sprites) {
        const character = this.project.characters.find((c) => c.id === sprite.characterId);
        const assetId = character?.sprites[sprite.expression];
        const url = assetId ? this.assetUrl(assetId) : null;
        const img = url ? await loadImage(url) : null;
        if (!img) continue;
        // Pictures without a size of their own (some SVGs) take their shape from the stage.
        const shown = this.spriteEls.get(sprite.characterId)?.wrap.querySelector('img:last-child');
        const box = shown?.getBoundingClientRect();
        const aspect =
          img.naturalWidth && img.naturalHeight
            ? img.naturalWidth / img.naturalHeight
            : box && box.height
              ? box.width / box.height
              : 1;
        const place = sprite.place ?? { x: POSITION_X[sprite.position], y: 1, height: 0.88 };
        const h = place.height * H;
        const w = h * aspect;
        ctx.drawImage(img, place.x * W - w / 2, place.y * H - h, w, h);
      }
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch {
      return null;
    }
  }

  destroy(): void {
    this.stopTyping();
    this.audio.destroy();
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.root.remove();
  }

  // -------------------------------------------------------------------------
  // Input

  private onClick = (e: MouseEvent) => {
    if (this.paused || (e.target as HTMLElement).closest('.zn-choice, .zn-hotspot, .zn-overlay button')) return;
    this.next();
  };

  private onKey = (e: KeyboardEvent) => {
    if (this.paused) return;
    const onButton = (e.target as HTMLElement).closest('button');
    if (e.key === ' ' || e.key === 'Enter') {
      // Let a focused choice / "Play again" button activate itself.
      if (onButton) return;
      e.preventDefault();
      this.next();
    } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
      this.engine.rollback();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && this.engine.getState().choices) {
      e.preventDefault();
      const buttons = Array.from(this.stage.querySelectorAll<HTMLButtonElement>('.zn-hotspot, .zn-choice'));
      const i = onButton ? buttons.indexOf(onButton as HTMLButtonElement) : -1;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = i < 0 ? (step > 0 ? 0 : buttons.length - 1) : (i + step + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    }
  };

  /** One rollback per scroll gesture, so a trackpad flick doesn't rewind ten lines. */
  private onWheel = (e: WheelEvent) => {
    const mode = this.options.wheelRollback ?? 'always';
    if (mode === 'never' || this.paused) return;
    if (mode === 'whenFocused' && !this.root.contains(document.activeElement)) return;
    const now = performance.now();
    if (now - this.lastWheelAt > WHEEL_GESTURE_GAP_MS) this.wheelGestureUsed = false;
    this.lastWheelAt = now;
    if (e.deltaY >= 0 || this.wheelGestureUsed) return;
    this.wheelGestureUsed = true;
    this.engine.rollback();
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
      this.dialogueBox.style.borderImage = src
        ? `url("${src}") ${d.frame.slice} fill / ${d.frame.slice}px stretch`
        : '';
      this.dialogueBox.style.borderStyle = src ? 'solid' : '';
    } else {
      this.dialogueBox.style.borderImage = '';
      this.dialogueBox.style.borderStyle = '';
    }
  }

  private render(s: Readonly<EngineState>) {
    // Rebuilding the choice/overlay buttons below drops keyboard focus if a
    // button had it; remember whether the player had focus to hand it back.
    const hadFocus = this.root.contains(document.activeElement);

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

    this.renderSprites(s.sprites);

    // A choice made on the picture: its question goes above it, not in the dialogue box.
    const onPicture = !!s.choices?.length && s.choices.every((c) => c.area);

    // Dialogue
    if (s.dialogue !== this.lastDialogue) {
      this.lastDialogue = s.dialogue;
      if (s.dialogue && !onPicture) {
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
    const captionText = onPicture ? (s.dialogue?.text ?? '') : '';
    if (this.caption.textContent !== captionText) this.caption.textContent = captionText;
    this.caption.style.display = captionText ? '' : 'none';

    // Choices: buttons in the middle, or parts of the picture to click.
    this.choiceLayer.replaceChildren();
    this.hotspotLayer.replaceChildren();
    for (const choice of s.choices ?? []) {
      if (choice.area) {
        const { x, y, width, height } = choice.area;
        const spot = el('button', 'zn-hotspot', this.hotspotLayer);
        spot.type = 'button';
        spot.setAttribute('aria-label', choice.text);
        spot.style.left = `${x * 100}%`;
        spot.style.top = `${y * 100}%`;
        spot.style.width = `${width * 100}%`;
        spot.style.height = `${height * 100}%`;
        // The label goes under the area, or above it near the bottom of the picture.
        const label = el('span', y + height > 0.82 ? 'zn-hotspot-label zn-above' : 'zn-hotspot-label', spot);
        label.textContent = choice.text;
        spot.addEventListener('click', () => this.engine.choose(choice.id));
      } else {
        const btn = el('button', 'zn-choice', this.choiceLayer);
        btn.type = 'button';
        btn.textContent = choice.text;
        btn.addEventListener('click', () => this.engine.choose(choice.id));
      }
    }

    // Music and sound
    const music = s.music && this.assetUrl(s.music.assetId);
    this.audio.setMusic(music && s.music ? { url: music, volume: s.music.volume, loop: s.music.loop } : null);
    if (s.sfx && s.sfx.id > this.lastSfxId) {
      this.lastSfxId = s.sfx.id;
      const sound = this.assetUrl(s.sfx.assetId);
      if (sound) this.audio.playSound(sound, s.sfx.volume);
    }

    // End / error overlay
    this.overlay.replaceChildren();
    this.overlay.style.display = s.ended || s.error ? '' : 'none';
    if (s.ended || s.error) {
      const strings = playerStrings[this.options.locale ?? this.project.meta.locale ?? 'en'] ?? playerStrings.en;
      const msg = el('div', s.error ? 'zn-overlay-error' : 'zn-overlay-title', this.overlay);
      msg.textContent = s.error ? strings.error(s.error) : strings.theEnd;
      const actions = this.options.endActions ?? [{ label: strings.playAgain, onClick: () => this.restart() }];
      for (const action of actions) {
        const button = el('button', '', this.overlay);
        button.type = 'button';
        button.textContent = action.label;
        button.addEventListener('click', action.onClick);
      }
    }

    // Keep keyboard focus in the player, but never move it onto a choice or
    // "Play again" by itself: someone holding Space to skip text would pick
    // an option without meaning to. ↑ / ↓ move into the choices.
    if (hadFocus && !this.root.contains(document.activeElement)) this.root.focus({ preventScroll: true });
  }

  /**
   * Keep sprite elements between renders: a sprite fades in when it appears,
   * cross-fades when its picture changes, glides when it moves and fades out
   * when hidden. Later-shown sprites are drawn in front.
   */
  private renderSprites(sprites: readonly SpriteState[]) {
    const onStage = new Set<string>();
    sprites.forEach((sprite, order) => {
      onStage.add(sprite.characterId);
      const character = this.project.characters.find((c) => c.id === sprite.characterId);
      const assetId = character?.sprites[sprite.expression];
      const url = assetId ? this.assetUrl(assetId) : null;

      let entry = this.spriteEls.get(sprite.characterId);
      if (!entry || entry.wrap.classList.contains('zn-leaving')) {
        entry = { wrap: el('div', 'zn-sprite', this.spriteLayer), url: undefined };
        this.spriteEls.set(sprite.characterId, entry);
      }
      const { wrap } = entry;
      wrap.style.zIndex = String(order + 1);
      if (sprite.place) {
        wrap.className = 'zn-sprite zn-placed';
        wrap.style.left = `${sprite.place.x * 100}%`;
        wrap.style.bottom = `${(1 - sprite.place.y) * 100}%`;
        wrap.style.height = `${sprite.place.height * 100}%`;
      } else {
        wrap.className = `zn-sprite zn-pos-${sprite.position}`;
        wrap.style.left = wrap.style.bottom = wrap.style.height = '';
      }

      if (entry.url === url) return;
      const changing = entry.url !== undefined;
      entry.url = url;
      const old = Array.from(wrap.children) as HTMLElement[];
      if (url) {
        const img = el('img', changing ? 'zn-sprite-in' : '', wrap);
        img.src = url;
        img.alt = character?.name ?? '';
        img.draggable = false;
      } else {
        const ph = el('div', 'zn-sprite-placeholder', wrap);
        ph.textContent = character?.name ?? '?';
        if (character) ph.style.borderColor = character.color;
      }
      for (const node of old) {
        node.classList.add('zn-sprite-out');
        window.setTimeout(() => node.remove(), 400);
      }
    });

    for (const [id, entry] of this.spriteEls) {
      if (onStage.has(id)) continue;
      this.spriteEls.delete(id);
      entry.wrap.classList.add('zn-leaving');
      window.setTimeout(() => entry.wrap.remove(), 400);
    }
  }

  /** Drop every sprite at once (restart, load): nothing should fade over from before. */
  private clearSprites() {
    this.spriteEls.clear();
    this.spriteLayer.replaceChildren();
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
