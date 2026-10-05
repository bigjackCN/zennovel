import type { Command, CommandType, Project, Scene } from '@zennovel/core';
import { actions, newCommand } from '../state/projectActions';
import { CommandCard } from './CommandCard';

export const COMMAND_LABELS: Record<CommandType, string> = {
  say: 'Line',
  bg: 'Background',
  show: 'Show character',
  hide: 'Hide character',
  choice: 'Choice',
  jump: 'Jump',
  setVar: 'Variable',
  if: 'If / else',
  end: 'End',
};

const ADD_ORDER: CommandType[] = ['say', 'bg', 'show', 'hide', 'choice', 'jump', 'setVar', 'if', 'end'];

interface Props {
  project: Project;
  scene: Scene;
  commands: Command[];
  /** null = top level of the scene; otherwise the `if` this list belongs to. */
  parent: { ifId: string; branch: 'then' | 'else' } | null;
  onEdit: (fn: (p: Project) => Project) => void;
}

export function CommandList({ project, scene, commands, parent, onEdit }: Props) {
  function append(type: CommandType) {
    const cmd = newCommand(type, project, scene.id);
    onEdit((p) =>
      actions.insertCommand(p, scene.id, cmd, { parentIfId: parent?.ifId ?? null, branch: parent?.branch }),
    );
    focusLater(cmd.id);
  }

  return (
    <div className={parent ? 'command-list nested' : 'command-list'}>
      {commands.length === 0 && <p className="muted empty">{parent ? '(empty)' : 'This scene is empty. Add the first step below.'}</p>}
      {commands.map((cmd, i) => (
        <CommandCard
          key={cmd.id}
          project={project}
          scene={scene}
          command={cmd}
          isFirst={i === 0}
          isLast={i === commands.length - 1}
          onEdit={onEdit}
        />
      ))}
      <div className="add-bar">
        <span className="muted">Add:</span>
        {ADD_ORDER.filter((t) => !(parent && t === 'if')).map((t) => (
          <button key={t} className={`chip chip-${t}`} onClick={() => append(t)}>
            {COMMAND_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Focus the first input of a newly added card once React has rendered it. */
export function focusLater(commandId: string) {
  window.requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-command-id="${commandId}"] textarea, [data-command-id="${commandId}"] input`);
    el?.focus();
  });
}
