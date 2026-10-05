import { useEffect, useRef, useState } from 'react';
import { navigate } from '../router';
import { storage } from '../storage/LocalProjectStorage';
import type { ProjectSummary } from '../storage/ProjectStorage';
import { createFromTemplate, downloadProject, readProjectFile, templates } from '../state/templates';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => storage.listProjects().then(setProjects);
  useEffect(() => {
    void refresh();
  }, []);

  async function create(templateId: string, defaultName: string) {
    const name = window.prompt('Name your new story:', defaultName);
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const project = await createFromTemplate(templateId, name);
      await storage.saveProject(project);
      navigate(`/p/${project.meta.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: ProjectSummary) {
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return;
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
      const project = await readProjectFile(file);
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
            <p>Write stories, not code. A visual novel maker for writers.</p>
          </div>
        </div>
        <a className="link" href="https://github.com/bigjackCN/zennovel" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </header>

      <section>
        <h2>New story</h2>
        <div className="template-grid">
          {templates.map((t) => (
            <button key={t.id} className="template-card" disabled={busy} onClick={() => create(t.id, t.id === 'blank' ? 'My Story' : t.name)}>
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </button>
          ))}
          <button className="template-card ghost" onClick={() => fileInput.current?.click()}>
            <strong>Import project</strong>
            <span>Open a previously exported .json project file</span>
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
        <h2>My stories</h2>
        {projects === null ? null : projects.length === 0 ? (
          <p className="muted">No projects yet. Try starting from the sample above.</p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id} className="project-row">
                <button className="project-open" onClick={() => navigate(`/p/${p.id}`)}>
                  <strong>{p.name}</strong>
                  <span className="muted">
                    {p.sceneCount} {p.sceneCount === 1 ? 'scene' : 'scenes'} · edited {formatDate(p.updatedAt)}
                  </span>
                </button>
                <button className="btn" onClick={() => exportOne(p.id)}>
                  Export
                </button>
                <button className="btn danger" onClick={() => remove(p)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
