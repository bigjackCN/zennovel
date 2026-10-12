import type { Project, StoryIssue } from '@zennovel/core';
import { useI18n } from '../i18n';

interface Props {
  project: Project;
  issues: StoryIssue[];
  /** Jump to the scene (and the card, when the issue names one). */
  onSelect: (issue: StoryIssue) => void;
}

/** The story checker, in plain language. */
export function IssuesPanel({ project, issues, onSelect }: Props) {
  const { t } = useI18n();
  const sceneName = (id: string) => project.scenes.find((s) => s.id === id)?.name || t.scenes.untitled;
  return (
    <section className="issues">
      <h3>{t.issues.title}</h3>
      {issues.length === 0 ? (
        <p className="ok">{t.issues.none}</p>
      ) : (
        <ul>
          {issues.map((issue, i) => (
            <li key={i} className={issue.level}>
              <button className="issue-link" onClick={() => onSelect(issue)} title={t.issues.goTo}>
                <strong>{sceneName(issue.sceneId)}</strong>
                {t.issues.separator}
                {t.issues.messages[issue.code](issue.params)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
