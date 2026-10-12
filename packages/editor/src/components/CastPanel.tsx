import { useEffect, useMemo, useState } from 'react';
import { findUsages, type Character, type Project } from '@zennovel/core';
import { actions } from '../state/projectActions';
import { useDialogs } from './Dialogs';
import { useEditorApi, type EditFn } from './EditorApi';
import { usePickImage } from './AssetsPanel';
import { useI18n } from '../i18n';

const UPLOAD = '__upload';

/** A name that isn't already one of `taken`: "happy", "happy 2", "happy 3"… */
function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`;
}

export function CastPanel({ project, onEdit }: { project: Project; onEdit: EditFn }) {
  const { t } = useI18n();
  const api = useEditorApi();
  const usage = useMemo(() => findUsages(project).characters, [project]);
  return (
    <section className="manager">
      <div className="manager-head">
        <h2>{t.cast.title}</h2>
        <button className="btn primary" onClick={() => void api.createCharacter()}>
          {t.cast.add}
        </button>
      </div>
      <p className="hint">{t.cast.hint}</p>
      {project.characters.length === 0 ? (
        <p className="muted empty-state">{t.cast.empty}</p>
      ) : (
        project.characters.map((c) => <CharacterCard key={c.id} project={project} character={c} uses={usage.get(c.id) ?? 0} onEdit={onEdit} />)
      )}
    </section>
  );
}

function CharacterCard({ project, character, uses, onEdit }: { project: Project; character: Character; uses: number; onEdit: EditFn }) {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const api = useEditorApi();
  const pickImage = usePickImage(onEdit);
  const images = project.assets.filter((a) => a.kind === 'image');
  const update = (next: Character, key?: string) => onEdit((p) => actions.updateCharacter(p, next), key);
  const expressions = Object.entries(character.sprites);

  async function addExpression() {
    const asset = await pickImage();
    if (!asset) return;
    const name = uniqueName(expressions.length === 0 ? t.cast.defaultExpression : asset.name || t.cast.defaultExpression, Object.keys(character.sprites));
    // Read the latest character inside the edit: pickImage has just added the asset.
    onEdit((p) => {
      const latest = p.characters.find((c) => c.id === character.id);
      return latest ? actions.updateCharacter(p, { ...latest, sprites: { ...latest.sprites, [name]: asset.id } }) : p;
    });
  }

  async function remove() {
    const ok = await dialogs.confirm(t.cast.deleteConfirm(character.name, uses), { okLabel: t.cast.delete, danger: true });
    if (!ok) return;
    onEdit((p) => actions.deleteCharacter(p, character.id));
    api.notifyDeleted();
  }

  return (
    <div className="manager-card">
      <div className="row">
        <input
          type="color"
          className="color-input"
          value={/^#[0-9a-f]{6}$/i.test(character.color) ? character.color : '#888888'}
          title={t.cast.color}
          onChange={(e) => update({ ...character, color: e.target.value }, `color:${character.id}`)}
        />
        <input
          className="name-input"
          value={character.name}
          aria-label={t.cast.name}
          style={{ color: character.color }}
          onChange={(e) => update({ ...character, name: e.target.value }, `name:${character.id}`)}
        />
        <span className="muted small">{uses ? t.cast.usedIn(uses) : t.cast.unused}</span>
        <span className="spacer" />
        <button className="link danger" onClick={() => void remove()}>
          {t.cast.delete}
        </button>
      </div>

      <div className="expression-grid">
        {expressions.map(([name, assetId]) => {
          const asset = images.find((a) => a.id === assetId);
          return (
            <div key={name} className="expression">
              <div className="expression-thumb">{asset ? <img src={asset.src} alt="" /> : <span className="muted">?</span>}</div>
              <ExpressionName
                name={name}
                taken={Object.keys(character.sprites)}
                onRename={(to) => onEdit((p) => actions.renameExpression(p, character.id, name, to))}
              />
              <select
                value={asset ? assetId : ''}
                aria-label={t.cast.image}
                onChange={async (e) => {
                  let next = e.target.value;
                  if (next === UPLOAD) {
                    const uploaded = await pickImage();
                    if (!uploaded) return;
                    next = uploaded.id;
                  }
                  onEdit((p) => {
                    const latest = p.characters.find((c) => c.id === character.id);
                    return latest ? actions.updateCharacter(p, { ...latest, sprites: { ...latest.sprites, [name]: next } }) : p;
                  });
                }}
              >
                {!asset && <option value="">{t.cast.noImage}</option>}
                {images.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value={UPLOAD}>{t.card.uploadImage}</option>
              </select>
              <button
                className="icon danger"
                title={t.cast.removeExpression}
                onClick={() => {
                  const { [name]: _removed, ...rest } = character.sprites;
                  update({ ...character, sprites: rest });
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
        <button className="expression add" onClick={() => void addExpression()}>
          <span>+</span>
          {t.cast.addExpression}
        </button>
      </div>
    </div>
  );
}

/** Expression names are renamed on blur/Enter, so half-typed names never clash or rewrite the story. */
function ExpressionName({ name, taken, onRename }: { name: string; taken: string[]; onRename: (to: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const trimmed = draft.trim();
  const invalid = trimmed !== name && (!trimmed || taken.includes(trimmed));
  const commit = () => {
    if (invalid) setDraft(name);
    else if (trimmed !== name) onRename(trimmed);
  };
  return (
    <input
      className={invalid ? 'invalid' : ''}
      value={draft}
      aria-label={t.cast.expressionName}
      title={invalid ? t.cast.nameTaken : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(name);
      }}
    />
  );
}
