import { createId, defaultTheme } from './defaults';
import {
  FORMAT_VERSION,
  type Asset,
  type AssetKind,
  type Background,
  type Character,
  type ChoiceOption,
  type Command,
  type CompareOp,
  type Condition,
  type Effect,
  type EffectOp,
  type Locale,
  type Project,
  type Scene,
  type StagePosition,
  type Theme,
  type Variable,
  type VariableValue,
} from './types';

/**
 * Why a file could not be opened, as a code so the editor can explain it in
 * the writer's language.
 */
export type ProjectLoadError = { code: 'notAProject' } | { code: 'newerFormat'; version: number };

export type NormalizeResult = { ok: true; project: Project } | { ok: false; error: ProjectLoadError };

/**
 * Upgrades from older format versions, keyed by the version they upgrade
 * *from*. Empty while the format is still at version 1; when the format
 * changes, bump FORMAT_VERSION and add `1: (p) => ...` here.
 */
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const isValue = (v: unknown): v is VariableValue =>
  typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

const LOCALES = ['en', 'zh'] as const satisfies readonly Locale[];
const ASSET_KINDS = ['image', 'audio', 'font'] as const satisfies readonly AssetKind[];
const POSITIONS = ['left', 'center', 'right'] as const satisfies readonly StagePosition[];
const COMPARE_OPS = ['==', '!=', '>', '>=', '<', '<='] as const satisfies readonly CompareOp[];
const EFFECT_OPS = ['set', 'add', 'subtract', 'toggle'] as const satisfies readonly EffectOp[];

/**
 * Turn untrusted JSON (an imported file, an old project in storage) into a
 * well-formed Project. Rejects things that aren't projects and files from a
 * newer ZenNovel; everything else is repaired: missing lists become empty,
 * the theme is completed from the defaults, malformed commands are dropped
 * and duplicate ids are renamed, so the editor and player never trip over
 * `undefined`. Broken *references* (a jump to a deleted scene) are left
 * alone on purpose: the story checker explains those to the writer.
 */
export function normalizeProject(raw: unknown): NormalizeResult {
  if (!isObj(raw) || !Array.isArray(raw.scenes)) return { ok: false, error: { code: 'notAProject' } };

  let version = num(raw.formatVersion, 1);
  if (version > FORMAT_VERSION) return { ok: false, error: { code: 'newerFormat', version } };
  let data: Obj = raw;
  while (version < FORMAT_VERSION) {
    const migrate = migrations[version];
    if (migrate) data = migrate(data);
    version++;
  }

  const sceneId = idMinter('scene');
  const assetId = idMinter('asset');
  const characterId = idMinter('chr');
  const variableId = idMinter('var');
  // Commands are looked up by id across the whole project, so they share one namespace.
  const ids: Minters = { command: idMinter('cmd'), option: idMinter('opt') };

  const now = new Date().toISOString();
  const meta = isObj(data.meta) ? data.meta : {};
  const resolution = isObj(meta.resolution) ? meta.resolution : {};
  const locale = LOCALES.includes(meta.locale as Locale) ? (meta.locale as Locale) : undefined;

  const scenes = (data.scenes as unknown[]).filter(isObj).map((s): Scene => ({
    id: sceneId(s.id),
    name: str(s.name, ''),
    commands: normalizeCommands(s.commands, ids),
    ...(isObj(s.position) && { position: { x: num(s.position.x, 0), y: num(s.position.y, 0) } }),
  }));
  if (scenes.length === 0) return { ok: false, error: { code: 'notAProject' } };

  const startSceneId = scenes.some((s) => s.id === data.startSceneId) ? (data.startSceneId as string) : scenes[0]!.id;

  const project: Project = {
    formatVersion: FORMAT_VERSION,
    meta: {
      id: str(meta.id, '') || createId('proj'),
      name: str(meta.name, ''),
      ...(locale && { locale }),
      ...(typeof meta.author === 'string' && { author: meta.author }),
      ...(typeof meta.description === 'string' && { description: meta.description }),
      resolution: {
        width: Math.max(1, num(resolution.width, 1280)),
        height: Math.max(1, num(resolution.height, 720)),
      },
      createdAt: str(meta.createdAt, now),
      updatedAt: str(meta.updatedAt, now),
    },
    assets: list(data.assets).map(
      (a): Asset => ({
        id: assetId(a.id),
        kind: oneOf(a.kind, ASSET_KINDS, 'image'),
        name: str(a.name, str(a.id, '')),
        src: str(a.src, ''),
      }),
    ),
    characters: list(data.characters).map(
      (c): Character => ({
        id: characterId(c.id),
        name: str(c.name, ''),
        color: str(c.color, '#888888'),
        sprites: Object.fromEntries(
          Object.entries(isObj(c.sprites) ? c.sprites : {}).filter((e): e is [string, string] => typeof e[1] === 'string'),
        ),
      }),
    ),
    variables: list(data.variables).map(
      (v): Variable => ({
        id: variableId(v.id),
        name: str(v.name, ''),
        initial: isValue(v.initial) ? v.initial : 0,
      }),
    ),
    theme: normalizeTheme(data.theme),
    scenes,
    startSceneId,
  };
  return { ok: true, project };
}

const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

type Minter = (v: unknown) => string;
interface Minters {
  command: Minter;
  option: Minter;
}

/** Keeps an id if it's a non-empty string not seen before, otherwise mints a new one. */
function idMinter(prefix: string): Minter {
  const seen = new Set<string>();
  return (v) => {
    const id = typeof v === 'string' && v && !seen.has(v) ? v : createId(prefix);
    seen.add(id);
    return id;
  };
}

function normalizeTheme(raw: unknown): Theme {
  const t = isObj(raw) ? raw : {};
  const d = isObj(t.dialogue) ? t.dialogue : {};
  const n = isObj(t.nameplate) ? t.nameplate : {};
  const c = isObj(t.choice) ? t.choice : {};
  const dd = defaultTheme.dialogue;
  const frame = isObj(d.frame) && typeof d.frame.assetId === 'string' ? { assetId: d.frame.assetId, slice: num(d.frame.slice, 16) } : undefined;
  return {
    fontFamily: str(t.fontFamily, defaultTheme.fontFamily),
    textSpeed: Math.max(0, num(t.textSpeed, defaultTheme.textSpeed)),
    dialogue: {
      background: str(d.background, dd.background),
      ...(frame && { frame }),
      textColor: str(d.textColor, dd.textColor),
      fontSize: num(d.fontSize, dd.fontSize),
      borderRadius: num(d.borderRadius, dd.borderRadius),
      padding: num(d.padding, dd.padding),
      height: Math.min(1, Math.max(0, num(d.height, dd.height))),
      margin: num(d.margin, dd.margin),
    },
    nameplate: {
      background: str(n.background, defaultTheme.nameplate.background),
      textColor: str(n.textColor, defaultTheme.nameplate.textColor),
      fontSize: num(n.fontSize, defaultTheme.nameplate.fontSize),
    },
    choice: {
      background: str(c.background, defaultTheme.choice.background),
      hoverBackground: str(c.hoverBackground, defaultTheme.choice.hoverBackground),
      textColor: str(c.textColor, defaultTheme.choice.textColor),
      borderRadius: num(c.borderRadius, defaultTheme.choice.borderRadius),
    },
  };
}

function normalizeCondition(raw: unknown): Condition | undefined {
  if (!isObj(raw)) return undefined;
  if (raw.kind === 'all' || raw.kind === 'any') {
    const conditions = (Array.isArray(raw.conditions) ? raw.conditions : [])
      .map(normalizeCondition)
      .filter((c): c is Condition => !!c);
    return { kind: raw.kind, conditions };
  }
  if (raw.kind !== 'compare') return undefined;
  return {
    kind: 'compare',
    variableId: str(raw.variableId, ''),
    op: oneOf(raw.op, COMPARE_OPS, '=='),
    value: isValue(raw.value) ? raw.value : 0,
  };
}

function normalizeEffect(raw: unknown): Effect | undefined {
  if (!isObj(raw)) return undefined;
  return {
    variableId: str(raw.variableId, ''),
    op: oneOf(raw.op, EFFECT_OPS, 'set'),
    ...(isValue(raw.value) && { value: raw.value }),
  };
}

function normalizeCommands(raw: unknown, ids: Minters): Command[] {
  const out: Command[] = [];
  for (const c of list(raw)) {
    const cmd = normalizeCommand(c, ids);
    if (cmd) out.push(cmd);
  }
  return out;
}

function normalizeCommand(c: Obj, ids: Minters): Command | undefined {
  const id = () => ids.command(c.id);
  switch (c.type) {
    case 'say':
      return {
        id: id(),
        type: 'say',
        text: str(c.text, ''),
        ...(typeof c.characterId === 'string' && c.characterId && { characterId: c.characterId }),
      };
    case 'bg': {
      const b = isObj(c.background) ? c.background : {};
      const background: Background =
        b.kind === 'image' && typeof b.assetId === 'string'
          ? { kind: 'image', assetId: b.assetId }
          : { kind: 'color', value: str(b.value, '#000000') };
      return { id: id(), type: 'bg', background, ...(c.transition === 'fade' && { transition: 'fade' as const }) };
    }
    case 'show':
      return {
        id: id(),
        type: 'show',
        characterId: str(c.characterId, ''),
        expression: str(c.expression, 'normal'),
        position: oneOf(c.position, POSITIONS, 'center'),
      };
    case 'hide':
      return { id: id(), type: 'hide', characterId: str(c.characterId, '') };
    case 'choice': {
      const options = list(c.options).map((o): ChoiceOption => {
        const condition = normalizeCondition(o.condition);
        const effects = list(o.effects).map(normalizeEffect).filter((e): e is Effect => !!e);
        return {
          id: ids.option(o.id),
          text: str(o.text, ''),
          ...(condition && { condition }),
          ...(effects.length > 0 && { effects }),
          ...(typeof o.targetSceneId === 'string' && o.targetSceneId && { targetSceneId: o.targetSceneId }),
        };
      });
      return { id: id(), type: 'choice', options, ...(typeof c.prompt === 'string' && c.prompt && { prompt: c.prompt }) };
    }
    case 'jump':
      return { id: id(), type: 'jump', targetSceneId: str(c.targetSceneId, '') };
    case 'setVar': {
      const effect = normalizeEffect(c.effect);
      return effect ? { id: id(), type: 'setVar', effect } : undefined;
    }
    case 'if': {
      const condition = normalizeCondition(c.condition);
      if (!condition) return undefined;
      const ifId = id();
      return {
        id: ifId,
        type: 'if',
        condition,
        then: normalizeCommands(c.then, ids),
        else: normalizeCommands(c.else, ids),
      };
    }
    case 'end':
      return { id: id(), type: 'end' };
    default:
      return undefined;
  }
}
