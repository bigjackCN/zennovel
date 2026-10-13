import { useCallback, useEffect, useMemo, useState } from 'react';
import { findUsages, type Asset, type Project } from '@zennovel/core';
import { actions } from '../state/projectActions';
import { isMediaReadError, readMediaFile, type MediaKind, type MediaReadError } from '../state/assets';
import { useDialogs } from './Dialogs';
import { useEditorApi, type EditFn } from './EditorApi';
import { useI18n, type Messages } from '../i18n';
import { desktop, type MediaImport } from '../desktop';

/** Open the browser's file picker. Resolves to [] if the picker is cancelled. */
function chooseFiles(kinds: MediaKind[], multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kinds.map((k) => `${k}/*`).join(',');
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

function readErrorMessage(name: string, e: MediaReadError, t: Messages): string {
  if (e.code === 'tooLarge') return t.assets.tooLarge(name, e.megabytes, e.limit);
  return e.accepted.includes('audio') && e.accepted.includes('image')
    ? t.assets.notMedia(name)
    : e.accepted.includes('audio')
      ? t.assets.notAudio(name)
      : t.assets.notImage(name);
}

/** Read files into assets; explains any that were refused. */
function useReadMedia() {
  const { t } = useI18n();
  const dialogs = useDialogs();
  return useCallback(
    async (files: File[], kinds: MediaKind[]): Promise<Asset[]> => {
      const results = await Promise.all(files.map(async (f) => [f.name, await readMediaFile(f, kinds)] as const));
      const errors = results
        .filter(([, r]) => isMediaReadError(r))
        .map(([name, r]) => readErrorMessage(name, r as MediaReadError, t));
      if (errors.length) await dialogs.alert(errors.join('\n'));
      return results.map(([, r]) => r).filter((r): r is Asset => !isMediaReadError(r));
    },
    [dialogs, t],
  );
}

/**
 * Adding media. In the browser files are read into data: URLs (with a size
 * limit). In the desktop app they are copied into the project's assets/
 * folder as they are, whatever their size.
 */
function useMedia() {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const { projectId } = useEditorApi();
  const readMedia = useReadMedia();
  const fromDesktop = useCallback(
    async (kinds: MediaKind[], get: () => Promise<MediaImport>): Promise<Asset[]> => {
      try {
        const { assets, rejected } = await get();
        if (rejected.length) {
          await dialogs.alert(
            rejected.map((n) => readErrorMessage(n, { code: 'unsupported', accepted: kinds }, t)).join('\n'),
          );
        }
        return assets;
      } catch (e) {
        await dialogs.alert(e instanceof Error ? e.message : String(e));
        return [];
      }
    },
    [dialogs, t],
  );
  const pick = useCallback(
    (kinds: MediaKind[], multiple: boolean): Promise<Asset[]> =>
      desktop
        ? fromDesktop(kinds, () => desktop!.pickMedia(projectId, kinds, multiple))
        : chooseFiles(kinds, multiple).then((files) => readMedia(files, kinds)),
    [fromDesktop, projectId, readMedia],
  );
  const fromFiles = useCallback(
    (files: File[], kinds: MediaKind[]): Promise<Asset[]> =>
      desktop ? fromDesktop(kinds, () => desktop!.importFiles(projectId, files, kinds)) : readMedia(files, kinds),
    [fromDesktop, projectId, readMedia],
  );
  return { pick, fromFiles };
}

/**
 * Pick one image or audio file from the computer and add it to the
 * project's assets. Used by the "Upload…" options on cards and in the cast panel.
 */
export function usePickAsset(onEdit: EditFn, kind: MediaKind): () => Promise<Asset | null> {
  const { pick } = useMedia();
  return useCallback(async () => {
    const [asset] = await pick([kind], false);
    if (!asset) return null;
    onEdit((p) => actions.addAssets(p, [asset]));
    return asset;
  }, [onEdit, pick, kind]);
}

export const usePickImage = (onEdit: EditFn) => usePickAsset(onEdit, 'image');

// --- Listening to audio in the editor -----------------------------------------

/** One preview at a time across the whole editor. */
let previewing: { el: HTMLAudioElement; src: string } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function togglePreview(src: string) {
  const same = previewing?.src === src;
  previewing?.el.pause();
  previewing = null;
  if (!same && src) {
    const el = new Audio(src);
    previewing = { el, src };
    el.addEventListener('ended', () => {
      if (previewing?.el === el) previewing = null;
      notify();
    });
    el.play().catch(() => {
      previewing = null;
      notify();
    });
  }
  notify();
}

/** ▶ / ■ button that plays an audio asset in the editor. */
export function ListenButton({ src, className = 'icon' }: { src: string | undefined; className?: string }) {
  const { t } = useI18n();
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const playing = !!src && previewing?.src === src;
  return (
    <button
      type="button"
      className={`${className} listen ${playing ? 'playing' : ''}`}
      disabled={!src}
      title={playing ? t.assets.stopListening : t.assets.listen}
      aria-label={playing ? t.assets.stopListening : t.assets.listen}
      onClick={() => src && togglePreview(src)}
    >
      {playing ? '■' : '▶'}
    </button>
  );
}

/** Rough size of the project as stored (images are embedded as data: URLs). */
function projectMegabytes(project: Project): string {
  return (JSON.stringify(project).length / 1024 / 1024).toFixed(1);
}

export function AssetsPanel({ project, onEdit }: { project: Project; onEdit: EditFn }) {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const api = useEditorApi();
  const media = useMedia();
  const usage = useMemo(() => findUsages(project).assets, [project]);
  const [dragging, setDragging] = useState(false);

  function addAll(assets: Asset[]) {
    if (assets.length) onEdit((p) => actions.addAssets(p, assets));
  }

  async function replace(asset: Asset) {
    const kind: MediaKind = asset.kind === 'audio' ? 'audio' : 'image';
    const [next] = await media.pick([kind], false);
    if (next) onEdit((p) => actions.updateAsset(p, { ...asset, src: next.src }));
  }

  async function remove(asset: Asset) {
    const uses = usage.get(asset.id) ?? 0;
    const ok = await dialogs.confirm(t.assets.deleteConfirm(asset.name, uses), {
      okLabel: t.assets.delete,
      danger: true,
    });
    if (!ok) return;
    onEdit((p) => actions.deleteAsset(p, asset.id));
    api.notifyDeleted();
  }

  return (
    <section
      className={`manager ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void media.fromFiles(Array.from(e.dataTransfer.files), ['image', 'audio']).then(addAll);
      }}
    >
      <div className="manager-head">
        <h2>{t.assets.title}</h2>
        <button className="btn primary" onClick={() => void media.pick(['image', 'audio'], true).then(addAll)}>
          {t.assets.upload}
        </button>
      </div>
      <p className="hint">{desktop ? t.assets.hintDesktop : t.assets.hint(projectMegabytes(project))}</p>

      {project.assets.length === 0 ? (
        <p className="muted empty-state">{t.assets.empty}</p>
      ) : (
        <div className="asset-grid">
          {project.assets.map((a) => {
            const uses = usage.get(a.id) ?? 0;
            return (
              <div key={a.id} className="asset-card">
                <div className="asset-thumb">
                  {a.kind === 'image' && a.src ? (
                    <img src={a.src} alt="" />
                  ) : a.kind === 'audio' ? (
                    <div className="audio-thumb">
                      <span className="note">♪</span>
                      <ListenButton src={a.src} className="btn small" />
                    </div>
                  ) : (
                    <span>{a.kind}</span>
                  )}
                </div>
                <input
                  value={a.name}
                  aria-label={t.assets.name}
                  onChange={(e) =>
                    onEdit((p) => actions.updateAsset(p, { ...a, name: e.target.value }), `asset-name:${a.id}`)
                  }
                />
                <div className="asset-meta">
                  <span className={uses ? 'muted' : 'muted unused'}>
                    {uses ? t.assets.usedIn(uses) : t.assets.unused}
                  </span>
                  <span className="spacer" />
                  {(a.kind === 'image' || a.kind === 'audio') && (
                    <button className="link" onClick={() => void replace(a)}>
                      {t.assets.replace}
                    </button>
                  )}
                  <button className="link danger" onClick={() => void remove(a)}>
                    {t.assets.delete}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
