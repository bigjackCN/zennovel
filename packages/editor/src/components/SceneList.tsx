import { createId, type Project, type StoryIssue } from '@zennovel/core';
import { actions } from '../state/projectActions';

interface Props {
  project: Project;
  selectedId: string;
  issues: StoryIssue[];
  onSelect: (id: string) => void;
  onEdit: (fn: (p: Project) => Project) => void;
}

export function SceneList({ project, selectedId, issues, onSelect, onEdit }: Props) {
  function addScene() {
    const name = window.prompt('Name the new scene:', `Scene ${project.scenes.length + 1}`);
    if (!name) return;
    const id = createId('scene');
    onEdit((p) => actions.addScene(p, id, name));
    onSelect(id);
  }

  return (
    <section className="scene-list">
      <div className="section-head">
        <h3>Scenes</h3>
        <button className="btn small" onClick={addScene}>
          + New scene
        </button>
      </div>
      <ul>
        {project.scenes.map((s) => {
          const errors = issues.filter((i) => i.sceneId === s.id && i.level === 'error').length;
          const warnings = issues.filter((i) => i.sceneId === s.id && i.level === 'warning').length;
          return (
            <li key={s.id} className={s.id === selectedId ? 'selected' : ''}>
              <button className="scene-item" onClick={() => onSelect(s.id)}>
                {project.startSceneId === s.id && <span title="Start scene">★ </span>}
                {s.name || '(untitled)'}
                {errors > 0 && <span className="dot error" title={`${errors} error${errors === 1 ? '' : 's'}`} />}
                {errors === 0 && warnings > 0 && <span className="dot warning" title={`${warnings} warning${warnings === 1 ? '' : 's'}`} />}
              </button>
              {s.id === selectedId && (
                <div className="scene-actions">
                  {project.startSceneId !== s.id && (
                    <button className="link" onClick={() => onEdit((p) => actions.setStartScene(p, s.id))}>
                      Set as start
                    </button>
                  )}
                  {project.scenes.length > 1 && (
                    <button
                      className="link danger"
                      onClick={() => {
                        if (!window.confirm(`Delete scene "${s.name}"?`)) return;
                        onEdit((p) => actions.deleteScene(p, s.id));
                        onSelect(project.scenes.find((x) => x.id !== s.id)!.id);
                      }}
                    >
                      Delete
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
