import { walkCommands } from './check';
import type { Condition, Effect, Project, VariableValue } from './types';

export type ValueType = 'number' | 'boolean' | 'string';

/** A variable's type is the type of its initial value. */
export function valueType(v: VariableValue): ValueType {
  return typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string';
}

/** The "empty" value of a type, used when a writer switches a variable's type. */
export function defaultValue(type: ValueType): VariableValue {
  return type === 'boolean' ? false : type === 'number' ? 0 : '';
}

/** Convert a value to a type as sensibly as possible ("3" → 3, "true" → true). */
export function coerceValue(v: VariableValue | undefined, type: ValueType): VariableValue {
  if (v === undefined) return defaultValue(type);
  switch (type) {
    case 'number': {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean':
      return typeof v === 'string' ? v === 'true' : Boolean(v);
    case 'string':
      return String(v);
  }
}

export interface Usage {
  /** How many commands / options / settings refer to each id. */
  assets: Map<string, number>;
  characters: Map<string, number>;
  variables: Map<string, number>;
}

function bump(map: Map<string, number>, id: string) {
  map.set(id, (map.get(id) ?? 0) + 1);
}

function conditionVariables(c: Condition, out: string[] = []): string[] {
  if (c.kind === 'compare') out.push(c.variableId);
  else for (const sub of c.conditions) conditionVariables(sub, out);
  return out;
}

/**
 * Count references to every asset, character and variable, so the editor can
 * say "used in 3 places" before something is deleted.
 */
export function findUsages(project: Project): Usage {
  const usage: Usage = { assets: new Map(), characters: new Map(), variables: new Map() };
  const effect = (e: Effect) => bump(usage.variables, e.variableId);
  const condition = (c: Condition | undefined) => {
    if (c) for (const id of new Set(conditionVariables(c))) bump(usage.variables, id);
  };

  for (const ch of project.characters) {
    for (const assetId of new Set(Object.values(ch.sprites))) bump(usage.assets, assetId);
  }
  if (project.theme.dialogue.frame) bump(usage.assets, project.theme.dialogue.frame.assetId);

  for (const scene of project.scenes) {
    walkCommands(scene.commands, (cmd) => {
      switch (cmd.type) {
        case 'bg':
          if (cmd.background.kind === 'image') bump(usage.assets, cmd.background.assetId);
          break;
        case 'music':
          if (cmd.action === 'play') bump(usage.assets, cmd.assetId);
          break;
        case 'sound':
          bump(usage.assets, cmd.assetId);
          break;
        case 'show':
        case 'hide':
          bump(usage.characters, cmd.characterId);
          break;
        case 'say':
          if (cmd.characterId) bump(usage.characters, cmd.characterId);
          break;
        case 'setVar':
          effect(cmd.effect);
          break;
        case 'if':
          condition(cmd.condition);
          break;
        case 'choice':
          for (const o of cmd.options) {
            condition(o.condition);
            o.effects?.forEach(effect);
          }
          break;
      }
    });
  }
  return usage;
}
