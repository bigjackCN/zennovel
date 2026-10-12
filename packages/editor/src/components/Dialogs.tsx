import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';

/**
 * In-app replacements for window.prompt / window.confirm. Those are ugly,
 * can't be styled or translated, and don't work in some embedded webviews
 * (e.g. a future Tauri desktop build).
 */
export interface Dialogs {
  /** Resolves to the entered text (trimmed), or null when cancelled or left empty. */
  prompt(message: string, defaultValue?: string): Promise<string | null>;
  confirm(message: string, options?: { okLabel?: string; danger?: boolean }): Promise<boolean>;
  /** A message with just an OK button. */
  alert(message: string): Promise<void>;
}

type Request =
  | { kind: 'prompt'; message: string; value: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; message: string; okLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'alert'; message: string; resolve: () => void };

const DialogContext = createContext<Dialogs | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [queue, setQueue] = useState<Request[]>([]);
  const current = queue[0];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  const dialogs = useMemo<Dialogs>(
    () => ({
      prompt: (message, defaultValue = '') =>
        new Promise((resolve) => setQueue((q) => [...q, { kind: 'prompt', message, value: defaultValue, resolve }])),
      confirm: (message, options) =>
        new Promise((resolve) => setQueue((q) => [...q, { kind: 'confirm', message, ...options, resolve }])),
      alert: (message) => new Promise((resolve) => setQueue((q) => [...q, { kind: 'alert', message, resolve }])),
    }),
    [],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!current || !dialog) return;
    setValue(current.kind === 'prompt' ? current.value : '');
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => {
      if (current.kind === 'prompt') inputRef.current?.select();
    });
  }, [current]);

  const close = useCallback(
    (ok: boolean) => {
      if (!current) return;
      if (current.kind === 'prompt') current.resolve(ok ? value.trim() || null : null);
      else if (current.kind === 'confirm') current.resolve(ok);
      else current.resolve();
      dialogRef.current?.close();
      setQueue((q) => q.slice(1));
    },
    [current, value],
  );

  return (
    <DialogContext.Provider value={dialogs}>
      {children}
      <dialog
        ref={dialogRef}
        className="app-dialog"
        onCancel={(e) => {
          e.preventDefault(); // Esc: resolve ourselves so the queue advances
          close(false);
        }}
      >
        {current && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              close(true);
            }}
          >
            <p className="app-dialog-message">{current.message}</p>
            {current.kind === 'prompt' && (
              <input ref={inputRef} className="app-dialog-input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            )}
            <div className="app-dialog-buttons">
              {current.kind !== 'alert' && (
                <button type="button" className="btn" onClick={() => close(false)}>
                  {t.dialog.cancel}
                </button>
              )}
              <button
                type="submit"
                className={`btn ${current.kind === 'confirm' && current.danger ? 'danger-solid' : 'primary'}`}
                autoFocus={current.kind !== 'prompt'}
              >
                {(current.kind === 'confirm' && current.okLabel) || t.dialog.ok}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </DialogContext.Provider>
  );
}

export function useDialogs(): Dialogs {
  const value = useContext(DialogContext);
  if (!value) throw new Error('useDialogs must be used inside <DialogProvider>');
  return value;
}
