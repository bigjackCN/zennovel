import { useEffect, useRef, useState } from 'react';
import { navigate } from '../router';
import { storage } from '../storage/LocalProjectStorage';
import type { ProjectSummary } from '../storage/ProjectStorage';
import { createFromTemplate, downloadProject, readProjectFile, templateIds, type TemplateId } from '../state/templates';
import { LanguageSwitcher, useI18n } from '../i18n';

export function ProjectList() {
  const { t, locale, formatDate } = useI18n();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => storage.listProjects().then(setProjects);
  useEffect(() => {
    void refresh();
  }, []);

  async function create(templateId: TemplateId) {
    const defaultName = templateId === 'blank' ? t.home.defaultName : t.templates[templateId].name;
    const name = window.prompt(t.home.namePrompt, defaultName);
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const project = await createFromTemplate(templateId, name, locale, t);
      await storage.saveProject(project);
      navigate(`/p/${project.meta.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: ProjectSummary) {
    if (!window.confirm(t.home.deleteConfirm(p.name))) return;
    await storage.deleteProject(p.id);
    await refresh();
  }

  async function exportOne(id: string) {
    const project = await storage.loadProject(id);
    if (project) downloadProject(project);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const project = await readProjectFile(file, t);
      await storage.saveProject(project);
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
            <button key={id} className="template-card" disabled={busy} onClick={() => create(id)}>
              <strong>{t.templates[id].name}</strong>
              <span>{t.templates[id].description}</span>
            </button>
          ))}
          <button className="template-card ghost" onClick={() => fileInput.current?.click()}>
            <strong>{t.home.importProject}</strong>
            <span>{t.home.importHint}</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <section>
        <h2>{t.home.myStories}</h2>
        {projects === null ? null : projects.length === 0 ? (
          <p className="muted">{t.home.empty}</p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id} className="project-row">
                <button className="project-open" onClick={() => navigate(`/p/${p.id}`)}>
                  <strong>{p.name}</strong>
                  <span className="muted">{t.home.summary(p.sceneCount, formatDate(p.updatedAt))}</span>
                </button>
                <button className="btn" onClick={() => exportOne(p.id)}>
                  {t.home.export}
                </button>
                <button className="btn danger" onClick={() => remove(p)}>
                  {t.home.delete}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
