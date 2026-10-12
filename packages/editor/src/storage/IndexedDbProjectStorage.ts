import type { Project } from '@zennovel/core';
import type { ProjectStorage, ProjectSummary } from './ProjectStorage';
import { LEGACY_INDEX_KEY, legacyProjectKey, summarize } from './LocalProjectStorage';

const DB_NAME = 'zennovel';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const SUMMARIES = 'summaries';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS);
      if (!db.objectStoreNames.contains(SUMMARIES)) db.createObjectStore(SUMMARIES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
}

/**
 * Projects (with their uploaded images as data URLs) in IndexedDB, which
 * has room for hundreds of megabytes where localStorage stops at ~5 MB.
 * Each save writes the project and its list entry in one transaction.
 */
export class IndexedDbProjectStorage implements ProjectStorage {
  private constructor(private db: IDBDatabase) {}

  static async open(): Promise<IndexedDbProjectStorage> {
    const storage = new IndexedDbProjectStorage(await openDb());
    await storage.importLegacyProjects();
    return storage;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const tx = this.db.transaction(SUMMARIES, 'readonly');
    const all = await request(tx.objectStore(SUMMARIES).getAll() as IDBRequest<ProjectSummary[]>);
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadProject(id: string): Promise<Project | null> {
    const tx = this.db.transaction(PROJECTS, 'readonly');
    return ((await request(tx.objectStore(PROJECTS).get(id))) as Project | undefined) ?? null;
  }

  async saveProject(project: Project): Promise<void> {
    const tx = this.db.transaction([PROJECTS, SUMMARIES], 'readwrite');
    tx.objectStore(PROJECTS).put(project, project.meta.id);
    tx.objectStore(SUMMARIES).put(summarize(project), project.meta.id);
    await done(tx);
  }

  async deleteProject(id: string): Promise<void> {
    const tx = this.db.transaction([PROJECTS, SUMMARIES], 'readwrite');
    tx.objectStore(PROJECTS).delete(id);
    tx.objectStore(SUMMARIES).delete(id);
    await done(tx);
  }

  /**
   * Move projects saved by older versions (localStorage) into IndexedDB.
   * The localStorage copies are removed only after the copy has committed.
   */
  private async importLegacyProjects(): Promise<void> {
    let ids: string[];
    try {
      const index = JSON.parse(localStorage.getItem(LEGACY_INDEX_KEY) ?? '[]') as ProjectSummary[];
      ids = index.map((p) => p.id);
    } catch {
      return;
    }
    if (ids.length === 0) return;

    const projects: Project[] = [];
    for (const id of ids) {
      try {
        const raw = localStorage.getItem(legacyProjectKey(id));
        if (raw) projects.push(JSON.parse(raw) as Project);
      } catch {
        // Unreadable entry: leave it in localStorage rather than lose it.
      }
    }
    const tx = this.db.transaction([PROJECTS, SUMMARIES], 'readwrite');
    for (const p of projects) {
      tx.objectStore(PROJECTS).put(p, p.meta.id);
      tx.objectStore(SUMMARIES).put(summarize(p), p.meta.id);
    }
    await done(tx);
    for (const p of projects) localStorage.removeItem(legacyProjectKey(p.meta.id));
    const left = ids.filter((id) => localStorage.getItem(legacyProjectKey(id)) !== null);
    if (left.length === 0) localStorage.removeItem(LEGACY_INDEX_KEY);
  }
}
