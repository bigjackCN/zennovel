import { useCallback, useMemo, useState } from 'react';
import { findUsages, type Asset, type Project } from '@zennovel/core';
import { actions } from '../state/projectActions';
import { isImageReadError, readImageFile, type ImageReadError } from '../state/assets';
import { useDialogs } from './Dialogs';
import { useEditorApi, type EditFn } from './EditorApi';
import { useI18n, type Messages } from '../i18n';

/** Open the browser's file picker. Resolves to [] if the picker is cancelled. */
function chooseFiles(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

function readErrorMessage(name: string, e: ImageReadError, t: Messages): string {
  return e.code === 'notImage' ? t.assets.notImage(name) : t.assets.tooLarge(name, e.megabytes);
}

/** Read files into image assets; explains any that were refused. */
function useReadImages() {
  const { t } = useI18n();
  const dialogs = useDialogs();
  return useCallback(
    async (files: File[]): Promise<Asset[]> => {
      const results = await Promise.all(files.map(async (f) => [f.name, await readImageFile(f)] as const));
      const errors = results.filter(([, r]) => isImageReadError(r)).map(([name, r]) => readErrorMessage(name, r as ImageReadError, t));
      if (errors.length) await dialogs.alert(errors.join('\n'));
      return results.map(([, r]) => r).filter((r): r is Asset => !isImageReadError(r));
    },
    [dialogs, t],
  );
}

/**
 * Pick one image from the computer and add it to the project's assets.
 * Used by the background card and the cast panel's "upload" options.
 */
export function usePickImage(onEdit: EditFn): () => Promise<Asset | null> {
  const readImages = useReadImages();
  return useCallback(async () => {
    const [asset] = await readImages(await chooseFiles(false));
    if (!asset) return null;
    onEdit((p) => actions.addAssets(p, [asset]));
    return asset;
  }, [onEdit, readImages]);
}

/** Rough size of the project as stored (images are embedded as data: URLs). */
function projectMegabytes(project: Project): string {
  return (JSON.stringify(project).length / 1024 / 1024).toFixed(1);
}

export function AssetsPanel({ project, onEdit }: { project: Project; onEdit: EditFn }) {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const api = useEditorApi();
  const readImages = useReadImages();
  const usage = useMemo(() => findUsages(project).assets, [project]);
  const [dragging, setDragging] = useState(false);

  async function add(files: File[]) {
    const assets = await readImages(files);
    if (assets.length) onEdit((p) => actions.addAssets(p, assets));
  }

  async function replace(asset: Asset) {
    const [next] = await readImages(await chooseFiles(false));
    if (next) onEdit((p) => actions.updateAsset(p, { ...asset, src: next.src }));
  }

  async function remove(asset: Asset) {
    const uses = usage.get(asset.id) ?? 0;
    const ok = await dialogs.confirm(t.assets.deleteConfirm(asset.name, uses), { okLabel: t.assets.delete, danger: true });
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
        void add(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="manager-head">
        <h2>{t.assets.title}</h2>
        <button className="btn primary" onClick={async () => void add(await chooseFiles(true))}>
          {t.assets.upload}
        </button>
      </div>
      <p className="hint">{t.assets.hint(projectMegabytes(project))}</p>

      {project.assets.length === 0 ? (
        <p className="muted empty-state">{t.assets.empty}</p>
      ) : (
        <div className="asset-grid">
          {project.assets.map((a) => {
            const uses = usage.get(a.id) ?? 0;
            return (
              <div key={a.id} className="asset-card">
                <div className="asset-thumb">{a.kind === 'image' && a.src ? <img src={a.src} alt="" /> : <span>{a.kind}</span>}</div>
                <input
                  value={a.name}
                  aria-label={t.assets.name}
                  onChange={(e) => onEdit((p) => actions.updateAsset(p, { ...a, name: e.target.value }), `asset-name:${a.id}`)}
                />
                <div className="asset-meta">
                  <span className={uses ? 'muted' : 'muted unused'}>{uses ? t.assets.usedIn(uses) : t.assets.unused}</span>
                  <span className="spacer" />
                  {a.kind === 'image' && (
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
