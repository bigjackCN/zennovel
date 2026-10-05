import type { Command, Condition, Effect, Project, Scene } from './types';

export type IssueLevel = 'error' | 'warning';

export interface StoryIssue {
  level: IssueLevel;
  sceneId: string;
  commandId?: string;
  message: string;
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
  if (last.type === 'choice') return last.options.length > 0 && last.options.every((o) => o.targetSceneId);
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
  const variableIds = new Set(project.variables.map((v) => v.id));

  if (!sceneIds.has(project.startSceneId)) {
    issues.push({ level: 'error', sceneId: project.startSceneId, message: 'No start scene is set' });
  }

  for (const scene of project.scenes) {
    const add = (level: IssueLevel, message: string, commandId?: string) =>
      issues.push({ level, sceneId: scene.id, commandId, message });

    const checkEffects = (effects: Effect[] | undefined, commandId: string) => {
      for (const e of effects ?? []) {
        if (!variableIds.has(e.variableId)) add('error', 'Uses a variable that does not exist', commandId);
      }
    };
    const checkCondition = (c: Condition | undefined, commandId: string) => {
      if (!c) return;
      for (const id of conditionVariables(c)) {
        if (!variableIds.has(id)) add('error', 'A condition uses a variable that does not exist', commandId);
      }
    };

    walkCommands(scene.commands, (cmd) => {
      switch (cmd.type) {
        case 'bg':
          if (cmd.background.kind === 'image' && !assetIds.has(cmd.background.assetId)) {
            add('error', 'The background image is missing', cmd.id);
          }
          break;
        case 'show': {
          const ch = characters.get(cmd.characterId);
          if (!ch) add('error', 'The character to show does not exist', cmd.id);
          else if (!ch.sprites[cmd.expression]) add('warning', `${ch.name} has no "${cmd.expression}" expression`, cmd.id);
          break;
        }
        case 'hide':
          if (!characters.has(cmd.characterId)) add('error', 'The character to hide does not exist', cmd.id);
          break;
        case 'say':
          if (cmd.characterId && !characters.has(cmd.characterId)) add('error', 'The speaking character does not exist', cmd.id);
          if (!cmd.text.trim()) add('warning', 'A line is empty', cmd.id);
          break;
        case 'choice':
          if (cmd.options.length === 0) add('error', 'A choice has no options', cmd.id);
          for (const opt of cmd.options) {
            if (opt.targetSceneId && !sceneIds.has(opt.targetSceneId)) {
              add('error', `Option "${opt.text}" points to a scene that does not exist`, cmd.id);
            }
            checkCondition(opt.condition, cmd.id);
            checkEffects(opt.effects, cmd.id);
          }
          break;
        case 'jump':
          if (!sceneIds.has(cmd.targetSceneId)) add('error', 'Jump target scene does not exist', cmd.id);
          break;
        case 'setVar':
          checkEffects([cmd.effect], cmd.id);
          break;
        case 'if':
          checkCondition(cmd.condition, cmd.id);
          break;
      }
    });

    if (!endsExplicitly(scene.commands)) {
      add('warning', 'Scene has no jump or End at the end, so the story will stop here');
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
    if (!reachable.has(scene.id)) issues.push({ level: 'warning', sceneId: scene.id, message: 'No path leads to this scene' });
  }

  return issues;
}
