import { useEffect, useMemo, useRef, useState } from 'react';
import { checkProject, type Project } from '@zennovel/core';
import { navigate } from '../router';
import { storage } from '../storage/LocalProjectStorage';
import { actions } from '../state/projectActions';
import { downloadProject } from '../state/templates';
import { SceneList } from './SceneList';
import { CommandList } from './CommandList';
import { Preview } from './Preview';
import { IssuesPanel } from './IssuesPanel';
import { ThemePanel } from './ThemePanel';

export function Editor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [sceneId, setSceneId] = useState<string>('');
  const [rightTab, setRightTab] = useState<'preview' | 'theme'>('preview');
  const [saved, setSaved] = useState(true);
  const firstLoad = useRef(true);

  useEffect(() => {
    void storage.loadProject(projectId).then((p) => {
      setProject(p);
      if (p) setSceneId(p.startSceneId);
    });
  }, [projectId]);

  // Autosave, debounced.
  useEffect(() => {
    if (!project) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    setSaved(false);
    const t = window.setTimeout(() => {
      void storage.saveProject(project).then(() => setSaved(true));
    }, 400);
    return () => window.clearTimeout(t);
  }, [project]);

  const issues = useMemo(() => (project ? checkProject(project) : []), [project]);

  if (project === undefined) return <div className="loading">Loading…</div>;
  if (project === null) {
    return (
      <div className="loading">
        <p>This project couldn't be found.</p>
        <button className="btn" onClick={() => navigate('/')}>
          Back to projects
        </button>
      </div>
    );
  }

  const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0]!;
  const edit = (fn: (p: Project) => Project) => setProject((p) => (p ? fn(p) : p));

  return (
    <div className="editor">
      <header className="editor-header">
        <button className="btn ghost" onClick={() => navigate('/')} title="Back to projects">
          ← Projects
        </button>
        <input
          className="title-input"
          value={project.meta.name}
          onChange={(e) => edit((p) => actions.renameProject(p, e.target.value))}
          aria-label="Project name"
        />
        <span className="save-state">{saved ? 'Saved' : 'Saving…'}</span>
        <div className="spacer" />
        <button className="btn" onClick={() => downloadProject(project)}>
          Export project file
        </button>
      </header>

      <aside className="panel left">
        <SceneList
          project={project}
          selectedId={scene.id}
          issues={issues}
          onSelect={setSceneId}
          onEdit={edit}
        />
        <IssuesPanel project={project} issues={issues} onSelectScene={setSceneId} />
      </aside>

      <main className="panel center">
        <div className="scene-title">
          <input
            value={scene.name}
            onChange={(e) => edit((p) => actions.renameScene(p, scene.id, e.target.value))}
            aria-label="Scene name"
          />
          {project.startSceneId === scene.id && <span className="badge">Start scene</span>}
        </div>
        <CommandList project={project} scene={scene} commands={scene.commands} parent={null} onEdit={edit} />
      </main>

      <aside className="panel right">
        <div className="tabs">
          <button className={rightTab === 'preview' ? 'active' : ''} onClick={() => setRightTab('preview')}>
            Preview
          </button>
          <button className={rightTab === 'theme' ? 'active' : ''} onClick={() => setRightTab('theme')}>
            Appearance
          </button>
        </div>
        <Preview project={project} sceneId={scene.id} />
        {rightTab === 'theme' && (
          <ThemePanel theme={project.theme} onChange={(theme) => edit((p) => actions.updateTheme(p, theme))} />
        )}
        {rightTab === 'preview' && (
          <p className="hint">Click or press Space to continue; press ← or scroll up to go back. The preview refreshes as you edit.</p>
        )}
      </aside>
    </div>
  );
}
