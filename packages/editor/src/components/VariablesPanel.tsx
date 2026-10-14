import { Fragment, useMemo, useState } from 'react';
import {
  findUsages,
  valueType,
  type Project,
  type ValueType,
  type Variable,
  type VariableDisplay,
} from '@zennovel/core';
import { actions } from '../state/projectActions';
import { useDialogs } from './Dialogs';
import { useEditorApi, type EditFn } from './EditorApi';
import { NumberInput, ValueInput } from './CommandCard';
import { useI18n } from '../i18n';

const TYPES: ValueType[] = ['number', 'boolean', 'string'];

export function VariablesPanel({ project, onEdit }: { project: Project; onEdit: EditFn }) {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const api = useEditorApi();
  const usage = useMemo(() => findUsages(project).variables, [project]);
  const update = (v: Variable, key?: string) => onEdit((p) => actions.updateVariable(p, v), key);
  /** Number variables whose on-screen / countdown settings are open. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function remove(v: Variable) {
    const uses = usage.get(v.id) ?? 0;
    const ok = await dialogs.confirm(t.variables.deleteConfirm(v.name, uses), {
      okLabel: t.variables.delete,
      danger: true,
    });
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
              const settings = type === 'number' && (open.has(v.id) || v.display || v.perSecond);
              return (
                <Fragment key={v.id}>
                  <tr>
                    <td>
                      <input
                        value={v.name}
                        aria-label={t.variables.name}
                        onChange={(e) => update({ ...v, name: e.target.value }, `var-name:${v.id}`)}
                      />
                    </td>
                    <td>
                      <select
                        value={type}
                        aria-label={t.variables.type}
                        onChange={(e) =>
                          onEdit((p) => actions.changeVariableType(p, v.id, e.target.value as ValueType))
                        }
                      >
                        {TYPES.map((ty) => (
                          <option key={ty} value={ty}>
                            {t.variables.types[ty]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <ValueInput
                        type={type}
                        value={v.initial}
                        onChange={(initial, key) => update({ ...v, initial }, key && `var-initial:${v.id}`)}
                      />
                    </td>
                    <td className="var-actions">
                      <span className="muted small">{uses ? t.variables.usedIn(uses) : t.variables.unused}</span>
                      {type === 'number' && !settings && (
                        <button className="link" onClick={() => toggle(v.id)}>
                          {t.variables.screen}
                        </button>
                      )}
                      <button className="link danger" onClick={() => void remove(v)}>
                        {t.variables.delete}
                      </button>
                    </td>
                  </tr>
                  {settings && (
                    <tr className="var-extra">
                      <td colSpan={4}>
                        <div className="row">
                          <span className="muted">{t.variables.display}</span>
                          <select
                            value={v.display?.style ?? 'none'}
                            onChange={(e) => {
                              const style = e.target.value as VariableDisplay['style'] | 'none';
                              update({
                                ...v,
                                display: style === 'none' ? undefined : { corner: 'top-left', ...v.display, style },
                              });
                            }}
                          >
                            {(Object.keys(t.variables.displays) as (keyof typeof t.variables.displays)[]).map((k) => (
                              <option key={k} value={k}>
                                {t.variables.displays[k]}
                              </option>
                            ))}
                          </select>
                          {v.display && (
                            <select
                              value={v.display.corner}
                              onChange={(e) =>
                                update({
                                  ...v,
                                  display: { ...v.display!, corner: e.target.value as VariableDisplay['corner'] },
                                })
                              }
                            >
                              {(Object.keys(t.variables.corners) as VariableDisplay['corner'][]).map((k) => (
                                <option key={k} value={k}>
                                  {t.variables.corners[k]}
                                </option>
                              ))}
                            </select>
                          )}
                          {v.display?.style === 'bar' && (
                            <>
                              <span className="muted">{t.variables.max}</span>
                              <NumberInput
                                value={
                                  v.display.max ?? (typeof v.initial === 'number' && v.initial > 0 ? v.initial : 100)
                                }
                                onChange={(max) =>
                                  max > 0 && update({ ...v, display: { ...v.display!, max } }, `var-max:${v.id}`)
                                }
                              />
                            </>
                          )}
                        </div>
                        <div className="row">
                          <span className="muted">{t.variables.perSecond}</span>
                          <NumberInput
                            value={v.perSecond ?? 0}
                            onChange={(n) =>
                              n >= 0 && update({ ...v, perSecond: n > 0 ? n : undefined }, `var-tick:${v.id}`)
                            }
                          />
                          <span className="muted small">{t.variables.perSecondHint}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
