import type { Command, Condition, Effect, Project, Scene, VariableValue } from './types';

export type IssueLevel = 'error' | 'warning';

/**
 * Issues are reported as codes + params, never as display text, so the
 * editor can show them in the writer's language.
 */
export type IssueCode =
  | 'noStartScene'
  | 'missingVariable'
  | 'missingConditionVariable'
  | 'variableTypeMismatch'
  | 'missingBackground'
  | 'missingAudio'
  | 'missingShowCharacter'
  | 'missingExpression'
  | 'missingHideCharacter'
  | 'missingSpeaker'
  | 'emptyLine'
  | 'emptyChoice'
  | 'missingOptionTarget'
  | 'missingJumpTarget'
  | 'noEnding'
  | 'unreachable'
  | 'badAchievementId'
  | 'missingFollowCharacter';

export interface StoryIssue {
  level: IssueLevel;
  sceneId: string;
  commandId?: string;
  code: IssueCode;
  params?: Record<string, string>;
}

/** Visit every command in a list, including those nested inside `if`. */
export function walkCommands(commands: Command[], visit: (cmd: Command) => void): void {
  for (const cmd of commands) {
    visit(cmd);
    if (cmd.type === 'if') {
      walkCommands(cmd.then, visit);
      walkCommands(cmd.else, visit);
    }
  }
}

/** Scene ids this scene can lead to. */
export function sceneTargets(scene: Scene): string[] {
  const targets: string[] = [];
  walkCommands(scene.commands, (cmd) => {
    if (cmd.type === 'jump') targets.push(cmd.targetSceneId);
    if (cmd.type === 'choice') {
      for (const opt of cmd.options) if (opt.targetSceneId) targets.push(opt.targetSceneId);
    }
  });
  return targets;
}

function conditionVariables(c: Condition): string[] {
  return c.kind === 'compare' ? [c.variableId] : c.conditions.flatMap(conditionVariables);
}

function endsExplicitly(commands: Command[]): boolean {
  const last = commands[commands.length - 1];
  if (!last) return false;
  if (last.type === 'jump' || last.type === 'end') return true;
  if (last.type === 'choice') {
    // If every option is conditional, all of them can be hidden; the player
    // then skips the choice and falls off the end of the scene. So does a
    // time limit with no option for when time runs out.
    const shown = last.options.filter((o) => !o.timeout);
    const timesOut = !!last.timeLimit && !last.options.some((o) => o.timeout);
    return last.options.every((o) => o.targetSceneId) && shown.some((o) => !o.condition) && !timesOut;
  }
  if (last.type === 'if') return endsExplicitly(last.then) && endsExplicitly(last.else);
  return false;
}

/**
 * The "story checker": finds broken links and dead ends in plain language,
 * so writers never have to read a stack trace.
 */
export function checkProject(project: Project): StoryIssue[] {
  const issues: StoryIssue[] = [];
  const sceneIds = new Set(project.scenes.map((s) => s.id));
  const characters = new Map(project.characters.map((c) => [c.id, c]));
  const assetIds = new Set(project.assets.map((a) => a.id));
  const audioIds = new Set(project.assets.filter((a) => a.kind === 'audio').map((a) => a.id));
  const variableIds = new Set(project.variables.map((v) => v.id));
  const variables = new Map(project.variables.map((v) => [v.id, v]));
  const kind = (v: VariableValue) => typeof v;

  if (!sceneIds.has(project.startSceneId)) {
    issues.push({ level: 'error', sceneId: project.startSceneId, code: 'noStartScene' });
  }

  for (const scene of project.scenes) {
    const add = (level: IssueLevel, code: IssueCode, commandId?: string, params?: Record<string, string>) =>
      issues.push({ level, sceneId: scene.id, commandId, code, ...(params && { params }) });

    // e.g. "add 1" to a yes/no variable, or "is greater than" on text —
    // usually left over after the writer changed the variable's kind.
    const mismatch = (variableId: string, commandId: string) =>
      add('warning', 'variableTypeMismatch', commandId, { variable: variables.get(variableId)?.name ?? '' });

    const checkEffects = (effects: Effect[] | undefined, commandId: string) => {
      for (const e of effects ?? []) {
        const v = variables.get(e.variableId);
        if (!v) {
          add('error', 'missingVariable', commandId);
          continue;
        }
        const type = kind(v.initial);
        const bad =
          ((e.op === 'add' || e.op === 'subtract') && type !== 'number') ||
          (e.op === 'toggle' && type !== 'boolean') ||
          (e.op === 'set' && e.value !== undefined && kind(e.value) !== type);
        if (bad) mismatch(v.id, commandId);
      }
    };
    const checkComparisons = (c: Condition, commandId: string) => {
      if (c.kind !== 'compare') return c.conditions.forEach((sub) => checkComparisons(sub, commandId));
      const v = variables.get(c.variableId);
      if (!v) return;
      const type = kind(v.initial);
      const ordering = c.op !== '==' && c.op !== '!=';
      if ((ordering && type !== 'number') || kind(c.value) !== type) mismatch(v.id, commandId);
    };
    const checkCondition = (c: Condition | undefined, commandId: string) => {
      if (!c) return;
      for (const id of conditionVariables(c)) {
        if (!variableIds.has(id)) add('error', 'missingConditionVariable', commandId);
      }
      checkComparisons(c, commandId);
    };

    walkCommands(scene.commands, (cmd) => {
      switch (cmd.type) {
        case 'bg':
          if (cmd.background.kind === 'image' && !assetIds.has(cmd.background.assetId)) {
            add('error', 'missingBackground', cmd.id);
          }
          break;
        case 'show': {
          const ch = characters.get(cmd.characterId);
          if (!ch) add('error', 'missingShowCharacter', cmd.id);
          else if (!ch.sprites[cmd.expression])
            add('warning', 'missingExpression', cmd.id, { character: ch.name, expression: cmd.expression });
          break;
        }
        case 'hide':
          if (!characters.has(cmd.characterId)) add('error', 'missingHideCharacter', cmd.id);
          break;
        case 'say':
          if (cmd.characterId && !characters.has(cmd.characterId)) add('error', 'missingSpeaker', cmd.id);
          if (!cmd.text.trim()) add('warning', 'emptyLine', cmd.id);
          break;
        case 'choice':
          if (cmd.options.length === 0) add('error', 'emptyChoice', cmd.id);
          for (const opt of cmd.options) {
            if (opt.targetSceneId && !sceneIds.has(opt.targetSceneId)) {
              add('error', 'missingOptionTarget', cmd.id, { option: opt.text });
            }
            checkCondition(opt.condition, cmd.id);
            checkEffects(opt.effects, cmd.id);
            if (opt.follow && !characters.has(opt.follow)) {
              add('error', 'missingFollowCharacter', cmd.id, { option: opt.text });
            }
          }
          break;
        case 'jump':
          if (!sceneIds.has(cmd.targetSceneId)) add('error', 'missingJumpTarget', cmd.id);
          break;
        case 'setVar':
          checkEffects([cmd.effect], cmd.id);
          break;
        case 'if':
          checkCondition(cmd.condition, cmd.id);
          break;
        case 'music':
        case 'sound':
          if (cmd.type === 'music' && cmd.action === 'stop') break;
          if (!audioIds.has(cmd.assetId)) add('error', 'missingAudio', cmd.id);
          break;
        case 'achievement':
          if (!/^[A-Za-z0-9_]+$/.test(cmd.achievementId)) add('warning', 'badAchievementId', cmd.id);
          break;
      }
    });

    if (!endsExplicitly(scene.commands)) {
      add('warning', 'noEnding');
    }
  }

  // Scenes nobody can reach.
  const reachable = new Set<string>();
  const byId = new Map(project.scenes.map((s) => [s.id, s]));
  const queue = [project.startSceneId];
  while (queue.length) {
    const id = queue.pop()!;
    if (reachable.has(id)) continue;
    const scene = byId.get(id);
    if (!scene) continue;
    reachable.add(id);
    queue.push(...sceneTargets(scene));
  }
  for (const scene of project.scenes) {
    if (!reachable.has(scene.id)) issues.push({ level: 'warning', sceneId: scene.id, code: 'unreachable' });
  }

  return issues;
}
