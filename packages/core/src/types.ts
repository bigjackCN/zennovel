/**
 * ZenNovel project format.
 *
 * A project is plain JSON: the editor only edits this data,
 * and the runtime only plays it. Nothing here depends on the DOM.
 */

export const FORMAT_VERSION = 1;

export interface Project {
  formatVersion: number;
  meta: ProjectMeta;
  assets: Asset[];
  characters: Character[];
  variables: Variable[];
  theme: Theme;
  scenes: Scene[];
  startSceneId: string;
}

/** Languages the editor and the built-in player UI support. */
export type Locale = 'en' | 'zh';

export interface ProjectMeta {
  id: string;
  name: string;
  /** Language of the player's built-in UI (end screen, buttons). Defaults to 'en'. */
  locale?: Locale;
  author?: string;
  description?: string;
  /** Logical stage size; the player scales it to fit the window. */
  resolution: { width: number; height: number };
  createdAt: string;
  updatedAt: string;
}

export type AssetKind = 'image' | 'audio' | 'font';

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  /** Absolute URL, data: URL, or a path resolved against the player's assetBase. */
  src: string;
}

export interface Character {
  id: string;
  name: string;
  /** Colour of the name label in the dialogue box. */
  color: string;
  /** Expression name -> image asset id, e.g. { happy: "img_alice_happy" }. */
  sprites: Record<string, string>;
}

export type VariableValue = number | boolean | string;

export interface Variable {
  id: string;
  name: string;
  initial: VariableValue;
}

export interface Scene {
  id: string;
  name: string;
  commands: Command[];
  /** Position on the story map (flow view). */
  position?: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Commands — every step a scene can take.
// ---------------------------------------------------------------------------

export type Transition = 'none' | 'fade';

export type Background =
  | { kind: 'color'; value: string }
  | { kind: 'image'; assetId: string };

export type StagePosition = 'left' | 'center' | 'right';

export interface BgCommand {
  id: string;
  type: 'bg';
  background: Background;
  transition?: Transition;
}

export interface ShowCommand {
  id: string;
  type: 'show';
  characterId: string;
  expression: string;
  position: StagePosition;
}

export interface HideCommand {
  id: string;
  type: 'hide';
  characterId: string;
}

/** A line of dialogue. No characterId means narration. */
export interface SayCommand {
  id: string;
  type: 'say';
  characterId?: string;
  text: string;
}

export interface ChoiceOption {
  id: string;
  text: string;
  /** Only shown when the condition holds. */
  condition?: Condition;
  /** Variable changes applied when picked. */
  effects?: Effect[];
  /** Scene to jump to; omitted means continue after the choice. */
  targetSceneId?: string;
}

export interface ChoiceCommand {
  id: string;
  type: 'choice';
  prompt?: string;
  options: ChoiceOption[];
}

export interface JumpCommand {
  id: string;
  type: 'jump';
  targetSceneId: string;
}

export interface SetVarCommand {
  id: string;
  type: 'setVar';
  effect: Effect;
}

export interface IfCommand {
  id: string;
  type: 'if';
  condition: Condition;
  then: Command[];
  else: Command[];
}

export interface EndCommand {
  id: string;
  type: 'end';
}

export type Command =
  | BgCommand
  | ShowCommand
  | HideCommand
  | SayCommand
  | ChoiceCommand
  | JumpCommand
  | SetVarCommand
  | IfCommand
  | EndCommand;

export type CommandType = Command['type'];

// ---------------------------------------------------------------------------
// Conditions & effects — structured, so writers pick from dropdowns
// ("if [affection] [>=] [5]") instead of typing expressions.
// ---------------------------------------------------------------------------

export type CompareOp = '==' | '!=' | '>' | '>=' | '<' | '<=';

export interface Comparison {
  kind: 'compare';
  variableId: string;
  op: CompareOp;
  value: VariableValue;
}

export interface AllOf {
  kind: 'all';
  conditions: Condition[];
}

export interface AnyOf {
  kind: 'any';
  conditions: Condition[];
}

export type Condition = Comparison | AllOf | AnyOf;

export type EffectOp = 'set' | 'add' | 'subtract' | 'toggle';

export interface Effect {
  variableId: string;
  op: EffectOp;
  value?: VariableValue;
}

// ---------------------------------------------------------------------------
// Theme — the writer-customisable look of the player.
// ---------------------------------------------------------------------------

export interface Theme {
  fontFamily: string;
  textSpeed: number; // characters per second; 0 = instant
  dialogue: {
    background: string; // any CSS colour
    /** Optional 9-slice frame image. */
    frame?: { assetId: string; slice: number };
    textColor: string;
    fontSize: number;
    borderRadius: number;
    padding: number;
    /** Height as a fraction of the stage (0–1). */
    height: number;
    margin: number;
  };
  nameplate: {
    background: string;
    textColor: string;
    fontSize: number;
  };
  choice: {
    background: string;
    hoverBackground: string;
    textColor: string;
    borderRadius: number;
  };
}
