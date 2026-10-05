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
import { LanguageSwitcher, useI18n } from '../i18n';

export function Editor({ projectId }: { projectId: string }) {
  const { t } = useI18n();
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

  if (project === undefined) return <div className="loading">{t.editor.loading}</div>;
  if (project === null) {
    return (
      <div className="loading">
        <p>{t.editor.notFound}</p>
        <button className="btn" onClick={() => navigate('/')}>
          {t.editor.backToProjects}
        </button>
      </div>
    );
  }

  const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0]!;
  const edit = (fn: (p: Project) => Project) => setProject((p) => (p ? fn(p) : p));

  return (
    <div className="editor">
      <header className="editor-header">
        <button className="btn ghost" onClick={() => navigate('/')} title={t.editor.backToProjects}>
          {t.editor.projects}
        </button>
        <input
          className="title-input"
          value={project.meta.name}
          onChange={(e) => edit((p) => actions.renameProject(p, e.target.value))}
          aria-label={t.editor.projectName}
        />
        <span className="save-state">{saved ? t.editor.saved : t.editor.saving}</span>
        <div className="spacer" />
        <LanguageSwitcher />
        <button className="btn" onClick={() => downloadProject(project)}>
          {t.editor.exportProject}
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
            aria-label={t.editor.sceneName}
          />
          {project.startSceneId === scene.id && <span className="badge">{t.editor.startScene}</span>}
        </div>
        <CommandList project={project} scene={scene} commands={scene.commands} parent={null} onEdit={edit} />
      </main>

      <aside className="panel right">
        <div className="tabs">
          <button className={rightTab === 'preview' ? 'active' : ''} onClick={() => setRightTab('preview')}>
            {t.editor.preview}
          </button>
          <button className={rightTab === 'theme' ? 'active' : ''} onClick={() => setRightTab('theme')}>
            {t.editor.appearance}
          </button>
        </div>
        <Preview project={project} sceneId={scene.id} />
        {rightTab === 'theme' && (
          <ThemePanel
            theme={project.theme}
            onChange={(theme) => edit((p) => actions.updateTheme(p, theme))}
            gameLocale={project.meta.locale ?? 'en'}
            onGameLocaleChange={(locale) => edit((p) => actions.setGameLocale(p, locale))}
          />
        )}
        {rightTab === 'preview' && (
          <p className="hint">{t.editor.previewHint}</p>
        )}
      </aside>
    </div>
  );
}
