import type { Command, CommandType, Project, Scene } from '@zennovel/core';
import { actions, newCommand } from '../state/projectActions';
import { CommandCard } from './CommandCard';
import type { EditFn } from './EditorApi';
import { useI18n } from '../i18n';

const ADD_ORDER: CommandType[] = ['say', 'bg', 'show', 'hide', 'choice', 'jump', 'setVar', 'if', 'end'];

interface Props {
  project: Project;
  scene: Scene;
  commands: Command[];
  /** null = top level of the scene; otherwise the `if` this list belongs to. */
  parent: { ifId: string; branch: 'then' | 'else' } | null;
  onEdit: EditFn;
}

export function CommandList({ project, scene, commands, parent, onEdit }: Props) {
  const { t } = useI18n();
  function append(type: CommandType) {
    const cmd = newCommand(type, project, scene.id, t.card.optionN);
    onEdit((p) => actions.insertCommand(p, scene.id, cmd, { parentIfId: parent?.ifId ?? null, branch: parent?.branch }));
    focusLater(cmd.id);
  }

  return (
    <div className={parent ? 'command-list nested' : 'command-list'}>
      {commands.length === 0 && <p className="muted empty">{parent ? t.commands.emptyBranch : t.commands.emptyScene}</p>}
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
        <span className="muted">{t.commands.add}</span>
        {ADD_ORDER.map((type) => (
          <button key={type} className={`chip chip-${type}`} onClick={() => append(type)}>
            {t.commands.labels[type]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A card's main field: its text box if it has one (a line's text, not its speaker), else its first control. */
function firstField(commandId: string): HTMLElement | null {
  const card = `[data-command-id="${CSS.escape(commandId)}"]`;
  return (
    document.querySelector<HTMLElement>(`${card} textarea`) ??
    document.querySelector<HTMLElement>(`${card} input:not([type=checkbox]):not([type=color])`) ??
    document.querySelector<HTMLElement>(`${card} select`)
  );
}

/** Focus the first field of a newly added card once React has rendered it. */
export function focusLater(commandId: string) {
  window.requestAnimationFrame(() => firstField(commandId)?.focus());
}

/** Scroll a card into view and flash it (e.g. when clicking a story-check issue). */
export function revealCommand(commandId: string) {
  // Two frames: the scene may only be switching to this card's scene now.
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-command-id="${CSS.escape(commandId)}"]`);
      if (!card) return;
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card.classList.remove('flash');
      void card.offsetWidth; // restart the animation
      card.classList.add('flash');
      firstField(commandId)?.focus({ preventScroll: true });
    }),
  );
}
