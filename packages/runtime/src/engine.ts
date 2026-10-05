import {
  applyEffect,
  evaluateCondition,
  initialVariables,
  walkCommands,
  type Background,
  type Command,
  type IfCommand,
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
  index: number;
}

export interface SpriteState {
  characterId: string;
  expression: string;
  position: StagePosition;
}

export interface DialogueState {
  characterId?: string;
  text: string;
}

export interface VisibleChoice {
  id: string;
  text: string;
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

  /** Start (or restart) from the beginning, or from a given scene. */
  start(sceneId: string = this.project.startSceneId): void {
    this.state = emptyState(this.project);
    this.history = [];
    this.enterScene(sceneId);
    this.run();
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

  load(saved: EngineState): void {
    this.state = structuredClone(saved);
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

    switch (cmd.type) {
      case 'bg':
        s.background = cmd.background;
        s.backgroundTransition = cmd.transition ?? 'none';
        return false;
      case 'show': {
        const sprite = { characterId: cmd.characterId, expression: cmd.expression, position: cmd.position };
        const i = s.sprites.findIndex((sp) => sp.characterId === cmd.characterId);
        if (i >= 0) s.sprites[i] = sprite;
        else s.sprites.push(sprite);
        return false;
      }
      case 'hide':
        s.sprites = s.sprites.filter((sp) => sp.characterId !== cmd.characterId);
        return false;
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
          .map((o) => ({ id: o.id, text: o.text }));
        if (visible.length === 0) return false;
        s.choices = visible;
        s.pendingChoiceId = cmd.id;
        s.dialogue = cmd.prompt ? { text: cmd.prompt } : null;
        return true;
      }
      case 'jump':
        this.enterScene(cmd.targetSceneId);
        return false;
      case 'setVar':
        s.variables = applyEffect(cmd.effect, s.variables);
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
    }
  }
}
