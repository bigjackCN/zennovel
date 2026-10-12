import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  coerceValue,
  createId,
  defaultValue,
  valueType,
  type ChoiceCommand,
  type ChoiceOption,
  type Command,
  type CompareOp,
  type Comparison,
  type Condition,
  type Effect,
  type EffectOp,
  type Project,
  type Scene,
  type StagePosition,
  type ValueType,
  type VariableValue,
} from '@zennovel/core';
import { actions } from '../state/projectActions';
import { CommandList, focusLater } from './CommandList';
import { useEditorApi, type EditFn } from './EditorApi';
import { usePickImage } from './AssetsPanel';
import { useI18n } from '../i18n';

interface Props {
  project: Project;
  scene: Scene;
  command: Command;
  isFirst: boolean;
  isLast: boolean;
  onEdit: EditFn;
}

const COMPARE_LABELS: Record<CompareOp, string> = { '>=': '≥', '>': '>', '==': '=', '!=': '≠', '<': '<', '<=': '≤' };
/** Which comparisons and changes make sense for each kind of variable. */
const COMPARE_OPS: Record<ValueType, CompareOp[]> = {
  number: ['>=', '>', '==', '!=', '<', '<='],
  boolean: ['==', '!='],
  string: ['==', '!='],
};
const EFFECT_OPS: Record<ValueType, EffectOp[]> = {
  number: ['add', 'subtract', 'set'],
  boolean: ['set', 'toggle'],
  string: ['set'],
};

const NEW = '__new';
const UPLOAD = '__upload';
const COLOR = '__color';

function typeOf(project: Project, variableId: string): ValueType {
  const v = project.variables.find((x) => x.id === variableId);
  return v ? valueType(v.initial) : 'number';
}

/** Estimated textarea height: wrapped lines plus explicit line breaks. */
function textRows(text: string): number {
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 36)), 0);
}

export function CommandCard({ project, scene, command, isFirst, isLast, onEdit }: Props) {
  const { t } = useI18n();
  const api = useEditorApi();
  const pickImage = usePickImage(onEdit);
  /** `key` groups continuous typing into one undo step. */
  const update = (next: Command, key?: string) => onEdit((p) => actions.updateCommand(p, scene.id, next), key);

  let body: ReactNode = null;
  switch (command.type) {
    case 'say': {
      const character = project.characters.find((c) => c.id === command.characterId);
      body = (
        <div className="say">
          <CharacterSelect
            project={project}
            value={command.characterId ?? ''}
            allowNarrator
            className="speaker"
            style={character ? { color: character.color } : undefined}
            onChange={(id) => update({ ...command, characterId: id || undefined })}
          />
          <textarea
            rows={textRows(command.text)}
            value={command.text}
            placeholder={t.card.linePlaceholder}
            onChange={(e) => update({ ...command, text: e.target.value }, `text:${command.id}`)}
            onKeyDown={(e) => {
              // keyCode 229: Safari reports the Enter that confirms an IME
              // candidate (e.g. Chinese pinyin) with isComposing === false.
              const composing = e.nativeEvent.isComposing || e.keyCode === 229;
              if (e.key === 'Enter' && !e.shiftKey && !composing) {
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
      const bg = command.background;
      const current = bg.kind === 'image' ? images.find((a) => a.id === bg.assetId) : undefined;
      body = (
        <div className="row">
          {current && <img className="thumb" src={current.src} alt="" />}
          <select
            value={bg.kind === 'image' ? bg.assetId : COLOR}
            onChange={async (e) => {
              const value = e.target.value;
              if (value === UPLOAD) {
                const asset = await pickImage();
                if (asset) update({ ...command, background: { kind: 'image', assetId: asset.id } });
              } else {
                update({
                  ...command,
                  background: value === COLOR ? { kind: 'color', value: '#2b2d42' } : { kind: 'image', assetId: value },
                });
              }
            }}
          >
            {bg.kind === 'image' && !current && <option value={bg.assetId}>{t.card.missingImage}</option>}
            {images.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value={COLOR}>{t.card.solidColor}</option>
            <option value={UPLOAD}>{t.card.uploadImage}</option>
          </select>
          {bg.kind === 'color' && (
            <input
              type="color"
              value={bg.value}
              onChange={(e) =>
                update({ ...command, background: { kind: 'color', value: e.target.value } }, `bg:${command.id}`)
              }
            />
          )}
          <label className="inline">
            <input
              type="checkbox"
              checked={command.transition === 'fade'}
              onChange={(e) => update({ ...command, transition: e.target.checked ? 'fade' : 'none' })}
            />
            {t.card.fadeIn}
          </label>
        </div>
      );
      break;
    }

    case 'show': {
      const character = project.characters.find((c) => c.id === command.characterId);
      const expressions = Object.keys(character?.sprites ?? {});
      const sprite = character && project.assets.find((a) => a.id === character.sprites[command.expression]);
      body = (
        <div className="row">
          {sprite && <img className="thumb tall" src={sprite.src} alt="" />}
          <CharacterSelect
            project={project}
            value={command.characterId}
            onChange={(characterId) => {
              const ch = project.characters.find((c) => c.id === characterId);
              const keep = ch && command.expression in ch.sprites;
              update({
                ...command,
                characterId,
                expression: keep ? command.expression : (Object.keys(ch?.sprites ?? {})[0] ?? 'normal'),
              });
            }}
          />
          {character && expressions.length === 0 ? (
            <span className="muted">{t.card.noExpressions}</span>
          ) : (
            <select value={command.expression} onChange={(e) => update({ ...command, expression: e.target.value })}>
              {!expressions.includes(command.expression) && (
                <option value={command.expression}>{command.expression}</option>
              )}
              {expressions.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          )}
          <span className="muted">{t.card.at}</span>
          <select
            value={command.position}
            onChange={(e) => update({ ...command, position: e.target.value as StagePosition })}
          >
            {Object.entries(t.card.positions).map(([k, v]) => (
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
          <CharacterSelect
            project={project}
            value={command.characterId}
            onChange={(characterId) => update({ ...command, characterId })}
          />
          <span className="muted">{t.card.leavesStage}</span>
        </div>
      );
      break;

    case 'choice':
      body = <ChoiceEditor project={project} command={command} onChange={update} />;
      break;

    case 'jump':
      body = (
        <div className="row">
          <span className="muted">{t.card.goTo}</span>
          <SceneSelect
            scenes={project.scenes}
            value={command.targetSceneId}
            onChange={(targetSceneId) => update({ ...command, targetSceneId })}
          />
        </div>
      );
      break;

    case 'setVar':
      body = (
        <EffectEditor
          project={project}
          effect={command.effect}
          onChange={(effect, key) => update({ ...command, effect }, key && `${key}:${command.id}`)}
        />
      );
      break;

    case 'if':
      body = (
        <div className="if-block">
          <div className="row top">
            <span className="muted cond-label">{t.card.if}</span>
            <ConditionEditor
              project={project}
              condition={command.condition}
              onChange={(condition, key) => update({ ...command, condition }, key && `${key}:${command.id}`)}
            />
          </div>
          <div className="branch-label">{t.card.then}</div>
          <CommandList
            project={project}
            scene={scene}
            commands={command.then}
            parent={{ ifId: command.id, branch: 'then' }}
            onEdit={onEdit}
          />
          <div className="branch-label">{t.card.otherwise}</div>
          <CommandList
            project={project}
            scene={scene}
            commands={command.else}
            parent={{ ifId: command.id, branch: 'else' }}
            onEdit={onEdit}
          />
        </div>
      );
      break;

    case 'end':
      body = <div className="muted">{t.card.storyEnds}</div>;
      break;
  }

  return (
    <div className={`card card-${command.type}`} data-command-id={command.id}>
      <div className="card-head">
        <span className={`chip chip-${command.type}`}>{t.commands.labels[command.type]}</span>
        <div className="card-tools">
          <button
            title={t.commands.moveUp}
            disabled={isFirst}
            onClick={() => onEdit((p) => actions.moveCommand(p, scene.id, command.id, -1))}
          >
            ↑
          </button>
          <button
            title={t.commands.moveDown}
            disabled={isLast}
            onClick={() => onEdit((p) => actions.moveCommand(p, scene.id, command.id, 1))}
          >
            ↓
          </button>
          <button
            title={t.commands.delete}
            className="danger"
            onClick={() => {
              onEdit((p) => actions.removeCommand(p, scene.id, command.id));
              api.notifyDeleted();
            }}
          >
            ✕
          </button>
        </div>
      </div>
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CharacterSelect({
  project,
  value,
  onChange,
  allowNarrator,
  className,
  style,
}: {
  project: Project;
  value: string;
  onChange: (id: string) => void;
  /** Offer "Narrator" (value '') as the first option. */
  allowNarrator?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const { t } = useI18n();
  const api = useEditorApi();
  const known = project.characters.some((c) => c.id === value);
  return (
    <select
      className={className}
      style={style}
      value={value}
      onChange={async (e) => {
        if (e.target.value !== NEW) return onChange(e.target.value);
        const id = await api.createCharacter();
        if (id) onChange(id);
      }}
    >
      {allowNarrator && <option value="">{t.card.narrator}</option>}
      {!known && !(allowNarrator && value === '') && <option value={value}>{t.card.chooseCharacter}</option>}
      {project.characters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={NEW}>{t.card.newCharacter}</option>
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
  const { t } = useI18n();
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {allowContinue && <option value="">{t.card.continueBelow}</option>}
      {!allowContinue && !scenes.some((s) => s.id === value) && <option value={value}>{t.card.chooseScene}</option>}
      {scenes.map((s) => (
        <option key={s.id} value={s.id}>
          → {s.name || t.scenes.untitled}
        </option>
      ))}
    </select>
  );
}

function VariableSelect({
  project,
  value,
  onChange,
}: {
  project: Project;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const api = useEditorApi();
  return (
    <select
      value={value}
      onChange={async (e) => {
        if (e.target.value !== NEW) return onChange(e.target.value);
        const id = await api.createVariable();
        if (id) onChange(id);
      }}
    >
      {!project.variables.some((v) => v.id === value) && <option value={value}>{t.card.chooseVariable}</option>}
      {project.variables.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
      <option value={NEW}>{t.card.newVariable}</option>
    </select>
  );
}

/** Input for a variable value that matches its type: yes/no, a number, or text. */
export function ValueInput({
  type,
  value,
  onChange,
}: {
  type: ValueType;
  value: VariableValue | undefined;
  onChange: (v: VariableValue, key?: string) => void;
}) {
  const { t } = useI18n();
  if (type === 'boolean') {
    return (
      <select value={String(value === true)} onChange={(e) => onChange(e.target.value === 'true')}>
        <option value="true">{t.card.yes}</option>
        <option value="false">{t.card.no}</option>
      </select>
    );
  }
  if (type === 'number') return <NumberInput value={Number(value ?? 0)} onChange={(n) => onChange(n, 'value')} />;
  return (
    <input
      className="small-input wide-text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value, 'value')}
    />
  );
}

/** A number field that lets you type "-" or "1." on the way to a number. */
export function NumberInput({
  value,
  onChange,
  className = 'small-input',
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    // Resync only when the value changes from outside (undo, another field),
    // not on every keystroke: that would wipe a half-typed "-" or "1.".
    if (Number(draft) !== value) setDraft(String(value));
  }, [value]);
  return (
    <input
      className={className}
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

function EffectEditor({
  project,
  effect,
  onChange,
}: {
  project: Project;
  effect: Effect;
  onChange: (e: Effect, key?: string) => void;
}) {
  const { t } = useI18n();
  const type = typeOf(project, effect.variableId);
  const ops = EFFECT_OPS[type];
  return (
    <div className="row">
      <VariableSelect
        project={project}
        value={effect.variableId}
        onChange={(variableId) => {
          const nextType = typeOf(project, variableId);
          const op = EFFECT_OPS[nextType].includes(effect.op) ? effect.op : EFFECT_OPS[nextType][0]!;
          onChange({ variableId, op, value: coerceValue(effect.value, nextType) });
        }}
      />
      <select value={effect.op} onChange={(e) => onChange({ ...effect, op: e.target.value as EffectOp })}>
        {!ops.includes(effect.op) && <option value={effect.op}>{t.card.effectOps[effect.op]}</option>}
        {ops.map((op) => (
          <option key={op} value={op}>
            {t.card.effectOps[op]}
          </option>
        ))}
      </select>
      {effect.op !== 'toggle' && (
        <ValueInput
          type={type}
          value={effect.value ?? defaultValue(type)}
          onChange={(value, key) => onChange({ ...effect, value }, key)}
        />
      )}
    </div>
  );
}

function newComparison(project: Project): Comparison {
  const v = project.variables[0];
  const type = v ? valueType(v.initial) : 'number';
  return {
    kind: 'compare',
    variableId: v?.id ?? '',
    op: type === 'number' ? '>=' : '==',
    value: type === 'number' ? 1 : type === 'boolean' ? true : '',
  };
}

/** "If [Courage] ≥ [1]", or a group "all of / any of" these. Groups can nest. */
function ConditionEditor({
  project,
  condition,
  onChange,
}: {
  project: Project;
  condition: Condition;
  onChange: (c: Condition, key?: string) => void;
}) {
  const { t } = useI18n();

  if (condition.kind === 'compare') {
    const type = typeOf(project, condition.variableId);
    const ops = COMPARE_OPS[type];
    return (
      <div className="row">
        <VariableSelect
          project={project}
          value={condition.variableId}
          onChange={(variableId) => {
            const nextType = typeOf(project, variableId);
            const op = COMPARE_OPS[nextType].includes(condition.op) ? condition.op : '==';
            onChange({ ...condition, variableId, op, value: coerceValue(condition.value, nextType) });
          }}
        />
        <select value={condition.op} onChange={(e) => onChange({ ...condition, op: e.target.value as CompareOp })}>
          {!ops.includes(condition.op) && <option value={condition.op}>{COMPARE_LABELS[condition.op]}</option>}
          {ops.map((op) => (
            <option key={op} value={op}>
              {COMPARE_LABELS[op]}
            </option>
          ))}
        </select>
        <ValueInput
          type={type}
          value={condition.value}
          onChange={(value, key) => onChange({ ...condition, value }, key)}
        />
        <button
          className="link small"
          onClick={() => onChange({ kind: 'all', conditions: [condition, newComparison(project)] })}
        >
          {t.card.andOr}
        </button>
      </div>
    );
  }

  const setChild = (i: number, child: Condition, key?: string) =>
    onChange(
      { ...condition, conditions: condition.conditions.map((c, j) => (j === i ? child : c)) },
      key && `${key}:${i}`,
    );
  const removeChild = (i: number) => {
    const rest = condition.conditions.filter((_, j) => j !== i);
    // A group of one is just that condition.
    onChange(
      rest.length === 1 ? rest[0]! : rest.length === 0 ? newComparison(project) : { ...condition, conditions: rest },
    );
  };

  return (
    <div className="cond-group">
      <select
        value={condition.kind}
        onChange={(e) => onChange({ ...condition, kind: e.target.value as 'all' | 'any' })}
      >
        <option value="all">{t.card.allOf}</option>
        <option value="any">{t.card.anyOf}</option>
      </select>
      {condition.conditions.map((child, i) => (
        <div key={i} className="cond-item">
          <ConditionEditor project={project} condition={child} onChange={(c, key) => setChild(i, c, key)} />
          <button className="icon" title={t.card.remove} onClick={() => removeChild(i)}>
            ✕
          </button>
        </div>
      ))}
      <button
        className="link small"
        onClick={() => onChange({ ...condition, conditions: [...condition.conditions, newComparison(project)] })}
      >
        {t.card.addCondition}
      </button>
    </div>
  );
}

function ChoiceEditor({
  project,
  command,
  onChange,
}: {
  project: Project;
  command: ChoiceCommand;
  onChange: (c: ChoiceCommand, key?: string) => void;
}) {
  const { t } = useI18n();
  const api = useEditorApi();
  const setOption = (id: string, patch: Partial<ChoiceOption>, key?: string) =>
    onChange(
      { ...command, options: command.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) },
      key && `${key}:${id}`,
    );

  /**
   * The variable a new effect/condition starts with, and its type. If the
   * project has none yet, one is created (new variables are numbers).
   */
  async function firstVariable(): Promise<{ id: string; type: ValueType } | null> {
    const existing = project.variables[0];
    if (existing) return { id: existing.id, type: valueType(existing.initial) };
    const id = await api.createVariable();
    return id ? { id, type: 'number' } : null;
  }

  return (
    <div className="choice">
      <input
        className="wide"
        value={command.prompt ?? ''}
        placeholder={t.card.choicePrompt}
        onChange={(e) => onChange({ ...command, prompt: e.target.value || undefined }, `prompt:${command.id}`)}
      />
      {command.options.map((o, i) => (
        <div key={o.id} className="option">
          <span className="option-index">{i + 1}</span>
          <input className="wide" value={o.text} onChange={(e) => setOption(o.id, { text: e.target.value }, 'text')} />
          <SceneSelect
            scenes={project.scenes}
            value={o.targetSceneId}
            allowContinue
            onChange={(v) => setOption(o.id, { targetSceneId: v || undefined })}
          />
          <button
            className="icon danger"
            title={t.card.removeOption}
            onClick={() => onChange({ ...command, options: command.options.filter((x) => x.id !== o.id) })}
          >
            ✕
          </button>
          <div className="option-extra">
            {(o.effects ?? []).map((eff, j) => (
              <div key={j} className="row">
                <span className="muted">{t.card.whenPicked}</span>
                <EffectEditor
                  project={project}
                  effect={eff}
                  onChange={(next, key) =>
                    setOption(
                      o.id,
                      { effects: o.effects!.map((x, k) => (k === j ? next : x)) },
                      key && `effect${j}:${key}`,
                    )
                  }
                />
                <button
                  className="icon"
                  title={t.card.remove}
                  onClick={() => setOption(o.id, { effects: o.effects!.filter((_, k) => k !== j) })}
                >
                  ✕
                </button>
              </div>
            ))}
            {o.condition && (
              <div className="row top">
                <span className="muted">{t.card.onlyShowIf}</span>
                <ConditionEditor
                  project={project}
                  condition={o.condition}
                  onChange={(condition, key) => setOption(o.id, { condition }, key && `cond:${key}`)}
                />
                <button
                  className="icon"
                  title={t.card.remove}
                  onClick={() => setOption(o.id, { condition: undefined })}
                >
                  ✕
                </button>
              </div>
            )}
            <div className="row">
              <button
                className="link"
                onClick={async () => {
                  const v = await firstVariable();
                  if (!v) return;
                  const effect: Effect = {
                    variableId: v.id,
                    op: EFFECT_OPS[v.type][0]!,
                    value: v.type === 'number' ? 1 : defaultValue(v.type),
                  };
                  setOption(o.id, { effects: [...(o.effects ?? []), effect] });
                }}
              >
                {t.card.changeVariable}
              </button>
              {!o.condition && (
                <button
                  className="link"
                  onClick={async () => {
                    const v = await firstVariable();
                    if (!v) return;
                    const condition: Comparison =
                      v.type === 'number'
                        ? { kind: 'compare', variableId: v.id, op: '>=', value: 1 }
                        : { kind: 'compare', variableId: v.id, op: '==', value: v.type === 'boolean' ? true : '' };
                    setOption(o.id, { condition });
                  }}
                >
                  {t.card.showCondition}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      <button
        className="link"
        onClick={() =>
          onChange({ ...command, options: [...command.options, { id: createId('opt'), text: t.card.newOption }] })
        }
      >
        {t.card.addOption}
      </button>
    </div>
  );
}
