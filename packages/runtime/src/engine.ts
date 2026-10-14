import {
  applyEffect,
  evaluateCondition,
  initialVariables,
  walkCommands,
  type Background,
  type Command,
  type Area,
  type IfCommand,
  type Placement,
  type Project,
  type Scene,
  type StagePosition,
  type VariableState,
} from '@zennovel/core';

/**
 * Where execution currently is. Frames are plain data (no object references)
 * so the whole engine state can be saved as JSON.
 */
export interface Frame {
  sceneId: string;
  /** Set when running inside an `if` branch. */
  ifId?: string;
  branch?: 'then' | 'else';
  /** Next command to run in this frame's list. */
  index: number;
  /**
   * Id of the command that ran last in this frame. Lets a save find its
   * place again after the writer inserts or deletes lines above it.
   */
  anchorId?: string;
}

export interface SpriteState {
  characterId: string;
  expression: string;
  position: StagePosition;
  /** Custom spot and size, used instead of `position` when set. */
  place?: Placement;
}

export interface DialogueState {
  characterId?: string;
  text: string;
}

export interface VisibleChoice {
  id: string;
  text: string;
  /** Picked by clicking this part of the picture. */
  area?: Area;
}

export interface EngineState {
  stack: Frame[];
  variables: VariableState;
  background: Background | null;
  backgroundTransition: 'none' | 'fade';
  sprites: SpriteState[];
  dialogue: DialogueState | null;
  choices: VisibleChoice[] | null;
  /** Id of the choice command currently waiting for the player. */
  pendingChoiceId: string | null;
  backlog: DialogueState[];
  ended: boolean;
  error: EngineError | null;
  /** Background music that should be playing, or null for silence. */
  music: MusicState | null;
  /** The most recent sound effect. Players play it when `id` is higher than the last one they played. */
  sfx: SoundCue | null;
  /** The most recent achievement unlocked, reported like `sfx` (once per `id`). */
  achievement: AchievementCue | null;
}

export interface AchievementCue {
  achievementId: string;
  name: string;
  id: number;
}

export interface MusicState {
  assetId: string;
  volume: number;
  loop: boolean;
}

export interface SoundCue {
  assetId: string;
  volume: number;
  /** Increases with every sound the engine plays (never reused, even after a rollback). */
  id: number;
}

/** Runtime problems, as codes so the player can show them in any language. */
export type EngineError = { code: 'sceneNotFound'; sceneId: string } | { code: 'infiniteLoop' };

export type EngineListener = (state: Readonly<EngineState>) => void;

const MAX_STEPS_PER_ADVANCE = 10_000;
const MAX_BACKLOG = 200;
const MAX_ROLLBACK = 100;

function emptyState(project: Project): EngineState {
  return {
    stack: [],
    variables: initialVariables(project.variables),
    background: null,
    backgroundTransition: 'none',
    sprites: [],
    dialogue: null,
    choices: null,
    pendingChoiceId: null,
    backlog: [],
    ended: false,
    error: null,
    music: null,
    sfx: null,
    achievement: null,
  };
}

/**
 * Headless story interpreter. Knows nothing about rendering —
 * the DOM player (or tests) subscribe to state changes.
 */
export class Engine {
  private project: Project;
  private scenes = new Map<string, Scene>();
  private state: EngineState;
  private history: EngineState[] = [];
  private listeners = new Set<EngineListener>();
  private sfxCounter = 0;
  private achievementCounter = 0;

  constructor(project: Project) {
    this.project = project;
    this.indexScenes();
    this.state = emptyState(project);
  }

  /** Swap in an edited project (live preview). Call start() afterwards. */
  setProject(project: Project): void {
    this.project = project;
    this.indexScenes();
  }

  getProject(): Project {
    return this.project;
  }

  getState(): Readonly<EngineState> {
    return this.state;
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Start (or restart) from the beginning, from a given scene, or from a
   * given command inside that scene (the editor's "play from this line").
   * When starting mid-scene, the backgrounds, characters and variable
   * changes above that command are applied first so the stage looks right.
   */
  start(sceneId: string = this.project.startSceneId, atCommandId?: string): void {
    this.state = emptyState(this.project);
    this.history = [];
    this.enterScene(sceneId);
    if (atCommandId && !this.state.error) this.fastForward(sceneId, atCommandId);
    this.run();
  }

  /**
   * The stage just before `commandId` runs: the background and characters
   * set up above it in its scene (what the editor draws when the writer
   * places a picture or marks part of it). Leaves the engine's own state alone.
   */
  stageAt(sceneId: string, commandId: string): { background: Background | null; sprites: SpriteState[] } {
    const saved = this.state;
    try {
      this.state = emptyState(this.project);
      this.enterScene(sceneId);
      if (!this.state.error) this.fastForward(sceneId, commandId);
      return structuredClone({ background: this.state.background, sprites: this.state.sprites });
    } finally {
      this.state = saved;
    }
  }

  /** Move past the current line. Does nothing while a choice is open. */
  advance(): void {
    if (this.state.ended || this.state.pendingChoiceId || this.state.error) return;
    this.remember();
    this.state.dialogue = null;
    this.run();
  }

  choose(optionId: string): void {
    const cmd = this.findCommand(this.state.pendingChoiceId);
    if (!cmd || cmd.type !== 'choice') return;
    const option = cmd.options.find((o) => o.id === optionId);
    if (!option || !this.state.choices?.some((c) => c.id === optionId)) return;

    this.remember();
    for (const effect of option.effects ?? []) {
      this.state.variables = applyEffect(effect, this.state.variables);
    }
    this.state.choices = null;
    this.state.pendingChoiceId = null;
    this.state.dialogue = null;
    if (option.targetSceneId) this.enterScene(option.targetSceneId);
    this.run();
  }

  canRollback(): boolean {
    return this.history.length > 0;
  }

  rollback(): void {
    const previous = this.history.pop();
    if (!previous) return;
    this.state = previous;
    this.emit();
  }

  /** Serialisable save data. */
  save(): EngineState {
    return structuredClone(this.state);
  }

  /**
   * Restore a save. The story may have been edited since it was made, so
   * each frame is re-anchored on the command it last ran, variables added
   * since then get their initial values, and a choice that no longer exists
   * is dropped.
   */
  load(saved: EngineState): void {
    const state = structuredClone(saved);
    // Saves from before music existed lack these fields.
    state.music ??= null;
    state.sfx ??= null;
    state.achievement ??= null;
    this.sfxCounter = Math.max(this.sfxCounter, state.sfx?.id ?? 0);
    this.achievementCounter = Math.max(this.achievementCounter, state.achievement?.id ?? 0);
    state.variables = { ...initialVariables(this.project.variables), ...state.variables };
    for (const frame of state.stack) {
      const list = this.commandsFor(frame);
      if (!list) continue; // scene or branch deleted: step() will pop this frame
      const at = frame.anchorId ? list.findIndex((c) => c.id === frame.anchorId) : -1;
      frame.index = at >= 0 ? at + 1 : Math.min(frame.index, list.length);
    }
    if (state.pendingChoiceId && this.findCommand(state.pendingChoiceId)?.type !== 'choice') {
      state.pendingChoiceId = null;
      state.choices = null;
    }
    this.state = state;
    this.history = [];
    this.emit();
  }

  // -------------------------------------------------------------------------

  private indexScenes() {
    this.scenes = new Map(this.project.scenes.map((s) => [s.id, s]));
  }

  private remember() {
    this.history.push(structuredClone(this.state));
    if (this.history.length > MAX_ROLLBACK) this.history.shift();
  }

  private emit() {
    for (const l of this.listeners) l(this.state);
  }

  private enterScene(sceneId: string) {
    if (!this.scenes.has(sceneId)) {
      this.state.error = { code: 'sceneNotFound', sceneId };
      this.state.stack = [];
      return;
    }
    this.state.stack = [{ sceneId, index: 0 }];
  }

  private findCommand(id: string | null): Command | undefined {
    if (!id) return undefined;
    for (const scene of this.scenes.values()) {
      let found: Command | undefined;
      walkCommands(scene.commands, (c) => {
        if (c.id === id) found = c;
      });
      if (found) return found;
    }
    return undefined;
  }

  private commandsFor(frame: Frame): Command[] | undefined {
    const scene = this.scenes.get(frame.sceneId);
    if (!scene) return undefined;
    if (!frame.ifId) return scene.commands;
    let ifCmd: IfCommand | undefined;
    walkCommands(scene.commands, (c) => {
      if (c.id === frame.ifId && c.type === 'if') ifCmd = c;
    });
    return ifCmd ? ifCmd[frame.branch ?? 'then'] : undefined;
  }

  /** Position the stack just before `commandId`, applying the setup commands above it. */
  private fastForward(sceneId: string, commandId: string) {
    const scene = this.scenes.get(sceneId);
    const path = scene && findPath(scene.commands, commandId);
    if (!scene || !path) return;
    const stack: Frame[] = [{ sceneId, index: 0 }];
    let list = scene.commands;
    path.forEach((step, depth) => {
      for (let i = 0; i < step.index; i++) this.applySetup(list[i]!);
      const frame = stack[stack.length - 1]!;
      if (depth === path.length - 1 || !step.branch) {
        frame.index = step.index;
        frame.anchorId = list[step.index - 1]?.id;
        return;
      }
      const ifCmd = list[step.index] as IfCommand;
      frame.index = step.index + 1;
      frame.anchorId = ifCmd.id;
      stack.push({ sceneId, ifId: ifCmd.id, branch: step.branch, index: 0 });
      list = ifCmd[step.branch];
    });
    this.state.stack = stack;
    this.state.backgroundTransition = 'none';
  }

  /**
   * Set up the stage for a command above the starting point: like
   * applyInstant, but an `if` takes the branch its condition picks with the
   * variables so far, so pictures shown inside branches appear too.
   */
  private applySetup(cmd: Command) {
    if (cmd.type === 'if') {
      const branch = evaluateCondition(cmd.condition, this.state.variables) ? cmd.then : cmd.else;
      for (const inner of branch) this.applySetup(inner);
      return;
    }
    this.applyInstant(cmd, true);
  }

  /**
   * Apply a command that changes the stage, music or variables without
   * pausing. Returns false for anything else. `skipping` is set while
   * fast-forwarding to a line: sound effects passed over stay silent.
   */
  private applyInstant(cmd: Command, skipping = false): boolean {
    const s = this.state;
    switch (cmd.type) {
      case 'bg':
        s.background = cmd.background;
        s.backgroundTransition = cmd.transition ?? 'none';
        return true;
      case 'show': {
        const sprite: SpriteState = {
          characterId: cmd.characterId,
          expression: cmd.expression,
          position: cmd.position,
          ...(cmd.place && { place: { ...cmd.place } }),
        };
        const i = s.sprites.findIndex((sp) => sp.characterId === cmd.characterId);
        if (i >= 0) s.sprites[i] = sprite;
        else s.sprites.push(sprite);
        return true;
      }
      case 'hide':
        s.sprites = s.sprites.filter((sp) => sp.characterId !== cmd.characterId);
        return true;
      case 'setVar':
        s.variables = applyEffect(cmd.effect, s.variables);
        return true;
      case 'music':
        s.music =
          cmd.action === 'play' ? { assetId: cmd.assetId, volume: cmd.volume ?? 1, loop: cmd.loop ?? true } : null;
        return true;
      case 'sound':
        if (!skipping) s.sfx = { assetId: cmd.assetId, volume: cmd.volume ?? 1, id: ++this.sfxCounter };
        return true;
      case 'achievement':
        if (!skipping && cmd.achievementId) {
          s.achievement = {
            achievementId: cmd.achievementId,
            name: cmd.name || cmd.achievementId,
            id: ++this.achievementCounter,
          };
        }
        return true;
      default:
        return false;
    }
  }

  /** Execute commands until something needs the player (a line, a choice, the end). */
  private run() {
    for (let steps = 0; steps < MAX_STEPS_PER_ADVANCE; steps++) {
      if (this.step()) {
        this.emit();
        return;
      }
    }
    this.state.error = { code: 'infiniteLoop' };
    this.emit();
  }

  /** Runs one command. Returns true when execution should pause. */
  private step(): boolean {
    const s = this.state;
    if (s.error || s.ended) return true;

    const frame = s.stack[s.stack.length - 1];
    if (!frame) {
      s.ended = true;
      return true;
    }
    const list = this.commandsFor(frame);
    if (!list || frame.index >= list.length) {
      s.stack.pop();
      return false;
    }

    const cmd = list[frame.index]!;
    frame.index++;
    frame.anchorId = cmd.id;

    if (this.applyInstant(cmd)) return false;
    switch (cmd.type) {
      case 'say': {
        const line = { characterId: cmd.characterId, text: cmd.text };
        s.dialogue = line;
        s.backlog.push(line);
        if (s.backlog.length > MAX_BACKLOG) s.backlog.shift();
        return true;
      }
      case 'choice': {
        const visible = cmd.options
          .filter((o) => !o.condition || evaluateCondition(o.condition, s.variables))
          .map((o) => ({ id: o.id, text: o.text, ...(o.area && { area: { ...o.area } }) }));
        if (visible.length === 0) return false;
        s.choices = visible;
        s.pendingChoiceId = cmd.id;
        s.dialogue = cmd.prompt ? { text: cmd.prompt } : null;
        return true;
      }
      case 'jump':
        this.enterScene(cmd.targetSceneId);
        return false;
      case 'if': {
        const branch = evaluateCondition(cmd.condition, s.variables) ? 'then' : 'else';
        s.stack.push({ sceneId: frame.sceneId, ifId: cmd.id, branch, index: 0 });
        return false;
      }
      case 'end':
        s.ended = true;
        s.stack = [];
        return true;
      default:
        return false;
    }
  }
}

type PathStep = { index: number; branch?: 'then' | 'else' };

/** Where `id` sits in a command tree: one step per `if` branch entered, then its index. */
function findPath(list: Command[], id: string): PathStep[] | null {
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (c.id === id) return [{ index: i }];
    if (c.type === 'if') {
      for (const branch of ['then', 'else'] as const) {
        const sub = findPath(c[branch], id);
        if (sub) return [{ index: i, branch }, ...sub];
      }
    }
  }
  return null;
}
