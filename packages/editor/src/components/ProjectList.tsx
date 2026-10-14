import { useEffect, useRef, useState } from 'react';
import { navigate } from '../router';
import { normalizeProject } from '@zennovel/core';
import { storage, type ProjectSummary } from '../storage';
import { onSavedElsewhere } from '../storage/sync';
import { backupStatus, requestPersistentStorage } from '../storage/backups';
import { createFromTemplate, downloadProject, readProjectFile, templateIds, type TemplateId } from '../state/templates';
import { playUrl, sampleIds } from '../state/samples';
import { preloadSamples } from '../state/seed';
import { desktop } from '../desktop';
import { useDialogs } from './Dialogs';
import { LanguageSwitcher, useI18n } from '../i18n';

export function ProjectList() {
  const { t, locale, formatDate } = useI18n();
  const dialogs = useDialogs();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Desktop: the folder new stories go in. */
  const [root, setRoot] = useState<string | null>(null);

  const refresh = () => storage.listProjects().then(setProjects);
  useEffect(() => {
    void desktop?.info().then((i) => setRoot(i.projectsRoot));
    void refresh();
    // A first visit finds the sample story already here.
    void preloadSamples(locale, t).then((added) => {
      if (added) void refresh();
    });
    // Keep the list current when another tab creates, edits or deletes a project.
    return onSavedElsewhere(() => void refresh());
    // Preloading happens once per browser, whatever the language is at the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(templateId: TemplateId) {
    const defaultName = templateId === 'blank' ? t.home.defaultName : t.templates[templateId].name;
    const name = await dialogs.prompt(t.home.namePrompt, defaultName);
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const project = await createFromTemplate(templateId, name, locale, t);
      await storage.saveProject(project);
      void requestPersistentStorage();
      navigate(`/p/${project.meta.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: ProjectSummary) {
    const question = desktop ? t.home.trashConfirm(p.name) : t.home.deleteConfirm(p.name);
    const okLabel = desktop ? t.home.trash : t.home.delete;
    if (!(await dialogs.confirm(question, { okLabel, danger: true }))) return;
    await storage.deleteProject(p.id);
    await refresh();
  }

  async function exportOne(id: string) {
    const raw = await storage.loadProject(id);
    const result = raw && normalizeProject(raw);
    if (result?.ok) await downloadProject(result.project);
    await refresh(); // update the backup badge
  }

  async function openFolder() {
    if (!desktop) return;
    setError(null);
    const res = await desktop.openProjectFolder();
    if (!res) return;
    if ('error' in res) {
      if (res.error === 'alreadyOpen' && res.id) navigate(`/p/${res.id}`);
      else setError(t.home.notAProject);
      return;
    }
    navigate(`/p/${res.id}`);
  }

  async function changeRoot() {
    const dir = await desktop?.chooseProjectsRoot();
    if (dir) {
      setRoot(dir);
      await refresh();
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const project = await readProjectFile(file, t);
      await storage.saveProject(project);
      void requestPersistentStorage();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark">Z</span>
          <div>
            <h1>ZenNovel</h1>
            <p>{t.app.tagline}</p>
          </div>
        </div>
        <div className="home-actions">
          <LanguageSwitcher />
          <a className="link" href="https://github.com/bigjackCN/zennovel" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </header>

      <section>
        <h2>{t.home.newStory}</h2>
        <div className="template-grid">
          {templateIds.map((id) => (
            <button key={id} className="template-card" disabled={busy} onClick={() => void create(id)}>
              <strong>{t.templates[id].name}</strong>
              <span>{t.templates[id].description}</span>
            </button>
          ))}
          <button className="template-card ghost" onClick={() => fileInput.current?.click()}>
            <strong>{t.home.importProject}</strong>
            <span>{t.home.importHint}</span>
          </button>
          {desktop && (
            <button className="template-card ghost" onClick={() => void openFolder()}>
              <strong>{t.home.openFolder}</strong>
              <span>{t.home.openFolderHint}</span>
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json,text/html,.html"
            hidden
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <p className="hint play-links">
          {t.home.playNow}
          {sampleIds.map((id, i) => (
            <span key={id}>
              {i > 0 && ' · '}
              <a className="link" href={playUrl(id, locale)} target="_blank" rel="noreferrer">
                {t.templates[id].name}
              </a>
            </span>
          ))}
        </p>
        {error && <p className="error">{error}</p>}
      </section>

      <section>
        <h2>{t.home.myStories}</h2>
        {projects === null ? null : projects.length === 0 ? (
          <p className="muted">{t.home.empty}</p>
        ) : (
          <>
            <p className="hint backup-hint">
              {desktop ? t.home.desktopHint : t.home.backupHint}
              {desktop && root && (
                <>
                  {' '}
                  {t.home.projectsRoot(root)}{' '}
                  <button className="link" onClick={() => void changeRoot()}>
                    {t.home.changeRoot}
                  </button>
                </>
              )}
            </p>
            <ul className="project-list">
              {projects.map((p) => {
                // On disk, a project is its own backup.
                const backup = desktop ? 'backedUp' : backupStatus(p.id, p.updatedAt);
                return (
                  <li key={p.id} className="project-row">
                    <button className="project-open" onClick={() => navigate(`/p/${p.id}`)}>
                      <strong>
                        {p.name}
                        {backup !== 'backedUp' && (
                          <span className="backup-badge" title={t.home.exportHint}>
                            {backup === 'never' ? t.home.neverBackedUp : t.home.changedSinceBackup}
                          </span>
                        )}
                      </strong>
                      <span className="muted">{t.home.summary(p.sceneCount, formatDate(p.updatedAt))}</span>
                    </button>
                    {desktop && (
                      <button className="btn" onClick={() => void desktop!.revealProject(p.id)}>
                        {t.home.reveal}
                      </button>
                    )}
                    <button className="btn" onClick={() => void exportOne(p.id)} title={t.home.exportHint}>
                      {t.home.export}
                    </button>
                    <button className="btn danger" onClick={() => void remove(p)}>
                      {desktop ? t.home.trash : t.home.delete}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
