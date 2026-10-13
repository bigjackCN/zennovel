/**
 * Projects live only in this browser, so clearing site data deletes them.
 * We remember when each project was last exported (project file or game,
 * both of which can be imported again) to remind writers to back up.
 */

const key = (projectId: string) => `zennovel:lastBackup:${projectId}`;

export function markBackedUp(projectId: string, at = new Date()): void {
  try {
    localStorage.setItem(key(projectId), at.toISOString());
  } catch {
    // Storage unavailable: the reminder just stays on.
  }
}

export function lastBackup(projectId: string): string | null {
  try {
    return localStorage.getItem(key(projectId));
  } catch {
    return null;
  }
}

export type BackupStatus = 'backedUp' | 'never' | 'changed';

/** Whether a project has unexported changes. ISO timestamps compare as strings. */
export function backupStatus(projectId: string, updatedAt: string): BackupStatus {
  const last = lastBackup(projectId);
  if (!last) return 'never';
  return updatedAt > last ? 'changed' : 'backedUp';
}

/**
 * Ask the browser not to evict our storage under disk pressure. Chrome and
 * Edge decide silently; Firefox asks the user, so this is only called after
 * the writer has created or imported a project.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    await navigator.storage.persist();
  } catch {
    // Not supported: nothing to do.
  }
}
