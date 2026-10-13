import { useEffect, useRef, useState } from 'react';
import type { Project } from '@zennovel/core';
import { desktop, type ExportProgress, type ExportResult, type ExportTarget } from '../desktop';
import { exportGameZip, exportWebFolderZip, playerScript } from '../export/exportGame';
import { gameFolder } from '../export/gameFolder';
import { markBackedUp } from '../storage/backups';
import { useI18n } from '../i18n';

type WebFormat = 'folder' | 'single';

interface Settings {
  targets: ExportTarget[];
  webFormat: WebFormat;
  zip: boolean;
  steam: boolean;
  steamAppId: string;
}

const DEFAULTS: Settings = { targets: ['web'], webFormat: 'folder', zip: true, steam: false, steamAppId: '' };
const settingsKey = (projectId: string) => `zennovel:export:${projectId}`;

function loadSettings(projectId: string): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(settingsKey(projectId)) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

const DESKTOP_ROWS: { platform: 'windows' | 'linux'; targets: [ExportTarget, ExportTarget] }[] = [
  { platform: 'windows', targets: ['windows-electron', 'windows-tauri'] },
  { platform: 'linux', targets: ['linux-electron', 'linux-tauri'] },
];

/**
 * "Export game": the web build (own website, itch.io) everywhere, and in the
 * desktop app also Windows / Linux builds, standard (Electron, Steam-ready)
 * or small (Tauri).
 */
export function ExportDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useI18n();
  const e = t.exportDialog;
  const ref = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<Settings>(() => loadSettings(project.meta.id));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steamworks, setSteamworks] = useState(true);

  useEffect(() => {
    ref.current?.showModal();
    void desktop?.info().then((i) => setSteamworks(i.steamworks));
    return desktop?.onExportProgress(setProgress);
  }, []);

  function update(next: Partial<Settings>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    try {
      localStorage.setItem(settingsKey(project.meta.id), JSON.stringify(merged));
    } catch {
      // Not remembered; nothing else changes.
    }
  }

  function toggle(target: ExportTarget, on: boolean) {
    const targets = on ? [...settings.targets, target] : settings.targets.filter((x) => x !== target);
    update({ targets: [...new Set(targets)] });
  }

  const targets: ExportTarget[] = desktop ? settings.targets : ['web'];
  const hasElectron = targets.some((x) => x.endsWith('electron'));
  const steamAppId = settings.steam && hasElectron ? settings.steamAppId.trim() : '';
  const steamInvalid = settings.steam && hasElectron && !/^\d+$/.test(steamAppId);
  const canExport = targets.length > 0 && !steamInvalid && !busy;

  async function run() {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      if (!desktop) {
        if (settings.webFormat === 'single') await exportGameZip(project);
        else await exportWebFolderZip(project);
        onClose();
        return;
      }
      const { html, files } = gameFolder(project, await playerScript());
      const res = await desktop.exportGame(project.meta.id, {
        gameName: project.meta.name || 'Game',
        targets,
        zip: settings.zip,
        steamAppId: steamAppId || null,
        html,
        files,
      });
      if (!res) return; // folder dialog cancelled
      if ('error' in res) {
        const known = e.errors[res.error.code as keyof typeof e.errors];
        setError(known ? `${known} (${res.error.message})` : res.error.message);
        return;
      }
      markBackedUp(project.meta.id);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const step = progress && busy ? e.step(progress.step, progress.target && e.targetName[progress.target]) : null;
  const percent = progress?.fraction !== undefined ? ` ${Math.round(progress.fraction * 100)}%` : '';

  return (
    <dialog
      ref={ref}
      className="app-dialog export-dialog"
      onCancel={(ev) => {
        ev.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2>{e.title}</h2>
      {result ? (
        <div className="export-done">
          <p>{e.done}</p>
          <code className="export-path">{result.folder}</code>
          <ul className="export-outputs">
            {result.outputs.map((o) => (
              <li key={o.target}>
                <strong>{e.targetName[o.target]}</strong> <span className="muted">{o.zip ?? o.folder}</span>
              </li>
            ))}
          </ul>
          <div className="app-dialog-buttons">
            <button className="btn" onClick={() => void desktop?.revealPath(result.folder)}>
              {e.openFolder}
            </button>
            <button className="btn primary" onClick={onClose} autoFocus>
              {e.close}
            </button>
          </div>
        </div>
      ) : (
        <>
          <fieldset className="export-group" disabled={busy}>
            <legend>{e.web}</legend>
            <label className="export-option">
              <input
                type="checkbox"
                checked={targets.includes('web')}
                onChange={(ev) => toggle('web', ev.target.checked)}
                disabled={!desktop}
              />
              <span>
                {e.webTarget}
                <small>{e.webHint}</small>
              </span>
            </label>
            {!desktop && (
              <div className="export-sub">
                {(['folder', 'single'] as const).map((f) => (
                  <label key={f} className="inline">
                    <input
                      type="radio"
                      name="web-format"
                      checked={settings.webFormat === f}
                      onChange={() => update({ webFormat: f })}
                    />
                    {f === 'folder' ? e.webFolder : e.webSingle}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="export-group" disabled={busy || !desktop}>
            <legend>{e.desktopGroup}</legend>
            {desktop ? (
              DESKTOP_ROWS.map((row) => (
                <div key={row.platform} className="export-row">
                  <strong>{e[row.platform]}</strong>
                  {row.targets.map((target) => (
                    <label key={target} className="export-option">
                      <input
                        type="checkbox"
                        checked={targets.includes(target)}
                        onChange={(ev) => toggle(target, ev.target.checked)}
                      />
                      <span>
                        {target.endsWith('electron') ? e.standard : e.small}
                        <small>{target.endsWith('electron') ? e.standardHint : e.smallHint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              ))
            ) : (
              <p className="muted">{e.desktopOnly}</p>
            )}
            {desktop && (
              <label className="export-option">
                <input type="checkbox" checked={settings.zip} onChange={(ev) => update({ zip: ev.target.checked })} />
                <span>{e.zip}</span>
              </label>
            )}
          </fieldset>

          {desktop && (
            <fieldset className="export-group" disabled={busy || !hasElectron}>
              <legend>Steam</legend>
              <label className="export-option">
                <input
                  type="checkbox"
                  checked={settings.steam}
                  onChange={(ev) => update({ steam: ev.target.checked })}
                />
                <span>
                  {e.steam}
                  <small>{hasElectron ? e.steamHint : e.steamNeedsStandard}</small>
                </span>
              </label>
              {settings.steam && hasElectron && (
                <div className="export-sub">
                  <label className="inline">
                    {e.steamAppId}
                    <input
                      className="small-input"
                      inputMode="numeric"
                      value={settings.steamAppId}
                      placeholder="480"
                      onChange={(ev) => update({ steamAppId: ev.target.value.replace(/\D+/g, '') })}
                    />
                  </label>
                  {!steamworks && <p className="error">{e.steamUnavailable}</p>}
                </div>
              )}
            </fieldset>
          )}

          {step && (
            <p className="export-progress">
              {step}
              {percent}
            </p>
          )}
          {error && <p className="error">{error}</p>}
          {targets.length === 0 && <p className="muted">{e.nothing}</p>}
          <div className="app-dialog-buttons">
            <button className="btn" onClick={onClose} disabled={busy}>
              {e.cancel}
            </button>
            <button className="btn primary" onClick={() => void run()} disabled={!canExport}>
              {busy ? e.exporting : e.export}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
