import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkProject, createId, normalizeProject, walkCommands, type Project, type StoryIssue } from '@zennovel/core';
import { navigate } from '../router';
import { storage } from '../storage';
import { onSavedElsewhere } from '../storage/sync';
import { actions } from '../state/projectActions';
import { canRedo, canUndo, createHistory, record, redo, undo, type History } from '../state/history';
import { downloadProject, loadErrorMessage } from '../state/templates';
import { repairTemplateAssets } from '../state/assets';
import { SceneList } from './SceneList';
import { CommandList, revealCommand } from './CommandList';
import { Preview } from './Preview';
import { IssuesPanel } from './IssuesPanel';
import { ThemePanel } from './ThemePanel';
import { CastPanel } from './CastPanel';
import { VariablesPanel } from './VariablesPanel';
import { AssetsPanel } from './AssetsPanel';
import { useDialogs } from './Dialogs';
import { CHARACTER_COLORS, EditorApiContext, type EditFn, type EditorApi } from './EditorApi';
import { LanguageSwitcher, useI18n } from '../i18n';

type Section = 'story' | 'cast' | 'variables' | 'assets';
const SECTIONS: Section[] = ['story', 'cast', 'variables', 'assets'];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Editor({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const [history, setHistory] = useState<History<Project> | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const project = history?.present;
  const [sceneId, setSceneId] = useState<string>('');
  const [section, setSection] = useState<Section>('story');
  const [rightTab, setRightTab] = useState<'preview' | 'theme'>('preview');
  /** The command card that last had keyboard focus: the preview can start there. */
  const [cursor, setCursor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** Set before replacing the project from storage, so that version isn't saved straight back. */
  const skipSave = useRef(true);
  /** Latest edit not yet written to storage. */
  const pending = useRef<Project | null>(null);

  const loadFromStorage = useCallback(async () => {
    const raw = await storage.loadProject(projectId);
    if (!raw) return null;
    const result = normalizeProject(raw);
    if (!result.ok) {
      setLoadError(loadErrorMessage(result.error, t));
      return null;
    }
    const repaired = await repairTemplateAssets(result.project);
    if (repaired !== result.project) await storage.saveProject(repaired).catch(() => {});
    return repaired;
    // `t` only words the error message: switching language must not reload the project.
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void loadFromStorage().then((p) => {
      if (cancelled) return;
      skipSave.current = true;
      setHistory(p ? createHistory(p) : null);
      if (p) setSceneId(p.startSceneId);
    });
    return () => {
      cancelled = true;
    };
  }, [loadFromStorage]);

  // ---------------------------------------------------------------- saving

  /**
   * Write the pending edit now. Storage writes start synchronously, so this
   * also works from beforeunload / unmount.
   */
  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    try {
      await storage.saveProject(p);
      if (!pending.current) {
        setSaveState('saved');
        setSaveError(null);
      }
    } catch (e) {
      pending.current ??= p;
      setSaveState('failed');
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Autosave, debounced.
  useEffect(() => {
    if (!project) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    pending.current = project;
    setSaveState((s) => (s === 'failed' ? s : 'saving'));
    const timer = window.setTimeout(() => void flush(), 400);
    return () => window.clearTimeout(timer);
  }, [project, flush]);

  // Don't drop the last edits when leaving the editor or closing the tab.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void flush();
      if (pending.current) e.preventDefault(); // still unsaved: ask the browser to warn
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flush();
    };
  }, [flush]);

  // Another tab saved (or deleted) this project.
  useEffect(
    () =>
      onSavedElsewhere((notice) => {
        if (notice.projectId === projectId) setChangedElsewhere(true);
      }),
    [projectId],
  );

  async function reloadFromStorage() {
    pending.current = null;
    const p = await loadFromStorage();
    setChangedElsewhere(false);
    if (!p) {
      navigate('/');
      return;
    }
    skipSave.current = true;
    setHistory(createHistory(p));
    setSaveState('saved');
  }

  function keepMine() {
    setChangedElsewhere(false);
    if (project) {
      pending.current = project;
      void flush();
    }
  }

  // --------------------------------------------------------------- editing

  const edit: EditFn = useCallback((fn, key) => {
    const now = Date.now();
    setHistory((h) => (h ? record(h, fn(h.present), { key, now }) : h));
  }, []);

  const doUndo = useCallback(() => setHistory((h) => (h ? undo(h) : h)), []);
  const doRedo = useCallback(() => setHistory((h) => (h ? redo(h) : h)), []);

  // Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo — for the whole editor, text fields included.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || document.querySelector('dialog[open]')) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (key === 'y' && !isMac) {
        e.preventDefault();
        doRedo();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [doUndo, doRedo]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const api = useMemo<EditorApi>(
    () => ({
      async createVariable() {
        const count = history?.present.variables.length ?? 0;
        const name = await dialogs.prompt(t.variables.newPrompt, t.variables.defaultName(count + 1));
        if (!name) return null;
        const id = createId('var');
        edit((p) => actions.addVariable(p, { id, name, initial: 0 }));
        return id;
      },
      async createCharacter() {
        const count = history?.present.characters.length ?? 0;
        const name = await dialogs.prompt(t.cast.newPrompt, t.cast.defaultName(count + 1));
        if (!name) return null;
        const id = createId('chr');
        const color = CHARACTER_COLORS[count % CHARACTER_COLORS.length]!;
        edit((p) => actions.addCharacter(p, { id, name, color, sprites: {} }));
        return id;
      },
      notifyDeleted: () => setToast(t.editor.deleted),
    }),
    [dialogs, edit, history?.present.variables.length, history?.present.characters.length, t],
  );

  const issues = useMemo(() => (project ? checkProject(project) : []), [project]);

  if (history === undefined) return <div className="loading">{t.editor.loading}</div>;
  if (!history || !project) {
    return (
      <div className="loading">
        <p>{loadError ?? t.editor.notFound}</p>
        <button className="btn" onClick={() => navigate('/')}>
          {t.editor.backToProjects}
        </button>
      </div>
    );
  }

  const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0]!;
  let cursorInScene: string | undefined;
  walkCommands(scene.commands, (c) => {
    if (c.id === cursor) cursorInScene = cursor;
  });

  function selectIssue(issue: StoryIssue) {
    setSection('story');
    setSceneId(issue.sceneId);
    if (issue.commandId) revealCommand(issue.commandId);
  }

  const counts: Record<Section, number> = {
    story: project.scenes.length,
    cast: project.characters.length,
    variables: project.variables.length,
    assets: project.assets.length,
  };
  const mod = isMac ? '⌘' : 'Ctrl+';

  return (
    <EditorApiContext.Provider value={api}>
      <div className="editor">
        <header className="editor-header">
          <button className="btn ghost" onClick={() => navigate('/')} title={t.editor.backToProjects}>
            {t.editor.projects}
          </button>
          <input
            className="title-input"
            value={project.meta.name}
            onChange={(e) => edit((p) => actions.renameProject(p, e.target.value), 'project-name')}
            aria-label={t.editor.projectName}
          />
          {saveState === 'failed' ? (
            <button className="save-state failed" title={t.editor.saveFailedDetail(saveError ?? '')} onClick={() => void flush()}>
              {t.editor.saveFailed}
            </button>
          ) : (
            <span className="save-state">{saveState === 'saved' ? t.editor.saved : t.editor.saving}</span>
          )}
          <div className="undo-redo">
            <button className="icon" onClick={doUndo} disabled={!canUndo(history)} title={`${t.editor.undo} (${mod}Z)`} aria-label={t.editor.undo}>
              ↶
            </button>
            <button
              className="icon"
              onClick={doRedo}
              disabled={!canRedo(history)}
              title={`${t.editor.redo} (${isMac ? '⌘⇧Z' : 'Ctrl+Y'})`}
              aria-label={t.editor.redo}
            >
              ↷
            </button>
          </div>
          <div className="spacer" />
          <LanguageSwitcher />
          <button className="btn" onClick={() => downloadProject(project)}>
            {t.editor.exportProject}
          </button>
        </header>

        <aside className="panel left">
          <nav className="sections" aria-label={t.editor.sectionsLabel}>
            {SECTIONS.map((s) => (
              <button key={s} className={section === s ? 'active' : ''} onClick={() => setSection(s)} aria-current={section === s}>
                <span>{t.editor.sections[s]}</span>
                <span className="count">{counts[s]}</span>
              </button>
            ))}
          </nav>
          {section === 'story' && (
            <SceneList project={project} selectedId={scene.id} issues={issues} onSelect={setSceneId} onEdit={edit} />
          )}
          <IssuesPanel project={project} issues={issues} onSelect={selectIssue} />
        </aside>

        <main
          className="panel center"
          onFocusCapture={(e) => {
            const id = (e.target as HTMLElement).closest('[data-command-id]')?.getAttribute('data-command-id');
            if (id) setCursor(id);
          }}
        >
          {section === 'story' && (
            <>
              <div className="scene-title">
                <input
                  value={scene.name}
                  onChange={(e) => edit((p) => actions.renameScene(p, scene.id, e.target.value), `scene-name:${scene.id}`)}
                  aria-label={t.editor.sceneName}
                />
                {project.startSceneId === scene.id && <span className="badge">{t.editor.startScene}</span>}
              </div>
              <CommandList project={project} scene={scene} commands={scene.commands} parent={null} onEdit={edit} />
            </>
          )}
          {section === 'cast' && <CastPanel project={project} onEdit={edit} />}
          {section === 'variables' && <VariablesPanel project={project} onEdit={edit} />}
          {section === 'assets' && <AssetsPanel project={project} onEdit={edit} />}
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
          <Preview project={project} sceneId={scene.id} commandId={cursorInScene} />
          {rightTab === 'theme' && (
            <ThemePanel
              theme={project.theme}
              onChange={(theme) => edit((p) => actions.updateTheme(p, theme), 'theme')}
              gameLocale={project.meta.locale ?? 'en'}
              onGameLocaleChange={(locale) => edit((p) => actions.setGameLocale(p, locale))}
            />
          )}
          {rightTab === 'preview' && <p className="hint">{t.editor.previewHint}</p>}
        </aside>

        {changedElsewhere && (
          <div className="notice warning" role="alert">
            <span>{t.editor.changedElsewhere}</span>
            <button className="btn small" onClick={() => void reloadFromStorage()}>
              {t.editor.loadTheirs}
            </button>
            <button className="btn small" onClick={keepMine}>
              {t.editor.keepMine}
            </button>
          </div>
        )}
        {toast && !changedElsewhere && (
          <div className="notice" role="status">
            <span>{toast}</span>
            <button
              className="btn small"
              onClick={() => {
                doUndo();
                setToast(null);
              }}
            >
              {t.editor.undo}
            </button>
          </div>
        )}
      </div>
    </EditorApiContext.Provider>
  );
}
