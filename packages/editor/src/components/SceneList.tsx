import { createId, type Project, type StoryIssue } from '@zennovel/core';
import { actions } from '../state/projectActions';
import { useI18n } from '../i18n';

interface Props {
  project: Project;
  selectedId: string;
  issues: StoryIssue[];
  onSelect: (id: string) => void;
  onEdit: (fn: (p: Project) => Project) => void;
}

export function SceneList({ project, selectedId, issues, onSelect, onEdit }: Props) {
  const { t } = useI18n();
  function addScene() {
    const name = window.prompt(t.scenes.newScenePrompt, t.scenes.defaultName(project.scenes.length + 1));
    if (!name) return;
    const id = createId('scene');
    onEdit((p) => actions.addScene(p, id, name));
    onSelect(id);
  }

  return (
    <section className="scene-list">
      <div className="section-head">
        <h3>{t.scenes.title}</h3>
        <button className="btn small" onClick={addScene}>
          {t.scenes.newScene}
        </button>
      </div>
      <ul>
        {project.scenes.map((s) => {
          const errors = issues.filter((i) => i.sceneId === s.id && i.level === 'error').length;
          const warnings = issues.filter((i) => i.sceneId === s.id && i.level === 'warning').length;
          return (
            <li key={s.id} className={s.id === selectedId ? 'selected' : ''}>
              <button className="scene-item" onClick={() => onSelect(s.id)}>
                {project.startSceneId === s.id && <span title={t.editor.startScene}>★ </span>}
                {s.name || t.scenes.untitled}
                {errors > 0 && <span className="dot error" title={t.scenes.errors(errors)} />}
                {errors === 0 && warnings > 0 && <span className="dot warning" title={t.scenes.warnings(warnings)} />}
              </button>
              {s.id === selectedId && (
                <div className="scene-actions">
                  {project.startSceneId !== s.id && (
                    <button className="link" onClick={() => onEdit((p) => actions.setStartScene(p, s.id))}>
                      {t.scenes.setAsStart}
                    </button>
                  )}
                  {project.scenes.length > 1 && (
                    <button
                      className="link danger"
                      onClick={() => {
                        if (!window.confirm(t.scenes.deleteConfirm(s.name))) return;
                        onEdit((p) => actions.deleteScene(p, s.id));
                        onSelect(project.scenes.find((x) => x.id !== s.id)!.id);
                      }}
                    >
                      {t.scenes.delete}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
