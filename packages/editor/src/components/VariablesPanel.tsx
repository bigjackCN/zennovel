import { useMemo } from 'react';
import { findUsages, valueType, type Project, type ValueType, type Variable } from '@zennovel/core';
import { actions } from '../state/projectActions';
import { useDialogs } from './Dialogs';
import { useEditorApi, type EditFn } from './EditorApi';
import { ValueInput } from './CommandCard';
import { useI18n } from '../i18n';

const TYPES: ValueType[] = ['number', 'boolean', 'string'];

export function VariablesPanel({ project, onEdit }: { project: Project; onEdit: EditFn }) {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const api = useEditorApi();
  const usage = useMemo(() => findUsages(project).variables, [project]);
  const update = (v: Variable, key?: string) => onEdit((p) => actions.updateVariable(p, v), key);

  async function remove(v: Variable) {
    const uses = usage.get(v.id) ?? 0;
    const ok = await dialogs.confirm(t.variables.deleteConfirm(v.name, uses), { okLabel: t.variables.delete, danger: true });
    if (!ok) return;
    onEdit((p) => actions.deleteVariable(p, v.id));
    api.notifyDeleted();
  }

  return (
    <section className="manager">
      <div className="manager-head">
        <h2>{t.variables.title}</h2>
        <button className="btn primary" onClick={() => void api.createVariable()}>
          {t.variables.add}
        </button>
      </div>
      <p className="hint">{t.variables.hint}</p>
      {project.variables.length === 0 ? (
        <p className="muted empty-state">{t.variables.empty}</p>
      ) : (
        <table className="var-table">
          <thead>
            <tr>
              <th>{t.variables.name}</th>
              <th>{t.variables.type}</th>
              <th>{t.variables.initial}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {project.variables.map((v) => {
              const type = valueType(v.initial);
              const uses = usage.get(v.id) ?? 0;
              return (
                <tr key={v.id}>
                  <td>
                    <input value={v.name} aria-label={t.variables.name} onChange={(e) => update({ ...v, name: e.target.value }, `var-name:${v.id}`)} />
                  </td>
                  <td>
                    <select
                      value={type}
                      aria-label={t.variables.type}
                      onChange={(e) => onEdit((p) => actions.changeVariableType(p, v.id, e.target.value as ValueType))}
                    >
                      {TYPES.map((ty) => (
                        <option key={ty} value={ty}>
                          {t.variables.types[ty]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <ValueInput type={type} value={v.initial} onChange={(initial, key) => update({ ...v, initial }, key && `var-initial:${v.id}`)} />
                  </td>
                  <td className="var-actions">
                    <span className="muted small">{uses ? t.variables.usedIn(uses) : t.variables.unused}</span>
                    <button className="link danger" onClick={() => void remove(v)}>
                      {t.variables.delete}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
