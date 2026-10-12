import { Component, type ErrorInfo, type ReactNode } from 'react';
import { navigate } from '../router';
import { useI18n } from '../i18n';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: if something throws while rendering, show a calm
 * explanation and a way out instead of a blank page. Keyed by route in App,
 * so navigating away resets it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ZenNovel crashed', error, info.componentStack);
  }

  override render() {
    return this.state.error ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}

function CrashScreen({ error }: { error: Error }) {
  const { t } = useI18n();
  return (
    <div className="crash">
      <h2>{t.crash.title}</h2>
      <p>{t.crash.body}</p>
      <div className="row">
        <button className="btn primary" onClick={() => window.location.reload()}>
          {t.crash.reload}
        </button>
        <button
          className="btn"
          onClick={() => {
            navigate('/');
            window.location.reload();
          }}
        >
          {t.editor.backToProjects}
        </button>
      </div>
      <details>
        <summary>{t.crash.details}</summary>
        <pre>{String(error.stack ?? error.message)}</pre>
      </details>
    </div>
  );
}
