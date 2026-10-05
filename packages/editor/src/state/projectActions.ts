import { createId, type Command, type CommandType, type Locale, type Project, type Scene, type Theme } from '@zennovel/core';

/**
 * All edits go through these pure functions (old project in, new project out).
 * That keeps undo/redo trivial to add later: just keep a stack of projects.
 */

function touch(p: Project): Project {
  return { ...p, meta: { ...p.meta, updatedAt: new Date().toISOString() } };
}

function mapScene(p: Project, sceneId: string, fn: (s: Scene) => Scene): Project {
  return touch({ ...p, scenes: p.scenes.map((s) => (s.id === sceneId ? fn(s) : s)) });
}

/** Apply `fn` to the command list that contains `commandId`, at any depth. */
function mapListContaining(
  commands: Command[],
  commandId: string,
  fn: (list: Command[], index: number) => Command[],
): Command[] {
  const index = commands.findIndex((c) => c.id === commandId);
  if (index >= 0) return fn(commands, index);
  return commands.map((c) =>
    c.type === 'if'
      ? { ...c, then: mapListContaining(c.then, commandId, fn), else: mapListContaining(c.else, commandId, fn) }
      : c,
  );
}

/** `optionLabel` names the default options of a new choice, e.g. n => `Option ${n}`. */
export function newCommand(
  type: CommandType,
  project: Project,
  sceneId: string,
  optionLabel: (n: number) => string,
): Command {
  const id = createId('cmd');
  const firstCharacter = project.characters[0]?.id;
  const firstVariable = project.variables[0]?.id ?? '';
  const otherScene = project.scenes.find((s) => s.id !== sceneId)?.id ?? sceneId;
  switch (type) {
    case 'say':
      return { id, type, text: '' };
    case 'bg': {
      const img = project.assets.find((a) => a.kind === 'image');
      return {
        id,
        type,
        background: img ? { kind: 'image', assetId: img.id } : { kind: 'color', value: '#2b2d42' },
        transition: 'fade',
      };
    }
    case 'show': {
      const ch = project.characters[0];
      return {
        id,
        type,
        characterId: ch?.id ?? '',
        expression: Object.keys(ch?.sprites ?? {})[0] ?? 'normal',
        position: 'center',
      };
    }
    case 'hide':
      return { id, type, characterId: firstCharacter ?? '' };
    case 'choice':
      return {
        id,
        type,
        options: [
          { id: createId('opt'), text: optionLabel(1) },
          { id: createId('opt'), text: optionLabel(2) },
        ],
      };
    case 'jump':
      return { id, type, targetSceneId: otherScene };
    case 'setVar':
      return { id, type, effect: { variableId: firstVariable, op: 'add', value: 1 } };
    case 'if':
      return {
        id,
        type,
        condition: { kind: 'compare', variableId: firstVariable, op: '>=', value: 1 },
        then: [],
        else: [],
      };
    case 'end':
      return { id, type };
  }
}

export const actions = {
  updateCommand(p: Project, sceneId: string, command: Command): Project {
    return mapScene(p, sceneId, (s) => ({
      ...s,
      commands: mapListContaining(s.commands, command.id, (list, i) => list.map((c, j) => (j === i ? command : c))),
    }));
  },

  /** Insert after `afterId`; when afterId is null, append to the given list. */
  insertCommand(
    p: Project,
    sceneId: string,
    command: Command,
    where: { afterId: string } | { parentIfId: string | null; branch?: 'then' | 'else' },
  ): Project {
    return mapScene(p, sceneId, (s) => {
      if ('afterId' in where) {
        return {
          ...s,
          commands: mapListContaining(s.commands, where.afterId, (list, i) => [
            ...list.slice(0, i + 1),
            command,
            ...list.slice(i + 1),
          ]),
        };
      }
      if (!where.parentIfId) return { ...s, commands: [...s.commands, command] };
      const branch = where.branch ?? 'then';
      return {
        ...s,
        commands: mapListContaining(s.commands, where.parentIfId, (list, i) =>
          list.map((c, j) => (j === i && c.type === 'if' ? { ...c, [branch]: [...c[branch], command] } : c)),
        ),
      };
    });
  },

  removeCommand(p: Project, sceneId: string, commandId: string): Project {
    return mapScene(p, sceneId, (s) => ({
      ...s,
      commands: mapListContaining(s.commands, commandId, (list, i) => list.filter((_, j) => j !== i)),
    }));
  },

  moveCommand(p: Project, sceneId: string, commandId: string, delta: -1 | 1): Project {
    return mapScene(p, sceneId, (s) => ({
      ...s,
      commands: mapListContaining(s.commands, commandId, (list, i) => {
        const j = i + delta;
        if (j < 0 || j >= list.length) return list;
        const next = [...list];
        [next[i], next[j]] = [next[j]!, next[i]!];
        return next;
      }),
    }));
  },

  addScene(p: Project, sceneId: string, name: string): Project {
    const scene: Scene = { id: sceneId, name, commands: [] };
    return touch({ ...p, scenes: [...p.scenes, scene] });
  },

  renameScene(p: Project, sceneId: string, name: string): Project {
    return mapScene(p, sceneId, (s) => ({ ...s, name }));
  },

  deleteScene(p: Project, sceneId: string): Project {
    if (p.scenes.length <= 1) return p;
    const scenes = p.scenes.filter((s) => s.id !== sceneId);
    return touch({
      ...p,
      scenes,
      startSceneId: p.startSceneId === sceneId ? scenes[0]!.id : p.startSceneId,
    });
  },

  setStartScene(p: Project, sceneId: string): Project {
    return touch({ ...p, startSceneId: sceneId });
  },

  updateTheme(p: Project, theme: Theme): Project {
    return touch({ ...p, theme });
  },

  setGameLocale(p: Project, locale: Locale): Project {
    return touch({ ...p, meta: { ...p.meta, locale } });
  },

  renameProject(p: Project, name: string): Project {
    return touch({ ...p, meta: { ...p.meta, name } });
  },
};
