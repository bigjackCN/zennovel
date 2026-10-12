/**
 * Tells other open tabs when a project was saved or deleted, so two tabs
 * editing the same story don't silently overwrite each other.
 */

export interface SavedNotice {
  projectId: string;
  /** meta.updatedAt of the saved version, or null when the project was deleted. */
  updatedAt: string | null;
}

// randomUUID only exists in secure contexts (https / localhost).
const TAB_ID = globalThis.crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
const channel: BroadcastChannel | null = typeof BroadcastChannel === 'function' ? new BroadcastChannel('zennovel') : null;

export function announceSaved(projectId: string, updatedAt: string | null): void {
  channel?.postMessage({ tab: TAB_ID, projectId, updatedAt });
}

/** Calls `listener` when *another* tab saves or deletes a project. Returns an unsubscribe function. */
export function onSavedElsewhere(listener: (notice: SavedNotice) => void): () => void {
  if (!channel) return () => {};
  const handler = (e: MessageEvent<{ tab: string } & SavedNotice>) => {
    if (e.data?.tab !== TAB_ID) listener({ projectId: e.data.projectId, updatedAt: e.data.updatedAt });
  };
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
}
