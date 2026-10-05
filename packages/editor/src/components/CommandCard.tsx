import type { ReactNode } from 'react';
import type {
  ChoiceCommand,
  Command,
  CompareOp,
  Condition,
  Effect,
  EffectOp,
  Project,
  Scene,
  StagePosition,
  VariableValue,
} from '@zennovel/core';
import { createId } from '@zennovel/core';
import { actions } from '../state/projectActions';
import { COMMAND_LABELS, CommandList, focusLater } from './CommandList';

interface Props {
  project: Project;
  scene: Scene;
  command: Command;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (fn: (p: Project) => Project) => void;
}

const POSITIONS: Record<StagePosition, string> = { left: 'left', center: 'center', right: 'right' };
const COMPARE_OPS: Record<CompareOp, string> = { '>=': '≥', '>': '>', '==': '=', '!=': '≠', '<': '<', '<=': '≤' };
const EFFECT_OPS: Record<EffectOp, string> = { add: 'add', subtract: 'subtract', set: 'set to', toggle: 'toggle' };

function parseValue(raw: string): VariableValue {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  return raw.trim() !== '' && !Number.isNaN(n) ? n : raw;
}

export function CommandCard({ project, scene, command, isFirst, isLast, onEdit }: Props) {
  const update = (next: Command) => onEdit((p) => actions.updateCommand(p, scene.id, next));
  const otherScenes = project.scenes;

  let body: ReactNode = null;
  switch (command.type) {
    case 'say': {
      const character = project.characters.find((c) => c.id === command.characterId);
      body = (
        <div className="say">
          <select
            className="speaker"
            value={command.characterId ?? ''}
            style={character ? { color: character.color } : undefined}
            onChange={(e) => update({ ...command, characterId: e.target.value || undefined })}
          >
            <option value="">Narrator</option>
            {project.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <textarea
            rows={Math.max(1, Math.ceil(command.text.length / 36))}
            value={command.text}
            placeholder="Type a line. Enter for the next line, Shift+Enter for a line break."
            onChange={(e) => update({ ...command, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                const next: Command = { id: createId('cmd'), type: 'say', characterId: command.characterId, text: '' };
                onEdit((p) => actions.insertCommand(p, scene.id, next, { afterId: command.id }));
                focusLater(next.id);
              }
            }}
          />
        </div>
      );
      break;
    }

    case 'bg': {
      const images = project.assets.filter((a) => a.kind === 'image');
      const isColor = command.background.kind === 'color';
      body = (
        <div className="row">
          <select
            value={command.background.kind === 'image' ? command.background.assetId : '__color'}
            onChange={(e) =>
              update({
                ...command,
                background:
                  e.target.value === '__color'
                    ? { kind: 'color', value: '#2b2d42' }
                    : { kind: 'image', assetId: e.target.value },
              })
            }
          >
            {images.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="__color">Solid color</option>
          </select>
          {isColor && command.background.kind === 'color' && (
            <input
              type="color"
              value={command.background.value}
              onChange={(e) => update({ ...command, background: { kind: 'color', value: e.target.value } })}
            />
          )}
          <label className="inline">
            <input
              type="checkbox"
              checked={command.transition === 'fade'}
              onChange={(e) => update({ ...command, transition: e.target.checked ? 'fade' : 'none' })}
            />
            Fade in
          </label>
        </div>
      );
      break;
    }

    case 'show': {
      const character = project.characters.find((c) => c.id === command.characterId);
      body = (
        <div className="row">
          <CharacterSelect project={project} value={command.characterId} onChange={(characterId) => update({ ...command, characterId })} />
          <select value={command.expression} onChange={(e) => update({ ...command, expression: e.target.value })}>
            {Object.keys(character?.sprites ?? { [command.expression]: '' }).map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <span className="muted">at</span>
          <select value={command.position} onChange={(e) => update({ ...command, position: e.target.value as StagePosition })}>
            {Object.entries(POSITIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      );
      break;
    }

    case 'hide':
      body = (
        <div className="row">
          <CharacterSelect project={project} value={command.characterId} onChange={(characterId) => update({ ...command, characterId })} />
          <span className="muted">leaves the stage</span>
        </div>
      );
      break;

    case 'choice':
      body = <ChoiceEditor project={project} command={command} onChange={update} />;
      break;

    case 'jump':
      body = (
        <div className="row">
          <span className="muted">Go to</span>
          <SceneSelect scenes={otherScenes} value={command.targetSceneId} onChange={(targetSceneId) => update({ ...command, targetSceneId })} />
        </div>
      );
      break;

    case 'setVar':
      body = <EffectEditor project={project} effect={command.effect} onChange={(effect) => update({ ...command, effect })} />;
      break;

    case 'if':
      body = (
        <div className="if-block">
          <div className="row">
            <span className="muted">If</span>
            <ConditionEditor project={project} condition={command.condition} onChange={(condition) => update({ ...command, condition })} />
          </div>
          <div className="branch-label">Then:</div>
          <CommandList project={project} scene={scene} commands={command.then} parent={{ ifId: command.id, branch: 'then' }} onEdit={onEdit} />
          <div className="branch-label">Otherwise:</div>
          <CommandList project={project} scene={scene} commands={command.else} parent={{ ifId: command.id, branch: 'else' }} onEdit={onEdit} />
        </div>
      );
      break;

    case 'end':
      body = <div className="muted">The story ends here</div>;
      break;
  }

  return (
    <div className={`card card-${command.type}`} data-command-id={command.id}>
      <div className="card-head">
        <span className={`chip chip-${command.type}`}>{COMMAND_LABELS[command.type]}</span>
        <div className="card-tools">
          <button title="Move up" disabled={isFirst} onClick={() => onEdit((p) => actions.moveCommand(p, scene.id, command.id, -1))}>
            ↑
          </button>
          <button title="Move down" disabled={isLast} onClick={() => onEdit((p) => actions.moveCommand(p, scene.id, command.id, 1))}>
            ↓
          </button>
          <button title="Delete" className="danger" onClick={() => onEdit((p) => actions.removeCommand(p, scene.id, command.id))}>
            ✕
          </button>
        </div>
      </div>
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CharacterSelect({ project, value, onChange }: { project: Project; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!project.characters.some((c) => c.id === value) && <option value={value}>(choose a character)</option>}
      {project.characters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function SceneSelect({
  scenes,
  value,
  onChange,
  allowContinue,
}: {
  scenes: Scene[];
  value: string | undefined;
  onChange: (id: string) => void;
  allowContinue?: boolean;
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {allowContinue && <option value="">Continue below</option>}
      {!allowContinue && !scenes.some((s) => s.id === value) && <option value={value}>(choose a scene)</option>}
      {scenes.map((s) => (
        <option key={s.id} value={s.id}>
          → {s.name}
        </option>
      ))}
    </select>
  );
}

function VariableSelect({ project, value, onChange }: { project: Project; value: string; onChange: (id: string) => void }) {
  if (project.variables.length === 0) return <span className="muted">(this project has no variables yet)</span>;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!project.variables.some((v) => v.id === value) && <option value={value}>(choose a variable)</option>}
      {project.variables.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  );
}

function EffectEditor({ project, effect, onChange }: { project: Project; effect: Effect; onChange: (e: Effect) => void }) {
  return (
    <div className="row">
      <VariableSelect project={project} value={effect.variableId} onChange={(variableId) => onChange({ ...effect, variableId })} />
      <select value={effect.op} onChange={(e) => onChange({ ...effect, op: e.target.value as EffectOp })}>
        {Object.entries(EFFECT_OPS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {effect.op !== 'toggle' && (
        <input className="small-input" value={String(effect.value ?? '')} onChange={(e) => onChange({ ...effect, value: parseValue(e.target.value) })} />
      )}
    </div>
  );
}

function ConditionEditor({ project, condition, onChange }: { project: Project; condition: Condition; onChange: (c: Condition) => void }) {
  if (condition.kind !== 'compare') return <span className="muted">(combined condition: not editable here yet)</span>;
  return (
    <>
      <VariableSelect project={project} value={condition.variableId} onChange={(variableId) => onChange({ ...condition, variableId })} />
      <select value={condition.op} onChange={(e) => onChange({ ...condition, op: e.target.value as CompareOp })}>
        {Object.entries(COMPARE_OPS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <input className="small-input" value={String(condition.value)} onChange={(e) => onChange({ ...condition, value: parseValue(e.target.value) })} />
    </>
  );
}

function ChoiceEditor({ project, command, onChange }: { project: Project; command: ChoiceCommand; onChange: (c: ChoiceCommand) => void }) {
  const setOption = (id: string, patch: Partial<ChoiceCommand['options'][number]>) =>
    onChange({ ...command, options: command.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  return (
    <div className="choice">
      <input
        className="wide"
        value={command.prompt ?? ''}
        placeholder="Question text (optional), e.g. Where should we go?"
        onChange={(e) => onChange({ ...command, prompt: e.target.value || undefined })}
      />
      {command.options.map((o, i) => (
        <div key={o.id} className="option">
          <span className="option-index">{i + 1}</span>
          <input className="wide" value={o.text} onChange={(e) => setOption(o.id, { text: e.target.value })} />
          <SceneSelect scenes={project.scenes} value={o.targetSceneId} allowContinue onChange={(v) => setOption(o.id, { targetSceneId: v || undefined })} />
          <button
            className="icon danger"
            title="Remove this option"
            onClick={() => onChange({ ...command, options: command.options.filter((x) => x.id !== o.id) })}
          >
            ✕
          </button>
          <div className="option-extra">
            {(o.effects ?? []).map((eff, j) => (
              <div key={j} className="row">
                <span className="muted">When picked:</span>
                <EffectEditor
                  project={project}
                  effect={eff}
                  onChange={(next) => setOption(o.id, { effects: o.effects!.map((x, k) => (k === j ? next : x)) })}
                />
                <button className="icon" title="Remove" onClick={() => setOption(o.id, { effects: o.effects!.filter((_, k) => k !== j) })}>
                  ✕
                </button>
              </div>
            ))}
            {o.condition && (
              <div className="row">
                <span className="muted">Only show if:</span>
                <ConditionEditor project={project} condition={o.condition} onChange={(condition) => setOption(o.id, { condition })} />
                <button className="icon" title="Remove" onClick={() => setOption(o.id, { condition: undefined })}>
                  ✕
                </button>
              </div>
            )}
            {project.variables.length > 0 && (
              <div className="row">
                <button
                  className="link"
                  onClick={() =>
                    setOption(o.id, {
                      effects: [...(o.effects ?? []), { variableId: project.variables[0]!.id, op: 'add', value: 1 }],
                    })
                  }
                >
                  + Change a variable
                </button>
                {!o.condition && (
                  <button
                    className="link"
                    onClick={() =>
                      setOption(o.id, { condition: { kind: 'compare', variableId: project.variables[0]!.id, op: '>=', value: 1 } })
                    }
                  >
                    + Show condition
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
      <button className="link" onClick={() => onChange({ ...command, options: [...command.options, { id: createId('opt'), text: 'New option' }] })}>
        + Add option
      </button>
    </div>
  );
}
